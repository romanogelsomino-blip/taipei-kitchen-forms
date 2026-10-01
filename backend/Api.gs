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
  const ctx = newRequestContext(new Date());

  try {
    const payload = JSON.parse(e.postData.contents);
    Logger.log(`[DEBUG] Received payload - formType: ${payload.formType}, type: ${payload.type}, has photos: ${!!payload.photos}, has rows: ${!!payload.rows}`);

    if (payload.type === 'bugReport') return handleBugReport(payload, ctx);

    ctx.logEntry.formType = payload.formType || 'unknown';
    ctx.logEntry.rowCount = payload.rows ? payload.rows.length : 0;
    ctx.logEntry.photoSizeKB = photoPayloadSizeKB(payload.photos);

    switch (payload.formType) {
      case 'production':  return handleProductionSubmission(payload, ctx);
      case 'delivery':    return handleDeliverySubmission(payload, ctx);
      case 'photos_only': return handlePhotoUpload(payload, ctx);
      default:
        // This used to fall through to {"status":"ok"} having written nothing. The forms
        // submit with mode:'no-cors' and cannot read the response, so a silent no-op was
        // indistinguishable from a successful save. Now it lands in the execution record.
        throw new Error(`Unknown formType: ${JSON.stringify(payload.formType)}`);
    }

  } catch(err) {
    ctx.logEntry.status = 'ERROR';
    ctx.logEntry.errorMessage = err.toString();
    return jsonResponse({ status: 'error', message: err.toString() });
  } finally {
    // Always write the execution record, even if that itself fails.
    try {
      writeExecutionRecord(ctx);
    } catch (logError) {
      Logger.log('[Executions] Failed to write the execution record: ' + logError);
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
    Logger.log('No ADMIN_TOKEN script property set. Set it in Project Settings > Script Properties.');
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

/** Idempotent set-up: the legacy control tabs, and the current month's file so the first write of the month never has to create it. */
function action_init(e) {
  try {
    const monthKey = monthKeyOfInstant(new Date());
    const opened = openMonthly(monthKey, true);

    return jsonResponse({
      status: 'ok',
      message: 'Initialization complete',
      current_month: { key: monthKey, name: monthlyFileName(monthKey), id: opened.fileId, url: monthlyFileUrl(opened.fileId) }
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
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

/**
 * Health check. Reports both stores while the legacy sheet is a write target, and reports
 * WRITE_TARGETS raw rather than validating it, so CI can name what is wrong.
 */
function action_ping(e) {
  const now = new Date();
  const sheetId = getSpreadsheetId();
  const ss = SpreadsheetApp.openById(sheetId);
  const writeTargets = PropertiesService.getScriptProperties().getProperty('WRITE_TARGETS') || null;

  let folder = null;
  let folderError = null;
  try {
    const f = getSpreadsheetFolder();
    folder = { id: f.getId(), name: f.getName() };
  } catch (err) {
    folderError = err.toString();
  }

  const monthKey = monthKeyOfInstant(now);
  const current = { key: monthKey, name: monthlyFileName(monthKey), id: null, url: null };
  if (folder) {
    try {
      const id = resolveMonthlyFileId(monthKey, false);
      if (id) { current.id = id; current.url = monthlyFileUrl(id); }
    } catch (err) {
      current.error = err.toString();
    }
  }

  return jsonResponse({
    status: 'ok',
    environment: ss.getName(),
    sheet_id: sheetId,
    folder_id: folder ? folder.id : null,
    folder_name: folder ? folder.name : null,
    folder_error: folderError,
    current_month: current,
    write_targets: writeTargets,
    timestamp: formatInstant(now)
  });
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

/** The monthly store as it stands: folder, targets, and the current and previous month files with row counts per tab. */
/** Re-apply the tab styling to the current and previous month files. Idempotent. */
function action_formatStorage(e) {
  try {
    const current = monthKeyOfInstant(new Date());
    const formatted = [];
    [current, previousMonthKey(current)].forEach(monthKey => {
      const opened = openMonthly(monthKey, false);
      if (!opened) return;
      tabNames().forEach(tab => {
        const sheet = opened.ss.getSheetByName(tab);
        if (!sheet) return;
        styleTab(sheet, tab);
        borderDataRows(sheet, tab);
      });
      formatted.push({ month: monthKey, url: monthlyFileUrl(opened.fileId) });
    });
    return jsonResponse({ status: 'ok', formatted: formatted });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

function action_storageStatus(e) {
  try {
    const now = new Date();
    const folder = getSpreadsheetFolder();
    const current = monthKeyOfInstant(now);
    const months = [current, previousMonthKey(current)].map(monthKey => {
      const opened = openMonthly(monthKey, false);
      if (!opened) return { month: monthKey, file: null };
      const rows = {};
      tabNames().forEach(tab => {
        const sheet = opened.ss.getSheetByName(tab);
        rows[tab] = sheet ? Math.max(0, sheet.getLastRow() - 1) : null;
      });
      return { month: monthKey, file: { name: monthlyFileName(monthKey), id: opened.fileId, url: monthlyFileUrl(opened.fileId) }, rows: rows };
    });
    let writeTargets = null;
    try { writeTargets = getWriteTargets().raw; } catch (err) { writeTargets = null; }
    return jsonResponse({
      status: 'ok',
      folder: { id: folder.getId(), name: folder.getName() },
      write_targets: writeTargets,
      months: months,
      timestamp: formatInstant(now)
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * Run once from the Apps Script editor, as the deploying account, after any change to the
 * scopes in appsscript.json. It touches each service the project declares, so approving the
 * prompt grants the whole set, and it reports what it reached so a half-granted state is
 * obvious rather than silent. Takes no arguments and writes nothing.
 */
function authorize() {
  const report = {};
  const check = (name, fn) => {
    try { report[name] = fn(); } catch (e) { report[name] = 'FAILED: ' + e.toString(); }
  };
  check('properties', () => Object.keys(PropertiesService.getScriptProperties().getProperties()).sort().join(', '));
  check('operations folder', () => getSpreadsheetFolder().getName());
  check('photo folder', () => getPhotoRootFolder().getName());
  check('legacy spreadsheet', () => SpreadsheetApp.openById(getSpreadsheetId()).getName());
  check('mail quota remaining', () => MailApp.getRemainingDailyQuota());
  check('sending account', () => Session.getEffectiveUser().getEmail());
  check('verified aliases', () => (GmailApp.getAliases() || []).join(', ') || '(none)');
  Object.keys(report).forEach(key => Logger.log(key + ': ' + report[key]));
  return report;
}

/** The action table: name → { fn, admin }. Built in a function so file load order cannot matter. */
function actions() {
  return {
    // Admin (token required)
    rotateAdminToken:      { fn: action_rotateAdminToken,      admin: true },
    init:                  { fn: action_init,                  admin: true },
    test:                  { fn: action_test,                  admin: true },
    ping:                  { fn: action_ping,                  admin: true },
    setScriptProperty:     { fn: action_setScriptProperty,     admin: true },
    getExecutionLog:       { fn: action_getExecutionLog,       admin: true },
    formatStorage:         { fn: action_formatStorage,         admin: true },
    mailStatus:            { fn: action_mailStatus,            admin: true },
    queryDeliveries:       { fn: action_queryDeliveries,       admin: true },
    storageStatus:         { fn: action_storageStatus,         admin: true },
    // Public
    getViolations:         { fn: action_getViolations,         admin: false },
    updateViolationStatus: { fn: action_updateViolationStatus, admin: false }
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
        message: 'Unknown action. Admin actions (require token): init, test, ping, mailStatus, setScriptProperty, rotateAdminToken, getExecutionLog, queryDeliveries, storageStatus, formatStorage. Public actions: getViolations, updateViolationStatus'
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
