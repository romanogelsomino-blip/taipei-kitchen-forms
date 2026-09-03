#!/usr/bin/env node
/**
 * Helper script to call admin actions on Apps Script Web App
 * Usage: node scripts/admin-action.js <env> <action>
 * Example: node scripts/admin-action.js staging init
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const url = require('url');

// Parse command line args
const [,, environment, action, ...additionalParams] = process.argv;

if (!environment || !action) {
  console.error('Usage: node scripts/admin-action.js <staging|production> <action> [params...]');
  console.error('Actions: init, test, ping, sendDailySummary, getExecutionLog, listTriggers, createTrigger, deleteTrigger');
  console.error('Example: node scripts/admin-action.js staging deleteTrigger sendDailySummary');
  process.exit(1);
}

// Load .env — a single file holding every variable for every environment, prefixed,
// mirroring the GitHub Actions secrets one-for-one.
const envFile = '.env';
if (!fs.existsSync(envFile)) {
  console.error(`Error: ${envFile} not found`);
  process.exit(1);
}

const envContent = fs.readFileSync(envFile, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  line = line.trim();
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      // Strip a trailing ` # comment`. Requires whitespace before the #, so a literal
      // '#' inside a value (URL fragment, token) is preserved.
      env[key] = valueParts.join('=').replace(/\s+#.*$/, '').trim();
    }
  }
});

const PREFIX = environment === 'production' ? 'PROD' : 'STAGING';
const WEB_APP_URL = env[`${PREFIX}_WEB_APP_URL`];
const ADMIN_TOKEN = env[`${PREFIX}_ADMIN_TOKEN`];

if (!WEB_APP_URL || !ADMIN_TOKEN) {
  console.error(`Error: ${PREFIX}_WEB_APP_URL or ${PREFIX}_ADMIN_TOKEN not found in ${envFile}`);
  process.exit(1);
}

env.WEB_APP_URL = WEB_APP_URL;
env.ADMIN_TOKEN = ADMIN_TOKEN;

// Build request URL with optional parameters
let requestUrl = `${env.WEB_APP_URL}?action=${action}&token=${encodeURIComponent(env.ADMIN_TOKEN)}`;

// Handle special cases that need extra parameters
if (action === 'deleteTrigger' && additionalParams.length > 0) {
  requestUrl += `&function=${encodeURIComponent(additionalParams[0])}`;
}

if (action === 'getExecutionLog' && additionalParams.length > 0) {
  requestUrl += `&limit=${encodeURIComponent(additionalParams[0])}`;
}

if (action === 'queryDeliveries') {
  // Parse additional params as key=value pairs
  additionalParams.forEach(param => {
    if (param.includes('=')) {
      const [key, value] = param.split('=');
      if (key && value !== undefined) {
        requestUrl += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      }
    } else {
      // Handle flag parameters like "debug"
      requestUrl += `&${encodeURIComponent(param)}=true`;
    }
  });
}

console.log(`🔧 Calling ${action} on ${environment}...`);

// Make HTTP request (follow redirects manually)
function makeRequest(urlString, redirectCount = 0) {
  if (redirectCount > 5) {
    console.error('Error: Too many redirects');
    process.exit(1);
  }

  const parsedUrl = url.parse(urlString);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    method: 'GET',
    headers: {
      'User-Agent': 'taipei-kitchen-automation/1.0'
    }
  };

  const req = protocol.request(options, (res) => {
    // Handle redirects
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
      const location = res.headers.location;
      if (location) {
        makeRequest(location, redirectCount + 1);
        return;
      }
    }

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log('✅ Response:');
        console.log(JSON.stringify(json, null, 2));

        if (json.status === 'ok' || json.status === 'SUCCESS') {
          process.exit(0);
        } else {
          console.error('⚠️  Action completed with non-OK status');
          process.exit(1);
        }
      } catch (e) {
        console.error('❌ Error parsing response as JSON:');
        console.error(data.substring(0, 500));
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ Request failed: ${e.message}`);
    process.exit(1);
  });

  req.end();
}

makeRequest(requestUrl);
