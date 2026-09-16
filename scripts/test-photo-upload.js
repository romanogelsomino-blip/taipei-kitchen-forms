#!/usr/bin/env node
/**
 * End-to-end photo test: a two-dish delivery, then its photos, then the links read back.
 * Usage: node scripts/test-photo-upload.js <staging|production>
 * Leaves two rows marked ZZ-TEST-PHOTO (store 6006) and two photos in the environment.
 */
const { readPrefix, requireKeys } = require('./env');
const webapp = require('./webapp');
const { deliveryPayload, photosPayload, newSubmissionId, todayNY } = require('./smoke-payload');

const USAGE = 'Usage: node scripts/test-photo-upload.js <staging|production>';
const { environment, prefix } = readPrefix(process.argv[2] || 'staging', USAGE);
const { WEB_APP_URL, ADMIN_TOKEN } = requireKeys(prefix, ['WEB_APP_URL', 'ADMIN_TOKEN']);
const over = { tag: 'ZZ-TEST-PHOTO', store: '6006', date: todayNY(), id: newSubmissionId(), dishes: 2 };

function fail(what, detail) {
  console.error(`FAIL: ${what}`, detail === undefined ? '' : JSON.stringify(detail));
  process.exit(1);
}

(async () => {
  console.log(`Photo test on ${environment}: submission ${over.id}, date ${over.date}`);

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
