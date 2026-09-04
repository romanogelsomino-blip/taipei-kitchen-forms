#!/usr/bin/env node
/**
 * Print one .env value for use in a shell command.
 *
 * Usage: node scripts/print-env.js <staging|production> <KEY>
 *   WEB_APP_URL=$(node scripts/print-env.js production WEB_APP_URL)
 *
 * KEY is the unprefixed name — WEB_APP_URL, ADMIN_TOKEN, SPREADSHEET_ID — and the
 * environment picks the PROD_ / STAGING_ prefix.
 *
 * This exists because `grep KEY= .env | cut -d= -f2-` looks right and is wrong: values
 * carry trailing ` # comments` that only the parser strips. Reusing it here keeps one
 * definition of what a .env value means.
 */

const { readPrefix, requireKeys } = require('./env');

const usage = 'Usage: node scripts/print-env.js <staging|production> <KEY>';
const { prefix } = readPrefix(process.argv[2], usage);

const key = process.argv[3];
if (!key) {
  console.error(usage);
  process.exit(1);
}

process.stdout.write(requireKeys(prefix, [key])[key] + '\n');
