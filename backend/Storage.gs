// Storage.gs — the monthly store: one spreadsheet per month in a year folder.
//
// <SPREADSHEET_FOLDER_ID>/<YYYY>/<YYYY-MM> Operations, four tabs each, headers from
// Schemas.gs. Files are found or created through DriveTree (cached, locked, exact name).
// Read paths never create a file; write paths create the month on first use.

const MAX_MONTHS_PER_REQUEST = 6;
const OPEN_MEMO = {}; // per-execution: monthKey → { monthKey, fileId, ss }
const TAB_STYLE = { header: '#323031', headerText: '#FFFFFF', rowA: '#FDF5E6', rowB: '#FFFBF4', border: '#DEDBD6' };

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
  names.forEach(name => initTab(ss.getSheetByName(name), name));
}

/**
 * A brand-new tab: sized to its layout, the header row, text format on every non-number
 * column so Sheets never coerces typed dates and times, and the tab's styling.
 */
function initTab(sheet, tab) {
  const schema = schemaFor(tab);
  const headers = headersOf(schema);
  const layout = tabLayout(tab);
  if (sheet.getMaxRows() < layout.rows) sheet.insertRowsAfter(sheet.getMaxRows(), layout.rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() > headers.length) sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  const body = sheet.getMaxRows() - 1;
  const formats = writeFormats(schema);
  sheet.getRange(2, 1, body, headers.length).setNumberFormats(Array.from({ length: body }, () => formats));
  styleTab(sheet, tab);
}

/** Row 1 of a tab as text, one entry per column up to the last used column. */
function sheetHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
}

/**
 * The 1-based sheet column of every schema column, matched on header text. A header the
 * sheet lacks is added after the last used column, styled like the others, so a file created
 * under an older schema keeps taking writes without losing a field.
 */
function sheetColumns(sheet, tab) {
  const schema = schemaFor(tab);
  const headers = sheetHeaders(sheet);
  const idx = headerIndex(headers, schema).idx;
  let added = false;
  schema.forEach(col => {
    if (idx[col.key] >= 0) return;
    const position = headers.length + 1;
    if (position > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), 1);
    sheet.getRange(1, position).setValue(col.header); // styleTab below paints it like the rest
    if (sheet.getMaxRows() > 1) sheet.getRange(2, position, sheet.getMaxRows() - 1, 1).setNumberFormat(col.type === 'number' ? 'General' : '@');
    headers.push(col.header);
    idx[col.key] = position - 1;
    added = true;
  });
  if (added) styleTab(sheet, tab);
  return schema.map(col => idx[col.key] + 1);
}

/**
 * Column widths, row colours and the basic filter, all located by header text. Idempotent;
 * the filter is only recreated when its range is wrong, so one a reader has applied
 * survives an ordinary call.
 *
 * The filter spans the sheet's full height so rows appended later fall inside it without it
 * being recreated, which would discard a reader's criteria.
 */
function styleTab(sheet, tab) {
  const schema = schemaFor(tab);
  const headers = sheetHeaders(sheet);
  const idx = headerIndex(headers, schema).idx;
  schema.forEach(col => { if (idx[col.key] >= 0) sheet.setColumnWidth(idx[col.key] + 1, columnWidth(col)); });

  bandRows(sheet);
  styleHeader(sheet, headers.length); // after the banding, which would otherwise repaint row 1
  borderRange(sheet.getRange(1, 1, 1, headers.length));
  boxRows(sheet);

  const through = tabLayout(tab).filterThrough;
  const filterColumns = through ? headers.indexOf(through) + 1 : 0;
  const existing = sheet.getFilter();
  if (!filterColumns) {
    if (existing) existing.remove();
    return;
  }
  const fits = existing && existing.getRange().getNumRows() === sheet.getMaxRows() && existing.getRange().getNumColumns() === filterColumns;
  if (!fits) {
    if (existing) existing.remove();
    sheet.getRange(1, 1, sheet.getMaxRows(), filterColumns).createFilter();
  }
}

