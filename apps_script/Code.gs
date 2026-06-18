
// ═══════════════════════════════════════════════════════════════════════════════
// Taipei Kitchen — Google Apps Script
// 1. In your Google Sheet go to Extensions → Apps Script
// 2. Delete everything there and paste ALL of the code below
// 3. Replace 1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI with your actual Sheet ID
// 4. Click Deploy → New deployment → Web app → Execute as: Me → Anyone → Deploy
// 5. Copy the Web app URL and paste it into both HTML form files
// ═══════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI'; // ← Replace this
  const BUG_REPORT_EMAIL = 'support@universoleappstudios.com'; // Email for bug reports

  const startTime = new Date();
  let logEntry = {
    timestamp: startTime.toISOString(),
    formType: 'unknown',
    rowCount: 0,
    photoSizeKB: 0,
    status: 'STARTED',
    errorMessage: '',
    durationMs: 0
  };

  try {
    const payload  = JSON.parse(e.postData.contents);

    // Handle bug reports
    if (payload.type === 'bugReport') {
      logEntry.formType = 'bugReport';
      MailApp.sendEmail({
        to: BUG_REPORT_EMAIL,
        subject: payload.subject,
        body: payload.body
      });
      logEntry.status = 'SUCCESS';
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Bug report sent' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Handle form submissions
    const rows     = payload.rows;
    const formType = payload.formType;
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Update log entry with form details
    logEntry.formType = formType || 'unknown';
    logEntry.rowCount = rows ? rows.length : 0;

    // Calculate photo payload size if present
    if (payload.photos) {
      let photoSize = 0;
      if (payload.photos.before && payload.photos.before.data) {
        photoSize += payload.photos.before.data.length * 0.75 / 1024; // base64 to KB
      }
      if (payload.photos.after && payload.photos.after.data) {
        photoSize += payload.photos.after.data.length * 0.75 / 1024;
      }
      logEntry.photoSizeKB = Math.round(photoSize);
    }

    // T-027: Capture server timestamp when data is received
    const serverTimestamp = new Date().toISOString();

    if (formType === 'delivery') {
      const sheet = ss.getSheetByName('Delivery Log - Live');
      if (!sheet) throw new Error('Sheet "Delivery Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.clientTimestamp,    // Col A  – Client Timestamp (when user submitted)
          serverTimestamp,        // Col B  – Server Timestamp (when server received)
          row.date,               // Col C  – Date
          row.driver,             // Col D  – Driver
          row.vehicle,            // Col E  – Vehicle #
          row.store,              // Col F  – Store  ← IMPORTANT: must match store ID e.g. '6542'
          row.arrive,             // Col G  – Arrival Time
          row.coolerTemp,         // Col H  – Cooler Temp °F
          row.coolerCond,         // Col I  – Cooler Condition
          row.casePrefillPercent, // Col J  – Case Pre-Fill % (NEW: T-047)
          row.dish,               // Col K  – Dish
          row.added,              // Col L  – Qty Added (qtyAdded)
          row.before,             // Col M  – On Shelf Before
          row.removed,            // Col N  – Qty Removed (Expired)
          row.reason,             // Col O  – Expire Reason
          row.after,              // Col P  – Shelf Total After
          row.notes,              // Col Q  – Store Notes
          row.receivedBy          // Col R  – Received By
        ]);

        // P2.4: Check for HACCP violations and send alerts
        try {
          // Get store name from data/stores.json format
          const storeNames = {
            '6006': 'Giant Hampden',
            '6061': 'Giant Columbia Gateway',
            '6253': 'Giant Columbia',
            '6331': 'Giant Clarksville',
            '6443': 'Giant Elkridge',
            '6542': 'Giant Laurel',
            '6564': 'Giant Catonsville'
          };
          const storeName = storeNames[row.store] || `Store ${row.store}`;
          onViolationDetected(row, storeName);
        } catch (alertError) {
          Logger.log(`Warning: Violation check failed for ${row.store}: ${alertError}`);
          // Don't fail the whole submission if alert fails
        }
      });
    }

    if (formType === 'production') {
      const sheet = ss.getSheetByName('Production Log - Live');
      if (!sheet) throw new Error('Sheet "Production Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.clientTimestamp, // Col A  – Client Timestamp (when user submitted)
          serverTimestamp,     // Col B  – Server Timestamp (when server received)
          row.date,            // Col C  – Date
          row.shift,           // Col D  – Shift
          row.kitchen,         // Col E  – Kitchen
          row.supervisor,      // Col F  – Supervisor
          row.dish,            // Col G  – Dish
          row.batch,           // Col H  – Batch #
          row.cookTemp,        // Col I  – Cook Temp °F
          row.cookStart,       // Col J  – Cook Start
          row.cookEnd,         // Col K  – Cook End
          row.cookTime,        // Col L  – Cook Time (min)
          row.qtyProduced,     // Col M  – Qty Produced
          row.qtyDiscarded,    // Col N  – Qty Discarded
          row.discardReason,   // Col O  – Discard Reason
          row.coolStart,       // Col P  – Cool Start
          row.coolEnd,         // Col Q  – Cool End
          row.coolTime,        // Col R  – Cool Time (min)
          row.finalTemp,       // Col S  – Final Temp °F
          row.qa,              // Col T  – QA Result
          row.qaNotes,         // Col U  – QA Notes
          row.initials,        // Col V  – Initials
          row.generalNotes,    // Col W  – General Notes
          row.batchQANotes     // Col X  – Batch QA Notes
        ]);
      });
    }

    // Handle photo uploads
    if (formType === 'photos_only') {
      logEntry.formType = 'photos_only';
      const photos = payload.photos;
      const folderName = 'Taipei Kitchen Photos';

      // Get or create photos folder
      let folder;
      const folders = DriveApp.getFoldersByName(folderName);
      if (folders.hasNext()) {
        folder = folders.next();
      } else {
        folder = DriveApp.createFolder(folderName);
      }

      // Save photos to Drive
      let savedCount = 0;
      if (photos.before && photos.before.data) {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(photos.before.data.split(',')[1]),
          photos.before.type,
          `${photos.storeId}_${photos.date}_before.jpg`
        );
        folder.createFile(blob);
        savedCount++;
      }

      if (photos.after && photos.after.data) {
        const blob = Utilities.newBlob(
          Utilities.base64Decode(photos.after.data.split(',')[1]),
          photos.after.type,
          `${photos.storeId}_${photos.date}_after.jpg`
        );
        folder.createFile(blob);
        savedCount++;
      }

      logEntry.rowCount = savedCount;
      logEntry.status = 'SUCCESS';
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', savedPhotos: savedCount }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    logEntry.status = 'SUCCESS';
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    logEntry.status = 'ERROR';
    logEntry.errorMessage = err.toString();
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    // Always write execution log, even if logging itself fails
    try {
      logEntry.durationMs = new Date() - startTime;
      writeExecutionLog(logEntry);
    } catch (logError) {
      Logger.log('[Execution Log] Failed to write log: ' + logError);
      // Don't throw - logging failure should not break submissions
    }
  }
}

