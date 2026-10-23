#!/usr/bin/env node
/**
 * Payload builders that mirror the forms' buildPayload key sets, so test and CI payloads
 * cannot drift from what the forms send. Keep in step with frontend/forms/production.js,
 * frontend/forms/packaging.js and frontend/forms/delivery.js: a key added or dropped there is
 * added or dropped here.
 *
 * CLI: node scripts/smoke-payload.js <production|packaging|delivery|photos> [key=value ...]
 *   tag=ZZ-CI-SMOKE  kitchen, supervisor, driver, received-by and dish all take the tag
 *   store=0000  date=YYYY-MM-DD  id=<submission id>  note=<text>  dishes=<count>
 * Prints the JSON body to POST.
 */
const crypto = require('crypto');

const TINY_JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/B+IA/9k=';

function newSubmissionId() {
  return crypto.randomUUID();
}

/** Today in New York as YYYY-MM-DD. */
function todayNY() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function settings(over) {
  const tag = over.tag || 'ZZ-CI-SMOKE';
  return {
    tag,
    date: over.date || todayNY(),
    id: over.id || newSubmissionId(),
    store: over.store || '0000',
    note: over.note || '',
    dishes: Math.max(1, parseInt(over.dishes, 10) || 1),
    now: new Date().toISOString()
  };
}

function dishNames(s) {
  return Array.from({ length: s.dishes }, (_, i) => (s.dishes === 1 ? s.tag : `${s.tag}-${i + 1}`));
}

/** The body production.js POSTs: one row per dish. */
function productionPayload(over = {}) {
  const s = settings(over);
  const rows = dishNames(s).map(dish => ({
    submissionId: s.id, date: s.date, kitchen: s.tag, supervisor: s.tag,
    kitchenSystemId: '', kitchenId: s.tag,   // the smoke kitchen is not on the reference list
    dish, dishSystemId: '', qtyProduced: '0', qtyDiscarded: '0', discardReason: s.note,
    cookTemp: '200', cookStart: '00:00', cookEnd: '00:01', cookTime: '1',
    formType: 'production', clientTimestamp: s.now
  }));
  return { formType: 'production', rows };
}

/** The body packaging.js POSTs: one cooler for one store, one row per dish. */
function packagingPayload(over = {}) {
  const s = settings(over);
  const rows = dishNames(s).map(dish => ({
    submissionId: s.id, date: s.date, time: '00:00',
    kitchen: s.tag, kitchenSystemId: '', kitchenId: s.tag,   // the smoke kitchen is not on the reference list
    driver: s.tag, store: `Store ${s.store}`, storeId: s.store,
    storeSystemId: s.store === '0000' ? '00000000-0000-4000-8000-000000000000' : '',   // the reserved store's System ID; see ReferenceSeed.gs
    dish, dishSystemId: '', loaded: '0', discarded: '0', discardReason: s.note,
    coolerTemp: '38', notes: s.note,
    formType: 'packaging', clientTimestamp: s.now
  }));
  return { formType: 'packaging', rows };
}

function photosBlock(s) {
  return { submissionId: s.id, storeId: s.store, storeName: `Store ${s.store}`, date: s.date, driver: s.tag };
}

/** The body delivery.js POSTs in step 1: one row per dish plus the photos block without image data. */
function deliveryPayload(over = {}) {
  const s = settings(over);
  const rows = dishNames(s).map(dish => ({
    submissionId: s.id, date: s.date, driver: s.tag, store: `Store ${s.store}`, storeId: s.store, arrive: '00:00',
    storeSystemId: s.store === '0000' ? '00000000-0000-4000-8000-000000000000' : '',   // the reserved store's System ID; see ReferenceSeed.gs
    arrivalTemp: '38', coolerTemp: '38', casePrefillPercent: '0-25%',
    dish, dishSystemId: '', added: '0', before: '0', removed: '0', reason: '', after: '0',
    notes: s.note, receivedBy: s.tag, formType: 'delivery', clientTimestamp: s.now
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
    console.error('Usage: node scripts/smoke-payload.js <production|packaging|delivery|photos> [tag=] [store=] [date=] [id=] [note=] [dishes=]');
    process.exit(1);
  }
  const over = {};
  pairs.forEach(p => { const eq = p.indexOf('='); if (eq > 0) over[p.slice(0, eq)] = p.slice(eq + 1); });
  process.stdout.write(JSON.stringify(builders[kind](over)) + '\n');
}

module.exports = { productionPayload, packagingPayload, deliveryPayload, photosPayload, newSubmissionId, todayNY, TINY_JPEG };
