// LegacyStore.gs — the single-spreadsheet store this project is migrating away from.
//
// Everything here writes to or reads from the spreadsheet named by SPREADSHEET_ID and
// its hand-built tabs. Column order is the contract with that sheet: do not reorder.
// This file is deleted whole when the legacy sheet is retired.

/**
 * Target spreadsheet for this environment — SINGLE SOURCE OF TRUTH.
 *
 * NO DEFAULT, BY DESIGN. This used to fall back to the production sheet ID, which meant
 * any environment with an unset or mistyped SPREADSHEET_ID silently wrote into the live
 * HACCP record. Failing loudly is the only safe behaviour.
 */
function getSpreadsheetId() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      'SPREADSHEET_ID Script Property is not set on this Apps Script project. ' +
      'Set it under Project Settings > Script Properties before deploying. ' +
      'Refusing to fall back to a default — that would risk writing to production.'
    );
  }
  return id;
}

// The store list lives in data/stores.json. This file deliberately keeps no copy of the
// names: one was removed 2026-09-04 after it turned out to be fabricated — seven Maryland
// Giant stores (Hampden, Laurel, Catonsville…) mapped onto Pennsylvania store numbers, so
// a cooler violation in Carlisle alerted on "Giant Laurel". stores.json names each store
// "Store <id>", which is exactly what `Store ${row.store}` produces at the call site.
// 'Delivery Log - Live'. Do not reorder — position is the contract with the sheet.
const DELIVERY_LOG_COLUMNS = [
  { col: 'A', header: 'Submitted At',      from: 'clientTimestamp' },
  { col: 'B', header: 'Date',              from: 'date' },
  { col: 'C', header: 'Driver',            from: 'driver' },
  { col: 'D', header: 'Store #',           from: 'store' },   // misspelled "Strore #" in the sheet
  { col: 'E', header: 'Arrival Time',      from: 'arrive' },
  { col: 'F', header: 'Cooler Temp °F',    from: 'coolerTemp' },
  { col: 'G', header: 'Cooler Condition',  from: 'coolerCond' },
  { col: 'H', header: 'Dish',              from: 'dish' },
  { col: 'I', header: 'Case Pre-Fill %',   from: 'casePrefillPercent' },
  { col: 'J', header: 'Qty Added',         from: 'added' },
  { col: 'K', header: 'On Shelf Before',   from: 'before' },
  { col: 'L', header: 'Qty Removed',       from: 'removed' },
  { col: 'M', header: 'Expire Reason',     from: 'reason' },
  { col: 'N', header: 'Shelf Total After', from: 'after' },
  { col: 'O', header: 'Store Notes',       from: 'notes' },
  { col: 'P', header: 'Received By',       from: 'receivedBy' },
  { col: 'Q', header: 'Before Photo Link', value: () => '' },  // filled later by handlePhotoUpload
  { col: 'R', header: 'After Photo Link',  value: () => '' }
];

// 'Production Log - Live'. Note this log carries a server timestamp at column B and the
// delivery log does not — the readers in doGet detect that difference at runtime.
const PRODUCTION_LOG_COLUMNS = [
  { col: 'A', header: 'Client Timestamp', from: 'clientTimestamp' },
  { col: 'B', header: 'Server Timestamp', value: (row, ctx) => ctx.serverTimestamp },
  { col: 'C', header: 'Date',             from: 'date' },
  { col: 'D', header: 'Shift',            from: 'shift' },
  { col: 'E', header: 'Kitchen',          from: 'kitchen' },
  { col: 'F', header: 'Supervisor',       from: 'supervisor' },
  { col: 'G', header: 'Dish',             from: 'dish' },
  { col: 'H', header: 'Batch #',          from: 'batch' },
  { col: 'I', header: 'Cook Temp °F',     from: 'cookTemp' },
  { col: 'J', header: 'Cook Start',       from: 'cookStart' },
  { col: 'K', header: 'Cook End',         from: 'cookEnd' },
  { col: 'L', header: 'Cook Time (min)',  from: 'cookTime' },
  { col: 'M', header: 'Qty Produced',     from: 'qtyProduced' },
  { col: 'N', header: 'Qty Discarded',    from: 'qtyDiscarded' },
  { col: 'O', header: 'Discard Reason',   from: 'discardReason' },
  { col: 'P', header: 'Cool Start',       from: 'coolStart' },
  { col: 'Q', header: 'Cool End',         from: 'coolEnd' },
  { col: 'R', header: 'Cool Time (min)',  from: 'coolTime' },
  { col: 'S', header: 'Final Temp °F',    from: 'finalTemp' },
  { col: 'T', header: 'QA Result',        from: 'qa' },
  { col: 'U', header: 'QA Notes',         from: 'qaNotes' },
  { col: 'V', header: 'Initials',         from: 'initials' },
  { col: 'W', header: 'General Notes',    from: 'generalNotes' },
  { col: 'X', header: 'Batch QA Notes',   from: 'batchQANotes' }
];

