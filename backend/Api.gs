// Api.gs — the web app's two entry points and the action dispatch.
//
// Apps Script gives a web app exactly two entry points, doGet and doPost, so dispatching
// on payload shape is unavoidable. doPost routes on formType; doGet routes on
// ?action=<name> through the table in actions(). Admin actions require the token in
// Script Properties; public actions do not. Each action lives with its domain
// (Reads.gs, Violations.gs, Config.gs) or, for the small admin utilities, here.
//
// This project is several files in one script. They share one global scope, so functions
// call across files with no imports. Top-level code must stay literal (no derived
// constants), because file load order is not guaranteed.

function jsonResponse(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function openSpreadsheet() {
  const id = getSpreadsheetId();
  Logger.log(`[INIT] Using SPREADSHEET_ID: ${id}`);
  return SpreadsheetApp.openById(id);
}

function requireSheet(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found. Upload the provided Google Sheet file first.`);
  return sheet;
}

function doPost(e) {
  const startTime = new Date();
  const logEntry = {
    timestamp: startTime.toISOString(),
    formType: 'unknown',
    rowCount: 0,
    photoSizeKB: 0,
    status: 'STARTED',
    errorMessage: '',
    durationMs: 0
  };

  try {
    const payload = JSON.parse(e.postData.contents);
    Logger.log(`[DEBUG] Received payload - formType: ${payload.formType}, type: ${payload.type}, has photos: ${!!payload.photos}, has rows: ${!!payload.rows}`);

    if (payload.type === 'bugReport') return handleBugReport(payload, logEntry);

    logEntry.formType = payload.formType || 'unknown';
    logEntry.rowCount = payload.rows ? payload.rows.length : 0;
    logEntry.photoSizeKB = photoPayloadSizeKB(payload.photos);

    switch (payload.formType) {
      case 'delivery':    return handleDeliverySubmission(payload, logEntry);
      case 'production':  return handleProductionSubmission(payload, logEntry);
      case 'photos_only': return handlePhotoUpload(payload, logEntry);
      default:
        // This used to fall through to {"status":"ok"} having written nothing. The forms
        // submit with mode:'no-cors' and cannot read the response, so a silent no-op was
        // indistinguishable from a successful save. Now it lands in the execution log.
        throw new Error(`Unknown formType: ${JSON.stringify(payload.formType)}`);
    }

  } catch(err) {
    logEntry.status = 'ERROR';
    logEntry.errorMessage = err.toString();
    return jsonResponse({ status: 'error', message: err.toString() });
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
    Logger.log('⚠️ No ADMIN_TOKEN script property set. Set it in Project Settings > Script Properties.');
    return false;
  }

  return providedToken === storedToken;
}

function action_rotateAdminToken(e) {
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

function action_init(e) {
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

function action_test(e) {
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

function action_ping(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

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

function action_setScriptProperty(e) {
  try {
    const key = e.parameter.key;
    const value = e.parameter.value;
    if (!key) throw new Error('Missing key parameter');

    PropertiesService.getScriptProperties().setProperty(key, value);

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        message: `Set ${key} = ${value}`
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function action_sendDailySummary(e) {
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

function action_listTriggers(e) {
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

function action_createTrigger(e) {
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

function action_deleteTrigger(e) {
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

/** The action table: name → { fn, admin }. Built in a function so file load order cannot matter. */
function actions() {
  return {
    // Admin (token required)
    rotateAdminToken:      { fn: action_rotateAdminToken,      admin: true },
    resetConfig:           { fn: action_resetConfig,           admin: true },
    init:                  { fn: action_init,                  admin: true },
    test:                  { fn: action_test,                  admin: true },
    debugConfig:           { fn: action_debugConfig,           admin: true },
    ping:                  { fn: action_ping,                  admin: true },
    setScriptProperty:     { fn: action_setScriptProperty,     admin: true },
    sendDailySummary:      { fn: action_sendDailySummary,      admin: true },
    getExecutionLog:       { fn: action_getExecutionLog,       admin: true },
    listTriggers:          { fn: action_listTriggers,          admin: true },
    createTrigger:         { fn: action_createTrigger,         admin: true },
    deleteTrigger:         { fn: action_deleteTrigger,         admin: true },
    queryDeliveries:       { fn: action_queryDeliveries,       admin: true },
    // Public
    getConfig:             { fn: action_getConfig,             admin: false },
    setConfig:             { fn: action_setConfig,             admin: false },
    getViolations:         { fn: action_getViolations,         admin: false },
    updateViolationStatus: { fn: action_updateViolationStatus, admin: false },
    addViolationNote:      { fn: action_addViolationNote,      admin: false },
    debug:                 { fn: action_debug,                 admin: false }
  };
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!params.action) return action_dashboard({ parameter: params });

  const entry = actions()[params.action];
  if (!entry) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: 'Unknown action. Admin actions (require token): init, test, ping, debugConfig, resetConfig, setScriptProperty, rotateAdminToken, sendDailySummary, getExecutionLog, queryDeliveries, listTriggers, createTrigger, deleteTrigger. Public actions: getConfig, setConfig, getViolations, updateViolationStatus, addViolationNote'
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (entry.admin && !verifyAdminToken(params.token)) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return entry.fn({ parameter: params });
}
