#!/usr/bin/env node

/**
 * Set SPREADSHEET_ID Script Property for staging or production
 * This fixes the hardcoded spreadsheet ID issue
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

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
const ADMIN_TOKEN = envVars.ADMIN_TOKEN;

// Environment-specific spreadsheet IDs
const SPREADSHEET_IDS = {
  staging: '1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E',
  production: '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI'
};

const SPREADSHEET_ID = SPREADSHEET_IDS[ENV];

if (!SPREADSHEET_ID) {
  console.error(`❌ Error: Unknown environment "${ENV}". Use "staging" or "production".`);
  process.exit(1);
}

console.log(`\n🔧 Setting SPREADSHEET_ID Script Property for ${ENV.toUpperCase()}`);
console.log(`Spreadsheet ID: ${SPREADSHEET_ID}`);
console.log(`Web App URL: ${WEB_APP_URL}\n`);

// For now, this needs to be done manually via Apps Script editor
// because setting Script Properties via Web App requires additional setup

console.log('⚠️  MANUAL STEPS REQUIRED:');
console.log(`\n1. Open Apps Script editor:`);
console.log(`   https://script.google.com/home/projects/${ENV === 'staging' ? '1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP' : '1WoLDGj8t2u23SXBT2XaZFCUg60hdvy4G2REXxqEPaqHuUudmFoyqJjbU'}`);
console.log(`\n2. Click: Project Settings (gear icon on left)`);
console.log(`\n3. Scroll to "Script Properties" section`);
console.log(`\n4. Click "Add script property"`);
console.log(`   - Property: SPREADSHEET_ID`);
console.log(`   - Value: ${SPREADSHEET_ID}`);
console.log(`\n5. Click "Save script properties"`);
console.log(`\n✅ Done! The script will now use the correct ${ENV} spreadsheet.\n`);
