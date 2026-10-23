#!/usr/bin/env node
/**
 * Payload builders that mirror the forms' buildPayload key sets, so test and CI payloads
 * cannot drift from what the forms send. Keep in step with frontend/forms/production.js,
 * frontend/forms/packaging.js and frontend/forms/delivery.js: a key added or dropped there is
 * added or dropped here.
 *
 * CLI: node scripts/smoke-payload.js <production|packaging|delivery|photos> [key=value ...]
 *   reference=<file>  a saved ?action=reference reply: kitchen, supervisor, driver, store and
 *                     dishes are then real entries picked at random, as a form would send them
 *   tag=ZZ-CI-SMOKE   without a reference file, every name is the tag
 *   store=0000  date=YYYY-MM-DD  id=<submission id>  note=<text>  dishes=<count>
 * Prints the JSON body to POST.
 */
const crypto = require('crypto');
const fs = require('fs');

const TINY_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/B+IA/9k=';
const RESERVED_STORE_ID = '00000000-0000-4000-8000-000000000000';   // store 0000; see ReferenceSeed.gs
const STORE_STAFF = ['Amanda', 'Michael', 'Sarah', 'James', 'Lisa', 'Emily', 'Chris', 'Dana'];

function newSubmissionId() {
  return crypto.randomUUID();
}

/** Today in New York as YYYY-MM-DD. */
function todayNY() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** `count` distinct entries of a list, in list order. */
function sample(list, count) {
  const copy = list.slice();
  const out = [];
  while (copy.length && out.length < count) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  return list.filter(entry => out.includes(entry));
}

/** The active, undeleted entries of a saved reference reply, less the reserved store. */
function liveLists(reference) {
  const live = list => (reference[list] || []).filter(e => e.active && !e.deletedAt);
  return {
    kitchens:    live('kitchens'),
    stores:      live('stores').filter(s => s.id !== RESERVED_STORE_ID),
    dishes:      live('dishes'),
    supervisors: live('supervisors'),
    drivers:     live('drivers')
  };
}

/**
 * Who and what a payload names. With a reference reply, real entries picked at random, the
 * ids a form would send alongside; without one, the tag for every name and no ids, except
 * that the store number is always sent.
 */
function cast(over) {
  const tag = over.tag || 'ZZ-CI-SMOKE';
  const count = Math.max(1, parseInt(over.dishes, 10) || 1);
  const reference = over.reference ? JSON.parse(fs.readFileSync(over.reference, 'utf8')) : null;
  if (!reference) {
    const store = over.store || '0000';
    return {
      kitchen: { name: tag, id: '', kitchenId: tag },
      supervisor: tag,
      driver: tag,
      store: { name: `Store ${store}`, id: store === '0000' ? RESERVED_STORE_ID : '', storeId: store },
      dishes: Array.from({ length: count }, (_, i) => ({ name: count === 1 ? tag : `${tag}-${i + 1}`, id: '' })),
      receivedBy: tag
    };
  }
  const lists = liveLists(reference);
  const store = over.store ? lists.stores.find(s => s.storeId === over.store) : pick(lists.stores);
  if (!store) throw new Error(`store ${over.store} is not on the reference list`);
  return {
    kitchen: pick(lists.kitchens),
    supervisor: pick(lists.supervisors).name,
    driver: pick(lists.drivers).name,
    store: store,
    dishes: sample(lists.dishes, count),
    receivedBy: pick(STORE_STAFF)
  };
}

function settings(over) {
  return {
    cast: cast(over),
    date: over.date || todayNY(),
    id: over.id || newSubmissionId(),
    note: over.note || '',
    now: new Date().toISOString()
  };
}

/** The body production.js POSTs: one row per dish. */
function productionPayload(over = {}) {
  const s = settings(over);
  const rows = s.cast.dishes.map(dish => ({
    submissionId: s.id, date: s.date, kitchen: s.cast.kitchen.name, supervisor: s.cast.supervisor,
    kitchenSystemId: s.cast.kitchen.id || '', kitchenId: s.cast.kitchen.kitchenId || '',
    dish: dish.name, dishSystemId: dish.id || '', qtyProduced: '0', qtyDiscarded: '0', discardReason: s.note,
    cookTemp: '200', cookStart: '00:00', cookEnd: '00:01', cookTime: '1',
    formType: 'production', clientTimestamp: s.now
  }));
  return { formType: 'production', rows };
}

/** The body packaging.js POSTs: one cooler for one store, one row per dish. */
function packagingPayload(over = {}) {
  const s = settings(over);
  const rows = s.cast.dishes.map(dish => ({
    submissionId: s.id, date: s.date, time: '00:00',
    kitchen: s.cast.kitchen.name, kitchenSystemId: s.cast.kitchen.id || '', kitchenId: s.cast.kitchen.kitchenId || '',
    driver: s.cast.driver, store: s.cast.store.name, storeId: s.cast.store.storeId, storeSystemId: s.cast.store.id || '',
    dish: dish.name, dishSystemId: dish.id || '', loaded: '0', discarded: '0', discardReason: '',
    coolerTemp: '38', notes: s.note,
    formType: 'packaging', clientTimestamp: s.now
  }));
  return { formType: 'packaging', rows };
}

function photosBlock(s) {
  return { submissionId: s.id, storeId: s.cast.store.storeId, storeName: s.cast.store.name, date: s.date, driver: s.cast.driver };
}

/** The body delivery.js POSTs in step 1: one row per dish plus the photos block without image data. */
function deliveryPayload(over = {}) {
  const s = settings(over);
  const rows = s.cast.dishes.map(dish => ({
    submissionId: s.id, date: s.date, driver: s.cast.driver, store: s.cast.store.name, storeId: s.cast.store.storeId,
    storeSystemId: s.cast.store.id || '', arrive: '00:00',
    arrivalTemp: '38', coolerTemp: '38', casePrefillPercent: '0-25%',
    dish: dish.name, dishSystemId: dish.id || '', added: '0', before: '0', removed: '0', reason: '', after: '0',
    notes: s.note, receivedBy: s.cast.receivedBy, formType: 'delivery', clientTimestamp: s.now
  }));
  return { formType: 'delivery', rows, photos: photosBlock(s) };
}

/** The body delivery.js POSTs in step 2: the photos block with image data. */
function photosPayload(over = {}) {
  const s = settings(over);
  return {
    formType: 'photos_only',
    photos: Object.assign(photosBlock(s), {
      before: { data: TINY_JPEG, mimeType: 'image/jpeg' },
      after: { data: TINY_JPEG, mimeType: 'image/jpeg' }
    })
  };
}

if (require.main === module) {
  const [kind, ...pairs] = process.argv.slice(2);
  const builders = { production: productionPayload, packaging: packagingPayload, delivery: deliveryPayload, photos: photosPayload };
  if (!builders[kind]) {
    console.error('Usage: node scripts/smoke-payload.js <production|packaging|delivery|photos> [reference=] [tag=] [store=] [date=] [id=] [note=] [dishes=]');
    process.exit(1);
  }
  const over = {};
  pairs.forEach(p => { const eq = p.indexOf('='); if (eq > 0) over[p.slice(0, eq)] = p.slice(eq + 1); });
  process.stdout.write(JSON.stringify(builders[kind](over)) + '\n');
}

module.exports = { productionPayload, packagingPayload, deliveryPayload, photosPayload, newSubmissionId, todayNY, liveLists, pick, sample, TINY_JPEG };
