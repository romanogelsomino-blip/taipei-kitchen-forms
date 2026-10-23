// Schemas.gs — the five tabs of a monthly file: headers, keys, and how rows are built and read.
//
// Header text is the read contract; column position is not. A column entry is
// { header, key, type, width?, value? }: `key` is the payload field on write and the output key
// on read; `width` is the column's pixel width; `value(row, ctx)` overrides the payload for server-derived cells; `type` is one of
// date | time | text | number | bool | instant and drives cell handling both ways. Renaming a
// header requires adding the old text to `aliases` so old files still read.
//
// tabNames() and schemaFor() name the monthly tabs only. The reference lists have their own
// tabs and schemas in Reference.gs; the helpers below the Writing fold take a schema and
// serve both.

function tabNames() {
  return ['Production', 'Packaging', 'Deliveries', 'Violations', 'Executions'];
}

function schemaFor(tab) {
  switch (tab) {
    case 'Production': return productionSchema();
    case 'Packaging':  return packagingSchema();
    case 'Deliveries': return deliveriesSchema();
    case 'Violations': return violationsSchema();
    case 'Executions': return executionsSchema();
    default: throw new Error('Unknown tab: ' + tab);
  }
}

function submissionIdOf(row, ctx) {
  return row.submissionId || ctx.submissionId || '';
}

/**
 * One row per dish per production run. Batches cool overnight from cook end, so no cooling
 * interval or final temperature is recorded. The kitchen is carried three ways: its name,
 * which the dashboard groups on, and its System ID and Kitchen ID from the Reference sheet.
 */
