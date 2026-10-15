// Reference.gs — the reference lists: kitchens, supervisors, dishes, stores, drivers.
//
// One spreadsheet, `Reference`, at the root of SPREADSHEET_FOLDER_ID beside the year folders,
// one tab per list. The dashboard's Config tab edits it through doPost (type: 'config'); the
// dashboard and the site build read it through ?action=reference. A form never calls this:
// the site job publishes each list as a static data/<list>.json on every build, and a save
// here asks GitHub to run that build.
//
// The lists are a picker source, not a constraint. Nothing validates a submitted kitchen,
// dish, driver or supervisor against them, and nothing may: the pickers allow free text and
// a delivery must never be refused over a dropdown.
//
// Ids are immutable and never reused; entries are deactivated, never deleted. A store id is
// printed on QR codes and embedded in photo filenames, and the other four lists are stored
// in the monthly rows by display name, so history depends on both staying put.

const REFERENCE_FILE_NAME = 'Reference';
const REFERENCE_MEMO = {};                          // per-execution: opened, ensured, payload
const REFERENCE_CACHE_KEY = 'reference:payload:v1';
const REFERENCE_CACHE_SEC = 600;                    // bounds staleness after a hand edit in Sheets, which nothing invalidates
const REFERENCE_VERSION_PREFIX = 'r1-';             // payload-shape revision; bump when an entry's shape changes
const REFERENCE_ROW_CAP = 500;                      // an unauthenticated append endpoint needs a ceiling
const REFERENCE_WRITES_PER_MINUTE = 20;
const REFERENCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;   // URL- and filename-safe: no '_' (the photo filename separator), no '.'
const REFERENCE_CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const REFERENCE_LIMITS = { id: 40, name: 80, location: 120, actor: 80, reorder: 500 };   // reorder matches REFERENCE_ROW_CAP

// ─── The lists ───────────────────────────────────────────────────────────────

/**
 * The five lists. Production precedes delivery, so kitchens and supervisors come first.
 * `storedAs` names the monthly tab and field that carry an entry's display name, which is
 * what a rename leaves behind; stores are carried by id, so the list is empty.
 */
function referenceLists() {
  return [
    { tab: 'Kitchens',    key: 'kitchens',    noun: 'kitchen',    storedAs: [{ tab: 'Production', field: 'kitchen' }] },
    { tab: 'Supervisors', key: 'supervisors', noun: 'supervisor', storedAs: [{ tab: 'Production', field: 'supervisor' }] },
    { tab: 'Dishes',      key: 'dishes',      noun: 'dish',       storedAs: [{ tab: 'Production', field: 'dish' }, { tab: 'Deliveries', field: 'dish' }] },
    { tab: 'Stores',      key: 'stores',      noun: 'store',      storedAs: [] },
    { tab: 'Drivers',     key: 'drivers',     noun: 'driver',     storedAs: [{ tab: 'Deliveries', field: 'driver' }] }
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
  const head = [
    { header: 'ID',   key: 'id',   type: 'text', width: 140 },
    { header: 'Name', key: 'name', type: 'text', width: 260 }
  ];
  const tail = [
    { header: 'Active',     key: 'active',    type: 'bool',    width: 80 },
    { header: 'Sort',       key: 'sortOrder', type: 'number',  width: 70 },
    { header: 'Created At', key: 'createdAt', type: 'instant' },
    { header: 'Updated At', key: 'updatedAt', type: 'instant' },
    { header: 'Updated By', key: 'updatedBy', type: 'text',    width: 170 }   // what the browser said; not authentication
  ];
  switch (tab) {
    case 'Kitchens':
    case 'Supervisors':
    case 'Dishes':
    case 'Drivers':
      return head.concat(tail);
    case 'Stores':
      return head.concat([{ header: 'Location', key: 'location', type: 'text', width: 300 }], tail);
    default:
      throw new Error('Unknown reference tab: ' + tab);
  }
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
 * are added and seeded only on a write path (`create`); a read never changes the file.
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
 * Idempotent: adds any missing tab and seeds a tab it had to create or whose row 1 is empty.
 * A tab with headers and no rows was emptied on purpose and is left alone.
 */
function ensureReferenceTabs(ss) {
  referenceTabNames().forEach((name, i) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, Math.min(i, ss.getSheets().length));
      initReferenceTab(sheet, name);
    } else if (sheet.getLastRow() === 0) {
      initReferenceTab(sheet, name);
    }
  });
}