// Test function — run this manually in the editor to verify your Sheet ID is correct
function testConnection() {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to: ' + ss.getName());
  Logger.log('Sheets found: ' + ss.getSheets().map(s => s.getName()).join(', '));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: Execution Logging
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Write execution log entry to "Execution Log" sheet
 * @param {Object} logEntry - Log entry with timestamp, formType, rowCount, etc.
 */
function writeExecutionLog(logEntry) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
 * Send daily summary email with yesterday's submission stats
 * Scheduled to run at 9am daily via time-driven trigger
 */
function sendDailySummary() {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
  const SUMMARY_EMAIL = 'support@universoleappstudios.com';

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName('Execution Log');

    if (!logSheet) {
      Logger.log('[Daily Summary] Execution Log sheet not found');
      return;
    }

    // Get yesterday's date range
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Read all log entries
    const data = logSheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1); // Skip header

    // Filter for yesterday's entries
    const yesterdayEntries = rows.filter(row => {
      const timestamp = new Date(row[0]); // Column A: Timestamp
      return timestamp >= yesterday && timestamp <= yesterdayEnd;
    });

    if (yesterdayEntries.length === 0) {
      // No submissions yesterday - send notification
      MailApp.sendEmail({
        to: SUMMARY_EMAIL,
        subject: `Taipei Kitchen Daily Summary - ${formatDate(yesterday)} - NO ACTIVITY`,
        body: `No form submissions were recorded on ${formatDate(yesterday)}.\n\nThis could indicate:\n- No operations on that day\n- Form submission failures\n- Network connectivity issues\n\nPlease verify with operations team.`
      });
      return;
    }

    // Aggregate statistics
    let deliveryCount = 0;
    let productionCount = 0;
    let bugReportCount = 0;
    let errorCount = 0;
    let photoUploads = 0;
    let totalDuration = 0;
    let maxDuration = 0;
    const errors = [];

    yesterdayEntries.forEach(row => {
      const formType = row[1];
      const rowCount = row[2];
      const photoSize = row[3];
      const status = row[4];
      const errorMsg = row[5];
      const duration = row[6];

      if (formType === 'delivery') deliveryCount++;
      else if (formType === 'production') productionCount++;
      else if (formType === 'bugReport') bugReportCount++;

      if (status === 'ERROR') {
        errorCount++;
        errors.push(`${row[0]}: ${errorMsg}`);
      }

      if (photoSize > 0) photoUploads++;

      totalDuration += duration;
      if (duration > maxDuration) maxDuration = duration;
    });

    const avgDuration = yesterdayEntries.length > 0 ? Math.round(totalDuration / yesterdayEntries.length) : 0;

    // Build email body
    const emailBody = `
Daily Operations Summary for ${formatDate(yesterday)}

═══════════════════════════════════════
SUBMISSIONS
═══════════════════════════════════════
• Delivery Forms: ${deliveryCount} submissions
• Production Forms: ${productionCount} submissions
• Bug Reports: ${bugReportCount}
• Total: ${yesterdayEntries.length} requests

═══════════════════════════════════════
ERRORS
═══════════════════════════════════════
${errorCount === 0 ? '✅ No errors reported' : `❌ ${errorCount} error(s) occurred:\n\n${errors.join('\n\n')}`}

═══════════════════════════════════════
PHOTOS
═══════════════════════════════════════
• Submissions with photos: ${photoUploads}

═══════════════════════════════════════
PERFORMANCE
═══════════════════════════════════════
• Average response time: ${avgDuration}ms
• Slowest submission: ${maxDuration}ms

View full execution log:
https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${logSheet.getSheetId()}

---
🤖 Automated daily summary from Taipei Kitchen Operations System
    `.trim();

    MailApp.sendEmail({
      to: SUMMARY_EMAIL,
      subject: `Taipei Kitchen Daily Summary - ${formatDate(yesterday)}${errorCount > 0 ? ' ⚠️ ERRORS' : ''}`,
      body: emailBody
    });

    Logger.log('[Daily Summary] Email sent successfully');

  } catch (error) {
    Logger.log('[Daily Summary] Failed: ' + error);
    // Try to send error notification
    try {
      MailApp.sendEmail({
        to: SUMMARY_EMAIL,
        subject: 'Taipei Kitchen Daily Summary - FAILED',
        body: 'Failed to generate daily summary:\n\n' + error.toString()
      });
    } catch (e) {
      Logger.log('[Daily Summary] Could not send error notification: ' + e);
    }
  }
}

