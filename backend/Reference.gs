// Reference.gs — the reference lists: kitchens, supervisors, dishes, stores, drivers.
//
// One spreadsheet, `Reference`, at the root of SPREADSHEET_FOLDER_ID beside the year folders,
// one tab per list. The dashboard's Config tab edits it through doPost (type: 'config'); the
// dashboard and the site build read it through ?action=reference. A form never calls this:
// the site job publishes each list as a static data/<list>.json on every build, and a save
// here asks GitHub to run that build.
//
// Every entry is keyed by a UUID the backend assigns and never changes: its System ID.
// Kitchens and stores also carry the identifier their organisation gave them (Kitchen ID,
// Store ID) and that organisation's name (Kitchen Type, Store Type). A store's Store ID is
// the number in its printed QR code, in every delivery row and in every photo filename; a
// production row carries its kitchen's name, System ID and Kitchen ID.
//
// The lists are a picker source, not a constraint. Nothing validates a submitted kitchen,
// dish, driver or supervisor against them, and nothing may: the pickers allow free text and
// a delivery must never be refused over a dropdown.
//
// A row is never removed from the sheet. An entry is deactivated to pause it (hidden from
// the forms, shown greyed on the Config tab, one switch to resume) or deleted to retire it
// (hidden from the Config tab too, restorable from its deleted list); either way history
// still resolves its name. The four name-keyed lists are stored in the monthly rows by
// display name, so history depends on names staying put; the Config tab warns before a
// rename and the backend never rewrites a record.

const REFERENCE_FILE_NAME = 'Reference';
const REFERENCE_MEMO = {};                          // per-execution: opened, ensured, payload
const REFERENCE_CACHE_KEY = 'reference:payload:v4';
const REFERENCE_CACHE_SEC = 600;                    // bounds staleness after a hand edit in Sheets, which nothing invalidates
const REFERENCE_VERSION_PREFIX = 'r4-';             // payload-shape revision; bump when an entry's shape changes
const REFERENCE_ROW_CAP = 500;                      // an unauthenticated append endpoint needs a ceiling
const REFERENCE_WRITES_PER_MINUTE = 20;
const REFERENCE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE_ORG_ID_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;   // goes into ?store=<id> and photo filenames: no '_' (their separator), no '.', nothing to percent-encode
const REFERENCE_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const REFERENCE_LIMITS = { orgId: 40, name: 80, text: 120, reorder: 500 };   // reorder matches REFERENCE_ROW_CAP
const REFERENCE_RESERVED_STORE_UUID = '00000000-0000-4000-8000-000000000000';   // store 0000, which the dev deploy's smoke test writes to
const REFERENCE_CATCHALL_DISH_UUID = '00000000-0000-4000-8000-000000000001';    // NON-TAIPEI DISH, UPC 00000000000000: where sales of items no dish claims are filed

// ─── The lists ───────────────────────────────────────────────────────────────

/**
 * The five lists, in the order the sheet's tabs, the payload and the Config tab show them:
 * Kitchens, Stores, Dishes, Supervisors, Drivers.
 *
 * `attrs` are the columns beyond name: kind 'type' is one of `types`, 'orgId' is the
 * organisation's own identifier (unique on its own, or per type when `uniqueWith` names the
 * type column), 'upc' is the 14-digit code the retailer's sales data carries for a dish
 * (required, unique), 'text' is free text, required when `required` is set. `storedAs` names the
 * monthly tab and field that carry one of an entry's attributes, which is what a change to
 * it leaves behind in the records.
 *
 * Two flags beyond deletion, each on the lists that have a use for it. `active` is the pause
 * switch, dishes only: off the forms without losing its place. `verified` marks an entry a
 * person added or confirmed, as against one an import created from the data it met; the
 * forms offer only verified entries.
 */
function referenceLists() {
  const location = { key: 'location', header: 'Location', kind: 'text', required: true };
  return [
    { tab: 'Kitchens', key: 'kitchens', noun: 'kitchen', types: ['Taipei', 'Giant'], active: false, verified: true,
      attrs: [
        { key: 'kitchenType', header: 'Kitchen Type', kind: 'type' },
        { key: 'kitchenId',   header: 'Kitchen ID',   kind: 'orgId', uniqueWith: 'kitchenType' },
        location
      ],
      storedAs: [{ tab: 'Production', field: 'kitchen', attr: 'name' }] },
    { tab: 'Stores', key: 'stores', noun: 'store', types: ['Giant'], active: false, verified: true,
      attrs: [
        { key: 'storeType', header: 'Store Type', kind: 'type' },
        { key: 'storeId',   header: 'Store ID',   kind: 'orgId', uniqueWith: null },   // records carry the number alone, as do QR codes printed before System IDs
        location
      ],
      storedAs: [{ tab: 'Deliveries', field: 'storeId', attr: 'storeId' }] },
    { tab: 'Dishes', key: 'dishes', noun: 'dish', types: null, active: true, verified: true,
      attrs: [{ key: 'upc', header: 'UPC', kind: 'upc' }],   // Giant's code for the dish, which its sales rows carry
      storedAs: [{ tab: 'Production', field: 'dish', attr: 'name' }, { tab: 'Deliveries', field: 'dish', attr: 'name' }] },
    { tab: 'Supervisors', key: 'supervisors', noun: 'supervisor', types: null, active: false, verified: false, attrs: [],
      storedAs: [{ tab: 'Production', field: 'supervisor', attr: 'name' }] },
    { tab: 'Drivers', key: 'drivers', noun: 'driver', types: null, active: false, verified: false, attrs: [],
      storedAs: [{ tab: 'Deliveries', field: 'driver', attr: 'name' }] }
  ];
}

