// Storage.gs — the monthly store: one spreadsheet per month in a year folder.
//
// <SPREADSHEET_FOLDER_ID>/<YYYY>/<YYYY-MM> Operations, four tabs each, headers from
// Schemas.gs. Files are found or created through DriveTree (cached, locked, exact name).
// Read paths never create a file; write paths create the month on first use.

const MAX_MONTHS_PER_REQUEST = 6;
const OPEN_MEMO = {}; // per-execution: monthKey → { monthKey, fileId, ss }

function getSpreadsheetFolder() {
  const id = requireProperty('SPREADSHEET_FOLDER_ID');
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error(
      'SPREADSHEET_FOLDER_ID "' + id + '" is not accessible to the account this deployment ' +
      'runs as (executeAs: USER_DEPLOYING). Fix the property or the folder sharing. ' +
      'Underlying error: ' + e.toString()
    );
  }
}

function monthlyFileName(monthKey) {
  return monthKey + ' Operations';
}

function monthlyFileUrl(fileId) {
  return 'https://docs.google.com/spreadsheets/d/' + fileId + '/edit';
}

/** File id for a month, or null when it does not exist and `create` is false. */
function resolveMonthlyFileId(monthKey, create) {
  const root = getSpreadsheetFolder();
  const year = yearOfMonthKey(monthKey);
  const yearFolder = create ? resolveChildFolder(root, year) : findChildFolder(root, year);
  if (!yearFolder) return null;
  const name = monthlyFileName(monthKey);
  return create ? resolveChildSpreadsheet(yearFolder, name, initMonthlyFile) : findChildSpreadsheet(yearFolder, name);
}

/** Open a month's spreadsheet once per execution. Returns { monthKey, fileId, ss } or null. */
function openMonthly(monthKey, create) {
  if (OPEN_MEMO[monthKey]) return OPEN_MEMO[monthKey];
  const fileId = resolveMonthlyFileId(monthKey, create);
  if (!fileId) return null;
  const ss = SpreadsheetApp.openById(fileId);
  ensureMonthlyTabs(ss);
  OPEN_MEMO[monthKey] = { monthKey, fileId, ss };
  return OPEN_MEMO[monthKey];
}

/** A brand-new monthly file: New York time zone, the four tabs in order, formatted headers. */
function initMonthlyFile(ss) {
  ss.setSpreadsheetTimeZone(NY_TZ);
  const names = tabNames();
  ss.getSheets()[0].setName(names[0]);
  for (let i = 1; i < names.length; i++) ss.insertSheet(names[i], i);
  names.forEach(name => initTab(ss.getSheetByName(name), schemaFor(name)));
}

/** Header row, frozen, and text format on every non-number column so Sheets never coerces typed dates and times. */
function initTab(sheet, schema) {
  const headers = headersOf(schema);
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#323031')
    .setFontColor('#FFFFFF');
  sheet.setFrozenRows(1);
  const body = sheet.getMaxRows() - 1;
  if (body > 0) {
    const formats = writeFormats(schema);
    sheet.getRange(2, 1, body, headers.length).setNumberFormats(Array.from({ length: body }, () => formats));
  }
}

/** Idempotent: adds any tab that is missing and writes headers into any tab whose row 1 is empty. */
function ensureMonthlyTabs(ss) {
  tabNames().forEach((name, i) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, Math.min(i, ss.getSheets().length));
      initTab(sheet, schemaFor(name));
    } else if (sheet.getLastRow() === 0) {
      initTab(sheet, schemaFor(name));
    }
  });
}

/**
 * Append built rows to a tab in one write. The block goes in under the script lock because
 * getLastRow()+1 followed by setValues is not atomic across concurrent requests. Formats are
 * set before the values, or Sheets coerces text that looks like a date or a number.
 */
function appendMonthlyRows(monthKey, tab, values) {
  if (!values.length) return { monthKey, fileId: null, firstRow: 0, count: 0 };
  const opened = openMonthly(monthKey, true);
  const sheet = opened.ss.getSheetByName(tab);
  const formats = writeFormats(schemaFor(tab));
  return withScriptLock(() => {
    const start = sheet.getLastRow() + 1;
    const last = start + values.length - 1;
    if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(values.length, 500));
    const range = sheet.getRange(start, 1, values.length, values[0].length);
    range.setNumberFormats(values.map(() => formats));
    range.setValues(values);
    return { monthKey, fileId: opened.fileId, firstRow: start, count: values.length };
  });
}

/** Records from one tab across several months. Months with no file are reported, not errors. */
function readMonthlyRows(monthKeys, tab) {
  if (monthKeys.length > MAX_MONTHS_PER_REQUEST) {
    throw new Error('Range spans ' + monthKeys.length + ' months; the maximum is ' + MAX_MONTHS_PER_REQUEST);
  }
  const schema = schemaFor(tab);
  const records = [];
  const files = [];
  const missing = [];
  monthKeys.forEach(monthKey => {
    const opened = openMonthly(monthKey, false);
    if (!opened) { missing.push(monthKey); return; }
    files.push({ monthKey, fileId: opened.fileId });
    const sheet = opened.ss.getSheetByName(tab);
    if (!sheet || sheet.getLastRow() < 2) return;
    readRows(sheet.getDataRange().getValues(), schema).records.forEach(record => {
      record._month = monthKey;
      record._fileId = opened.fileId;
      records.push(record);
    });
  });
  return { records, files, missing };
}

/** The row in a month's tab whose `key` column equals `value`: { sheet, rowNumber, record } or null. */
function findMonthlyRow(monthKey, tab, key, value) {
  const opened = openMonthly(monthKey, false);
  if (!opened) return null;
  const sheet = opened.ss.getSheetByName(tab);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const record = readRows(sheet.getDataRange().getValues(), schemaFor(tab)).records
    .find(r => String(r[key]) === String(value));
  return record ? { sheet, rowNumber: record._row, record } : null;
}

/** Set the cells named by `patch` (key → value) on one row, located by header text. */
function updateMonthlyRow(sheet, tab, rowNumber, patch) {
  const schema = schemaFor(tab);
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const { idx } = headerIndex(headerRow, schema);
  Object.keys(patch).forEach(key => {
    const col = idx[key];
    if (col === undefined || col < 0) throw new Error('No "' + key + '" column on ' + tab);
    const column = schema.find(c => c.key === key);
    sheet.getRange(rowNumber, col + 1).setValue(cellForWrite(column, patch[key]));
  });
}
