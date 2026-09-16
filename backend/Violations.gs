// Violations.gs — HACCP temperature violations, alert emails, the daily summary.

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

  let violations = [];

  if (!isNaN(coolerTemp) && coolerTemp > threshold) {
    violations.push({
      type: 'Cooler Temperature',
      temp: coolerTemp,
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
      date: new Date().toLocaleDateString('en-US'),
      arrive: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      driver: 'TEST_DRIVER',
      receivedBy: 'TEST_SUPERVISOR',
      dish: 'General Tso Chicken Bento',
      added: '10',
      notes: '🧪 AUTOMATED TEST - This is a simulated violation for testing email alerts'
    };

    const storeName = `Store ${fakeDelivery.store}`;

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

/**
 * Send daily summary email with yesterday's submission stats
 * Scheduled to run at 9am daily via time-driven trigger
 */
function sendDailySummary() {
  const SUMMARY_EMAIL = 'tech-support@kalispellconsulting.com';

  try {
    const day = addDays(todayNY(), -1);
    const label = formatDate(new Date(day + 'T12:00:00Z'));
    const read = readMonthlyRows([monthKeyOfDate(day)], 'Executions');
    const entries = read.records.filter(record => String(record.timestamp).slice(0, 10) === day);

    if (entries.length === 0) {
      MailApp.sendEmail({
        to: SUMMARY_EMAIL,
        subject: `Taipei Kitchen Daily Summary - ${label} - NO ACTIVITY`,
        body: `No form submissions were recorded on ${label}.\n\nThis could indicate:\n- No operations on that day\n- Form submission failures\n- Network connectivity issues\n\nPlease verify with operations team.`
      });
      return;
    }

    let deliveryCount = 0, productionCount = 0, bugReportCount = 0, photoUploads = 0;
    let errorCount = 0, totalDuration = 0, maxDuration = 0;
    const errors = [];
    const notes = [];

    entries.forEach(entry => {
      if (entry.formType === 'delivery') deliveryCount++;
      else if (entry.formType === 'production') productionCount++;
      else if (entry.formType === 'bugReport') bugReportCount++;

      if (entry.status === 'ERROR') {
        errorCount++;
        errors.push(`${entry.timestamp}: ${entry.errorMessage}`);
      }
      if (entry.notes) notes.push(`${entry.timestamp}: ${entry.notes}`);
      if ((parseInt(entry.photoSizeKB, 10) || 0) > 0) photoUploads++;

      const duration = parseInt(entry.durationMs, 10) || 0;
      totalDuration += duration;
      if (duration > maxDuration) maxDuration = duration;
    });

    const avgDuration = Math.round(totalDuration / entries.length);
    const monthFile = (read.files[0] || {}).fileId;

    const emailBody = `
Daily Operations Summary for ${label}

═══════════════════════════════════════
SUBMISSIONS
═══════════════════════════════════════
• Delivery Forms: ${deliveryCount} submissions
• Production Forms: ${productionCount} submissions
• Bug Reports: ${bugReportCount}
• Total: ${entries.length} requests

═══════════════════════════════════════
ERRORS
═══════════════════════════════════════
${errorCount === 0 ? '✅ No errors reported' : `❌ ${errorCount} error(s) occurred:\n\n${errors.join('\n\n')}`}

═══════════════════════════════════════
NOTES
═══════════════════════════════════════
${notes.length === 0 ? 'None' : notes.join('\n')}

═══════════════════════════════════════
PHOTOS
═══════════════════════════════════════
• Submissions with photos: ${photoUploads}

═══════════════════════════════════════
PERFORMANCE
═══════════════════════════════════════
• Average response time: ${avgDuration}ms
• Slowest submission: ${maxDuration}ms

${monthFile ? 'View the month\'s operations file:\n' + monthlyFileUrl(monthFile) : ''}

---
🤖 Automated daily summary from Taipei Kitchen Operations System
    `.trim();

    MailApp.sendEmail({
      to: SUMMARY_EMAIL,
      subject: `Taipei Kitchen Daily Summary - ${label}${errorCount > 0 ? ' ⚠️ ERRORS' : ''}`,
      body: emailBody
    });

    Logger.log('[Daily Summary] Email sent successfully');

  } catch (error) {
    Logger.log('[Daily Summary] Failed: ' + error);
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
function action_getViolations(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

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

function action_updateViolationStatus(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

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
