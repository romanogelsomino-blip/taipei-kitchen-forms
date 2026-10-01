// Records.gs — one write path for every record, with the legacy sheet as a second target.
//
// Monthly is the record: its failure fails the request. The legacy sheet is best-effort
// while WRITE_TARGETS includes it: its failure is noted on the Executions row and the
// request still succeeds. If monthly fails and legacy is on, legacy is still attempted as
// salvage before the error is returned, so no row is lost while the old sheet exists.

/** Per-request state shared by the handlers and the execution record. */
function newRequestContext(startTime) {
  return {
    startTime: startTime,
    serverTimestamp: formatInstant(startTime),
    submissionId: null,
    notes: [],
    logEntry: { formType: 'unknown', rowCount: 0, photoSizeKB: 0, status: 'STARTED', errorMessage: '', durationMs: 0 }
  };
}

/** Add an annotation for the Executions row, once. */
function note(ctx, text) {
  if (!ctx.notes.includes(text)) ctx.notes.push(text);
}

/** The tab and the legacy writer for each record kind. */
function recordKinds() {
  return {
    production: { tab: 'Production', legacy: legacyAppendProduction },
    deliveries: { tab: 'Deliveries', legacy: legacyAppendDeliveries }
  };
}

function writeRecords(kind, rows, ctx) {
  const def = recordKinds()[kind];
  if (!def) throw new Error('Unknown record kind: ' + kind);
  const targets = getWriteTargets();
  const schema = schemaFor(def.tab);

  // Group by the month each row files under: its own date, in New York.
  const groups = {};
  rows.forEach(row => {
    const filed = partitionDateFor(row.date);
    if (filed.fallback) note(ctx, 'date_fallback=' + filed.fallback + ':' + String(row.date));
    const monthKey = monthKeyOfDate(filed.date);
    (groups[monthKey] = groups[monthKey] || []).push(row);
  });

  let monthlyError = null;
  try {
    Object.keys(groups).sort().forEach(monthKey => {
      appendMonthlyRows(monthKey, def.tab, buildRows(schema, groups[monthKey], ctx));
    });
  } catch (e) {
    monthlyError = e;
    note(ctx, 'monthly_failed=' + kind + ':' + e.message);
  }

  if (targets.legacy) {
    try {
      def.legacy(rows, ctx);
      if (monthlyError) note(ctx, 'legacy_salvage=ok');
    } catch (e) {
      note(ctx, (monthlyError ? 'legacy_salvage=failed:' : 'legacy_failed=' + kind + ':') + e.message);
    }
  }

  if (monthlyError) throw monthlyError;
}

// One email per distinct error per window, so a deploy that breaks every submission reports
// itself once rather than once per driver. A different error still gets through immediately.
const ERROR_EMAIL_WINDOW_SEC = 900;

/**
 * Tell support that a request failed. Google notifies the account that owns the project when
 * a trigger throws, but nothing watches a failed form submission, and the account that owns
 * the project will not always be the people who maintain it. Never throws.
 */
function emailExecutionError(ctx) {
  try {
    const message = String(ctx.logEntry.errorMessage || 'unknown error');
    const cache = CacheService.getScriptCache();
    // Keyed on the error itself, so a repeat is suppressed but a new fault is not.
    const key = ('errmail:' + message.replace(/[^A-Za-z0-9]+/g, '-')).slice(0, 200);
    if (cache.get(key)) {
      note(ctx, 'error_email_suppressed');
      return;
    }
    cache.put(key, '1', ERROR_EMAIL_WINDOW_SEC);

    const monthKey = monthKeyOfInstant(ctx.startTime);
    const fileId = resolveMonthlyFileId(monthKey, false);
    const sent = sendMail(
      supportRecipients(),
      'Taipei Kitchen submission failed: ' + ctx.logEntry.formType,
      [
        'A form submission was rejected by the backend. The person who submitted it saw an error.',
        '',
        'Form type:     ' + ctx.logEntry.formType,
        'Submission id: ' + (ctx.submissionId || '(none)'),
        'Rows:          ' + ctx.logEntry.rowCount,
        'When:          ' + ctx.serverTimestamp,
        '',
        'Error:',
        message,
        '',
        ctx.notes.length ? 'Notes: ' + ctx.notes.join(' | ') : '',
        '',
        fileId ? "Executions tab of this month's operations file:\n" + monthlyFileUrl(fileId) : '',
        '',
        'Repeats of this same error are suppressed for ' + (ERROR_EMAIL_WINDOW_SEC / 60) + ' minutes.'
      ].join('\n').trim()
    );
    note(ctx, sent.status === 'SUCCESS' ? 'error_email=sent' : 'error_email_failed=' + sent.error);
  } catch (e) {
    Logger.log('[Records] could not email the execution error: ' + e);
  }
}

/** The Executions row for this request. Runs in doPost's finally and never throws. */
function writeExecutionRecord(ctx) {
  const entry = ctx.logEntry;
  entry.durationMs = new Date() - ctx.startTime;

  // Before the notes are snapshotted, so whether the email sent is recorded on the row too.
  if (entry.status === 'ERROR') emailExecutionError(ctx);

  const notes = ctx.notes.slice();

  let targets = null;
  try {
    targets = getWriteTargets();
  } catch (e) {
    notes.push('write_targets=' + e.message);
  }

  const row = {
    formType: entry.formType,
    status: entry.status,
    rowCount: entry.rowCount,
    photoSizeKB: entry.photoSizeKB,
    durationMs: entry.durationMs,
    errorMessage: entry.errorMessage,
    notes: notes.join(' | '),
    writeTargets: targets ? targets.raw : '',
    submissionId: ctx.submissionId || '',
    timestamp: ctx.startTime
  };

  try {
    appendMonthlyRows(monthKeyOfInstant(ctx.startTime), 'Executions', buildRows(schemaFor('Executions'), [row], ctx));
  } catch (e) {
    Logger.log('[Executions] monthly write failed: ' + e);
  }

  // The legacy Execution Log keeps its seven columns while legacy is a target. When the
  // targets could not be read at all, write it anyway so the failure is visible somewhere.
  if (!targets || targets.legacy) {
    try {
      writeExecutionLog({
        timestamp: ctx.startTime.toISOString(),
        formType: entry.formType,
        rowCount: entry.rowCount,
        photoSizeKB: entry.photoSizeKB,
        status: entry.status,
        errorMessage: entry.errorMessage,
        durationMs: entry.durationMs
      });
    } catch (e) {
      Logger.log('[Execution Log] legacy write failed: ' + e);
    }
  }
}
