#!/usr/bin/env node
/**
 * Payload builders that mirror the forms' buildPayload key sets, so test and CI payloads
 * cannot drift from what the forms send. Keep in step with frontend/forms/production.js,
 * frontend/forms/packaging.js and frontend/forms/delivery.js: a key added or dropped there is
 * added or dropped here.
 *
 * CLI: node scripts/smoke-payload.js <production|packaging|delivery|photos> [key=value ...]
 *   reference=<file>  a saved ?action=reference reply (or, from code, the parsed reply): kitchen,
 *                     supervisor, driver, store and dishes are then real entries picked at
 *                     random, as a form would send them; store= and driver= pin those two
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

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Minutes since midnight as HH:mm. */
function hhmm(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

const DISCARD_REASONS = ['Damaged', 'Quality Issue'];
const REMOVAL_REASONS = ['Damaged', 'Expired', 'Quality Issue'];
const CASE_FILL = ['0-25%', '25-50%', '50-75%', '75-100%'];

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
  const reference = typeof over.reference === 'string' ? JSON.parse(fs.readFileSync(over.reference, 'utf8')) : (over.reference || null);
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
    driver: over.driver || pick(lists.drivers).name,
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

// Quantities, times and temperatures are plausible and random, so a smoke row reads like a
// real one; the note is what marks it. Temperatures stay under the limit: a smoke row must
// never raise a violation or send an alert.

/** The body production.js POSTs: one row per dish. A batch cooked in the afternoon, about an hour. */
function productionPayload(over = {}) {
  const s = settings(over);
  const cookStart = randInt(13 * 60, 16 * 60);
  const cookTime = randInt(45, 90);
  const rows = s.cast.dishes.map(dish => {
    const produced = randInt(30, 120);
    const discarded = Math.random() < 0.3 ? randInt(1, Math.min(3, produced - 1)) : 0;
    return {
      submissionId: s.id, date: s.date, kitchen: s.cast.kitchen.name, supervisor: s.cast.supervisor,
      kitchenSystemId: s.cast.kitchen.id || '', kitchenId: s.cast.kitchen.kitchenId || '',
      dish: dish.name, dishSystemId: dish.id || '',
      qtyProduced: String(produced), qtyDiscarded: String(discarded), discardReason: discarded ? pick(DISCARD_REASONS) : '',
      cookTemp: String(randInt(165, 195)), cookStart: hhmm(cookStart), cookEnd: hhmm(cookStart + cookTime), cookTime: String(cookTime),
      notes: s.note,
      formType: 'production', clientTimestamp: s.now
    };
  });
  return { formType: 'production', rows };
}

/** The body packaging.js POSTs: one cooler for one store, one row per dish, loaded in the morning. */
function packagingPayload(over = {}) {
  const s = settings(over);
  const time = hhmm(randInt(6 * 60, 7 * 60 + 30));
  const productTemp = String(randInt(33, 39));
  const rows = s.cast.dishes.map(dish => {
    const loaded = randInt(5, 20);
    const discarded = Math.random() < 0.2 ? 1 : 0;
    return {
      submissionId: s.id, date: s.date, time,
      kitchen: s.cast.kitchen.name, kitchenSystemId: s.cast.kitchen.id || '', kitchenId: s.cast.kitchen.kitchenId || '',
      driver: s.cast.driver, store: s.cast.store.name, storeId: s.cast.store.storeId, storeSystemId: s.cast.store.id || '',
      dish: dish.name, dishSystemId: dish.id || '',
      loaded: String(loaded), discarded: String(discarded), discardReason: discarded ? pick(DISCARD_REASONS) : '',
      productTemp, notes: s.note,
      formType: 'packaging', clientTimestamp: s.now
    };
  });
  return { formType: 'packaging', rows };
}

function photosBlock(s) {
  return { submissionId: s.id, storeId: s.cast.store.storeId, storeName: s.cast.store.name, date: s.date, driver: s.cast.driver };
}

/** The body delivery.js POSTs in step 1: one row per dish plus the photos block without image data. A morning stop. */
function deliveryPayload(over = {}) {
  const s = settings(over);
  const arrive = hhmm(randInt(8 * 60, 13 * 60));
  const arrivalTemp = String(randInt(34, 40));
  const coolerTemp = String(randInt(35, 40));
  const casePrefillPercent = pick(CASE_FILL);
  const rows = s.cast.dishes.map(dish => {
    const added = randInt(5, 20);
    const before = randInt(0, 6);
    const removed = before ? randInt(0, Math.min(2, before)) : 0;
    return {
      submissionId: s.id, date: s.date, driver: s.cast.driver, store: s.cast.store.name, storeId: s.cast.store.storeId,
      storeSystemId: s.cast.store.id || '', arrive,
      arrivalTemp, coolerTemp, casePrefillPercent,
      dish: dish.name, dishSystemId: dish.id || '',
      added: String(added), before: String(before), removed: String(removed),
      reason: removed ? pick(REMOVAL_REASONS) : '', after: String(before + added - removed),
      notes: s.note, receivedBy: s.cast.receivedBy, formType: 'delivery', clientTimestamp: s.now
    };
  });
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

module.exports = { productionPayload, packagingPayload, deliveryPayload, photosPayload, newSubmissionId, todayNY, liveLists, pick, sample, randInt, hhmm, DISCARD_REASONS, REMOVAL_REASONS, CASE_FILL, TINY_JPEG };
