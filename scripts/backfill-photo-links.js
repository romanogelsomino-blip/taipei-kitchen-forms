#!/usr/bin/env node
/**
 * Backfill Photo Links - Link orphaned photos to delivery rows
 *
 * Finds photos in Drive that were uploaded but not linked to sheet rows,
 * matches them to delivery rows by store/date/driver, and writes the URLs back.
 */

require('dotenv').config({ path: '.env.production' });
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const WEB_APP_URL = process.env.WEB_APP_URL;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!WEB_APP_URL || !ADMIN_TOKEN) {
  console.error('❌ Error: Missing WEB_APP_URL or ADMIN_TOKEN in .env.production');
  process.exit(1);
}

async function backfillPhotos(date) {
  console.log(`\n🔍 Backfilling photo links for ${date}...`);

  try {
    const url = `${WEB_APP_URL}?action=backfillPhotoLinks&token=${ADMIN_TOKEN}&date=${date}`;

    const { stdout, stderr } = await execPromise(`curl -s "${url}"`);

    if (stderr) {
      console.error('curl stderr:', stderr);
    }

    const response = JSON.parse(stdout);

    if (response.status === 'ok') {
      console.log(`✅ Success!`);
      console.log(`   Photos processed: ${response.photosProcessed || 0}`);
      console.log(`   Rows updated: ${response.rowsUpdated || 0}`);
      console.log(`   Orphans (no match): ${response.orphans || 0}`);

      if (response.details) {
        console.log('\nDetails:');
        response.details.forEach(d => {
          console.log(`   ${d}`);
        });
      }
    } else {
      console.log(`❌ Failed: ${response.message || 'Unknown error'}`);
      if (response.error) {
        console.log(`   Error: ${response.error}`);
      }
    }

    return response;

  } catch (error) {
    console.error('❌ Error calling backfill endpoint:', error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const date = args[0] || new Date().toISOString().split('T')[0];

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Photo Link Backfill Script');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Target date: ${date}`);

  await backfillPhotos(date);

  console.log('\n✅ Backfill complete\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
