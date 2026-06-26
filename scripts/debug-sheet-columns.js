#!/usr/bin/env node

/**
 * Debug: Print actual column values from test row to verify indices
 */

console.log('\n🔍 DEBUGGING: Column Index Verification\n');
console.log('From the screenshot, the test row (1966) shows:');
console.log('  Column B: 2026-06-25 (Date)');
console.log('  Column C: TEST_DRIV... (Driver)');
console.log('  Column D: 6006 (Store #)');
console.log('  Column E: 12:00 (Arrival time)\n');

console.log('Current code expects:');
console.log('  row[2] (Col C / index 2) = Date       ✅ CORRECT');
console.log('  row[3] (Col D / index 3) = Driver     ❌ WRONG - Driver is in Col C (index 2)');
console.log('  row[5] (Col F / index 5) = Store ID   ❌ WRONG - Store is in Col D (index 3)\n');

console.log('The screenshot shows the header row has these columns:');
console.log('  A: Submitted At');
console.log('  B: Date');
console.log('  C: Driver');
console.log('  D: Store #');
console.log('  E: Arrival time\n');

console.log('But the Code.gs appendRow writes:');
console.log('  Col A: clientTimestamp');
console.log('  Col B: serverTimestamp');
console.log('  Col C: date');
console.log('  Col D: driver');
console.log('  Col E: vehicle');
console.log('  Col F: store\n');

console.log('❓ HYPOTHESIS:');
console.log('The staging sheet might have a DIFFERENT column structure than production.');
console.log('OR the screenshot is showing a filtered/hidden column view.\n');

console.log('📋 ACTION REQUIRED:');
console.log('1. Open staging sheet: https://docs.google.com/spreadsheets/d/1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E');
console.log('2. Go to row 1 (header row)');
console.log('3. Count columns A, B, C, D, E, F and tell me what the headers say');
console.log('4. Specifically: Is column A "Submitted At" or "Client Timestamp"?');
console.log('5. Is there a hidden "Server Timestamp" column between A and B?\n');