function referenceTabNames() {
  return referenceLists().map(list => list.tab);
}

/** The list entry for a tab name or a payload key. Rejects naming the five valid ones. */
function referenceListFor(name) {
  const wanted = String(name || '').toLowerCase();
  const found = referenceLists().find(list => list.tab.toLowerCase() === wanted || list.key === wanted);
  if (!found) {
    throw referenceRejection('Unknown list ' + JSON.stringify(name) + '. Valid lists: ' + referenceLists().map(l => l.key).join(', ') + '.', 'unknown_list');
  }
  return found;
}

/** One reference list's columns, in the vocabulary of Schemas.gs. Header text is the read contract; column order is not. */
function referenceSchemaFor(tab) {
  const list = referenceLists().find(l => l.tab === tab);
  if (!list) throw new Error('Unknown reference tab: ' + tab);
  const head = [
    { header: 'System ID', key: 'id',   type: 'text', width: 290, aliases: ['UUID', 'ID'] },   // the earlier names of the key column
    { header: 'Name',      key: 'name', type: 'text', width: 260 }
  ];
  const attrs = list.attrs.map(attr => ({ header: attr.header, key: attr.key, type: 'text', width: attr.kind === 'text' ? 300 : attr.kind === 'upc' ? 150 : 120 }));
  const tail = [];
  if (list.verified) tail.push({ header: 'Verified', key: 'verified', type: 'bool', width: 80 });   // false until a person confirms an entry an import created
  if (list.active)   tail.push({ header: 'Active',   key: 'active',   type: 'bool', width: 80 });
  tail.push(
    { header: 'Deleted At', key: 'deletedAt', type: 'instant' },   // empty unless the entry is deleted; the row itself stays
    { header: 'Sort',       key: 'sortOrder', type: 'number',  width: 70 },
    { header: 'Created At', key: 'createdAt', type: 'instant' },
    { header: 'Updated At', key: 'updatedAt', type: 'instant' }
  );
  return head.concat(attrs, tail);
}

/** Sheet size at creation. No basic filter: the lists are short and the Config tab is the UI. */
function referenceTabLayout(tab) {
  return { rows: 200, filterThrough: null };
}

// ─── The file ────────────────────────────────────────────────────────────────

function referenceFileUrl(fileId) {
  return 'https://docs.google.com/spreadsheets/d/' + fileId + '/edit';
}

/** File id of the Reference sheet, or null when absent and `create` is false. */
function resolveReferenceFileId(create) {
  const root = getSpreadsheetFolder();
  return create
    ? resolveChildSpreadsheet(root, REFERENCE_FILE_NAME, initReferenceFile)
    : findChildSpreadsheet(root, REFERENCE_FILE_NAME);
}

/**
 * Open the Reference sheet once per execution. Returns { fileId, ss } or null. Missing tabs
 * are added and seeded, and older tabs migrated, only on a write path (`create`); a read
 * never changes the file.
 */
function openReference(create) {
  if (!REFERENCE_MEMO.opened) {
    const fileId = resolveReferenceFileId(create);
    if (!fileId) return null;
    REFERENCE_MEMO.opened = { fileId: fileId, ss: SpreadsheetApp.openById(fileId) };
  }
  if (create && !REFERENCE_MEMO.ensured) {
    ensureReferenceTabs(REFERENCE_MEMO.opened.ss);
    REFERENCE_MEMO.ensured = true;
  }
  return REFERENCE_MEMO.opened;
}

/** A brand-new Reference file: New York time zone, the five tabs in order, each seeded. */
function initReferenceFile(ss) {
  ss.setSpreadsheetTimeZone(NY_TZ);
  const tabs = referenceTabNames();
  ss.getSheets()[0].setName(tabs[0]);
  for (let i = 1; i < tabs.length; i++) ss.insertSheet(tabs[i], i);
  tabs.forEach(tab => initReferenceTab(ss.getSheetByName(tab), tab));
}

/** Headers, formats and styling, then the seed rows. */
function initReferenceTab(sheet, tab) {
  initTabWith(sheet, referenceSchemaFor(tab), referenceTabLayout(tab));
  seedReferenceTab(sheet, tab);
}

/**
 * Idempotent, under the lock: adds any missing tab, seeds a tab it had to create or whose
 * row 1 is empty, migrates a populated tab written under an earlier schema, and puts the
 * tabs in the lists' order. A tab with headers and no rows was emptied on purpose and is
 * left alone.
 */
