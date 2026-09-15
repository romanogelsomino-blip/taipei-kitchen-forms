// Schemas.gs — the four tabs of a monthly file: headers, keys, and how rows are built and read.
//
// Header text is the read contract; column position is not. A column entry is
// { header, key, type, width?, value? }: `key` is the payload field on write and the output key
// on read; `width` is the column's pixel width; `value(row, ctx)` overrides the payload for server-derived cells; `type` is one of
// date | time | text | number | instant and drives cell handling both ways. Renaming a
// header requires adding the old text to `aliases` so old files still read.

function tabNames() {
  return ['Production', 'Deliveries', 'Violations', 'Executions'];
}

function schemaFor(tab) {
  switch (tab) {
    case 'Production': return productionSchema();
    case 'Deliveries': return deliveriesSchema();
    case 'Violations': return violationsSchema();
    case 'Executions': return executionsSchema();
    default: throw new Error('Unknown tab: ' + tab);
  }
}

function submissionIdOf(row, ctx) {
  return row.submissionId || ctx.submissionId || '';
}

/** One row per dish per production run. */
function productionSchema() {
  return [
    { header: 'Date',                key: 'date',            type: 'date' },
    { header: 'Production Kitchen',  key: 'kitchen',         type: 'text',    width: 170 },
    { header: 'Supervisor',          key: 'supervisor',      type: 'text',    width: 140 },
    { header: 'Shift',               key: 'shift',           type: 'text',    width: 80 },
    { header: 'Dish',                key: 'dish',            type: 'text',    width: 220 },
    { header: 'Qty Produced',        key: 'qtyProduced',     type: 'number',  width: 110 },
    { header: 'Qty Discarded',       key: 'qtyDiscarded',    type: 'number',  width: 110 },
    { header: 'Discard Reason',      key: 'discardReason',   type: 'text',    width: 200 },
    { header: 'Cook Temp °F',        key: 'cookTemp',        type: 'number',  width: 110 },
    { header: 'Cook Start',          key: 'cookStart',       type: 'time' },
    { header: 'Cook End',            key: 'cookEnd',         type: 'time' },
    { header: 'Cook Time (min)',     key: 'cookTime',        type: 'number',  width: 120 },
    { header: 'Cool Start',          key: 'coolStart',       type: 'time' },
    { header: 'Cool End',            key: 'coolEnd',         type: 'time',    width: 110 },  // or 'Next Morning'
    { header: 'Cool Time (min)',     key: 'coolTime',        type: 'number',  width: 120 },  // or 'Overnight'
    { header: 'Final Batch Temp °F', key: 'finalTemp',       type: 'number',  width: 150 },
    { header: 'Submission ID',       key: 'submissionId',    type: 'text',    width: 290, value: submissionIdOf },
    { header: 'Submitted At',        key: 'clientTimestamp', type: 'instant' },
    { header: 'Received At',         key: 'serverTimestamp', type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/** One row per dish per store visit. */
function deliveriesSchema() {
  return [
    { header: 'Date',                      key: 'date',               type: 'date' },
    { header: 'Store',                     key: 'storeId',            type: 'text',    width: 80, value: row => row.storeId || row.store || '' },
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
    { header: 'Submission ID',             key: 'submissionId',       type: 'text',    width: 290, value: submissionIdOf },
    { header: 'Submitted At',              key: 'clientTimestamp',    type: 'instant' },
    { header: 'Received At',               key: 'serverTimestamp',    type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/** One row per violation; open until Resolved At is filled. */
function violationsSchema() {
  return [
    { header: 'Date',          key: 'date',          type: 'date' },
    { header: 'Store',         key: 'storeId',       type: 'text',    width: 80 },
    { header: 'Driver',        key: 'driver',        type: 'text' },
    { header: 'Type',          key: 'violationType', type: 'text',    width: 170 },
    { header: 'Temp °F',       key: 'value',         type: 'number' },
    { header: 'Resolved By',   key: 'resolvedBy',    type: 'text',    width: 140 },
    { header: 'Resolved At',   key: 'resolvedAt',    type: 'instant' },
    { header: 'Alert Sent To', key: 'recipients',    type: 'text',    width: 240 },
    { header: 'Alert Status',  key: 'emailStatus',   type: 'text',    width: 110 },
    { header: 'Alert Error',   key: 'errorMessage',  type: 'text',    width: 260 },
    { header: 'Detected At',   key: 'timestamp',     type: 'instant' },
    { header: 'Submission ID', key: 'submissionId',  type: 'text',    width: 290 },
    { header: 'Violation ID',  key: 'violationId',   type: 'text',    width: 180 }
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
    { header: 'Write Targets',   key: 'writeTargets', type: 'text',    width: 120 },
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
    Production: { rows: 4000, filterThrough: 'Shift' },
    Deliveries: { rows: 6000, filterThrough: 'Dish' },
    Violations: { rows: 1000, filterThrough: null },
    Executions: { rows: 4000, filterThrough: null }
  }[tab];
}

/** Pixel width for a column: its own, else a default for its type. */
function columnWidth(col) {
  return col.width || { date: 100, time: 90, number: 90, instant: 175, text: 130 }[col.type] || 130;
}

// ─── Writing ─────────────────────────────────────────────────────────────────

function headersOf(schema) {
  return schema.map(col => col.header);
}

/** Number formats for one written row: plain numbers stay numbers, everything else is text so Sheets never coerces it. */
function writeFormats(schema) {
  return schema.map(col => (col.type === 'number' ? 'General' : '@'));
}

/** A cell value for one column: numeric strings become numbers, instants are normalised, everything else is text. */
function cellForWrite(col, value) {
  if (value === undefined || value === null) return '';
  if (col.type === 'instant') return normaliseInstant(value);
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
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (type === 'date') return Utilities.formatDate(value, NY_TZ, 'yyyy-MM-dd');
    if (type === 'time') return Utilities.formatDate(value, NY_TZ, 'HH:mm');
    return formatInstant(value);
  }
  return value;
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
