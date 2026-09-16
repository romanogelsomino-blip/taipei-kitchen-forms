// Violations.gs — HACCP temperature violations: detection, alerts, and the daily summary.
//
// The limit is regulatory, not configurable: cold-held product must stay at or below 41°F.
// Detection runs once per submission, not once per dish row, so one warm cooler is one email
// and one row rather than one of each per dish.

const TEMP_LIMIT_F = 41;

/** The two temperatures a delivery records, and the violation each one raises. */
function violationRules() {
  return [
    { key: 'coolerTemp',  type: 'Cooler Temperature',  label: 'store cooler' },
    { key: 'arrivalTemp', type: 'Arrival Temperature', label: 'product on arrival' }
  ];
}

/** `V-<YYYY-MM>-<8 hex>`; the month lets a later resolve open the right file without searching. */
function newViolationId(monthKey) {
  const hex = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  return 'V-' + monthKey + '-' + hex;
}

/** The month a violation id belongs to, or null when the id predates this scheme. */
function monthOfViolationId(violationId) {
  const match = /^V-(\d{4}-\d{2})-[0-9a-f]{8}$/i.exec(String(violationId || ''));
  return match ? match[1] : null;
}

/**
 * Check one delivery submission and raise a violation per breached rule. Each breach sends one
 * email and writes one Violations row carrying that email's outcome, so the record exists even
 * when the mail fails. Nothing here throws: losing an alert is recoverable, losing the
 * delivery record is not.
 */
function checkViolations(rows, ctx) {
  if (!rows || !rows.length) return [];
  const first = rows[0];
  const filed = partitionDateFor(first.date);
  const monthKey = monthKeyOfDate(filed.date);
  const storeId = first.storeId || first.store || '';
  const raised = [];

  violationRules().forEach(rule => {
    const value = parseFloat(first[rule.key]);
    if (isNaN(value) || value <= TEMP_LIMIT_F) return;

    const recipients = alertRecipients();
    const sent = sendMail(
      recipients,
      '⚠️ HACCP Violation Alert: ' + rule.type + ' - Store ' + storeId,
      violationEmailBody(rule, value, first, storeId)
    );
    if (sent.note) note(ctx, sent.note);

    const row = {
      date: first.date,
      storeId: storeId,
      driver: first.driver || '',
      violationType: rule.type,
      value: value,
      resolvedBy: '',
      resolvedAt: '',
      recipients: sent.recipients,
      emailStatus: sent.status,
      errorMessage: sent.error,
      timestamp: ctx && ctx.serverTimestamp ? ctx.serverTimestamp : formatInstant(new Date()),
      submissionId: (ctx && ctx.submissionId) || first.submissionId || '',
      violationId: newViolationId(monthKey)
    };

    try {
      appendMonthlyRows(monthKey, 'Violations', buildRows(schemaFor('Violations'), [row], ctx || newRequestContext(new Date())));
      note(ctx, 'violation=' + rule.type + ':' + value);
      raised.push(row);
    } catch (e) {
      note(ctx, 'violation_write_failed=' + e.message);
      Logger.log('[Violations] could not record ' + rule.type + ': ' + e);
    }
  });

  return raised;
}

function violationEmailBody(rule, value, delivery, storeId) {
  return [
    '═══════════════════════════════════════════════════',
    '   TAIPEI KITCHEN · HACCP VIOLATION ALERT',
    '═══════════════════════════════════════════════════',
    '',
    '⚠️ VIOLATION DETECTED',
    '',
    'Location: Store ' + storeId,
    'Date: ' + (delivery.date || ''),
    'Arrival time: ' + (delivery.arrive || 'N/A'),
    '',
    'Violation type: ' + rule.type + ' (' + rule.label + ')',
    'Recorded temperature: ' + value + '°F',
    'Limit: ' + TEMP_LIMIT_F + '°F',
    '',
    'Driver: ' + (delivery.driver || 'N/A'),
    'Received by: ' + (delivery.receivedBy || 'N/A'),
    'Store notes: ' + (delivery.notes || 'None'),
    '',
    '─────────────────────────────────────────────────',
    'ACTION REQUIRED: take corrective action, then mark the',
    'violation resolved in the dashboard.',
    '',
    'https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/',
    '',
    '─────────────────────────────────────────────────',
    'Automated alert from Taipei Kitchen Operations System',
    'Generated: ' + formatInstant(new Date())
  ].join('\n');
}