/**
 * Format date for email display
 */
function formatDate(date) {
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/**
 * Create time-driven trigger for daily summary at 9am
 * Run this once manually after deployment
 */
function createDailySummaryTrigger() {
  // Delete existing trigger if any
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendDailySummary') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger for 9am daily
  ScriptApp.newTrigger('sendDailySummary')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  Logger.log('Daily summary trigger created - will run at 9am every day');
}

// ═══════════════════════════════════════════════════════════════════════════════
// P2.4: HACCP Violation Alerts System (Backend)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize Config sheet if it doesn't exist
 * Run this once manually after deploying to create the Config tab
 */
function initializeConfigSheet() {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  let configSheet = ss.getSheetByName('Config');
  if (!configSheet) {
    configSheet = ss.insertSheet('Config');

    // Set up headers and default values
    configSheet.appendRow(['Setting', 'Value', 'Description']);
    configSheet.appendRow(['violation_alert_emails', '', 'Comma-separated email addresses for HACCP violation alerts']);
    configSheet.appendRow(['enable_violation_alerts', 'TRUE', 'Enable/disable email alerts (TRUE/FALSE)']);
    configSheet.appendRow(['temp_threshold', '41', 'Temperature threshold in °F for violations']);

    // Format header row
    const headerRange = configSheet.getRange('A1:C1');
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#1C1C1C');
    headerRange.setFontColor('#FFFFFF');

    // Auto-resize columns
    configSheet.autoResizeColumns(1, 3);

    Logger.log('✅ Config sheet created');
  } else {
    Logger.log('Config sheet already exists');
  }
}

/**
 * Initialize Alert Log sheet if it doesn't exist
 */
function initializeAlertLogSheet() {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
 * Get config value from Config sheet
 */
function getConfig(key) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const configSheet = ss.getSheetByName('Config');

  if (!configSheet) return null;

  const data = configSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      const rawValue = data[i][1];

      // Normalize boolean values for bulletproof checking
      // Handle: true (bool), "true", "TRUE", "True", 1, "1", "yes", "YES"
      // Handle: false (bool), "false", "FALSE", "False", 0, "0", "no", "NO"
      if (key === 'enable_violation_alerts' || key.toLowerCase().includes('enable')) {
        const stringValue = String(rawValue).trim().toLowerCase();
        if (stringValue === 'true' || stringValue === '1' || stringValue === 'yes' || rawValue === true) {
          return 'true';  // Return canonical string
        } else if (stringValue === 'false' || stringValue === '0' || stringValue === 'no' || rawValue === false) {
          return 'false';  // Return canonical string
        }
      }

      return rawValue;
    }
  }
  return null;
}