function ensureReferenceTabs(ss) {
  withScriptLock(() => {
    const tabs = referenceTabNames();
    tabs.forEach((name, i) => {
      let sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name, Math.min(i, ss.getSheets().length));
        initReferenceTab(sheet, name);
      } else if (sheet.getLastRow() === 0) {
        initReferenceTab(sheet, name);
      } else {
        migrateReferenceTab(sheet, name);
      }
    });
    tabs.forEach((name, i) => {
      const sheet = ss.getSheetByName(name);
      if (sheet.getIndex() !== i + 1) {   // a file made under an earlier order; getIndex and moveActiveSheet are both 1-based
        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(i + 1);
      }
    });
  });
}

/**
 * Bring a tab written under an earlier schema up to date: the key column renamed from ID to
 * UUID, columns the schema has gained added and ones it has dropped removed, a row keyed by
 * a slug given a UUID with the slug kept as its organisation id, the reserved CI store marked
 * deleted, every row from before the Verified flag marked verified, and a code the seed
 * learned after a row was written (a dish's UPC) filled in where the row has none. A tab
 * already in shape is left alone, so this costs one read on every init and writes only the
 * first time.
 */
function migrateReferenceTab(sheet, tab) {
  const list = referenceListFor(tab);
  const schema = referenceSchemaFor(tab);
  let headers = sheetHeaders(sheet);
  if (headers.indexOf('System ID') < 0) {   // the key column's earlier names
    const old = ['UUID', 'ID'].map(name => headers.indexOf(name)).find(at => at >= 0);
    if (old !== undefined) sheet.getRange(1, old + 1).setValue('System ID');
  }
  ['Updated By'].concat(list.active ? [] : ['Active']).forEach(dropped => {   // columns an earlier schema wrote that this one does not
    headers = sheetHeaders(sheet);
    const at = headers.indexOf(dropped);
    if (at >= 0) sheet.deleteColumn(at + 1);
  });
  const hadVerified = sheetHeaders(sheet).indexOf('Verified') >= 0;
  sheetColumnsWith(sheet, schema, referenceTabLayout(tab));
  const seedById = {};
  (referenceSeed()[list.key] || []).forEach(entry => { seedById[String(entry.id).toLowerCase()] = entry; });
  readReferenceRows(sheet, tab).forEach(row => {
    const slug = String(row.id).trim();
    const patch = {};
    const seeded = seedById[slug.toLowerCase()];
    list.attrs.forEach(attr => {
      if (attr.kind === 'upc' && !row[attr.key] && seeded && seeded[attr.key]) patch[attr.key] = seeded[attr.key];
    });
    const reserved = list.tab === 'Stores' && (slug.toLowerCase() === REFERENCE_RESERVED_STORE_UUID || String(row.storeId || slug) === '0000');
    if (!REFERENCE_UUID_PATTERN.test(slug)) {
      patch.id = reserved ? REFERENCE_RESERVED_STORE_UUID : Utilities.getUuid();
      list.attrs.forEach(attr => {
        if (row[attr.key]) return;
        if (attr.kind === 'orgId') patch[attr.key] = slug;
        if (attr.kind === 'type') patch[attr.key] = /^\d+$/.test(slug) && list.types.indexOf('Giant') >= 0 ? 'Giant' : list.types[0];   // a bare number was a Giant store number
      });
    }
    if (reserved && !row.deletedAt) patch.deletedAt = formatInstant(new Date());   // the smoke row is never offered anywhere
    if (list.verified && !hadVerified) patch.verified = true;   // every row from before the flag was entered or confirmed by a person
    if (Object.keys(patch).length) updateRow(sheet, schema, row._row, patch);
  });
  // Reserved rows the seed gained after this tab was made: the system depends on them being there.
  const present = readReferenceRows(sheet, tab).map(row => String(row.id).toLowerCase());
  const missing = (referenceSeed()[list.key] || []).filter(entry => entry.reserved && present.indexOf(String(entry.id).toLowerCase()) < 0);
  if (missing.length) {
    const now = formatInstant(new Date());
    appendReferenceRows(sheet, tab, buildRows(schema, missing.map((entry, i) => seedReferenceRow(list, entry, present.length + i + 1, now)), {}));
  }
}

/** One seed entry as a sheet row: the given sortOrder, createdAt now, nothing updated yet. */
function seedReferenceRow(list, entry, sortOrder, now) {
  const row = { id: entry.id, name: entry.name, deletedAt: entry.deletedAt || '', sortOrder: sortOrder, createdAt: now, updatedAt: '' };
  if (list.active) row.active = entry.active !== false;
  if (list.verified) row.verified = true;
  list.attrs.forEach(attr => { row[attr.key] = entry[attr.key] || ''; });
  return row;
}

/** The seed rows for one list, sortOrder from position. */
function seedReferenceTab(sheet, tab) {
  const list = referenceListFor(tab);
  const entries = referenceSeed()[list.key] || [];
  if (!entries.length) return;
  const now = formatInstant(new Date());
  appendReferenceRows(sheet, tab, buildRows(referenceSchemaFor(tab), entries.map((entry, i) => seedReferenceRow(list, entry, i + 1, now)), {}));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Every row of one reference tab, in sheet order, keyed by schema key plus _row. Rows with no key are ignored. */
function readReferenceRows(sheet, tab) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return readRows(sheet.getDataRange().getValues(), referenceSchemaFor(tab)).records
    .filter(record => String(record.id).trim() !== '');
}

