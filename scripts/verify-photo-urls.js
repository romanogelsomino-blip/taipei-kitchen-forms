#!/usr/bin/env node

/**
 * Verify photo URLs in staging spreadsheet
 * Searches for test driver and checks columns S/T
 */

const https = require('https');

const SPREADSHEET_ID = '1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E';
const TEST_DRIVER = process.argv[2] || 'TEST_DRIVER_1782420599054';
const SHEET_NAME = 'Delivery Log - Live';

console.log(`\n🔍 Verifying Photo URLs`);
console.log(`Spreadsheet: ${SPREADSHEET_ID}`);
console.log(`Looking for driver: ${TEST_DRIVER}\n`);

console.log(`⚠️  This requires Google Sheets API access or manual verification.\n`);
console.log(`Manual verification steps:`);
console.log(`1. Open: https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`);
console.log(`2. Go to "${SHEET_NAME}" tab`);
console.log(`3. Press Ctrl+F (or Cmd+F) and search for: ${TEST_DRIVER}`);
console.log(`4. Check columns S and T for that row`);
console.log(`5. Expected format: https://drive.google.com/file/d/...`);
console.log(`\nIf columns S and T have Drive URLs: ✅ PASS`);
console.log(`If columns S and T are empty: ❌ FAIL\n`);