/**
 * Set config value in Config sheet
 */
function setConfig(key, value) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let configSheet = ss.getSheetByName('Config');

  if (!configSheet) {
    initializeConfigSheet();
    configSheet = ss.getSheetByName('Config');
  }

  // Normalize boolean values to canonical TRUE/FALSE for human readability
  let normalizedValue = value;
  if (key === 'enable_violation_alerts' || key.toLowerCase().includes('enable')) {
    const stringValue = String(value).trim().toLowerCase();
    if (stringValue === 'true' || stringValue === '1' || stringValue === 'yes' || value === true) {
      normalizedValue = 'TRUE';  // Canonical uppercase for sheet display
    } else if (stringValue === 'false' || stringValue === '0' || stringValue === 'no' || value === false) {
      normalizedValue = 'FALSE';  // Canonical uppercase for sheet display
    }
  }

  const data = configSheet.getDataRange().getValues();
  let found = false;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      configSheet.getRange(i + 1, 2).setValue(normalizedValue);
      found = true;
      break;
    }
  }

  if (!found) {
    configSheet.appendRow([key, normalizedValue, '']);
  }
}

/**
 * Log violation alert attempt
 */
function logViolationAlert(violationType, storeId, storeName, temp, threshold, date, time, driver, receivedBy, recipients, emailStatus, errorMessage) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';
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
 * Check for HACCP violation and send alert if needed
 * Called automatically after delivery form submission
 */