/** A row as the API emits it: id, name, the list's attributes, its flags (verified, active) where the list has them, deletedAt (empty unless deleted), sortOrder. The audit columns stay in the sheet. */
function publicReferenceEntry(record, list) {
  const entry = { id: String(record.id).trim(), name: String(record.name) };
  list.attrs.forEach(attr => { entry[attr.key] = String(record[attr.key] === undefined || record[attr.key] === null ? '' : record[attr.key]); });
  if (list.verified) entry.verified = record.verified === true;
  if (list.active) entry.active = record.active === true;
  entry.deletedAt = String(record.deletedAt || '');
  entry.sortOrder = Number(record.sortOrder) || 0;
  return entry;
}

/** Entries in display order, sortOrder then name, so clients need no sort of their own. */
function sortedReferenceEntries(records, list) {
  return records.map(record => publicReferenceEntry(record, list))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/** The seed as the API would emit it, for an environment whose Reference file does not exist yet. */
function seedReferenceEntries(list) {
  return (referenceSeed()[list.key] || []).map((entry, i) => publicReferenceEntry(
    Object.assign({}, entry, { active: entry.active !== false, verified: true, sortOrder: i + 1 }), list));
}

/** The allowed values of every typed attribute, keyed by list, so a client need not hardcode them. */
function referenceTypes() {
  const types = {};
  referenceLists().forEach(list => { if (list.types) types[list.key] = list.types.slice(); });
  return types;
}

/**
 * The five lists plus version, updatedAt, source and types. Memoised per execution and
 * cached for REFERENCE_CACHE_SEC. The cache is checked before the file is resolved, so a hit
 * does no Drive work at all. Never creates the file: without one, the seed stands in.
 */
function referencePayload() {
  if (REFERENCE_MEMO.payload) return REFERENCE_MEMO.payload;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(REFERENCE_CACHE_KEY);
  if (cached) {
    try {
      REFERENCE_MEMO.payload = JSON.parse(cached);
      return REFERENCE_MEMO.payload;
    } catch (e) {
      cache.remove(REFERENCE_CACHE_KEY);
    }
  }
  const payload = buildReferencePayload();
  cache.put(REFERENCE_CACHE_KEY, JSON.stringify(payload), REFERENCE_CACHE_SEC);
  REFERENCE_MEMO.payload = payload;
  return payload;
}

/** Read every tab and assemble the payload. All entries, active and inactive: history still names retired ones. */
function buildReferencePayload() {
  const opened = openReference(false);
  const lists = {};
  let updatedAt = null;
  referenceLists().forEach(list => {
    if (!opened) {
      lists[list.key] = seedReferenceEntries(list);
      return;
    }
    const records = readReferenceRows(opened.ss.getSheetByName(list.tab), list.tab);
    records.forEach(record => {
      [record.updatedAt, record.createdAt].forEach(text => {
        const at = text ? new Date(text) : null;
        if (at && !isNaN(at.getTime()) && (!updatedAt || at > updatedAt)) updatedAt = at;
      });
    });
    lists[list.key] = sortedReferenceEntries(records, list);
  });
  const payload = {
    version: referenceVersion(lists),
    updatedAt: updatedAt ? formatInstant(updatedAt) : '',
    source: opened ? 'sheet' : 'seed',
    types: referenceTypes()
  };
  referenceLists().forEach(list => { payload[list.key] = lists[list.key]; });
  return payload;
}

/** Drop the memo and the cached payload. After every write, and on every setScriptProperty. */
function invalidateReferencePayload() {
  REFERENCE_MEMO.payload = null;
  CacheService.getScriptCache().remove(REFERENCE_CACHE_KEY);
}

/** The version prefix plus eight hex digits of an MD5 over the emitted lists. The audit columns are excluded, so a fresh seed and a seeded sheet agree. */
function referenceVersion(lists) {
  const text = JSON.stringify(referenceLists().map(list => lists[list.key]));
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8);
  const hex = digest.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  return REFERENCE_VERSION_PREFIX + hex.slice(0, 8);
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/** An Error for a request that is wrong rather than a fault. handleConfigWrite records it as REJECTED and never emails support. */
function referenceRejection(message, code) {
  const error = new Error(message);
  error.rejection = true;
  error.code = code || 'rejected';
  return error;
}

/** Refuse more than REFERENCE_WRITES_PER_MINUTE config writes across the whole script. Counted in CacheService; not atomic, and need not be. */
function referenceThrottle() {
  const cache = CacheService.getScriptCache();
  const key = 'reference:writes:' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHHmm');
  const count = (parseInt(cache.get(key), 10) || 0) + 1;
  cache.put(key, String(count), 120);
  if (count > REFERENCE_WRITES_PER_MINUTE) throw referenceRejection('Too many reference changes; try again in a minute.', 'throttled');
}

/** Trimmed, internal whitespace collapsed. The stored form, so "Owen " and "Owen" cannot coexist. */
function normaliseReferenceName(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
}

/** A text field after normalising, or a rejection naming what is wrong with it. */
function checkReferenceText(value, label, max, required) {
  const text = normaliseReferenceName(value);
  if (!text) {
    if (required) throw referenceRejection(label + ' is required.', 'validation');
    return '';
  }
  if (text.length > max) throw referenceRejection(label + ' is longer than ' + max + ' characters.', 'validation');
  if (REFERENCE_CONTROL_CHARS.test(text)) throw referenceRejection(label + ' contains a control character.', 'validation');
  if (text.charAt(0) === '=') throw referenceRejection(label + ' cannot start with "=".', 'validation');   // a formula, if the column is ever reformatted
  return text;
}

/** One attribute's value, validated for its kind: a type must be one of the list's, an org id must be URL- and filename-safe, text is text. */
function checkReferenceAttr(list, attr, value) {
  if (attr.kind === 'type') {
    const text = normaliseReferenceName(value);
    if (!text) throw referenceRejection(attr.header + ' is required.', 'validation');
    if (list.types.indexOf(text) < 0) throw referenceRejection(attr.header + ' must be one of ' + list.types.join(', ') + '; got ' + JSON.stringify(text) + '.', 'validation');
    return text;
  }
  if (attr.kind === 'orgId') {
    const text = normaliseReferenceName(value);
    if (!text) throw referenceRejection(attr.header + ' is required.', 'validation');
    if (text.length > REFERENCE_LIMITS.orgId) throw referenceRejection(attr.header + ' is longer than ' + REFERENCE_LIMITS.orgId + ' characters.', 'validation');
    if (!REFERENCE_ORG_ID_PATTERN.test(text)) throw referenceRejection(attr.header + ' ' + JSON.stringify(text) + ' may only contain letters, digits and single hyphens.', 'validation');
    return text;
  }
  if (attr.kind === 'upc') {
    const text = normaliseReferenceName(value);
    if (!text) throw referenceRejection(attr.header + ' is required.', 'validation');
    if (!/^\d{14}$/.test(text)) throw referenceRejection(attr.header + ' must be the 14 digits of the code; got ' + JSON.stringify(text) + '.', 'validation');
    return text;
  }
  return checkReferenceText(value, attr.header, REFERENCE_LIMITS.text, !!attr.required);
}

/** true or false from the forms a JSON or query value takes. Anything else is a rejection: a typo must not deactivate a store. */
function parseReferenceBool(value, label) {
  if (value === true || value === false) return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  throw referenceRejection(label + ' must be true or false; got ' + JSON.stringify(value) + '.', 'validation');
}

function findReferenceRow(rows, id) {
  const wanted = String(id === undefined || id === null ? '' : id).trim().toLowerCase();
  if (!wanted) return null;
  return rows.find(row => String(row.id).toLowerCase() === wanted) || null;
}

/** The other row already using this name, deleted rows included, or null. */
function referenceNameOwner(rows, name, exceptId) {
  const wanted = name.toLowerCase();
  return rows.find(row => String(row.id) !== exceptId && normaliseReferenceName(row.name).toLowerCase() === wanted) || null;
}

/** A duplicate-name rejection that points at Restore when the name belongs to a deleted entry. */
function referenceNameTakenRejection(list, name, owner) {
  return referenceRejection(owner.deletedAt
    ? 'A deleted ' + list.noun + ' named "' + name + '" exists. Restore it instead of adding another.'
    : 'A ' + list.noun + ' named "' + name + '" already exists.', 'duplicate');
}

/** Whether another row already carries this org id or UPC, within the same type when the attribute is unique per type. */
function referenceOrgIdTaken(rows, attr, candidate, exceptId) {
  const wanted = String(candidate[attr.key] || '').toLowerCase();
  return rows.some(row =>
    String(row.id) !== exceptId &&
    String(row[attr.key] || '').toLowerCase() === wanted &&
    (!attr.uniqueWith || String(row[attr.uniqueWith] || '') === String(candidate[attr.uniqueWith] || '')));
}

/**
 * Work out what a batch of ops does to a list without touching the sheet. Every op is checked
 * against the rows as the previous ops leave them, so a batch is rejected whole or applied
 * whole. Returns { mutations, changes, touched }; a mutation is { type: 'append', row } or
 * { type: 'patch', row, patch }, where `row` is the simulated row object so a patch on a row
 * added earlier in the same batch finds its sheet row number once the append has run. A
 * change is { attr, id, from, to } for every name or org id that moved, for the warnings.
 */
function planReferenceOps(list, ops, rows, now) {
  const sim = rows.map(row => Object.assign({}, row));
  const mutations = [];
  const changes = [];
  const touched = [];
  const stamp = { updatedAt: now };
  const patch = (row, fields) => {
    Object.assign(row, fields);
    mutations.push({ type: 'patch', row: row, patch: fields });
  };
  const orgIds = list.attrs.filter(attr => attr.kind === 'orgId' || attr.kind === 'upc');   // the attributes that must be unique

  ops.forEach((op, index) => {
    const where = 'op ' + (index + 1);
    if (!op || typeof op !== 'object') throw referenceRejection(where + ' is not an object.', 'validation');
    const entry = op.entry || {};

    switch (op.op) {
      case 'add': {
        if (sim.length >= REFERENCE_ROW_CAP) throw referenceRejection('The ' + list.key + ' list is at its cap of ' + REFERENCE_ROW_CAP + ' entries.', 'validation');
        const name = checkReferenceText(entry.name, 'Name', REFERENCE_LIMITS.name, true);
        const owner = referenceNameOwner(sim, name, null);
        if (owner) throw referenceNameTakenRejection(list, name, owner);
        const sortOrder = sim.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1;
        const row = { _row: null, id: Utilities.getUuid(), name: name, deletedAt: '', sortOrder: sortOrder, createdAt: now, updatedAt: now };
        if (list.active) row.active = true;
        if (list.verified) row.verified = entry.verified === undefined ? true : parseReferenceBool(entry.verified, 'verified');   // a person's add is verified; an import's says so
        list.attrs.forEach(attr => { row[attr.key] = checkReferenceAttr(list, attr, entry[attr.key]); });
        orgIds.forEach(attr => {
          if (referenceOrgIdTaken(sim, attr, row, null)) {
            throw referenceRejection('A ' + list.noun + ' with ' + attr.header + ' "' + row[attr.key] + '" already exists' + (attr.uniqueWith ? ' for ' + row[attr.uniqueWith] : '') + '.', 'duplicate');
          }
        });
        sim.push(row);
        mutations.push({ type: 'append', row: row });
        touched.push(row.id);
        break;
      }

      case 'update': {
        const row = findReferenceRow(sim, entry.id);
        if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(entry.id) + '.', 'not_found');
        const fields = {};
        if (entry.name !== undefined) {
          const name = checkReferenceText(entry.name, 'Name', REFERENCE_LIMITS.name, true);
          if (name !== normaliseReferenceName(row.name)) {
            const owner = referenceNameOwner(sim, name, String(row.id));
            if (owner) throw referenceNameTakenRejection(list, name, owner);
            changes.push({ attr: 'name', id: String(row.id), from: normaliseReferenceName(row.name), to: name });
            fields.name = name;
          }
        }
        list.attrs.forEach(attr => {
          if (entry[attr.key] === undefined) return;
          const value = checkReferenceAttr(list, attr, entry[attr.key]);
          if (value !== String(row[attr.key] || '')) fields[attr.key] = value;
        });
        const next = Object.assign({}, row, fields);
        orgIds.forEach(attr => {
          const moved = fields[attr.key] !== undefined || (attr.uniqueWith && fields[attr.uniqueWith] !== undefined);
          if (!moved) return;
          if (referenceOrgIdTaken(sim, attr, next, String(row.id))) {
            throw referenceRejection('Another ' + list.noun + ' already has ' + attr.header + ' "' + next[attr.key] + '"' + (attr.uniqueWith ? ' for ' + next[attr.uniqueWith] : '') + '.', 'duplicate');
          }
          if (fields[attr.key] !== undefined) changes.push({ attr: attr.key, id: String(row.id), from: String(row[attr.key] || ''), to: next[attr.key] });
        });
        if (entry.active !== undefined) {
          if (!list.active) throw referenceRejection(list.key + ' have no active switch; delete or restore instead.', 'validation');
          const active = parseReferenceBool(entry.active, 'active');
          if (active !== (row.active === true)) fields.active = active;
        }
        if (entry.verified !== undefined) {
          if (!list.verified) throw referenceRejection(list.key + ' have no verified flag.', 'validation');
          const verified = parseReferenceBool(entry.verified, 'verified');
          if (verified !== (row.verified === true)) fields.verified = verified;
        }
        if (!Object.keys(fields).length) break;   // nothing changed; not an error
        patch(row, Object.assign(fields, stamp));
        touched.push(String(row.id));
        break;
      }

      case 'setActive': {
        if (!list.active) throw referenceRejection(list.key + ' have no active switch; delete or restore instead.', 'validation');
        const row = findReferenceRow(sim, op.id);
        if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(op.id) + '.', 'not_found');
        const active = parseReferenceBool(op.active, 'active');
        if (active === (row.active === true)) break;
        patch(row, Object.assign({ active: active }, stamp));
        touched.push(String(row.id));
        break;
      }

      // A delete leaves the row in place with Deleted At set, so history still names it and
      // Restore is one patch; `active` is left as it was, so a restored entry comes back as
      // it went.
      case 'delete':
      case 'restore': {
        const row = findReferenceRow(sim, op.id);
        if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(op.id) + '.', 'not_found');
        const deleted = op.op === 'delete';
        if (deleted === !!row.deletedAt) break;
        patch(row, Object.assign({ deletedAt: deleted ? now : '' }, stamp));
        touched.push(String(row.id));
        break;
      }

      case 'reorder': {
        if (!Array.isArray(op.order)) throw referenceRejection(where + ': order must be an array of ids.', 'validation');
        const order = op.order.map(id => String(id).trim().toLowerCase());
        if (order.length > REFERENCE_LIMITS.reorder) throw referenceRejection(where + ': too many ids.', 'validation');
        if (new Set(order).size !== order.length) throw referenceRejection(where + ': an id is listed twice.', 'validation');
        const listed = order.map(id => {
          const row = findReferenceRow(sim, id);
          if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(id) + '. Reload the list and try again.', 'not_found');
          return row;
        });
        const rest = sim.filter(row => order.indexOf(String(row.id).toLowerCase()) < 0)
          .sort((a, b) => ((Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)) || String(a.name).localeCompare(String(b.name)));
        listed.concat(rest).forEach((row, i) => {
          // A reorder is a view change: it does not stamp Updated At, or every row would look edited.
          if ((Number(row.sortOrder) || 0) !== i + 1) patch(row, { sortOrder: i + 1 });
        });
        break;
      }

      default:
        throw referenceRejection(where + ': unknown op ' + JSON.stringify(op.op) + '. Valid ops: add, update, setActive, delete, restore, reorder.', 'validation');
    }
  });

  // Nothing may empty a list. A form with no dishes cannot be submitted, and every printed
  // store QR code opens a delivery form that needs its store on the list.
  if (sim.length && !sim.some(row => (!list.active || row.active === true) && !row.deletedAt)) {
    throw referenceRejection('Refusing: that would leave no ' + list.key + (list.active ? ' active and not deleted. At least one must stay.' : ' that is not deleted. At least one must stay.'), 'validation');
  }

  return { mutations: mutations, changes: changes, touched: touched };
}