/** The header row: bold, the dark brand background, white text. Never part of the banding. */
function styleHeader(sheet, width) {
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground(TAB_STYLE.header)
    .setFontColor(TAB_STYLE.headerText);
}

/**
 * Alternating colours on the written rows, so the table ends where the data does instead of
 * running to the bottom of the sheet. The header is excluded and keeps its own dark fill.
 * Re-applied after every append.
 */
function bandRows(sheet) {
  const width = sheetHeaders(sheet).length;
  const last = sheet.getLastRow();
  sheet.getBandings().forEach(banding => banding.remove());
  if (last < 2) return;
  sheet.getRange(2, 1, last - 1, width)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false)
    .setFirstRowColor(TAB_STYLE.rowA)
    .setSecondRowColor(TAB_STYLE.rowB);
}

/** Grid lines on a block of cells: its outer edges and every line inside it. */
function borderRange(range) {
  range.setBorder(true, true, true, true, true, true, TAB_STYLE.border, SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * A heavier edge around the header and the written rows, so the table reads as one block and
 * its last row closes it. Interior lines are left alone (null), and the next append redraws
 * the shared line above its own block as an ordinary one before moving the edge down.
 */
function boxRows(sheet) {
  const width = sheetHeaders(sheet).length;
  const rows = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(1, 1, rows, width)
    .setBorder(true, true, true, true, null, null, TAB_STYLE.border, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

/** Grid lines on every written row, for files formatted before the styling or edited by hand. */
function borderDataRows(sheet, tab) {
  const last = sheet.getLastRow();
  if (last >= 2) borderRange(sheet.getRange(2, 1, last - 1, sheetHeaders(sheet).length));
  boxRows(sheet);
}

/** Idempotent: adds any tab that is missing and writes headers into any tab whose row 1 is empty. */
function ensureMonthlyTabs(ss) {
  tabNames().forEach((name, i) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, Math.min(i, ss.getSheets().length));
      initTab(sheet, name);
    } else if (sheet.getLastRow() === 0) {
      initTab(sheet, name);
    }
  });
}

/**
 * Append rows built in schema order to a tab in one write, each value under the sheet column
 * whose header matches, so a file whose columns predate a schema change still takes writes.
 * The block goes in under the script lock because getLastRow()+1 followed by setValues is
 * not atomic across concurrent requests. Formats are set before the values, or Sheets
 * coerces text that looks like a date or a number. Grid lines and row colours go on after,
 * so both end at the last written row and the table has a closing edge.
 */
function appendMonthlyRows(monthKey, tab, values) {
  if (!values.length) return { monthKey, fileId: null, firstRow: 0, count: 0 };
  const opened = openMonthly(monthKey, true);
  const sheet = opened.ss.getSheetByName(tab);
  const schemaFormats = writeFormats(schemaFor(tab));
  return withScriptLock(() => {
    const columns = sheetColumns(sheet, tab);
    const width = Math.max(sheet.getLastColumn(), ...columns);
    const place = (row, fill) => { const out = Array(width).fill(fill); row.forEach((v, i) => { out[columns[i] - 1] = v; }); return out; };
    const formats = place(schemaFormats, '@');
    const placed = values.map(row => place(row, ''));

    const start = sheet.getLastRow() + 1;
    const last = start + placed.length - 1;
    if (last > sheet.getMaxRows()) {
      sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(placed.length, 500));
      styleTab(sheet, tab); // the filter must cover the new rows
    }
    const range = sheet.getRange(start, 1, placed.length, width);
    range.setNumberFormats(placed.map(() => formats));
    range.setValues(placed);
    borderRange(range);   // the new block, including the line it shares with the block above
    bandRows(sheet);      // the colours end at the new last row
    boxRows(sheet);       // and so does the outer edge
    return { monthKey, fileId: opened.fileId, firstRow: start, count: placed.length };
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