/** The seed rows for one list: sortOrder from position, createdAt now, nothing updated yet. */
function seedReferenceTab(sheet, tab) {
  const list = referenceListFor(tab);
  const entries = referenceSeed()[list.key] || [];
  if (!entries.length) return;
  const now = formatInstant(new Date());
  const rows = entries.map((entry, i) => ({
    id: entry.id, name: entry.name, location: entry.location || '',
    active: entry.active !== false, sortOrder: i + 1,
    createdAt: now, updatedAt: '', updatedBy: ''
  }));
  appendReferenceRows(sheet, tab, buildRows(referenceSchemaFor(tab), rows, {}));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Every row of one reference tab, in sheet order, keyed by schema key plus _row. Rows with no id are ignored. */
function readReferenceRows(sheet, tab) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  return readRows(sheet.getDataRange().getValues(), referenceSchemaFor(tab)).records
    .filter(record => String(record.id).trim() !== '');
}

/** A row as the API emits it: id, name, (location,) active, sortOrder. The audit columns stay in the sheet. */
function publicReferenceEntry(record, tab) {
  const entry = { id: String(record.id).trim(), name: String(record.name) };
  if (tab === 'Stores') entry.location = String(record.location || '');
  entry.active = record.active === true;
  entry.sortOrder = Number(record.sortOrder) || 0;
  return entry;
}

/** Entries in display order, sortOrder then name, so clients need no sort of their own. */
function sortedReferenceEntries(records, tab) {
  return records.map(record => publicReferenceEntry(record, tab))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
}

/** The seed as the API would emit it, for an environment whose Reference file does not exist yet. */
function seedReferenceEntries(list) {
  return (referenceSeed()[list.key] || []).map((entry, i) => publicReferenceEntry({
    id: entry.id, name: entry.name, location: entry.location || '', active: entry.active !== false, sortOrder: i + 1
  }, list.tab));
}

/**
 * The five lists plus version, updatedAt and source. Memoised per execution and cached for
 * REFERENCE_CACHE_SEC. The cache is checked before the file is resolved, so a hit does no
 * Drive work at all. Never creates the file: without one, the seed stands in.
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
    lists[list.key] = sortedReferenceEntries(records, list.tab);
  });
  const payload = {
    version: referenceVersion(lists),
    updatedAt: updatedAt ? formatInstant(updatedAt) : '',
    source: opened ? 'sheet' : 'seed'
  };
  referenceLists().forEach(list => { payload[list.key] = lists[list.key]; });
  return payload;
}

/** Drop the memo and the cached payload. After every write, and on every setScriptProperty. */
function invalidateReferencePayload() {
  REFERENCE_MEMO.payload = null;
  CacheService.getScriptCache().remove(REFERENCE_CACHE_KEY);
}

/** 'r1-' plus eight hex digits of an MD5 over the emitted lists. The audit columns are excluded, so a fresh seed and a seeded sheet agree. */
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

function checkReferenceId(id) {
  if (id.length > REFERENCE_LIMITS.id) throw referenceRejection('Id is longer than ' + REFERENCE_LIMITS.id + ' characters.', 'validation');
  if (!REFERENCE_ID_PATTERN.test(id)) throw referenceRejection('Id ' + JSON.stringify(id) + ' may only contain lowercase letters, digits and single hyphens.', 'validation');
}