/** Write a planned batch to the sheet in order. An append records its row number on the simulated row for any later patch. */
function applyReferenceMutations(sheet, tab, mutations) {
  const schema = referenceSchemaFor(tab);
  mutations.forEach(mutation => {
    if (mutation.type === 'append') {
      const written = appendReferenceRows(sheet, tab, buildRows(schema, [mutation.row], {}));
      mutation.row._row = written.firstRow;
    } else {
      updateRow(sheet, schema, mutation.row._row, mutation.patch);
    }
  });
}

/**
 * Append rows built in schema order to a reference tab, each value under the column whose
 * header matches. The record-append path (appendMonthlyRows) carries month resolution, a
 * submission-id guard and per-submission separators that a reference row does not want, so
 * this is its core alone.
 */
function appendReferenceRows(sheet, tab, values) {
  if (!values.length) return { firstRow: 0, count: 0 };
  const schema = referenceSchemaFor(tab);
  const layout = referenceTabLayout(tab);
  return withScriptLock(() => {
    const columns = sheetColumnsWith(sheet, schema, layout);
    const width = Math.max(sheet.getLastColumn(), ...columns);
    const place = (row, fill) => { const out = Array(width).fill(fill); row.forEach((v, i) => { out[columns[i] - 1] = v; }); return out; };
    const formats = place(writeFormats(schema), '@');
    const placed = values.map(row => place(row, ''));

    const start = sheet.getLastRow() + 1;
    const last = start + placed.length - 1;
    if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(placed.length, 100));
    const range = sheet.getRange(start, 1, placed.length, width);
    range.setNumberFormats(placed.map(() => formats));   // before the values, or Sheets coerces text that looks like a number
    range.setValues(placed);
    bandRows(sheet);
    boxRows(sheet);
    return { firstRow: start, count: placed.length };
  });
}

