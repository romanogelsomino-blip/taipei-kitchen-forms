#!/usr/bin/env node
/**
 * Call an admin action on the web app and print its JSON.
 * Usage: node scripts/admin-action.js <staging|production> <action> [key=value ...]
 * A bare word is sent as key=true; for getExecutionLog a bare first word is the limit.
 *
 * Production is read-only from here. CI owns every write to it — init, Script Properties,
 * formatting — and `test` writes a real violation and emails the client's food-safety
 * recipients. The one write a person may need, rotateAdminToken, requires write=production
 * on the command line.
 */
const { readPrefix, requireKeys } = require('./env');
const webapp = require('./webapp');

const PRODUCTION_READS = ['ping', 'storageStatus', 'referenceStatus', 'reference', 'getExecutionLog', 'queryDeliveries', 'mailStatus', 'getViolations'];
const USAGE = 'Usage: node scripts/admin-action.js <staging|production> <action> [key=value ...]\n' +
  'Actions: ping, storageStatus, referenceStatus, reference, getExecutionLog, queryDeliveries, mailStatus, init, test, formatStorage, setScriptProperty, rotateAdminToken\n' +
  'Production accepts reads only; rotateAdminToken needs write=production.';
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
  else if (i === 0 && action === 'getExecutionLog') query.limit = p;
  else query[p] = 'true';
});

if (environment === 'production' && !PRODUCTION_READS.includes(action)) {
  if (action !== 'rotateAdminToken' || query.write !== 'production') {
    console.error(`Refused: ${action} writes to production. Production is read-only from a laptop; CI does the writes.` +
      (action === 'rotateAdminToken' ? ' Add write=production to rotate the token.' : ''));
    process.exit(1);
  }
}
delete query.write;

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
