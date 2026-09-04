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
const { readPrefix, requireKeys } = require('./env');

const { environment, prefix } = readPrefix(
  process.argv[2],
  'Usage: node scripts/set-clasp-env.js <staging|production>'
);

const { SCRIPT_ID: scriptId } = requireKeys(prefix, ['SCRIPT_ID']);

const target = path.join(__dirname, '..', '.clasp.json');
fs.writeFileSync(target, JSON.stringify({ scriptId, rootDir: './backend' }, null, 2) + '\n');

console.log(`clasp target -> ${environment.toUpperCase()} (${scriptId})`);
