// Violations.gs — HACCP temperature violations: detection, alerts, read and resolve.
//
// The limit is regulatory, not configurable: cold-held product must stay at or below 41°F.
// Detection runs once per submission, not once per dish row, so one warm cooler is one email
// and one row rather than one of each per dish. A row is the food-safety record: the reading,
// where and when it was taken, the driver's notes, and what was done about it. Whether the
// alert email went out is noted on the request's Executions row, not here.

const TEMP_LIMIT_F = 41;
const VIOLATION_ACTION_MAX = 500;   // characters of corrective action, more than a cell should hold

/** The two temperatures a delivery records, and the violation each one raises. */
function violationRules() {
  return [
    { key: 'coolerTemp',  type: 'Cooler Temperature',  label: 'store cooler' },
    { key: 'arrivalTemp', type: 'Arrival Temperature', label: 'product on arrival' }
  ];
}

/**
 * Check one delivery submission and raise a violation per breached rule. Each breach sends one
 * email and writes one Violations row; the row is written whether or not the mail went, and a
 * failed alert is noted on the Executions row. Nothing here throws: losing an alert is
 * recoverable, losing the delivery record is not. The rows arrive enriched (see enrichRows), so
 * the store's name and System ID are already on them.
 */
function checkViolations(rows, ctx) {
  if (!rows || !rows.length) return [];
  const first = rows[0];
  const filed = partitionDateFor(first.date);
  const monthKey = monthKeyOfDate(filed.date);
  const storeId = first.storeId || '';
  const storeName = first.store || ('Store ' + storeId);
  const storeLabel = storeId && storeName !== 'Store ' + storeId ? storeName + ' (' + storeId + ')' : storeName;
  const raised = [];

  violationRules().forEach(rule => {
    const value = parseFloat(first[rule.key]);
    if (isNaN(value) || value <= TEMP_LIMIT_F) return;

    const sent = sendMail(
      alertRecipients(),
      'HACCP Violation Alert: ' + rule.type + ' - ' + storeLabel,
      violationEmailBody(rule, value, first, storeLabel)
    );
    if (sent.note) note(ctx, sent.note);
    if (sent.status !== 'SUCCESS') note(ctx, 'alert_failed=' + rule.type + ':' + sent.error);

    const row = {
      date: first.date,
      arrive: first.arrive || '',
      store: storeName,
      driver: first.driver || '',
      violationType: rule.type,
      value: value,
      notes: first.notes || '',
      correctiveAction: '',
      resolvedBy: '',
      resolvedAt: '',
      timestamp: ctx && ctx.serverTimestamp ? ctx.serverTimestamp : formatInstant(new Date()),
      storeSystemId: first.storeSystemId || '',
      submissionId: (ctx && ctx.submissionId) || first.submissionId || '',
      violationId: Utilities.getUuid()
    };

    try {
      appendMonthlyRows(monthKey, 'Violations', buildRows(schemaFor('Violations'), [row], ctx || newRequestContext(new Date())));
      note(ctx, 'violation=' + rule.type + ':' + value);
      raised.push(Object.assign({}, row, { alertStatus: sent.status, alertError: sent.error }));
    } catch (e) {
      note(ctx, 'violation_write_failed=' + e.message);
      Logger.log('[Violations] could not record ' + rule.type + ': ' + e);
    }
  });

  return raised;
}

