#!/usr/bin/env node
/**
 * Generate .clasp.json for an environment from .env.
 *
 * Usage: node scripts/set-clasp-env.js <staging|production>
 *
 * .clasp.json is generated, never committed — the script id has one source of truth
 * (.env locally, the matching GitHub secret in CI) so the two cannot drift.
 */

const fs = require('fs');
const path = require('path');

const environment = process.argv[2];
if (environment !== 'staging' && environment !== 'production') {
  console.error('Usage: node scripts/set-clasp-env.js <staging|production>');
  process.exit(1);
}

const envFile = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envFile)) {
  console.error(`Error: ${envFile} not found`);
  process.exit(1);
}

const env = {};
fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
  line = line.trim();
  if (!line || line.startsWith('#')) return;
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    // Strip a trailing ` # comment` — whitespace required before the #.
    env[key.trim()] = valueParts.join('=').replace(/\s+#.*$/, '').trim();
  }
});

const PREFIX = environment === 'production' ? 'PROD' : 'STAGING';
const scriptId = env[`${PREFIX}_SCRIPT_ID`];

if (!scriptId) {
  console.error(`Error: ${PREFIX}_SCRIPT_ID not found in .env`);
  process.exit(1);
}

const target = path.join(__dirname, '..', '.clasp.json');
fs.writeFileSync(target, JSON.stringify({ scriptId, rootDir: './backend' }, null, 2) + '\n');

console.log(`clasp target -> ${environment.toUpperCase()} (${scriptId})`);