/** Build one sheet row from a schema. `ctx` carries per-request values like serverTimestamp. */
function buildSheetRow(schema, row, ctx) {
  return schema.map(column => {
    const value = column.value ? column.value(row, ctx) : row[column.from];
    return value === undefined || value === null ? '' : value;
  });
}

/** Legacy writers, called by Records.gs while WRITE_TARGETS includes `legacy`. */
function legacyAppendProduction(rows, ctx) {
  const sheet = requireSheet(openSpreadsheet(), 'Production Log - Live');
  // T-027: the legacy sheet keeps its UTC server timestamp.
  const legacyCtx = { serverTimestamp: ctx.startTime.toISOString() };
  rows.forEach(row => sheet.appendRow(buildSheetRow(PRODUCTION_LOG_COLUMNS, row, legacyCtx)));
}

function legacyAppendDeliveries(rows) {
  const sheet = requireSheet(openSpreadsheet(), 'Delivery Log - Live');
  rows.forEach(row => sheet.appendRow(buildSheetRow(DELIVERY_LOG_COLUMNS, row)));
}

/**
 * Write execution log entry to "Execution Log" sheet
 * @param {Object} logEntry - Log entry with timestamp, formType, rowCount, etc.
 */
function writeExecutionLog(logEntry) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let logSheet = ss.getSheetByName('Execution Log');
  if (!logSheet) {
    // Auto-create on first write
    logSheet = ss.insertSheet('Execution Log');
    logSheet.appendRow([
      'Timestamp',
      'Form Type',
      'Row Count',
      'Photo Size (KB)',
      'Status',
      'Error Message',
      'Duration (ms)'
    ]);
    // Format header row
    const headerRange = logSheet.getRange(1, 1, 1, 7);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#323031');
    headerRange.setFontColor('#FFFFFF');
  }

  logSheet.appendRow([
    logEntry.timestamp,
    logEntry.formType,
    logEntry.rowCount,
    logEntry.photoSizeKB,
    logEntry.status,
    logEntry.errorMessage,
    logEntry.durationMs
  ]);
}

/**
 * Initialize Execution Log sheet
 * Run this manually or via init endpoint
 */
function initializeExecutionLog() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let logSheet = ss.getSheetByName('Execution Log');
  if (logSheet) {
    Logger.log('Execution Log sheet already exists');
    return;
  }

  logSheet = ss.insertSheet('Execution Log');
  logSheet.appendRow([
    'Timestamp',
    'Form Type',
    'Row Count',
    'Photo Size (KB)',
    'Status',
    'Error Message',
    'Duration (ms)'
  ]);

  // Format header
  const headerRange = logSheet.getRange(1, 1, 1, 7);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#323031');
  headerRange.setFontColor('#FFFFFF');

  Logger.log('Execution Log sheet created successfully');
}

/**
 * Initialize Alert Log sheet if it doesn't exist
 */
function initializeAlertLogSheet() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let alertLogSheet = ss.getSheetByName('Alert Log');
  if (!alertLogSheet) {
    alertLogSheet = ss.insertSheet('Alert Log');

    // Set up headers
    alertLogSheet.appendRow([
      'Timestamp',
      'Violation Type',
      'Store',
      'Store Name',
      'Temperature',
      'Threshold',
      'Date',
      'Time',
      'Driver',
      'Received By',
      'Recipients',
      'Email Status',
      'Error Message'
    ]);

    // Format header row
    const headerRange = alertLogSheet.getRange('A1:M1');
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#C0392B');
    headerRange.setFontColor('#FFFFFF');

    // Freeze header row
    alertLogSheet.setFrozenRows(1);

    // Auto-resize columns
    alertLogSheet.autoResizeColumns(1, 13);

    Logger.log('✅ Alert Log sheet created');
  } else {
    Logger.log('Alert Log sheet already exists');
  }
}

/**
 * Initialize Violations Tracker sheet if it doesn't exist.
 * Tracks HACCP violations with status management (open → in_progress → resolved).
 */
