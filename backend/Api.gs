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

function doPost(e) {
  const ctx = newRequestContext(new Date());

  try {
    const payload = JSON.parse(e.postData.contents);
    Logger.log(`[DEBUG] Received payload - formType: ${payload.formType}, type: ${payload.type}, has photos: ${!!payload.photos}, has rows: ${!!payload.rows}`);

    if (payload.type === 'bugReport')        return handleBugReport(payload, ctx);
    if (payload.type === 'config')           return handleConfigWrite(payload, ctx);        // the reference lists; see Reference.gs
    if (payload.type === 'resolveViolation') return handleViolationResolve(payload, ctx);   // see Violations.gs

    ctx.logEntry.formType = payload.formType || 'unknown';
    ctx.logEntry.rowCount = payload.rows ? payload.rows.length : 0;
    ctx.logEntry.photoSizeKB = photoPayloadSizeKB(payload.photos);

    switch (payload.formType) {
      case 'production':  return handleProductionSubmission(payload, ctx);
      case 'packaging':   return handlePackagingSubmission(payload, ctx);
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

/**
 * Idempotent set-up: the current month's file, so the first write of the month never has to
 * create it, and the Reference sheet, seeded the first time it is created.
 */
function action_init(e) {
  try {
    const monthKey = monthKeyOfInstant(new Date());
    const opened = openMonthly(monthKey, true);

    const reference = openReference(true);
    invalidateReferencePayload();
    const payload = referencePayload();
    const counts = {};
    referenceLists().forEach(list => { counts[list.key] = payload[list.key].length; });

    return jsonResponse({
      status: 'ok',
      message: 'Initialization complete',
      current_month: { key: monthKey, name: monthlyFileName(monthKey), id: opened.fileId, url: monthlyFileUrl(opened.fileId) },
      reference: { name: REFERENCE_FILE_NAME, id: reference.fileId, url: referenceFileUrl(reference.fileId), version: payload.version, counts: counts }
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

/** Health check: the operations folder this deployment is bound to and the current month's file. */
function action_ping(e) {
  const now = new Date();

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
    environment: folder ? folder.name : null,
    folder_id: folder ? folder.id : null,
    folder_name: folder ? folder.name : null,
    folder_error: folderError,
    current_month: current,
    timestamp: formatInstant(now)
  });
}

function action_setScriptProperty(e) {
  try {
    const key = e.parameter.key;
    const value = e.parameter.value;
    if (!key) throw new Error('Missing key parameter');

    PropertiesService.getScriptProperties().setProperty(key, value);
    invalidateReferencePayload();   // CI sets several properties per deploy, so every deploy drops the cached lists

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        message: `Set ${key}`   // never the value: one of these is a token
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
    return jsonResponse({
      status: 'ok',
      folder: { id: folder.getId(), name: folder.getName() },
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
  // When the editor runs this without showing the consent dialog, the grant still lacks
  // something: this names it and gives the consent URL directly, so revoking the old grant
  // is a last resort rather than the first step.
  check('authorization', () => {
    const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
    return info.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED
      ? 'REQUIRED. Open this as the deploying account and approve: ' + info.getAuthorizationUrl()
      : 'granted for every declared scope';
  });
  check('properties', () => Object.keys(PropertiesService.getScriptProperties().getProperties()).sort().join(', '));
  check('operations folder', () => getSpreadsheetFolder().getName());
  check('photo folder', () => getPhotoRootFolder().getName());
  check('mail quota remaining', () => MailApp.getRemainingDailyQuota());
  check('sending account', () => Session.getEffectiveUser().getEmail());
  check('verified aliases', () => (GmailApp.getAliases() || []).join(', ') || '(none)');
  check('github api (external_request scope)', () => 'HTTP ' + UrlFetchApp.fetch('https://api.github.com', { muteHttpExceptions: true }).getResponseCode());
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
    referenceStatus:       { fn: action_referenceStatus,       admin: true },
    // Public
    getViolations:         { fn: action_getViolations,         admin: false },
    reference:             { fn: action_reference,             admin: false }
  };
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  if (!params.action) return action_dashboard({ parameter: params });

  const table = actions();
  const entry = table[params.action];
  if (!entry) {
    const names = admin => Object.keys(table).filter(name => table[name].admin === admin).join(', ');
    return jsonResponse({
      status: 'error',
      message: 'Unknown action. Admin actions (require token): ' + names(true) + '. Public actions: ' + names(false)
    });
  }
  if (entry.admin && !verifyAdminToken(params.token)) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized: Invalid or missing admin token' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return entry.fn({ parameter: params });
}
