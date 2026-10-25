#!/usr/bin/env node
/**
 * Fill staging with realistic-looking records for the past months, every step of a day in
 * order: a batch cooked the evening before, one cooler per store loaded in the morning, then
 * each store's delivery. Names and ids come from the environment's own reference lists, so
 * the rows look exactly like the forms' and the dashboard shows what real use would.
 *
 * Manual only. Each run adds everything again, so run it once per wipe; it is not for CI.
 *
 * Usage: node scripts/mock-data.js staging [days=90] [from=YYYY-MM-DD] [to=YYYY-MM-DD]
 *                                           [stores=5-8] [violations=0.03] [concurrency=6]
 *                                           [dry=true] [yes=true]
 *   days         how far back to go, ending yesterday; Sundays are skipped
 *   from, to     an explicit range instead, inclusive; `to` alone ends earlier than yesterday,
 *                `from` alone picks up where an interrupted run stopped
 *   stores       stores delivered to per day, a count or a range
 *   violations   the share of temperature readings above 41°F; each one raises a real
 *                violation and sends a real alert email to the environment's recipients
 *   concurrency  submissions in flight at once
 *   dry          build everything and report, post nothing
 *   yes          skip the confirmation
 */
const readline = require('readline');
const { readPrefix, requireKeys } = require('./env');
const webapp = require('./webapp');
const smoke = require('./smoke-payload');

const USAGE = 'Usage: node scripts/mock-data.js staging [days=90] [from=YYYY-MM-DD] [to=YYYY-MM-DD] [stores=5-8] [violations=0.03] [concurrency=6] [dry=true] [yes=true]';
const [,, environment, ...pairs] = process.argv;
const { prefix } = readPrefix(environment || '', USAGE);
if (environment !== 'staging') {
  console.error('Mock data is for staging only. Production holds the real record.');
  process.exit(1);
}
const opts = {};
pairs.forEach(p => { const eq = p.indexOf('='); if (eq > 0) opts[p.slice(0, eq)] = p.slice(eq + 1); else opts[p] = 'true'; });
const DAYS = Math.max(1, parseInt(opts.days, 10) || 90);
const isoDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null;
const TO = isoDate(opts.to) || null;     // default: yesterday
const FROM = isoDate(opts.from) || null; // default: DAYS before the end
if ((opts.to && !TO) || (opts.from && !FROM)) { console.error('from= and to= take YYYY-MM-DD'); process.exit(1); }
const [STORES_MIN, STORES_MAX] = String(opts.stores || '5-8').split('-').map(n => parseInt(n, 10)).reduce((acc, n, i, arr) => arr.length === 1 ? [n, n] : [arr[0], arr[1]], []);
const VIOLATION_RATE = opts.violations === undefined ? 0.03 : Math.max(0, Math.min(1, parseFloat(opts.violations) || 0));
const CONCURRENCY = Math.max(1, parseInt(opts.concurrency, 10) || 6);
const DRY = opts.dry === 'true';
const YES = opts.yes === 'true';
const { WEB_APP_URL } = requireKeys(prefix, ['WEB_APP_URL']);

const NY = 'America/New_York';
const TEMP_LIMIT_F = 41;
const STORE_STAFF = ['Amanda', 'Michael', 'Sarah', 'James', 'Lisa', 'Emily', 'Chris', 'Dana', 'Priya', 'Marcus'];
const PRODUCTION_NOTES = ['', '', '', '', '', '', '', 'Oven 2 slow to preheat', 'Short on chicken, smaller batch', 'New supervisor shadowing'];
const PACKAGING_NOTES = ['', '', '', '', '', '', 'Cooler took a while to come down', 'Short on one dish, see counts'];
const DELIVERY_NOTES = ['', '', '', '', '', '', 'Case was being restocked on arrival', 'Manager asked for more Spring Rolls next week', 'Cooler door seal looks worn', 'Store short-staffed, waited for sign-off'];