function initializeViolationsTrackerSheet() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let violationsSheet = ss.getSheetByName('Violations Tracker');
  if (!violationsSheet) {
    violationsSheet = ss.insertSheet('Violations Tracker');

    // Set up headers
    violationsSheet.appendRow([
      'Violation ID',
      'Timestamp',
      'Store ID',
      'Store Name',
      'Violation Type',
      'Value',
      'Threshold',
      'Alert Log Ref',
      'Status',
      'Notes',
      'Resolved At',
      'Resolved By'
    ]);

    // Format header row
    const headerRange = violationsSheet.getRange('A1:L1');
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#C0392B');
    headerRange.setFontColor('#FFFFFF');

    // Freeze header row
    violationsSheet.setFrozenRows(1);

    // Auto-resize columns
    violationsSheet.autoResizeColumns(1, 12);

    Logger.log('✅ Violations Tracker sheet created');
  } else {
    Logger.log('Violations Tracker sheet already exists');
  }
}

/**
 * Log violation alert attempt
 */
function logViolationAlert(violationType, storeId, storeName, temp, threshold, date, time, driver, receivedBy, recipients, emailStatus, errorMessage) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let alertLogSheet = ss.getSheetByName('Alert Log');

  if (!alertLogSheet) {
    initializeAlertLogSheet();
    alertLogSheet = ss.getSheetByName('Alert Log');
  }

  alertLogSheet.appendRow([
    new Date(),
    violationType,
    storeId,
    storeName,
    temp,
    threshold,
    date,
    time,
    driver,
    receivedBy,
    recipients,
    emailStatus,
    errorMessage || ''
  ]);
}

/**
 * Create a violation tracker entry
 */
function createViolationTrackerEntry(violationType, storeId, storeName, temp, threshold, alertLogTimestamp) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let violationsSheet = ss.getSheetByName('Violations Tracker');

  if (!violationsSheet) {
    initializeViolationsTrackerSheet();
    violationsSheet = ss.getSheetByName('Violations Tracker');
  }

  const violationId = Utilities.getUuid();
  const timestamp = new Date().toISOString();

  violationsSheet.appendRow([
    violationId,                    // Violation ID
    timestamp,                      // Timestamp
    storeId,                        // Store ID
    storeName,                      // Store Name
    violationType,                  // Violation Type
    temp,                           // Value
    threshold,                      // Threshold
    alertLogTimestamp,              // Alert Log Ref
    'open',                         // Status (open, in_progress, resolved)
    '',                             // Notes
    '',                             // Resolved At
    ''                              // Resolved By
  ]);

  Logger.log(`✅ Violation tracker entry created: ${violationId}`);
  return violationId;
}

/**
 * Locate the columns this handler needs by header name.
 *
 * Staging and production drifted apart on whether a Server Timestamp column exists, so the
 * positions cannot be hardcoded. Matching on headers rather than fixed indices is what
 * survives that drift; the numeric fallbacks are the observed staging layout.
 */
function findDeliveryPhotoColumns(data) {
  const headerRow = data[0];
  const headerRow2 = data[1] || [];   // header may be on row 2 if row 1 is a banner

  const findColumnIndex = (headerNames) => {
    for (let colIdx = 0; colIdx < headerRow.length; colIdx++) {
      const header = String(headerRow[colIdx]).toLowerCase().trim();
      const header2 = String(headerRow2[colIdx]).toLowerCase().trim();
      if (headerNames.some(name => header.includes(name) || header2.includes(name))) {
        return colIdx;
      }
    }
    return -1;
  };

  const storeIdCol = findColumnIndex(['store', 'strore']);  // handles the sheet's misspelling
  const dateCol = findColumnIndex(['date']);
  const driverCol = findColumnIndex(['driver']);

  // 'photo link' phrases, not bare 'photo', so other photo columns cannot match.
  const beforePhotoCol = findColumnIndex(['before photo link', 'photo before', 'before link']);
  const afterPhotoCol = findColumnIndex(['after photo link', 'photo after', 'after link']);

  const storeIdx = storeIdCol >= 0 ? storeIdCol : 3;   // Col D in staging
  const dateIdx = dateCol >= 0 ? dateCol : 1;          // Col B in staging
  const driverIdx = driverCol >= 0 ? driverCol : 2;    // Col C in staging

  // If the photo headers are missing, append after the known data columns (data ends ~col P).
  const lastDataCol = Math.max(storeIdx, dateIdx, driverIdx, 16);
  const beforePhotoIdx = beforePhotoCol >= 0 ? beforePhotoCol : lastDataCol + 1;
  const afterPhotoIdx = afterPhotoCol >= 0 ? afterPhotoCol : lastDataCol + 2;

  return {
    storeIdx: storeIdx,
    dateIdx: dateIdx,
    driverIdx: driverIdx,
    beforeSheetCol: beforePhotoIdx + 1,   // getRange() is 1-indexed
    afterSheetCol: afterPhotoIdx + 1,
    beforeFound: beforePhotoCol >= 0,
    afterFound: afterPhotoCol >= 0
  };
}

