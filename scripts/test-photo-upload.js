#!/usr/bin/env node

/**
 * Test photo upload pipeline on staging
 *
 * Tests:
 * 1. Submit test delivery to create matching row
 * 2. Submit photos for that delivery
 * 3. Verify Drive URLs appear in columns S/T
 * 4. Check execution logs for success message
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const ENV = process.argv[2] || 'staging';
const envFile = path.join(__dirname, '..', `.env.${ENV}`);

if (!fs.existsSync(envFile)) {
  console.error(`❌ Error: ${envFile} not found`);
  process.exit(1);
}

// Parse .env file
const envVars = fs.readFileSync(envFile, 'utf-8')
  .split('\n')
  .filter(line => line && !line.startsWith('#'))
  .reduce((acc, line) => {
    const [key, ...valueParts] = line.split('=');
    acc[key.trim()] = valueParts.join('=').trim();
    return acc;
  }, {});

const WEB_APP_URL = envVars.WEB_APP_URL;

if (!WEB_APP_URL) {
  console.error(`❌ Error: WEB_APP_URL not found in ${envFile}`);
  process.exit(1);
}

// Test data
const TEST_DATE = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const TEST_DRIVER = 'TEST_DRIVER_' + Date.now();
const TEST_STORE_ID = '6006';

// Minimal 1x1 red pixel JPEG in base64
const TEST_IMAGE_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/B+IA/9k=';

console.log('\n🧪 Testing Photo Upload Pipeline');
console.log(`Environment: ${ENV.toUpperCase()}`);
console.log(`Web App URL: ${WEB_APP_URL}`);
console.log(`Test Store: ${TEST_STORE_ID}`);
console.log(`Test Date: ${TEST_DATE}`);
console.log(`Test Driver: ${TEST_DRIVER}\n`);

// Helper: POST to Web App
function postToWebApp(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEB_APP_URL);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        // Handle Google Apps Script redirect
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location;
          https.get(redirectUrl, (redirectRes) => {
            let redirectData = '';
            redirectRes.on('data', (chunk) => redirectData += chunk);
            redirectRes.on('end', () => {
              try {
                resolve(JSON.parse(redirectData));
              } catch (e) {
                resolve({ raw: redirectData });
              }
            });
          }).on('error', reject);
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper: Wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test flow
(async () => {
  try {
    // Step 1: Submit test delivery
    console.log('📝 Step 1: Submitting test delivery...');
    const deliveryPayload = {
      formType: 'delivery',
      rows: [{
        clientTimestamp: new Date().toISOString(),
        date: TEST_DATE,
        driver: TEST_DRIVER,
        vehicle: 'TEST-VEH-1',
        store: TEST_STORE_ID,
        arrive: '12:00',
        coolerTemp: '38',
        coolerCond: 'Good',
        casePrefillPercent: '75',
        dish: 'Test Dish',
        added: '10',
        before: '5',
        removed: '0',
        reason: '',
        after: '15',
        notes: 'Automated test delivery',
        receivedBy: 'Test Manager'
      }]
    };

    const deliveryResult = await postToWebApp(deliveryPayload);
    console.log('   Response:', deliveryResult);

    if (deliveryResult.status !== 'ok') {
      console.error('❌ FAIL: Delivery submission failed');
      process.exit(1);
    }
    console.log('✅ Delivery submitted successfully\n');

    // Wait for sheet to update
    await sleep(2000);

    // Step 2: Submit photos
    console.log('📸 Step 2: Submitting test photos...');
    const photoPayload = {
      formType: 'photos_only',
      photos: {
        storeId: TEST_STORE_ID,
        date: TEST_DATE,
        driver: TEST_DRIVER,
        storeName: 'Store 6006',
        before: {
          data: TEST_IMAGE_BASE64,
          type: 'image/jpeg'
        },
        after: {
          data: TEST_IMAGE_BASE64,
          type: 'image/jpeg'
        }
      }
    };

    const photoResult = await postToWebApp(photoPayload);
    console.log('   Response:', photoResult);

    if (photoResult.status !== 'ok') {
      console.error('❌ FAIL: Photo submission failed');
      process.exit(1);
    }
    console.log(`✅ Photos submitted successfully (${photoResult.savedPhotos} photos)\n`);

    // Wait for sheet to update
    await sleep(2000);

    // Step 3: Verify results
    console.log('🔍 Step 3: Verifying results...');
    console.log('\n⚠️  Manual verification required:');
    console.log(`   1. Open staging spreadsheet: https://docs.google.com/spreadsheets/d/1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E`);
    console.log(`   2. Go to "Delivery Log - Live" tab`);
    console.log(`   3. Find row with driver="${TEST_DRIVER}" and date="${TEST_DATE}"`);
    console.log(`   4. Check columns S and T for Drive URLs`);
    console.log(`   5. Click URLs to verify photos open\n`);

    console.log('   Expected columns S/T format: https://drive.google.com/file/d/...\n');

    console.log('📋 Step 4: Check execution logs:');
    console.log(`   Run: npm run test:log:staging`);
    console.log(`   Look for: [PHOTO UPLOAD] SUCCESS: Linked photos to row X\n`);

    console.log('✅ TEST COMPLETE');
    console.log(`\nTest Data Summary:`);
    console.log(`  Store ID: ${TEST_STORE_ID}`);
    console.log(`  Date: ${TEST_DATE}`);
    console.log(`  Driver: ${TEST_DRIVER}`);
    console.log(`\nTo clean up: Delete the test row from staging spreadsheet (search for driver="${TEST_DRIVER}")`);

  } catch (error) {
    console.error('❌ TEST FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
})();