// ─── Small helpers ───────────────────────────────────────────────────────────
const { pick, randInt, hhmm, DISCARD_REASONS, REMOVAL_REASONS, CASE_FILL } = smoke;

/** `days` days before today in New York, as YYYY-MM-DD. */
function dateNY(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function weekdayNY(iso) {
  return new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short' }).format(new Date(iso + 'T12:00:00Z'));
}

/** `YYYY-MM-DDTHH:mm:00-04:00`: the wall-clock moment in New York as an ISO instant, the way a phone's clock would be read. */
function instantNY(iso, time) {
  const probe = new Date(iso + 'T' + time + ':00Z');
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: NY, timeZoneName: 'longOffset' }).formatToParts(probe).find(p => p.type === 'timeZoneName').value;   // e.g. GMT-04:00
  const sign = offset.includes('-') ? '-' : '+';
  const [h, m] = (offset.match(/(\d{2}):(\d{2})/) || [, '00', '00']).slice(1);
  return `${iso}T${time}:00${sign}${h}:${m}`;
}

/** A cold reading, or a warm one at the violation rate. */
function temperature(lo, hi) {
  return Math.random() < VIOLATION_RATE ? randInt(TEMP_LIMIT_F + 1, TEMP_LIMIT_F + 5) : randInt(lo, hi);
}

function sameKeys(a, b, what) {
  const ka = Object.keys(a).sort().join(','), kb = Object.keys(b).sort().join(',');
  if (ka !== kb) throw new Error(`${what} rows no longer match the form's key set:\n  mock:  ${ka}\n  forms: ${kb}`);
}

// ─── One day ─────────────────────────────────────────────────────────────────