function productionSchema() {
  return [
    { header: 'Date',                key: 'date',            type: 'date' },
    { header: 'Production Kitchen',  key: 'kitchen',         type: 'text',    width: 170 },
    { header: 'Supervisor',          key: 'supervisor',      type: 'text',    width: 140 },
    { header: 'Dish',                key: 'dish',            type: 'text',    width: 220 },
    { header: 'Qty Produced',        key: 'qtyProduced',     type: 'number',  width: 110 },
    { header: 'Qty Discarded',       key: 'qtyDiscarded',    type: 'number',  width: 110 },
    { header: 'Discard Reason',      key: 'discardReason',   type: 'text',    width: 200 },
    { header: 'Cook Temp °F',        key: 'cookTemp',        type: 'number',  width: 110 },
    { header: 'Cook Start',          key: 'cookStart',       type: 'time' },
    { header: 'Cook End',            key: 'cookEnd',         type: 'time' },
    { header: 'Cook Time (min)',     key: 'cookTime',        type: 'number',  width: 120 },
    { header: 'Kitchen System ID',   key: 'kitchenSystemId', type: 'text',    width: 290 },
    { header: 'Kitchen ID',          key: 'kitchenId',       type: 'text',    width: 120 },
    { header: 'Dish System ID',      key: 'dishSystemId',    type: 'text',    width: 290 },
    { header: 'Submission ID',       key: 'submissionId',    type: 'text',    width: 290, value: submissionIdOf },
    { header: 'Submitted At',        key: 'clientTimestamp', type: 'instant' },
    { header: 'Received At',         key: 'serverTimestamp', type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/**
 * One row per dish per cooler loaded at the kitchen, one cooler per intended store. The
 * cooler's temperature is on every row of its cooler. Kitchen and store are each carried as
 * name, System ID and the organisation's own id, as on the other tabs.
 */
function packagingSchema() {
  return [
    { header: 'Date',              key: 'date',            type: 'date' },
    { header: 'Time',              key: 'time',            type: 'time',    width: 90 },
    { header: 'Kitchen',           key: 'kitchen',         type: 'text',    width: 170 },
    { header: 'Driver',            key: 'driver',          type: 'text' },
    { header: 'Intended Store',    key: 'store',           type: 'text',    width: 120 },
    { header: 'Dish',              key: 'dish',            type: 'text',    width: 220 },
    { header: 'Loaded',            key: 'loaded',          type: 'number' },
    { header: 'Discarded',         key: 'discarded',       type: 'number' },
    { header: 'Discard Reason',    key: 'discardReason',   type: 'text',    width: 200 },
    { header: 'Cooler Temp °F',    key: 'coolerTemp',      type: 'number',  width: 120 },
    { header: 'Notes',             key: 'notes',           type: 'text',    width: 260 },
    { header: 'Kitchen System ID', key: 'kitchenSystemId', type: 'text',    width: 290 },
    { header: 'Kitchen ID',        key: 'kitchenId',       type: 'text',    width: 120 },
    { header: 'Store System ID',   key: 'storeSystemId',   type: 'text',    width: 290 },
    { header: 'Store ID',          key: 'storeId',         type: 'text',    width: 80 },
    { header: 'Dish System ID',    key: 'dishSystemId',    type: 'text',    width: 290 },
    { header: 'Submission ID',     key: 'submissionId',    type: 'text',    width: 290, value: submissionIdOf },
    { header: 'Submitted At',      key: 'clientTimestamp', type: 'instant' },
    { header: 'Received At',       key: 'serverTimestamp', type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/**
 * One row per dish per store visit. The store is carried three ways: its name under Store,
 * which is what a reader of the sheet wants, and its System ID and store number from the
 * Reference sheet; the number is what the QR code, the dashboard and the photo filenames
 * key on. Files written before Store ID existed held the number under Store; see
 * normaliseRecords.
 */
function deliveriesSchema() {
  return [
    { header: 'Date',                      key: 'date',               type: 'date' },
    { header: 'Store',                     key: 'store',              type: 'text',    width: 120 },
    { header: 'Driver',                    key: 'driver',             type: 'text' },
    { header: 'Dish',                      key: 'dish',               type: 'text',    width: 220 },
    { header: 'Arrival Time',              key: 'arrive',             type: 'time',    width: 110 },
    { header: 'Arrival Temp °F',           key: 'arrivalTemp',        type: 'number',  width: 130 },
    { header: 'Added to Shelf',            key: 'added',              type: 'number',  width: 120 },
    { header: 'On Shelf Before',           key: 'before',             type: 'number',  width: 130 },
    { header: 'Removed',                   key: 'removed',            type: 'number' },
    { header: 'Removal Reason',            key: 'reason',             type: 'text',    width: 180 },
    { header: 'Shelf Total After',         key: 'after',              type: 'number',  width: 140 },  // or '—' / '⚠ Check'
    { header: 'Case Fill Before Stocking', key: 'casePrefillPercent', type: 'text',    width: 190 },
    { header: 'Store Cooler Temp °F',      key: 'coolerTemp',         type: 'number',  width: 160 },
    { header: 'Received By',               key: 'receivedBy',         type: 'text',    width: 140 },
    { header: 'Store Notes',               key: 'notes',              type: 'text',    width: 260 },
    { header: 'Before Photo',              key: 'beforePhotoLink',    type: 'text',    width: 220 },  // filled by the photo upload
    { header: 'After Photo',               key: 'afterPhotoLink',     type: 'text',    width: 220 },  // filled by the photo upload
    { header: 'Store System ID',           key: 'storeSystemId',      type: 'text',    width: 290 },
    { header: 'Store ID',                  key: 'storeId',            type: 'text',    width: 80 },
    { header: 'Dish System ID',            key: 'dishSystemId',       type: 'text',    width: 290 },
    { header: 'Submission ID',             key: 'submissionId',       type: 'text',    width: 290, value: submissionIdOf },
    { header: 'Submitted At',              key: 'clientTimestamp',    type: 'instant' },
    { header: 'Received At',               key: 'serverTimestamp',    type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/**
 * One row per violation; open until Resolved At is filled. A violation belongs to a location,
 * a store (from a delivery) or a kitchen (from packaging): the row keys on the location's
 * System ID and carries its name and type; the organisation's own id is not stored, the
 * dashboard attaches it when needed. Files written when violations were store-shaped held
 * the store number or name under Store; see normaliseRecords.
 */
function violationsSchema() {
  return [
    { header: 'Date',               key: 'date',             type: 'date' },
    { header: 'Time',               key: 'time',             type: 'time',    width: 90,  aliases: ['Arrival Time'] },
    { header: 'Location',           key: 'location',         type: 'text',    width: 150, aliases: ['Store'] },
    { header: 'Location Type',      key: 'locationType',     type: 'text',    width: 110 },   // Kitchen | Store
    { header: 'Driver',             key: 'driver',           type: 'text' },
    { header: 'Type',               key: 'violationType',    type: 'text',    width: 170 },
    { header: 'Temp °F',            key: 'value',            type: 'number' },
    { header: 'Notes',              key: 'notes',            type: 'text',    width: 260, aliases: ['Store Notes'] },
    { header: 'Corrective Action',  key: 'correctiveAction', type: 'text',    width: 300 },
    { header: 'Resolved By',        key: 'resolvedBy',       type: 'text',    width: 140 },
    { header: 'Resolved At',        key: 'resolvedAt',       type: 'instant' },
    { header: 'Detected At',        key: 'timestamp',        type: 'instant' },
    { header: 'Location System ID', key: 'locationSystemId', type: 'text',    width: 290, aliases: ['Store System ID'] },
    { header: 'Submission ID',      key: 'submissionId',     type: 'text',    width: 290 },
    { header: 'Violation ID',       key: 'violationId',      type: 'text',    width: 290 }
  ];
}

/** One row per request the backend handled. */
function executionsSchema() {
  return [
    { header: 'Form Type',       key: 'formType',     type: 'text',    width: 110 },
    { header: 'Status',          key: 'status',       type: 'text',    width: 100 },
    { header: 'Row Count',       key: 'rowCount',     type: 'number',  width: 100 },
    { header: 'Photo Size (KB)', key: 'photoSizeKB',  type: 'number',  width: 120 },
    { header: 'Duration (ms)',   key: 'durationMs',   type: 'number',  width: 110 },
    { header: 'Error Message',   key: 'errorMessage', type: 'text',    width: 340 },
    { header: 'Notes',           key: 'notes',        type: 'text',    width: 340 },
    { header: 'Submission ID',   key: 'submissionId', type: 'text',    width: 290 },
    { header: 'Timestamp',       key: 'timestamp',    type: 'instant' }
  ];
}

/**
 * Sheet size at creation and the last column of the basic filter. A basic filter is one
 * rectangle from column A, so every column up to `filterThrough` gets a dropdown.
 */
function tabLayout(tab) {
  return {
    Production: { rows: 4000, filterThrough: 'Dish' },
    Packaging:  { rows: 6000, filterThrough: 'Dish' },
    Deliveries: { rows: 6000, filterThrough: 'Dish' },
    Violations: { rows: 1000, filterThrough: null },
    Executions: { rows: 4000, filterThrough: null }
  }[tab];
}

/** Pixel width for a column: its own, else a default for its type. */
function columnWidth(col) {
  return col.width || { date: 100, time: 90, number: 90, bool: 80, instant: 175, text: 130 }[col.type] || 130;
}

// ─── Writing ─────────────────────────────────────────────────────────────────

function headersOf(schema) {
  return schema.map(col => col.header);
}

/** Number formats for one written row: plain numbers stay numbers, everything else is text so Sheets never coerces it. */
function writeFormats(schema) {
  return schema.map(col => (col.type === 'number' ? 'General' : '@'));
}

/** A stored boolean cell: a real boolean, TRUE/true/yes/1, or anything else (an empty cell included) as false. */
function boolFromCell(value) {
  if (value === true || value === false) return value;
  const s = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1';
}

/** A cell value for one column: numeric strings become numbers, instants are normalised, booleans the words TRUE/FALSE, everything else is text. */
function cellForWrite(col, value) {
  if (value === undefined || value === null) return '';
  if (col.type === 'instant') return normaliseInstant(value);
  if (col.type === 'bool') return boolFromCell(value) ? 'TRUE' : 'FALSE';   // text under the '@' format, so Sheets stores the word
  if (col.type === 'number') {
    if (typeof value === 'number') return value;
    const s = String(value).trim();
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
  }
  return String(value);
}

/** Rows as 2-D cell values in schema order. */
function buildRows(schema, rows, ctx) {
  return rows.map(row => schema.map(col => cellForWrite(col, col.value ? col.value(row, ctx) : row[col.key])));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Column index per schema key, matched on header text (or an alias); -1 when absent. */
function headerIndex(headerRow, schema) {
  const cells = headerRow.map(h => String(h).trim());
  const idx = {};
  const missing = [];
  schema.forEach(col => {
    let i = cells.indexOf(col.header);
    if (i < 0 && col.aliases) i = cells.findIndex(c => col.aliases.includes(c));
    idx[col.key] = i;
    if (i < 0) missing.push(col.header);
  });
  return { idx, missing };
}

/** A cell as the API returns it. Date objects only appear in cells someone reformatted by hand. */
function normaliseCell(value, type) {
  if (type === 'bool') return boolFromCell(value);   // before the null check: an empty Active cell reads as false, not ''
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (type === 'date') return Utilities.formatDate(value, NY_TZ, 'yyyy-MM-dd');
    if (type === 'time') return Utilities.formatDate(value, NY_TZ, 'HH:mm');
    return formatInstant(value);
  }
  return value;
}

/**
 * Per-tab repair of rows read from a file written under an earlier schema. Deliveries: Store
 * once held the store number; put it under storeId and the store's name under store.
 * Violations were store-shaped: a row with no Location System ID has the store number under
 * Location, and a row with a System ID but no Location Type is a store. Rows that already
 * have the newer fields are left alone. Call on every read of the tab; never on a write.
 */
function normaliseRecords(tab, records) {
  if (tab !== 'Deliveries' && tab !== 'Violations') return records;
  let stores = null;
  const byNumber = number => {
    if (!stores) stores = storeList();
    return stores.find(s => String(s.id) === number) || null;
  };
  records.forEach(record => {
    if (tab === 'Deliveries') {
      const store = String(record.store || '').trim();
      if (!store) return;
      if (!record.storeId) record.storeId = store;
      if (String(record.storeId) === store) {
        const match = byNumber(store);
        if (match) record.store = match.name;
      }
      return;
    }
    const location = String(record.location || '').trim();
    if (!record.locationSystemId && location) {
      const match = byNumber(location);
      if (match) {
        record.location = match.name;
        record.locationSystemId = match.key;
      }
    }
    if (!record.locationType && (record.locationSystemId || location)) record.locationType = 'Store';
  });
  return records;
}

/**
 * Sheet values (header row first) → records keyed by schema key, plus `_row` (1-based sheet
 * row). Columns the file lacks read as ''. Extra columns in the file are ignored.
 */
function readRows(values, schema) {
  if (!values.length) return { records: [], missing: headersOf(schema) };
  const { idx, missing } = headerIndex(values[0], schema);
  const records = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    if (row.every(v => v === '' || v === null || v === undefined)) continue;
    const record = { _row: r + 1 };
    schema.forEach(col => {
      const i = idx[col.key];
      record[col.key] = i < 0 ? '' : normaliseCell(row[i], col.type);
    });
    records.push(record);
  }
  return { records, missing };
}
