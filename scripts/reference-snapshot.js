#!/usr/bin/env node
/**
 * Refresh the git copies of data/<list>.json from an environment's backend.
 * Usage: node scripts/reference-snapshot.js <staging|production>
 *
 * The published site gets these files from the backend on every build. The copies in git
 * exist for local runs (npm run serve, npm run serve:demo), which have no build step; run
 * this when a local run should see the current lists. The files are never edited by hand:
 * the dashboard's Config tab is where the lists change.
 */
const fs = require('fs');
const path = require('path');
const { readPrefix, requireKeys } = require('./env');
const webapp = require('./webapp');

const LISTS = ['kitchens', 'stores', 'dishes', 'cooks', 'drivers'];   // the order of the sheet's tabs and the Config tab

/** Now as the store's instant format: ISO 8601 in New York with its numeric offset. */
function nowNY() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', timeZoneName: 'longOffset',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${offset}`;
}

const { environment, prefix } = readPrefix(process.argv[2], 'Usage: node scripts/reference-snapshot.js <staging|production>');
const { WEB_APP_URL } = requireKeys(prefix, ['WEB_APP_URL']);

webapp.get(WEB_APP_URL, { action: 'reference' })
  .then(json => {
    if (json.status !== 'ok') throw new Error(json.message || 'the backend returned an error');
    const generatedAt = nowNY();
    LISTS.forEach(list => {
      const body = {};
      body[list] = json[list] || [];
      body.version = json.version;
      body.generatedAt = generatedAt;
      fs.writeFileSync(path.join(__dirname, '..', 'data', list + '.json'), JSON.stringify(body, null, 2) + '\n');
      console.log(`data/${list}.json: ${body[list].length} entries`);
    });
    console.log(`reference ${json.version} from ${environment} (${json.source})`);
  })
  .catch(e => {
    console.error(e.message);
    process.exit(1);
  });
