#!/usr/bin/env node
/**
 * Call an admin action on the web app and print its JSON.
 * Usage: node scripts/admin-action.js <staging|production> <action> [key=value ...]
 * A bare word is sent as key=true; for deleteTrigger and getExecutionLog a bare first word
 * is the function name or the limit.
 */
const { readPrefix, requireKeys } = require('./env');
const webapp = require('./webapp');

const USAGE = 'Usage: node scripts/admin-action.js <staging|production> <action> [key=value ...]\n' +
  'Actions: ping, storageStatus, init, test, getExecutionLog, queryDeliveries, listTriggers, createTrigger, deleteTrigger, checkPhotoDrift, formatStorage, mailStatus, sendDailySummary, setScriptProperty, rotateAdminToken';
const [,, environment, action, ...params] = process.argv;
if (!environment || !action) {
  console.error(USAGE);
  process.exit(1);
}
const { prefix } = readPrefix(environment, USAGE);
const { WEB_APP_URL, ADMIN_TOKEN } = requireKeys(prefix, ['WEB_APP_URL', 'ADMIN_TOKEN']);

const query = { action, token: ADMIN_TOKEN };
params.forEach((p, i) => {
  const eq = p.indexOf('=');
  if (eq > 0) query[p.slice(0, eq)] = p.slice(eq + 1);
  else if (i === 0 && action === 'deleteTrigger') query.function = p;
  else if (i === 0 && action === 'getExecutionLog') query.limit = p;
  else query[p] = 'true';
});

console.log(`Calling ${action} on ${environment}...`);
webapp.get(WEB_APP_URL, query)
  .then(json => {
    console.log(JSON.stringify(json, null, 2));
    process.exit(json.status === 'ok' || json.status === 'SUCCESS' ? 0 : 1);
  })
  .catch(e => {
    console.error(e.message);
    process.exit(1);
  });
