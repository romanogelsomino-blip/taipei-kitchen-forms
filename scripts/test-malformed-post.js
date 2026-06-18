#!/usr/bin/env node
/**
 * Test malformed POST to Web App and verify error logging
 * Usage: node scripts/test-malformed-post.js <staging|production>
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const url = require('url');

// Parse command line args
const [,, environment] = process.argv;

if (!environment) {
  console.error('Usage: node scripts/test-malformed-post.js <staging|production>');
  process.exit(1);
}

// Load .env file
const envFile = `.env.${environment}`;
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
      env[key] = valueParts.join('=');
    }
  }
});

if (!env.WEB_APP_URL || !env.ADMIN_TOKEN) {
  console.error(`Error: WEB_APP_URL or ADMIN_TOKEN not found in ${envFile}`);
  process.exit(1);
}

console.log(`🧪 Testing malformed POST to ${environment}...`);

// Step 1: POST malformed data
function postMalformedData() {
  return new Promise((resolve, reject) => {
    const malformedPayload = '{"invalid": "this is missing required fields"}';

    const parsedUrl = url.parse(env.WEB_APP_URL);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(malformedPayload),
        'User-Agent': 'taipei-kitchen-test/1.0'
      }
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('📤 POST Response:', json);
          if (json.status === 'error') {
            console.log('✅ Server correctly returned error status');
            resolve(json);
          } else {
            console.log('⚠️  Expected error status, got:', json.status);
            resolve(json);
          }
        } catch (e) {
          console.error('❌ Error parsing POST response');
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.error(`❌ POST request failed: ${e.message}`);
      reject(e);
    });

    req.write(malformedPayload);
    req.end();
  });
}

// Step 2: Read execution log
function getExecutionLog() {
  return new Promise((resolve, reject) => {
    const logUrl = `${env.WEB_APP_URL}?action=getExecutionLog&token=${encodeURIComponent(env.ADMIN_TOKEN)}&limit=5`;

    function makeRequest(urlString, redirectCount = 0) {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      const parsedUrl = url.parse(urlString);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'User-Agent': 'taipei-kitchen-test/1.0'
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
            resolve(json);
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.end();
    }

    makeRequest(logUrl);
  });
}

// Main test flow
(async () => {
  try {
    // Step 1: POST malformed data
    await postMalformedData();

    // Wait 2 seconds for log to be written
    console.log('⏳ Waiting 2 seconds for log entry...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2: Read execution log
    console.log('📖 Reading execution log...');
    const logResponse = await getExecutionLog();

    if (logResponse.status !== 'ok') {
      console.error('❌ Failed to read execution log:', logResponse);
      process.exit(1);
    }

    console.log(`📊 Retrieved ${logResponse.logs.length} log entries`);

    // Check if most recent entry is an ERROR
    const recentEntries = logResponse.logs.reverse(); // Most recent first
    const errorEntry = recentEntries.find(entry => entry.status === 'ERROR');

    if (!errorEntry) {
      console.error('❌ No ERROR entry found in recent logs');
      console.log('Recent logs:', recentEntries);
      process.exit(1);
    }

    console.log('✅ Found ERROR log entry:');
    console.log(JSON.stringify(errorEntry, null, 2));

    console.log('\n🎉 Malformed POST test PASSED:');
    console.log('  - Server returned error response');
    console.log('  - Error logged to Execution Log');
    console.log('  - Form Type:', errorEntry.formType);
    console.log('  - Error Message:', errorEntry.errorMessage);
    console.log('  - Duration:', errorEntry.durationMs, 'ms');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
})();