/**
 * How many rows of the last MAX_MONTHS_PER_REQUEST months carry the value a change replaced.
 * Null when nothing in the records carries that attribute (a store's name, a kitchen's id).
 * The rows are never rewritten: they are the HACCP record, and a backfill must not be added
 * here as a convenience.
 */
function changeWarning(list, change) {
  const where = list.storedAs.filter(stored => stored.attr === change.attr);
  if (!where.length || !change.from) return null;
  const attr = list.attrs.find(a => a.key === change.attr);
  const label = attr ? attr.header : 'name';
  const months = [];
  let key = monthKeyOfInstant(new Date());
  for (let i = 0; i < MAX_MONTHS_PER_REQUEST; i++) { months.unshift(key); key = previousMonthKey(key); }
  const wanted = change.from.toLowerCase();
  let count = 0;
  try {
    where.forEach(stored => {
      readMonthlyRows(months, stored.tab).records.forEach(record => {
        if (normaliseReferenceName(record[stored.field]).toLowerCase() === wanted) count += 1;
      });
    });
  } catch (e) {
    return 'Records filed under the old ' + label + ' "' + change.from + '" keep it; the count could not be read (' + e.message + ').';
  }
  const tail = attr && attr.kind === 'orgId'
    ? '; they keep it, and anything printed with it, such as an older QR code, no longer matches this ' + list.noun + '.'
    : '; they will keep it.';
  return count + ' row' + (count === 1 ? '' : 's') + ' in the last ' + MAX_MONTHS_PER_REQUEST + ' months use the old ' + label + ' "' + change.from + '"' + tail;
}

