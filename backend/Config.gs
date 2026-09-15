// Config.gs — Script Properties and the alert settings.
//
// Deployment identity (SPREADSHEET_ID, PHOTO_FOLDER_ID, ADMIN_TOKEN) lives in Script
// Properties, set by CI or by hand; none has a default, an unset property throws. Alert
// settings currently live in the legacy Config sheet.

/** A Script Property that must be set. Throws naming it; nothing here has a default. */
function requireProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error(
      `${name} Script Property is not set on this Apps Script project. ` +
      'Set it under Project Settings > Script Properties. CI sets the deployment ids; switches are set by hand.'
    );
  }
  return value;
}

/**
 * Initialize Config sheet if it doesn't exist
 * Run this once manually after deploying to create the Config tab
 */
function initializeConfigSheet() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
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
 * Get config value from Config sheet
 */
function getConfig(key) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
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
  const scriptProperties = PropertiesService.getScriptProperties();
  const SPREADSHEET_ID = getSpreadsheetId();
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

function action_resetConfig(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

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

function action_debugConfig(e) {
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

function action_getConfig(e) {
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

function action_setConfig(e) {
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