/** Everything one day's three forms would send, in the order they are filled. */
function buildDay(iso, lists) {
  const kitchen = pick(lists.kitchens);
  const supervisor = pick(lists.supervisors).name;
  const driver = pick(lists.drivers).name;
  const storeCount = Math.min(lists.stores.length, randInt(STORES_MIN, STORES_MAX));
  const stores = smoke.sample(lists.stores, storeCount);
  const cooked = dateNY(0) === iso ? iso : previousDay(iso);   // cooked the evening before, except that today's batch has no yesterday yet
  const warm = { production: 0, packaging: 0, delivery: 0 };

  // Production: the batch for this day's route, one row per dish
  const produced = {};
  const cookStart = randInt(13 * 60, 16 * 60);
  const cookMinutes = randInt(45, 150);
  const productionId = smoke.newSubmissionId();
  const productionNotes = pick(PRODUCTION_NOTES);
  const production = lists.dishes.map(dish => {
    produced[dish.id] = randInt(30, 120);
    const discarded = Math.random() < 0.12 ? randInt(1, 3) : 0;
    return {
      submissionId: productionId, date: cooked, kitchen: kitchen.name, supervisor,
      kitchenSystemId: kitchen.id, kitchenId: kitchen.kitchenId,
      dish: dish.name, dishSystemId: dish.id,
      qtyProduced: String(produced[dish.id]), qtyDiscarded: String(discarded),
      discardReason: discarded ? pick(DISCARD_REASONS) : '',
      cookTemp: String(randInt(165, 195)), cookStart: hhmm(cookStart), cookEnd: hhmm(cookStart + cookMinutes), cookTime: String(cookMinutes),
      notes: productionNotes,
      formType: 'production', clientTimestamp: instantNY(cooked, hhmm(cookStart + cookMinutes + randInt(5, 40)))
    };
  });

  // Packaging: one cooler per store, loaded in the morning, sharing the batch
  const coolers = stores.map((store, i) => {
    const time = hhmm(6 * 60 + i * 4 + randInt(0, 3));
    const productTemp = temperature(33, 39);
    if (productTemp > TEMP_LIMIT_F) warm.packaging++;
    const id = smoke.newSubmissionId();
    const notes = pick(PACKAGING_NOTES);
    const rows = lists.dishes.map(dish => {
      const share = Math.max(0, Math.floor(produced[dish.id] / storeCount) + randInt(-3, 3));
      const discarded = Math.random() < 0.04 ? 1 : 0;
      return {
        submissionId: id, date: iso, time,
        kitchen: kitchen.name, kitchenSystemId: kitchen.id, kitchenId: kitchen.kitchenId,
        driver, store: store.name, storeId: store.storeId, storeSystemId: store.id,
        dish: dish.name, dishSystemId: dish.id,
        loaded: String(share), discarded: String(discarded), discardReason: discarded ? pick(DISCARD_REASONS) : '',
        productTemp: String(productTemp), notes,
        formType: 'packaging', clientTimestamp: instantNY(iso, hhmm(6 * 60 + i * 4 + 3))
      };
    });
    return { store, rows, time };
  });

  // Deliveries: the route, in cooler order, what was loaded going onto the shelf
  const deliveries = coolers.map((cooler, i) => {
    const arriveMinutes = 8 * 60 + i * randInt(30, 45) + randInt(-5, 10);
    const arrive = hhmm(arriveMinutes);
    const arrivalTemp = temperature(34, 40);
    const coolerTemp = temperature(35, 40);
    if (arrivalTemp > TEMP_LIMIT_F) warm.delivery++;
    if (coolerTemp > TEMP_LIMIT_F) warm.delivery++;
    const id = smoke.newSubmissionId();
    const receivedBy = pick(STORE_STAFF);
    const notes = pick(DELIVERY_NOTES);
    const casePrefill = pick(CASE_FILL);
    const rows = cooler.rows.map(loaded => {
      const added = Math.max(0, parseInt(loaded.loaded, 10) - parseInt(loaded.discarded, 10));
      const before = Math.random() < 0.6 ? randInt(0, 6) : 0;
      const removed = before && Math.random() < 0.35 ? randInt(1, Math.min(2, before)) : 0;
      return {
        submissionId: id, date: iso, driver, store: cooler.store.name, storeId: cooler.store.storeId,
        storeSystemId: cooler.store.id, arrive,
        arrivalTemp: String(arrivalTemp), coolerTemp: String(coolerTemp), casePrefillPercent: casePrefill,
        dish: loaded.dish, dishSystemId: loaded.dishSystemId,
        added: String(added), before: String(before), removed: String(removed),
        reason: removed ? pick(REMOVAL_REASONS) : '', after: String(before + added - removed),
        notes, receivedBy, formType: 'delivery', clientTimestamp: instantNY(iso, hhmm(arriveMinutes + randInt(8, 25)))
      };
    });
    const photos = { submissionId: id, storeId: cooler.store.storeId, storeName: cooler.store.name, date: iso, driver };
    return { rows, photos };
  });

  return { iso, kitchen, driver, production, coolers, deliveries, warm };
}

function previousDay(iso) {
  return previousDays(iso, 1);
}

/** The date `n` days before `iso`; a negative `n` goes forward. */
function previousDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Posting ─────────────────────────────────────────────────────────────────

async function pool(items, worker) {
  const queue = items.slice();
  const results = [];
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) results.push(await worker(queue.shift()));
  }));
  return results;
}

async function send(payload, what) {
  if (DRY) return { status: 'ok', dry: true };
  const reply = await webapp.post(WEB_APP_URL, payload);
  if (!reply || reply.status !== 'ok') {
    console.error(`  FAILED ${what}: ${reply ? reply.message || JSON.stringify(reply) : 'no JSON reply'}`);
    return reply || { status: 'error' };
  }
  return reply;
}

