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

/** The Executions row for this request. Runs in doPost's finally and never throws. */
function writeExecutionRecord(ctx) {
  const entry = ctx.logEntry;
  entry.durationMs = new Date() - ctx.startTime;

  const notes = ctx.notes.slice();
  if (entry.notes) notes.push(String(entry.notes)); // string notes from the legacy photo path

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
