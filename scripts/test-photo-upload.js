#!/usr/bin/env node
/**
 * End-to-end photo test on staging: a two-dish delivery, then its photos, then the links read
 * back. The only thing that exercises the photo path; the CI smoke does not.
 * Usage: node scripts/test-photo-upload.js
 * Leaves two delivery rows for a random real store, noted "PHOTO TEST - safe to delete", and
 * two photos in the staging Drive folder.
 */
const { requireKeys } = require('./env');
const webapp = require('./webapp');
const { deliveryPayload, photosPayload, newSubmissionId, todayNY, liveLists, pick } = require('./smoke-payload');

const { WEB_APP_URL, ADMIN_TOKEN } = requireKeys('STAGING', ['WEB_APP_URL', 'ADMIN_TOKEN']);

function fail(what, detail) {
  console.error(`FAIL: ${what}`, detail === undefined ? '' : JSON.stringify(detail));
  process.exit(1);
}

(async () => {
  const reference = await webapp.get(WEB_APP_URL, { action: 'reference' });
  if (reference.status !== 'ok') fail('reference', reference);
  const lists = liveLists(reference);
  // One store and one driver for both requests, so the photos block names the rows' store.
  const over = {
    reference, store: pick(lists.stores).storeId, driver: pick(lists.drivers).name,
    note: 'PHOTO TEST - safe to delete', date: todayNY(), id: newSubmissionId(), dishes: 2
  };
  console.log(`Photo test on staging: submission ${over.id}, date ${over.date}, store ${over.store}`);

  const delivery = deliveryPayload(over);
  const wrote = await webapp.post(WEB_APP_URL, delivery);
  if (!wrote || wrote.status !== 'ok') fail('delivery write', wrote);
  console.log(`  delivery: ${delivery.rows.length} rows written`);

  const uploaded = await webapp.post(WEB_APP_URL, photosPayload(over));
  if (!uploaded || uploaded.status !== 'ok') fail('photo upload', uploaded);
  console.log(`  photos: ${uploaded.savedPhotos} saved, linked on ${uploaded.linkedRows} monthly rows`);
  if (uploaded.savedPhotos !== 2) fail('expected 2 photos saved', uploaded);
  if (uploaded.linkedRows !== delivery.rows.length) fail(`expected links on ${delivery.rows.length} monthly rows`, uploaded);

  const ping = await webapp.get(WEB_APP_URL, { action: 'ping', token: ADMIN_TOKEN });
  console.log(`  month file: ${ping.current_month ? ping.current_month.url : '(none)'}`);

  // Read the rows back out of the month file by submission id.
  const q = await webapp.get(WEB_APP_URL, { action: 'queryDeliveries', token: ADMIN_TOKEN, submissionId: over.id, limit: 200 });
  if (q.status !== 'ok') fail('queryDeliveries', q);
  const rows = q.deliveries || [];
  const linked = rows.filter(r => r.beforePhotoLink && r.afterPhotoLink);
  console.log(`  month file: ${rows.length} rows for this submission, ${linked.length} with both links`);
  if (rows.length !== delivery.rows.length) fail(`expected ${delivery.rows.length} rows back`, rows.map(r => r.dish));
  if (linked.length !== rows.length) fail('rows missing photo links', rows.map(r => ({ dish: r.dish, before: r.beforePhotoLink, after: r.afterPhotoLink })));

  console.log('PASS');
})().catch(e => fail(e.message));