/** Ask GitHub to run the site job, which republishes data/<list>.json from this backend. Throws on anything but 204. */
function publishReference(version) {
  const repo = requireProperty('GITHUB_REPOSITORY');
  const token = requireProperty('DISPATCH_TOKEN');
  let environment = '';
  try { environment = getSpreadsheetFolder().getName(); } catch (e) { /* a label for the run log only */ }
  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: JSON.stringify({ event_type: 'reference-changed', client_payload: { version: version, environment: environment } }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 204) throw new Error('GitHub answered HTTP ' + code + ': ' + String(response.getContentText()).slice(0, 200));
}

/**
 * The one way the reference store changes. Parses, validates, plans and applies a batch of
 * ops for one list under the script lock, then asks GitHub to republish the static lists.
 *
 * Authorisation is decided here, in one place. Today there is none, the same as resolving a
 * violation. To gate these writes, this is the line:
 *   if (!verifyAdminToken(payload.token)) throw referenceRejection('Unauthorized', 'unauthorized');
 *
 * A rejection (a bad request) is answered with its reason and recorded as REJECTED, which
 * keeps it off the support-email path. A fault (Drive unreachable, the lock timing out) is
 * rethrown so doPost records ERROR and does email.
 */
function handleConfigWrite(payload, ctx) {
  ctx.logEntry.formType = 'config';
  ctx.submissionId = 'cfg-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);

  try {
    const list = referenceListFor(payload.list);
    const ops = Array.isArray(payload.ops) ? payload.ops : null;
    if (!ops || !ops.length) throw referenceRejection('ops must be a non-empty array.', 'validation');
    const baseVersion = payload.baseVersion ? String(payload.baseVersion) : null;
    referenceThrottle();

    const now = formatInstant(ctx.startTime);
    const plan = withScriptLock(() => {
      const opened = openReference(true);
      invalidateReferencePayload();                       // compare against the sheet, not a cached copy
      const current = referencePayload();
      if (baseVersion && baseVersion !== current.version) {
        throw referenceRejection('The lists changed since this page loaded (' + baseVersion + ' is now ' + current.version + '). Reload and try again.', 'conflict');
      }
      const sheet = opened.ss.getSheetByName(list.tab);
      const planned = planReferenceOps(list, ops, readReferenceRows(sheet, list.tab), now);
      applyReferenceMutations(sheet, list.tab, planned.mutations);
      invalidateReferencePayload();
      return planned;
    });

    ctx.logEntry.rowCount = plan.mutations.length;
    note(ctx, 'config=' + list.key + ':' + ops.map(op => op.op).join(',') + (plan.touched.length ? ':' + plan.touched.join(',') : ''));
    plan.changes.forEach(change => note(ctx, 'config_change=' + change.attr + ':' + change.from + '->' + change.to));

    const warnings = plan.changes.map(change => changeWarning(list, change)).filter(Boolean);
    warnings.forEach(warning => note(ctx, 'config_warning=' + warning));

    const reference = referencePayload();
    let published = false;
    let publishError = null;
    if (payload.publish !== false && plan.mutations.length) {
      try {
        publishReference(reference.version);
        published = true;
        note(ctx, 'config_published=' + reference.version);
      } catch (e) {
        publishError = e.message || String(e);
        note(ctx, 'config_publish_failed=' + publishError);
      }
    }

    ctx.logEntry.status = 'SUCCESS';
    return jsonResponse({
      status: 'ok',
      changeId: ctx.submissionId,
      list: list.key,
      applied: plan.mutations.length,
      version: reference.version,
      warning: warnings.join(' ') || null,
      published: published,
      publishError: publishError,
      reference: reference
    });

  } catch (err) {
    if (!err.rejection) throw err;
    ctx.logEntry.status = 'REJECTED';
    ctx.logEntry.errorMessage = err.message;
    note(ctx, 'config_rejected=' + err.code);
    return jsonResponse({ status: 'error', code: err.code, message: err.message, changeId: ctx.submissionId });
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

/** The five lists. `?version=<current>` answers notModified instead of the payload. Public. */
function action_reference(e) {
  try {
    const params = (e && e.parameter) || {};
    const payload = referencePayload();
    if (params.version && params.version === payload.version) {
      return jsonResponse({ status: 'ok', version: payload.version, notModified: true });
    }
    return jsonResponse(Object.assign({ status: 'ok' }, payload));
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/** The Reference file as it stands: id and url, row counts and header drift per tab, any tab that is not one of the five. Admin. */
function action_referenceStatus(e) {
  try {
    const opened = openReference(false);
    if (!opened) {
      return jsonResponse({ status: 'ok', file: null, source: 'seed', message: 'No Reference file yet; init creates and seeds it.' });
    }
    const known = referenceTabNames();
    const tabs = {};
    known.forEach(tab => {
      const sheet = opened.ss.getSheetByName(tab);
      if (!sheet) { tabs[tab] = null; return; }
      const schema = referenceSchemaFor(tab);
      const headers = sheetHeaders(sheet);
      const expected = headersOf(schema);
      tabs[tab] = {
        rows: Math.max(0, sheet.getLastRow() - 1),
        missingColumns: headerIndex(headers, schema).missing,
        extraColumns: headers.filter(header => header && expected.indexOf(header) < 0),
        unmigrated: readReferenceRows(sheet, tab).filter(row => !REFERENCE_UUID_PATTERN.test(String(row.id).trim())).length
      };
    });
    const unexpected = opened.ss.getSheets().map(sheet => sheet.getName()).filter(name => known.indexOf(name) < 0);
    const cached = !!CacheService.getScriptCache().get(REFERENCE_CACHE_KEY);
    const payload = referencePayload();
    return jsonResponse({
      status: 'ok',
      file: { name: REFERENCE_FILE_NAME, id: opened.fileId, url: referenceFileUrl(opened.fileId) },
      tabs: tabs,
      unexpectedTabs: unexpected,
      version: payload.version,
      updatedAt: payload.updatedAt,
      cached: cached,
      timestamp: formatInstant(new Date())
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}