/** A URL- and filename-safe id from a name; eight random hex characters when the name has no ASCII letters or digits. */
function referenceSlug(name) {
  const slug = String(name).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, REFERENCE_LIMITS.id)
    .replace(/-+$/, '');
  return slug || Utilities.getUuid().replace(/-/g, '').slice(0, 8);
}

/** The first of <slug>, <slug>-2, <slug>-3 … not already an id in the list. */
function uniqueReferenceId(rows, slug) {
  const taken = new Set(rows.map(row => String(row.id).toLowerCase()));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const suffix = '-' + n;
    const candidate = slug.slice(0, REFERENCE_LIMITS.id - suffix.length).replace(/-+$/, '') + suffix;
    if (!taken.has(candidate)) return candidate;
  }
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

function referenceNameTaken(rows, name, exceptId) {
  const wanted = name.toLowerCase();
  return rows.some(row => String(row.id) !== exceptId && normaliseReferenceName(row.name).toLowerCase() === wanted);
}

/**
 * Work out what a batch of ops does to a list without touching the sheet. Every op is checked
 * against the rows as the previous ops leave them, so a batch is rejected whole or applied
 * whole. Returns { mutations, renames, touched }; a mutation is { type: 'append', row } or
 * { type: 'patch', row, patch }, where `row` is the simulated row object so a patch on a row
 * added earlier in the same batch finds its sheet row number once the append has run.
 */