/** End-to-end check of the alert path: writes one real violation and reports what happened. */
function simulateViolation() {
  const recipients = alertRecipients();
  if (!recipients.length) {
    return { status: 'FAILED', error: 'No recipients. Set the ALERT_RECIPIENTS Script Property from the matching GitHub secret.' };
  }

  const ctx = newRequestContext(new Date());
  ctx.submissionId = 'sim-' + Utilities.getUuid().slice(0, 8);
  const raised = checkViolations([{
    date: todayNY(),
    store: '6542',
    storeId: '6542',
    driver: 'TEST_DRIVER',
    receivedBy: 'TEST_SUPERVISOR',
    arrive: Utilities.formatDate(new Date(), NY_TZ, 'HH:mm'),
    dish: 'General Tso Chicken Bento',
    coolerTemp: String(TEMP_LIMIT_F + 4),
    arrivalTemp: String(TEMP_LIMIT_F - 3),   // below the limit: proves only the breach raises
    notes: 'Simulated violation, safe to resolve'
  }], ctx);

  return {
    status: raised.length === 1 && raised[0].emailStatus === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
    recipients: recipients,
    raised: raised.map(r => ({ violationId: r.violationId, violationType: r.violationType, value: r.value, emailStatus: r.emailStatus, errorMessage: r.errorMessage })),
    notes: ctx.notes
  };
}

// ─── Daily summary ───────────────────────────────────────────────────────────

function sendDailySummary() {
  try {
    const day = addDays(todayNY(), -1);
    const label = formatDate(new Date(day + 'T12:00:00Z'));
    const read = readMonthlyRows([monthKeyOfDate(day)], 'Executions');
    const entries = read.records.filter(record => String(record.timestamp).slice(0, 10) === day);

    if (entries.length === 0) {
      sendMail(alertRecipients(), 'Taipei Kitchen Daily Summary - ' + label + ' - NO ACTIVITY',
        'No form submissions were recorded on ' + label + '.\n\nThis could indicate:\n- No operations on that day\n- Form submission failures\n- Network connectivity issues\n\nPlease verify with the operations team.');
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
        errors.push(entry.timestamp + ': ' + entry.errorMessage);
      }
      if (entry.notes) notes.push(entry.timestamp + ': ' + entry.notes);
      if ((parseInt(entry.photoSizeKB, 10) || 0) > 0) photoUploads++;

      const duration = parseInt(entry.durationMs, 10) || 0;
      totalDuration += duration;
      if (duration > maxDuration) maxDuration = duration;
    });

    const violations = readMonthlyRows([monthKeyOfDate(day)], 'Violations').records
      .filter(v => String(v.date).slice(0, 10) === day);
    const monthFile = (read.files[0] || {}).fileId;

    const body = [
      'Daily Operations Summary for ' + label,
      '',
      '═══════════════════════════════════════',
      'SUBMISSIONS',
      '═══════════════════════════════════════',
      '• Delivery forms: ' + deliveryCount,
      '• Production forms: ' + productionCount,
      '• Bug reports: ' + bugReportCount,
      '• Total: ' + entries.length + ' requests',
      '',
      '═══════════════════════════════════════',
      'HACCP VIOLATIONS',
      '═══════════════════════════════════════',
      violations.length === 0 ? '✅ None recorded'
        : violations.map(v => '• ' + v.violationType + ' at store ' + v.storeId + ': ' + v.value + '°F (' + v.violationId + ')').join('\n'),
      '',
      '═══════════════════════════════════════',
      'ERRORS',
      '═══════════════════════════════════════',
      errorCount === 0 ? '✅ No errors reported' : '❌ ' + errorCount + ' error(s):\n\n' + errors.join('\n\n'),
      '',
      '═══════════════════════════════════════',
      'NOTES',
      '═══════════════════════════════════════',
      notes.length === 0 ? 'None' : notes.join('\n'),
      '',
      '═══════════════════════════════════════',
      'PERFORMANCE',
      '═══════════════════════════════════════',
      '• Submissions with photos: ' + photoUploads,
      '• Average response time: ' + Math.round(totalDuration / entries.length) + 'ms',
      '• Slowest submission: ' + maxDuration + 'ms',
      '',
      monthFile ? "View the month's operations file:\n" + monthlyFileUrl(monthFile) : '',
      '',
      '---',
      '🤖 Automated daily summary from Taipei Kitchen Operations System'
    ].join('\n').trim();

    sendMail(alertRecipients(),
      'Taipei Kitchen Daily Summary - ' + label + (errorCount > 0 ? ' ⚠️ ERRORS' : ''), body);
    Logger.log('[Daily Summary] Email sent');

  } catch (error) {
    Logger.log('[Daily Summary] Failed: ' + error);
    try {
      sendMail(alertRecipients(), 'Taipei Kitchen Daily Summary - FAILED',
        'Failed to generate daily summary:\n\n' + error.toString());
    } catch (e) {
      Logger.log('[Daily Summary] Could not send error notification: ' + e);
    }
  }
}

