// Schemas.gs — the four tabs of a monthly file: headers, keys, and how rows are built and read.
//
// Header text is the read contract; column position is not. A column entry is
// { header, key, type, value? }: `key` is the payload field on write and the output key on
// read; `value(row, ctx)` overrides the payload for server-derived cells; `type` is one of
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
    { header: 'Production Kitchen',  key: 'kitchen',         type: 'text' },
    { header: 'Supervisor',          key: 'supervisor',      type: 'text' },
    { header: 'Shift',               key: 'shift',           type: 'text' },
    { header: 'Dish',                key: 'dish',            type: 'text' },
    { header: 'Qty Produced',        key: 'qtyProduced',     type: 'number' },
    { header: 'Qty Discarded',       key: 'qtyDiscarded',    type: 'number' },
    { header: 'Discard Reason',      key: 'discardReason',   type: 'text' },
    { header: 'Cook Temp °F',        key: 'cookTemp',        type: 'number' },
    { header: 'Cook Start',          key: 'cookStart',       type: 'time' },
    { header: 'Cook End',            key: 'cookEnd',         type: 'time' },
    { header: 'Cook Time (min)',     key: 'cookTime',        type: 'number' },
    { header: 'Cool Start',          key: 'coolStart',       type: 'time' },
    { header: 'Cool End',            key: 'coolEnd',         type: 'time' },      // or 'Next Morning'
    { header: 'Cool Time (min)',     key: 'coolTime',        type: 'number' },    // or 'Overnight'
    { header: 'Final Batch Temp °F', key: 'finalTemp',       type: 'number' },
    { header: 'Submission ID',       key: 'submissionId',    type: 'text',    value: submissionIdOf },
    { header: 'Submitted At',        key: 'clientTimestamp', type: 'instant' },
    { header: 'Received At',         key: 'serverTimestamp', type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/** One row per dish per store visit. */
function deliveriesSchema() {
  return [
    { header: 'Date',                      key: 'date',               type: 'date' },
    { header: 'Store',                     key: 'storeId',            type: 'text',    value: row => row.storeId || row.store || '' },
    { header: 'Driver',                    key: 'driver',             type: 'text' },
    { header: 'Arrival Time',              key: 'arrive',             type: 'time' },
    { header: 'Arrival Temp °F',           key: 'arrivalTemp',        type: 'number' },
    { header: 'Dish',                      key: 'dish',               type: 'text' },
    { header: 'Added to Shelf',            key: 'added',              type: 'number' },
    { header: 'On Shelf Before',           key: 'before',             type: 'number' },
    { header: 'Removed',                   key: 'removed',            type: 'number' },
    { header: 'Removal Reason',            key: 'reason',             type: 'text' },
    { header: 'Shelf Total After',         key: 'after',              type: 'number' },   // or '—' / '⚠ Check'
    { header: 'Case Fill Before Stocking', key: 'casePrefillPercent', type: 'text' },
    { header: 'Store Cooler Temp °F',      key: 'coolerTemp',         type: 'number' },
    { header: 'Received By',               key: 'receivedBy',         type: 'text' },
    { header: 'Store Notes',               key: 'notes',              type: 'text' },
    { header: 'Before Photo',              key: 'beforePhotoLink',    type: 'text' },     // filled by the photo upload
    { header: 'After Photo',               key: 'afterPhotoLink',     type: 'text' },     // filled by the photo upload
    { header: 'Submission ID',             key: 'submissionId',       type: 'text',    value: submissionIdOf },
    { header: 'Submitted At',              key: 'clientTimestamp',    type: 'instant' },
    { header: 'Received At',               key: 'serverTimestamp',    type: 'instant', value: (row, ctx) => ctx.serverTimestamp }
  ];
}

/** One row per violation; open until Resolved At is filled. */
function violationsSchema() {
  return [
    { header: 'Date',          key: 'date',          type: 'date' },
    { header: 'Store',         key: 'storeId',       type: 'text' },
    { header: 'Driver',        key: 'driver',        type: 'text' },
    { header: 'Type',          key: 'violationType', type: 'text' },
    { header: 'Temp °F',       key: 'value',         type: 'number' },
    { header: 'Resolved By',   key: 'resolvedBy',    type: 'text' },
    { header: 'Resolved At',   key: 'resolvedAt',    type: 'instant' },
    { header: 'Alert Sent To', key: 'recipients',    type: 'text' },
    { header: 'Alert Status',  key: 'emailStatus',   type: 'text' },
    { header: 'Alert Error',   key: 'errorMessage',  type: 'text' },
    { header: 'Detected At',   key: 'timestamp',     type: 'instant' },
    { header: 'Submission ID', key: 'submissionId',  type: 'text' },
    { header: 'Violation ID',  key: 'violationId',   type: 'text' }
  ];
}

/** One row per request the backend handled. */
function executionsSchema() {
  return [
    { header: 'Form Type',       key: 'formType',     type: 'text' },
    { header: 'Status',          key: 'status',       type: 'text' },
    { header: 'Row Count',       key: 'rowCount',     type: 'number' },
    { header: 'Photo Size (KB)', key: 'photoSizeKB',  type: 'number' },
    { header: 'Duration (ms)',   key: 'durationMs',   type: 'number' },
    { header: 'Error Message',   key: 'errorMessage', type: 'text' },
    { header: 'Notes',           key: 'notes',        type: 'text' },
    { header: 'Write Targets',   key: 'writeTargets', type: 'text' },
    { header: 'Submission ID',   key: 'submissionId', type: 'text' },
    { header: 'Timestamp',       key: 'timestamp',    type: 'instant' }
  ];
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