function planReferenceOps(list, ops, rows, actor, now) {
  const sim = rows.map(row => Object.assign({}, row));
  const mutations = [];
  const renames = [];
  const touched = [];
  const stamp = { updatedAt: now, updatedBy: actor };
  const patch = (row, fields) => {
    Object.assign(row, fields);
    mutations.push({ type: 'patch', row: row, patch: fields });
  };

  ops.forEach((op, index) => {
    const where = 'op ' + (index + 1);
    if (!op || typeof op !== 'object') throw referenceRejection(where + ' is not an object.', 'validation');
    const entry = op.entry || {};

    switch (op.op) {
      case 'add': {
        if (sim.length >= REFERENCE_ROW_CAP) throw referenceRejection('The ' + list.key + ' list is at its cap of ' + REFERENCE_ROW_CAP + ' entries.', 'validation');
        const name = checkReferenceText(entry.name, 'Name', REFERENCE_LIMITS.name, true);
        if (referenceNameTaken(sim, name)) throw referenceRejection('A ' + list.noun + ' named "' + name + '" already exists.', 'duplicate');
        let id;
        if (entry.id !== undefined && entry.id !== null && String(entry.id).trim() !== '') {
          id = String(entry.id).trim().toLowerCase();
          checkReferenceId(id);
          if (findReferenceRow(sim, id)) throw referenceRejection('A ' + list.noun + ' with id "' + id + '" already exists. Ids are never reused.', 'duplicate');
        } else if (list.tab === 'Stores') {
          throw referenceRejection('A store needs an id: the store number, which goes in its QR code and cannot change later.', 'validation');
        } else {
          id = uniqueReferenceId(sim, referenceSlug(name));
        }
        const location = list.tab === 'Stores' ? checkReferenceText(entry.location, 'Location', REFERENCE_LIMITS.location, false) : '';
        const sortOrder = sim.reduce((max, row) => Math.max(max, Number(row.sortOrder) || 0), 0) + 1;
        const row = { _row: null, id: id, name: name, location: location, active: true, sortOrder: sortOrder, createdAt: now, updatedAt: now, updatedBy: actor };
        sim.push(row);
        mutations.push({ type: 'append', row: row });
        touched.push(id);
        break;
      }

      case 'update': {
        const row = findReferenceRow(sim, entry.id);
        if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(entry.id) + '.', 'not_found');
        const fields = {};
        if (entry.name !== undefined) {
          const name = checkReferenceText(entry.name, 'Name', REFERENCE_LIMITS.name, true);
          if (name !== normaliseReferenceName(row.name)) {
            if (referenceNameTaken(sim, name, String(row.id))) throw referenceRejection('Another ' + list.noun + ' is already named "' + name + '".', 'duplicate');
            renames.push({ id: String(row.id), from: normaliseReferenceName(row.name), to: name });
            fields.name = name;
          }
        }
        if (list.tab === 'Stores' && entry.location !== undefined) {
          const location = checkReferenceText(entry.location, 'Location', REFERENCE_LIMITS.location, false);
          if (location !== String(row.location || '')) fields.location = location;
        }
        if (entry.active !== undefined) {
          const active = parseReferenceBool(entry.active, 'active');
          if (active !== (row.active === true)) fields.active = active;
        }
        if (!Object.keys(fields).length) break;   // nothing changed; not an error
        patch(row, Object.assign(fields, stamp));
        touched.push(String(row.id));
        break;
      }

      case 'setActive': {
        const row = findReferenceRow(sim, op.id);
        if (!row) throw referenceRejection('No ' + list.noun + ' with id ' + JSON.stringify(op.id) + '.', 'not_found');
        const active = parseReferenceBool(op.active, 'active');
        if (active === (row.active === true)) break;
        patch(row, Object.assign({ active: active }, stamp));
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
        throw referenceRejection(where + ': unknown op ' + JSON.stringify(op.op) + '. Valid ops: add, update, setActive, reorder.', 'validation');
    }
  });

  // Nothing may empty a list. A form with no dishes cannot be submitted, and every printed
  // store QR code opens a delivery form that needs its store on the list.
  if (sim.length && !sim.some(row => row.active === true)) {
    throw referenceRejection('Refusing: that would leave no active ' + list.key + '. At least one must stay active.', 'validation');
  }

  return { mutations: mutations, renames: renames, touched: touched };
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
 * How many rows of the last MAX_MONTHS_PER_REQUEST months carry the old name. Null for
 * stores, whose rows carry the id. The rows are never rewritten: they are the HACCP record,
 * and a backfill must not be added here as a convenience.
 */
function renameWarning(list, rename) {
  if (!list.storedAs.length) return null;
  const months = [];
  let key = monthKeyOfInstant(new Date());
  for (let i = 0; i < MAX_MONTHS_PER_REQUEST; i++) { months.unshift(key); key = previousMonthKey(key); }
  const wanted = rename.from.toLowerCase();
  let count = 0;
  try {
    list.storedAs.forEach(where => {
      readMonthlyRows(months, where.tab).records.forEach(record => {
        if (normaliseReferenceName(record[where.field]).toLowerCase() === wanted) count += 1;
      });
    });
  } catch (e) {
    return 'Records filed under the old name "' + rename.from + '" keep it; the count could not be read (' + e.message + ').';
  }
  return count + ' row' + (count === 1 ? '' : 's') + ' in the last ' + MAX_MONTHS_PER_REQUEST + ' months use the old name "' + rename.from + '"; they will keep it.';
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
 * Authorisation is decided here, in one place. Today there is none, the same as
 * updateViolationStatus. To gate these writes, this is the line:
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
    const actor = checkReferenceText(payload.actor, 'Actor', REFERENCE_LIMITS.actor, false) || 'dashboard';
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
      const planned = planReferenceOps(list, ops, readReferenceRows(sheet, list.tab), actor, now);
      applyReferenceMutations(sheet, list.tab, planned.mutations);
      invalidateReferencePayload();
      return planned;
    });

    ctx.logEntry.rowCount = plan.mutations.length;
    note(ctx, 'config=' + list.key + ':' + ops.map(op => op.op).join(',') + (plan.touched.length ? ':' + plan.touched.join(',') : ''));
    note(ctx, 'config_actor=' + actor);
    plan.renames.forEach(rename => note(ctx, 'config_rename=' + rename.from + '->' + rename.to));

    const warnings = plan.renames.map(rename => renameWarning(list, rename)).filter(Boolean);
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
        extraColumns: headers.filter(header => header && expected.indexOf(header) < 0)
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