function onViolationDetected(deliveryData, storeName) {
  const enableAlerts = getConfig('enable_violation_alerts');
  if (enableAlerts !== 'true' && enableAlerts !== true) {
    Logger.log('Violation alerts disabled');
    return;
  }

  const emailList = getConfig('violation_alert_emails');
  if (!emailList || emailList.trim() === '') {
    Logger.log('No email recipients configured');
    return;
  }

  const recipients = emailList.split(',').map(e => e.trim()).filter(e => e);
  if (recipients.length === 0) {
    Logger.log('No valid email recipients');
    return;
  }

  const threshold = parseFloat(getConfig('temp_threshold') || '41');
  const coolerTemp = parseFloat(deliveryData.coolerTemp);
  const arrivalTemp = parseFloat(deliveryData.arrivalTemp);

  let violations = [];

  if (!isNaN(coolerTemp) && coolerTemp > threshold) {
    violations.push({
      type: 'Cooler Temperature',
      temp: coolerTemp,
      threshold: threshold
    });
  }

  if (!isNaN(arrivalTemp) && arrivalTemp > threshold) {
    violations.push({
      type: 'Delivery Temperature',
      temp: arrivalTemp,
      threshold: threshold
    });
  }

  if (violations.length === 0) {
    return; // No violations
  }

  // Send email for each violation
  violations.forEach(violation => {
    try {
      const subject = `⚠️ HACCP Violation Alert: ${violation.type} - ${storeName}`;
      const body = `
═══════════════════════════════════════════════════
   TAIPEI KITCHEN · HACCP VIOLATION ALERT
═══════════════════════════════════════════════════

⚠️ VIOLATION DETECTED

Location: ${storeName} (${deliveryData.store})
Date: ${deliveryData.date}
Time: ${deliveryData.arrive || 'N/A'}

Violation Type: ${violation.type}
Recorded Temperature: ${violation.temp}°F
Threshold: ${violation.threshold}°F

Driver: ${deliveryData.driver}
Received By: ${deliveryData.receivedBy || 'N/A'}

Product Details:
  Dish: ${deliveryData.dish}
  Quantity Added: ${deliveryData.added || 0}
  Notes: ${deliveryData.notes || 'None'}

─────────────────────────────────────────────────
ACTION REQUIRED: Please take corrective action and
document the response in the dashboard.

View Dashboard:
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

─────────────────────────────────────────────────
Automated alert from Taipei Kitchen Operations System
Generated: ${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})}
      `.trim();

      MailApp.sendEmail({
        to: recipients.join(','),
        subject: subject,
        body: body
      });

      const alertTimestamp = new Date().toISOString();

      logViolationAlert(
        violation.type,
        deliveryData.store,
        storeName,
        violation.temp,
        violation.threshold,
        deliveryData.date,
        deliveryData.arrive,
        deliveryData.driver,
        deliveryData.receivedBy,
        recipients.join(', '),
        'SUCCESS',
        null
      );

      // Create violation tracker entry
      createViolationTrackerEntry(
        violation.type,
        deliveryData.store,
        storeName,
        violation.temp,
        violation.threshold,
        alertTimestamp
      );

      Logger.log(`✅ Violation alert sent to ${recipients.length} recipient(s)`);
    } catch (error) {
      logViolationAlert(
        violation.type,
        deliveryData.store,
        storeName,
        violation.temp,
        violation.threshold,
        deliveryData.date,
        deliveryData.arrive,
        deliveryData.driver,
        deliveryData.receivedBy,
        recipients.join(', '),
        'FAILED',
        error.toString()
      );

      Logger.log(`❌ Failed to send violation alert: ${error}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helper - Simulate Violation
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulates a delivery violation for end-to-end testing.
 * Can be run via: npm run test:violation:staging or npm run test:violation:production
 *
 * @returns {Object} Test result with status and details
 */
function simulateViolation() {
  Logger.log('🧪 Starting violation simulation test...');

  try {
    // Step 1: Verify Config sheet is initialized
    const emailList = getConfig('violation_alert_emails');
    if (!emailList || emailList.trim() === '') {
      return {
        status: 'FAILED',
        error: 'No email recipients configured in Config sheet. Run initializeConfigSheet first and set violation_alert_emails in cell B2.'
      };
    }

    const enableAlerts = getConfig('enable_violation_alerts');
    if (enableAlerts !== 'true' && enableAlerts !== true) {
      return {
        status: 'FAILED',
        error: 'Violation alerts are disabled. Set enable_violation_alerts to "true" in Config sheet cell B3.'
      };
    }

    Logger.log(`📧 Email recipients: ${emailList}`);

    // Step 2: Construct fake delivery with violation (cooler temp 45°F > threshold 41°F)
    const fakeDelivery = {
      store: '6542',
      coolerTemp: '45',        // ⚠️ VIOLATION: Above 41°F threshold
      arrivalTemp: '38',       // Normal temp (no violation)
      date: new Date().toLocaleDateString('en-US'),
      arrive: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      driver: 'TEST_DRIVER',
      receivedBy: 'TEST_SUPERVISOR',
      dish: 'General Tso Chicken Bento',
      added: '10',
      notes: '🧪 AUTOMATED TEST - This is a simulated violation for testing email alerts'
    };

    const storeName = 'Giant Laurel';

    Logger.log(`🚨 Triggering violation check for ${storeName} with cooler temp ${fakeDelivery.coolerTemp}°F`);

    // Step 3: Call onViolationDetected (same code path as real submissions)
    onViolationDetected(fakeDelivery, storeName);

    Logger.log('✅ Violation simulation completed');

    return {
      status: 'SUCCESS',
      message: 'Simulated cooler temperature violation (45°F)',
      store: storeName,
      recipients: emailList,
      timestamp: new Date().toISOString(),
      note: 'Check email inbox and Alert Log sheet for confirmation'
    };

  } catch (error) {
    Logger.log(`❌ Simulation failed: ${error}`);
    return {
      status: 'FAILED',
      error: error.toString()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Token Management - For Automation via Web App
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * One-time setup: Generate and store admin token for protected endpoints.
 * Call this via Web App URL with ?action=setupAdminToken (first time only).
 * Returns the generated token - save it to .env.staging or .env.production.
 *
 * @param {boolean} force - If true, overwrite existing token (use cautiously)
 * @returns {Object} Generated token and instructions
 */
function setupAdminToken(force) {
  const scriptProperties = PropertiesService.getScriptProperties();

  // Check if token already exists
  const existingToken = scriptProperties.getProperty('ADMIN_TOKEN');
  if (existingToken && !force) {
    return {
      status: 'EXISTS',
      message: 'Admin token already configured. Use force=true to overwrite (this will invalidate the old token).',
      token: '[REDACTED]'
    };
  }

  // Generate strong random token
  const token = Utilities.getUuid();

  // Store in Script Properties
  scriptProperties.setProperty('ADMIN_TOKEN', token);

  Logger.log(`✅ Admin token generated: ${token}`);

  return {
    status: 'SUCCESS',
    message: existingToken ? 'Admin token regenerated (old token invalidated)' : 'Admin token generated and stored in Script Properties',
    token: token,
    instructions: 'Save this token to .env.staging or .env.production (gitignored). You will need it for all admin API calls.'
  };
}

/**
 * Verify admin token from request parameter.
 *
 * @param {string} providedToken - Token from request
 * @returns {boolean} True if token matches
 */
function verifyAdminToken(providedToken) {
  if (!providedToken) {
    return false;
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const storedToken = scriptProperties.getProperty('ADMIN_TOKEN');

  if (!storedToken) {
    Logger.log('⚠️ No admin token configured. Run setupAdminToken first.');
    return false;
  }

  return providedToken === storedToken;
}

// ═══════════════════════════════════════════════════════════════════════════════
// doGet Handler - Dashboard API & Config Management & Admin Actions
// ═══════════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const SPREADSHEET_ID = '1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI';

  // ────────────────────────────────────────────────────────────────────────────────
  // Admin Actions (Protected by Token)
  // ────────────────────────────────────────────────────────────────────────────────

  // One-time setup: Generate admin token (no auth required - first time only)
  if (e.parameter.action === 'setupAdminToken') {
    try {
      const force = e.parameter.force === 'true' || e.parameter.force === '1';
      const result = setupAdminToken(force);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Rotate admin token: generate new token (requires current valid token)
  if (e.parameter.action === 'rotateAdminToken') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const scriptProperties = PropertiesService.getScriptProperties();
      const newToken = Utilities.getUuid();
      scriptProperties.setProperty('ADMIN_TOKEN', newToken);

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: 'Admin token rotated successfully',
          newToken: newToken,
          instructions: 'Update .env.staging or .env.production with the new token'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Reset/reinitialize Config sheet (requires admin token)
  if (e.parameter.action === 'resetConfig') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const existingConfig = ss.getSheetByName('Config');

      // Delete existing Config sheet if it exists
      if (existingConfig) {
        ss.deleteSheet(existingConfig);
      }

      // Reinitialize with defaults
      initializeConfigSheet();

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: 'Config sheet reset to defaults',
          defaults: {
            violation_alert_emails: '',
            enable_violation_alerts: 'TRUE',
            temp_threshold: '41'
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Initialize Config, Alert Log, and Violations Tracker sheets (requires admin token)
  if (e.parameter.action === 'init') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      initializeConfigSheet();
      initializeAlertLogSheet();
      initializeViolationsTrackerSheet();

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: 'Initialization complete',
          sheets_created: ['Config', 'Alert Log', 'Violations Tracker']
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Test violation simulation (requires admin token)
  if (e.parameter.action === 'test') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const result = simulateViolation();
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Debug config value (requires admin token)
  if (e.parameter.action === 'debugConfig') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const key = e.parameter.key || 'enable_violation_alerts';
    const rawValue = getConfig(key);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        key: key,
        rawValue: rawValue,
        valueType: typeof rawValue,
        isString: typeof rawValue === 'string',
        isBoolean: typeof rawValue === 'boolean',
        stringValue: String(rawValue),
        booleanValue: Boolean(rawValue),
        equalsStringTrue: rawValue === 'true',
        equalsBooleanTrue: rawValue === true,
        strictEquality: rawValue === true || rawValue === 'true'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Health check ping (requires admin token)
  if (e.parameter.action === 'ping') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        environment: ss.getName(),
        sheet_id: SPREADSHEET_ID,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Send daily summary email on demand (requires admin token)
  if (e.parameter.action === 'sendDailySummary') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      sendDailySummary();
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: 'Daily summary email sent successfully'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: error.toString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Get execution log entries (requires admin token)
  if (e.parameter.action === 'getExecutionLog') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const logSheet = ss.getSheetByName('Execution Log');

      if (!logSheet) {
        return ContentService
          .createTextOutput(JSON.stringify({
            status: 'ok',
            logs: [],
            message: 'Execution Log sheet does not exist yet'
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const limit = parseInt(e.parameter.limit) || 10;
      const data = logSheet.getDataRange().getValues();
      const headers = data[0];
      const rows = data.slice(1); // Skip header

      // Get last N entries
      const recentRows = rows.slice(-limit);
      const logs = recentRows.map(row => ({
        timestamp: row[0],
        formType: row[1],
        rowCount: row[2],
        photoSizeKB: row[3],
        status: row[4],
        errorMessage: row[5],
        durationMs: row[6]
      }));

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          logs: logs,
          totalEntries: rows.length
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: error.toString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // List all project triggers (requires admin token)
  if (e.parameter.action === 'listTriggers') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const triggers = ScriptApp.getProjectTriggers();
      const triggerList = triggers.map(trigger => ({
        triggerId: trigger.getUniqueId(),
        handlerFunction: trigger.getHandlerFunction(),
        eventType: trigger.getEventType().toString(),
        source: trigger.getTriggerSource().toString()
      }));

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          triggers: triggerList,
          count: triggerList.length
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: error.toString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Create daily summary trigger (requires admin token)
  if (e.parameter.action === 'createTrigger') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      createDailySummaryTrigger();
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: 'Daily summary trigger created successfully (9am daily)'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: error.toString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Delete trigger by function name (requires admin token)
  if (e.parameter.action === 'deleteTrigger') {
    if (!verifyAdminToken(e.parameter.token)) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    try {
      const functionName = e.parameter.function || 'sendDailySummary';
      const triggers = ScriptApp.getProjectTriggers();
      let deleted = 0;

      triggers.forEach(trigger => {
        if (trigger.getHandlerFunction() === functionName) {
          ScriptApp.deleteTrigger(trigger);
          deleted++;
        }
      });

      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          message: `Deleted ${deleted} trigger(s) for function: ${functionName}`,
          deleted: deleted
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'error',
          message: error.toString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Public Actions (No Auth Required)
  // ────────────────────────────────────────────────────────────────────────────────

  // Handle config read request
  if (e.parameter.action === 'getConfig') {
    try {
      const key = e.parameter.key;
      if (!key) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing key parameter' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const value = getConfig(key);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', value: value }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Handle config write request
  if (e.parameter.action === 'setConfig') {
    try {
      const key = e.parameter.key;
      const value = e.parameter.value;

      if (!key) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing key parameter' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      setConfig(key, value || '');
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Config saved' }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────
  // Violations Tracker Endpoints
  // ────────────────────────────────────────────────────────────────────────────────

  // Get violations with optional status filter
  if (e.parameter.action === 'getViolations') {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const violationsSheet = ss.getSheetByName('Violations Tracker');

      if (!violationsSheet) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'ok', violations: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const data = violationsSheet.getDataRange().getValues();
      const headers = data[0];
      const statusFilter = e.parameter.status; // optional: 'open', 'in_progress', 'resolved'

      const violations = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const violation = {
          violationId: row[0],
          timestamp: row[1],
          storeId: row[2],
          storeName: row[3],
          violationType: row[4],
          value: row[5],
          threshold: row[6],
          alertLogRef: row[7],
          status: row[8],
          notes: row[9],
          resolvedAt: row[10],
          resolvedBy: row[11]
        };

        // Apply status filter if provided
        if (!statusFilter || violation.status === statusFilter) {
          violations.push(violation);
        }
      }

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', violations: violations }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Update violation status
  if (e.parameter.action === 'updateViolationStatus') {
    try {
      const violationId = e.parameter.violationId;
      const newStatus = e.parameter.status; // 'open', 'in_progress', 'resolved'
      const resolvedBy = e.parameter.resolvedBy || 'System';

      if (!violationId || !newStatus) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing violationId or status parameter' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      if (!['open', 'in_progress', 'resolved'].includes(newStatus)) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid status. Must be: open, in_progress, or resolved' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const violationsSheet = ss.getSheetByName('Violations Tracker');

      if (!violationsSheet) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Violations Tracker sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const data = violationsSheet.getDataRange().getValues();
      let found = false;

      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === violationId) {
          // Update status (column I, index 8)
          violationsSheet.getRange(i + 1, 9).setValue(newStatus);

          // If resolving, set resolved timestamp and resolved by
          if (newStatus === 'resolved') {
            violationsSheet.getRange(i + 1, 11).setValue(new Date().toISOString()); // Resolved At
            violationsSheet.getRange(i + 1, 12).setValue(resolvedBy); // Resolved By
          } else {
            // Clear resolved fields if changing back to open/in_progress
            violationsSheet.getRange(i + 1, 11).setValue('');
            violationsSheet.getRange(i + 1, 12).setValue('');
          }

          found = true;
          break;
        }
      }

      if (!found) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Violation not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Status updated', violationId: violationId, newStatus: newStatus }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Add note to violation
  if (e.parameter.action === 'addViolationNote') {
    try {
      const violationId = e.parameter.violationId;
      const note = e.parameter.note;
      const author = e.parameter.author || 'User';

      if (!violationId || !note) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing violationId or note parameter' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const violationsSheet = ss.getSheetByName('Violations Tracker');

      if (!violationsSheet) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Violations Tracker sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      const data = violationsSheet.getDataRange().getValues();
      let found = false;

      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === violationId) {
          // Get existing notes (column J, index 9)
          const existingNotes = data[i][9] || '';
          const timestamp = new Date().toISOString();
          const newNote = `[${timestamp}] ${author}: ${note}`;
          const updatedNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

          violationsSheet.getRange(i + 1, 10).setValue(updatedNotes);
          found = true;
          break;
        }
      }

      if (!found) {
        return ContentService
          .createTextOutput(JSON.stringify({ status: 'error', message: 'Violation not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Note added', violationId: violationId }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Default: Return dashboard data (no action parameter)
  // This is the main endpoint the dashboard calls to get deliveries, production, waste, and stores
  if (!e.parameter.action) {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

      // Read delivery data - mapping based on doPost structure (lines 42-61)
      const deliverySheet = ss.getSheetByName('Delivery Log - Live');
      const deliveryData = deliverySheet ? deliverySheet.getDataRange().getValues() : [];

      // Filter out title and header rows
      const deliveries = deliveryData
        .filter(row => {
          // FIX: Check Column B (date) instead of Column A since some rows have blank clientTimestamp
          // This handles rows 3071-4656 which have data but no Column A timestamp
          if (!row[1] && !row[0]) return false; // Skip if both date AND timestamp are empty

          // If Column A exists, check if it's a header
          if (row[0]) {
            const firstCol = row[0].toString().toUpperCase();
            if (firstCol.includes('TAIPEI') ||
                firstCol.includes('TIMESTAMP') ||
                firstCol.includes('SUBMITTED') ||
                firstCol.includes('CLIENT')) {
              return false; // Skip header rows
            }
          }

          // If Column B (date) exists, check if it's a header
          if (row[1]) {
            const secondCol = row[1].toString().toUpperCase();
            if (secondCol.includes('DATE') || secondCol.includes('DRIVER')) {
              return false; // Skip header rows
            }
          }

          return true; // Include row if it has date or timestamp data
        })
        .map(row => ({
          submittedAt: row[0],        // Col A  – Client Timestamp
          serverTimestamp: row[1],    // Col B  – Server Timestamp
          date: row[2],               // Col C  – Date
          driver: row[3],             // Col D  – Driver
          vehicle: row[4],            // Col E  – Vehicle #
          store: row[5],              // Col F  – Store
          arrive: row[6],             // Col G  – Arrival Time
          coolerTemp: row[7],         // Col H  – Cooler Temp °F
          coolerCond: row[8],         // Col I  – Cooler Condition
          casePrefillPercent: row[9], // Col J  – Case Pre-Fill %
          dish: row[10],              // Col K  – Dish
          added: row[11],             // Col L  – Qty Added
          before: row[12],            // Col M  – On Shelf Before
          removed: row[13],           // Col N  – Qty Removed (Expired)
          reason: row[14],            // Col O  – Expire Reason
          after: row[15],             // Col P  – Shelf Total After
          notes: row[16],             // Col Q  – Store Notes
          receivedBy: row[17]         // Col R  – Received By
        }));

      // Read production data - mapping based on doPost structure (lines 88-113)
      const productionSheet = ss.getSheetByName('Production Log - Live');
      const productionData = productionSheet ? productionSheet.getDataRange().getValues() : [];

      // Filter out title and header rows
      const production = productionData
        .filter(row => {
          if (!row[0]) return false;
          const firstCol = row[0].toString().toUpperCase();
          // Skip title rows, header rows, and empty rows
          return !firstCol.includes('TAIPEI') &&
                 !firstCol.includes('PRODUCTION') &&
                 !firstCol.includes('TIMESTAMP') &&
                 !firstCol.includes('SUBMITTED') &&
                 !firstCol.includes('CLIENT') &&
                 firstCol.length > 0;
        })
        .map(row => ({
          submittedAt: row[0],        // Col A  – Client Timestamp
          date: row[2],               // Col C  – Date (skip serverTimestamp at Col B)
          shift: row[3],              // Col D  – Shift
          kitchen: row[4],            // Col E  – Kitchen
          supervisor: row[5],         // Col F  – Supervisor
          dish: row[6],               // Col G  – Dish
          batch: row[7],              // Col H  – Batch #
          cookTemp: row[8],           // Col I  – Cook Temp °F
          cookStart: row[9],          // Col J  – Cook Start
          cookEnd: row[10],           // Col K  – Cook End
          cookTime: row[11],          // Col L  – Cook Time (min)
          qtyProduced: row[12],       // Col M  – Qty Produced
          qtyDiscarded: row[13],      // Col N  – Qty Discarded
          discardReason: row[14],     // Col O  – Discard Reason
          coolStart: row[15],         // Col P  – Cool Start
          coolEnd: row[16],           // Col Q  – Cool End
          coolTime: row[17],          // Col R  – Cool Time (min)
          finalTemp: row[18],         // Col S  – Final Temp °F
          qa: row[19],                // Col T  – QA Result
          qaNotes: row[20],           // Col U  – QA Notes
          initials: row[21],          // Col V  – Initials
          generalNotes: row[22],      // Col W  – General Notes
          batchQANotes: row[23]       // Col X  – Batch QA Notes
        }));

      // Calculate waste from deliveries (items with qtyRemoved > 0)
      const waste = deliveries.filter(d => (parseInt(d.removed) || 0) > 0);

      // Read stores from data/stores.json format (hardcoded for now)
      const stores = [
        { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA' },
        { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA' },
        { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA' },
        { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA' },
        { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA' },
        { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
        { id: '6564', name: 'Store 6564', location: 'Catonsville' }
      ];

      return ContentService
        .createTextOutput(JSON.stringify({
          deliveries: deliveries,
          production: production,
          waste: waste,
          stores: stores,
          lastUpdated: new Date().toISOString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Unknown action: Return error
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'error',
      message: 'Unknown action. Supported admin actions (require token): init, test, ping, sendDailySummary, getExecutionLog, listTriggers, createTrigger, deleteTrigger. Public actions: getConfig, setConfig, getViolations, updateViolationStatus, addViolationNote'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