function violationEmailBody(rule, value, delivery, storeLabel) {
  return [
    '═══════════════════════════════════════════════════',
    '   TAIPEI KITCHEN · HACCP VIOLATION ALERT',
    '═══════════════════════════════════════════════════',
    '',
    'VIOLATION DETECTED',
    '',
    'Location: ' + storeLabel,
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

/**
 * End-to-end check of the alert path: writes one real violation and reports what happened.
 * Filed under the reserved store 0000, with notes that say what it is, so the row reads as a
 * test in the sheet and is safe to resolve.
 */
function simulateViolation() {
  const recipients = alertRecipients();
  if (!recipients.length) {
    return { status: 'FAILED', error: 'No recipients. Set the ALERT_RECIPIENTS Script Property from the matching GitHub secret.' };
  }

  const ctx = newRequestContext(new Date());
  ctx.submissionId = 'sim-' + Utilities.getUuid().slice(0, 8);
  const rows = enrichRows('deliveries', [{
    submissionId: ctx.submissionId,
    date: todayNY(),
    storeId: '0000',
    driver: 'TEST_DRIVER',
    receivedBy: 'TEST_SUPERVISOR',
    arrive: Utilities.formatDate(new Date(), NY_TZ, 'HH:mm'),
    dish: 'General Tso Chicken Bento',
    coolerTemp: String(TEMP_LIMIT_F + 4),
    arrivalTemp: String(TEMP_LIMIT_F - 3),   // below the limit: proves only the breach raises
    notes: 'Simulated violation, safe to resolve'
  }], ctx);
  const raised = checkViolations(rows, ctx);

  return {
    status: raised.length === 1 && raised[0].alertStatus === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
    recipients: recipients,
    raised: raised.map(r => ({ violationId: r.violationId, violationType: r.violationType, value: r.value, alertStatus: r.alertStatus, alertError: r.alertError })),
    notes: ctx.notes
  };
}

// ─── Read and resolve ────────────────────────────────────────────────────────

/**
 * Violations in a window, newest last, with the derived status filled in. The store number is
 * attached from the Reference sheet as read-time metadata; the row itself keys on System ID.
 */
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
        const store = stores.find(s => s.key === row.storeSystemId);
        row.storeName = row.store;
        row.storeId = store ? store.id : '';
        row.status = row.resolvedAt ? 'resolved' : 'open';
        row.month = record._month;
        return row;
      })
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/** A refusal the caller caused: recorded as REJECTED, not ERROR, so it does not page support. */
function violationRejection(message) {
  const error = new Error(message);
  error.rejection = true;
  return error;
}

/**
 * Resolve a violation, from a POST of { type: 'resolveViolation', violationId, month,
 * resolvedBy, correctiveAction }. Fills Resolved At and records who did it and the corrective
 * action taken, both required. There is no reopening; a resolved violation stays resolved.
 * `month` names the file the row is in.
 */
function handleViolationResolve(payload, ctx) {
  ctx.logEntry.formType = 'violation';
  try {
    const violationId = String(payload.violationId || '').trim();
    const month = String(payload.month || '').trim();
    if (!violationId) throw violationRejection('Missing violationId');
    if (!/^\d{4}-\d{2}$/.test(month)) throw violationRejection('month must be YYYY-MM; got ' + JSON.stringify(payload.month));

    const resolvedBy = String(payload.resolvedBy || '').replace(/\s+/g, ' ').trim();
    const correctiveAction = String(payload.correctiveAction || '').replace(/\s+/g, ' ').trim();
    if (!resolvedBy) throw violationRejection('resolvedBy is required to resolve a violation');
    if (!correctiveAction) throw violationRejection('correctiveAction is required to resolve a violation');
    if (correctiveAction.length > VIOLATION_ACTION_MAX) throw violationRejection('correctiveAction is longer than ' + VIOLATION_ACTION_MAX + ' characters');
    const patch = { resolvedAt: ctx.serverTimestamp, resolvedBy: resolvedBy, correctiveAction: correctiveAction };

    const result = withScriptLock(() => {
      const found = findMonthlyRow(month, 'Violations', 'violationId', violationId);
      if (!found) throw violationRejection('Violation "' + violationId + '" not found in ' + monthlyFileName(month));
      if (found.record.resolvedAt) throw violationRejection('Violation "' + violationId + '" is already resolved');
      sheetColumns(found.sheet, 'Violations');   // a file from before Corrective Action existed gains the column
      updateMonthlyRow(found.sheet, 'Violations', found.rowNumber, patch);
      return found.record;
    });

    ctx.submissionId = result.submissionId || null;
    ctx.logEntry.rowCount = 1;
    note(ctx, 'violation_resolved=' + violationId);
    ctx.logEntry.status = 'SUCCESS';
    return jsonResponse({
      status: 'ok', violationId: violationId, violationStatus: 'resolved', month: month,
      resolvedAt: patch.resolvedAt, resolvedBy: patch.resolvedBy, correctiveAction: patch.correctiveAction
    });
  } catch (err) {
    if (!err.rejection) throw err;
    ctx.logEntry.status = 'REJECTED';
    ctx.logEntry.errorMessage = err.message;
    note(ctx, 'violation_rejected');
    return jsonResponse({ status: 'error', message: err.message });
  }
}