/** Human-readable date for email subjects and headings. */
function formatDate(date) {
  return Utilities.formatDate(date, NY_TZ, 'EEE, MMM d, yyyy');
}

// ─── Read and resolve ────────────────────────────────────────────────────────

/** Violations in a window, newest last, with the store name and derived status filled in. */
function action_getViolations(e) {
  try {
    const win = requestWindow(e);
    const read = recordsInWindow(win, 'Violations');
    const stores = storeList();

    return jsonResponse({
      status: 'ok',
      window: { from: win.from, to: win.to, missingMonths: read.missing },
      violations: read.records.map(record => {
        const row = publicRecord(record);
        const store = stores.find(s => s.id === String(row.storeId));
        row.storeName = store ? store.name : 'Store ' + row.storeId;
        row.status = row.resolvedAt ? 'resolved' : 'open';
        row.month = record._month;
        return row;
      })
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * Resolve a violation or reopen it. A violation is open until Resolved At is filled, so those
 * two fields are the whole of its state; there is nothing else to set.
 */
function action_updateViolationStatus(e) {
  try {
    const params = (e && e.parameter) || {};
    const violationId = params.violationId;
    const status = params.status;
    if (!violationId) throw new Error('Missing violationId');
    if (status !== 'resolved' && status !== 'open') {
      throw new Error('status must be "resolved" or "open"; got ' + JSON.stringify(status));
    }

    const monthKey = monthOfViolationId(violationId);
    if (!monthKey) {
      throw new Error('Violation "' + violationId + '" predates the monthly store and cannot be edited here.');
    }

    return withScriptLock(() => {
      const found = findMonthlyRow(monthKey, 'Violations', 'violationId', violationId);
      if (!found) throw new Error('Violation "' + violationId + '" not found in ' + monthlyFileName(monthKey));

      const patch = status === 'resolved'
        ? { resolvedAt: formatInstant(new Date()), resolvedBy: params.resolvedBy || 'Dashboard User' }
        : { resolvedAt: '', resolvedBy: '' };
      updateMonthlyRow(found.sheet, 'Violations', found.rowNumber, patch);

      return jsonResponse({ status: 'ok', violationId: violationId, violationStatus: status, month: monthKey, resolvedAt: patch.resolvedAt, resolvedBy: patch.resolvedBy });
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}
