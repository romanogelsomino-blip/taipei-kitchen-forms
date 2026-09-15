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

  // The legacy sheet, while it is still a write target, through its own reader.
  if (String(ping.write_targets || '').includes('legacy')) {
    const q = await webapp.get(WEB_APP_URL, { action: 'queryDeliveries', token: ADMIN_TOKEN, date: over.date, driver: over.tag, limit: 200 });
    const rows = (q.deliveries || []).filter(r => r.driver === over.tag);
    const linked = rows.filter(r => r.beforePhotoLink && r.afterPhotoLink);
    console.log(`  legacy: ${rows.length} rows for ${over.tag} today, ${linked.length} with both links`);
    if (linked.length < delivery.rows.length) fail('legacy rows missing links', rows.slice(-delivery.rows.length));
  }

  console.log('PASS');
})().catch(e => fail(e.message));
