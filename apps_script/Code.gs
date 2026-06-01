
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
  const BUG_REPORT_EMAIL = 'leandertoney@gmail.com'; // ← Replace with your email for bug reports

  try {
    const payload  = JSON.parse(e.postData.contents);

    // Handle bug reports
    if (payload.type === 'bugReport') {
      MailApp.sendEmail({
        to: BUG_REPORT_EMAIL,
        subject: payload.subject,
        body: payload.body
      });
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Bug report sent' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Handle form submissions
    const rows     = payload.rows;
    const formType = payload.formType;
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);

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

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
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
HACCP VIOLATION DETECTED

Store: ${storeName} (${deliveryData.store})
Date: ${deliveryData.date}
Time: ${deliveryData.arrive || 'N/A'}

Violation Type: ${violation.type}
Recorded Temperature: ${violation.temp}°F
Threshold: ${violation.threshold}°F

Driver: ${deliveryData.driver}
Received By: ${deliveryData.receivedBy || 'N/A'}

Dish: ${deliveryData.dish}
Quantity Added: ${deliveryData.added || 0}

Notes: ${deliveryData.notes || 'None'}

This is an automated alert from the Taipei Kitchen Bento Operations System.
Please take corrective action and document the response.

View dashboard: https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/
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

      // Read delivery data
      const deliverySheet = ss.getSheetByName('Delivery Log - Live');
      const deliveryData = deliverySheet ? deliverySheet.getDataRange().getValues() : [];
      const deliveryHeaders = deliveryData[0] || [];
      const deliveries = deliveryData.slice(1).map(row => {
        const obj = {};
        deliveryHeaders.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });

      // Read production data
      const productionSheet = ss.getSheetByName('Production Log - Live');
      const productionData = productionSheet ? productionSheet.getDataRange().getValues() : [];
      const productionHeaders = productionData[0] || [];
      const production = productionData.slice(1).map(row => {
        const obj = {};
        productionHeaders.forEach((header, i) => {
          obj[header] = row[i];
        });
        return obj;
      });

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
      message: 'Unknown action. Supported actions: getConfig, setConfig, getViolations, updateViolationStatus, addViolationNote'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
