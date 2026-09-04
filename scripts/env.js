#!/usr/bin/env node
/**
 * Read the root .env — a single file holding every variable for both environments,
 * prefixed PROD_ / STAGING_, mirroring the GitHub Actions secret names one-for-one.
 *
 * Trailing ` # comment` is stripped on whitespace-then-hash, so a literal '#' inside a
 * value (a URL fragment, a token) survives.
 */

const fs = require('fs');
const path = require('path');

function readEnv() {
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
      env[key.trim()] = valueParts.join('=').replace(/\s+#.*$/, '').trim();
    }
  });

  return env;
}

/** Resolve an environment name to its .env key prefix. */
function readPrefix(environment, usage) {
  if (environment !== 'staging' && environment !== 'production') {
    console.error(usage);
    process.exit(1);
  }
  return { environment, prefix: environment === 'production' ? 'PROD' : 'STAGING' };
}

/**
 * Read .env and pull the prefixed keys an environment needs, e.g.
 * requireKeys('STAGING', ['WEB_APP_URL']) -> { WEB_APP_URL: '…' }.
 * Exits with a named error if any are missing, rather than failing later on undefined.
 */
function requireKeys(prefix, names) {
  const env = readEnv();
  const out = {};
  const missing = [];
  names.forEach(name => {
    const value = env[`${prefix}_${name}`];
    if (!value) missing.push(`${prefix}_${name}`);
    out[name] = value;
  });
  if (missing.length) {
    console.error(`Error: ${missing.join(', ')} not found in .env`);
    process.exit(1);
  }
  return out;
}

module.exports = { readEnv, readPrefix, requireKeys };