/** Rows matching this upload's store + date + driver, as 1-indexed sheet row numbers. */
function findMatchingDeliveryRows(data, cols, photos) {
  // "Store 6253 – New Cumberland, PA" → "6253"
  const extractStoreId = (fullStoreName) => {
    const match = String(fullStoreName).match(/Store (\d+)/i);
    return match ? match[1] : String(fullStoreName).trim();
  };

  const matchingRows = [];
  for (let i = 2; i < data.length; i++) {   // start at 2 to clear both possible header rows
    const row = data[i];
    const rowStoreId = extractStoreId(String(row[cols.storeIdx]).trim());
    const rowDate = row[cols.dateIdx];
    const rowDriver = String(row[cols.driverIdx]).trim();

    const rowDateStr = rowDate instanceof Date
      ? Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : String(rowDate);

    if (rowStoreId === String(photos.storeId) &&
        rowDateStr === photos.date &&
        rowDriver === photos.driver) {
      matchingRows.push(i + 1);
    }
  }
  return matchingRows;
}

function linkPhotosToDeliveryRow(ss, photos, saved, logEntry) {
  const sheet = ss.getSheetByName('Delivery Log - Live');
  if (!sheet) {
    Logger.log(`[PHOTO UPLOAD] WARNING: Sheet not found. Photos saved to Drive but URLs not written. storeId=${photos.storeId}, date=${photos.date}, driver=${photos.driver}`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const cols = findDeliveryPhotoColumns(data);
  Logger.log(`[PHOTO UPLOAD] Column detection: storeIdx=${cols.storeIdx}, dateIdx=${cols.dateIdx}, driverIdx=${cols.driverIdx}, beforePhotoCol=${cols.beforeSheetCol} (found=${cols.beforeFound}), afterPhotoCol=${cols.afterSheetCol} (found=${cols.afterFound})`);

  const matchingRows = findMatchingDeliveryRows(data, cols, photos);
  const trail = `storeId=${photos.storeId}, date=${photos.date}, driver=${photos.driver}, beforeUrl=${saved.beforeUrl}, afterUrl=${saved.afterUrl}`;

  if (matchingRows.length === 0) {
    // Photos are in Drive but nothing points at them. Recoverable by hand from this log.
    Logger.log(`[PHOTO UPLOAD] ORPHAN: No matching delivery row found. Photos saved to Drive but not linked. ${trail}`);
    logEntry.notes = 'ORPHAN: No matching delivery row';
    return;
  }

  // On multiple matches take the most recent, which is the row the driver just submitted.
  const targetRow = matchingRows[matchingRows.length - 1];
  if (saved.beforeUrl) sheet.getRange(targetRow, cols.beforeSheetCol).setValue(saved.beforeUrl);
  if (saved.afterUrl) sheet.getRange(targetRow, cols.afterSheetCol).setValue(saved.afterUrl);

  if (matchingRows.length === 1) {
    Logger.log(`[PHOTO UPLOAD] SUCCESS: Linked photos to row ${targetRow} cols ${cols.beforeSheetCol}/${cols.afterSheetCol}. ${trail}`);
    logEntry.notes = `Linked to row ${targetRow}`;
  } else {
    Logger.log(`[PHOTO UPLOAD] WARNING: Multiple matches found (${matchingRows.length}), wrote to most recent row ${targetRow} cols ${cols.beforeSheetCol}/${cols.afterSheetCol}. ${trail}, allMatches=[${matchingRows.join(', ')}]`);
    logEntry.notes = `Multiple matches, linked to row ${targetRow}`;
  }
}

// Test function — run this manually in the editor to verify your Sheet ID is correct
function testConnection() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to: ' + ss.getName());
  Logger.log('Sheets found: ' + ss.getSheets().map(s => s.getName()).join(', '));
}