async function postDay(day) {
  const failures = [];
  const check = (reply, what) => { if (!reply || reply.status !== 'ok') failures.push(what); };
  check(await send({ formType: 'production', rows: day.production }, `production ${day.iso}`), 'production');
  await pool(day.coolers, async cooler => check(await send({ formType: 'packaging', rows: cooler.rows }, `packaging ${day.iso} ${cooler.store.name}`), 'packaging'));
  await pool(day.deliveries, async delivery => check(await send({ formType: 'delivery', rows: delivery.rows, photos: delivery.photos }, `delivery ${day.iso} ${delivery.photos.storeName}`), 'delivery'));
  return failures;
}

function confirm(question) {
  if (YES || DRY) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(/^y(es)?$/i.test(answer.trim())); }));
}

(async () => {
  console.log(`Reading the reference lists from ${environment}…`);
  const reference = await webapp.get(WEB_APP_URL, { action: 'reference' });
  if (reference.status !== 'ok') throw new Error('reference: ' + (reference.message || JSON.stringify(reference)));
  const lists = smoke.liveLists(reference);
  Object.entries(lists).forEach(([name, list]) => { if (!list.length) throw new Error(`the reference list ${name} has no active entries`); });

  const end = TO || dateNY(1);
  const start = FROM || previousDays(end, DAYS - 1);
  if (start > end) throw new Error(`from (${start}) is after to (${end})`);
  const days = [];
  for (let iso = start; iso <= end; iso = previousDays(iso, -1)) {
    if (weekdayNY(iso) === 'Sun') continue;   // no route on Sundays
    days.push(buildDay(iso, lists));
  }
  if (!days.length) throw new Error('no days to build: the range holds only Sundays');

  // The mock rows must be shaped exactly as the forms' payloads are; the smoke builders track those.
  sameKeys(days[0].production[0], smoke.productionPayload().rows[0], 'production');
  sameKeys(days[0].coolers[0].rows[0], smoke.packagingPayload().rows[0], 'packaging');
  sameKeys(days[0].deliveries[0].rows[0], smoke.deliveryPayload().rows[0], 'delivery');

  const submissions = days.reduce((n, d) => n + 1 + d.coolers.length + d.deliveries.length, 0);
  const rows = days.reduce((n, d) => n + d.production.length + d.coolers.reduce((m, c) => m + c.rows.length, 0) + d.deliveries.reduce((m, x) => m + x.rows.length, 0), 0);
  const warm = days.reduce((n, d) => n + d.warm.packaging + d.warm.delivery, 0);
  console.log(`\nPlan for ${environment}:`);
  console.log(`  ${days.length} days, ${days[0].iso} to ${days[days.length - 1].iso}`);
  console.log(`  ${lists.kitchens.length} kitchens, ${lists.stores.length} stores, ${lists.dishes.length} dishes, ${lists.drivers.length} drivers, ${lists.supervisors.length} supervisors`);
  console.log(`  ${submissions} submissions, ${rows} rows: production, then packaging, then deliveries, each day in order`);
  console.log(`  ${warm} warm readings -> ${warm} violations and ${warm} alert emails to this environment's ALERT_RECIPIENTS`);
  const minutes = Math.max(1, Math.round(submissions * 8 / CONCURRENCY / 60));
  console.log(`  about ${minutes} minute${minutes === 1 ? '' : 's'} at ${CONCURRENCY} in flight, at the usual 8 s a submission`);
  if (DRY) { console.log('\nDry run: nothing posted.'); return; }
  if (!(await confirm('\nProceed? [y/N] '))) { console.log('Nothing posted.'); return; }

  const started = Date.now();
  let failed = 0;
  for (const day of days) {
    const failures = await postDay(day);
    failed += failures.length;
    console.log(`  ${day.iso}  ${day.kitchen.name} -> ${day.coolers.length} coolers by ${day.driver}` +
      (day.warm.packaging + day.warm.delivery ? `  (${day.warm.packaging + day.warm.delivery} warm)` : '') +
      (failures.length ? `  FAILED: ${failures.join(', ')}` : ''));
  }
  console.log(`\nDone in ${Math.round((Date.now() - started) / 60000)} min; ${failed} submission${failed === 1 ? '' : 's'} failed.`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
