// Submissions.gs — what each POST does with its payload.

const BUG_REPORT_EMAIL = 'tech-support@kalispellconsulting.com';

/** Approximate decoded size of a photo payload, for the execution record. */
function photoPayloadSizeKB(photos) {
  if (!photos) return 0;
  let bytes = 0;
  if (photos.before && photos.before.data) bytes += photos.before.data.length * 0.75;
  if (photos.after && photos.after.data) bytes += photos.after.data.length * 0.75;
  return Math.round(bytes / 1024);
}

/**
 * Rows as submitted, ready to write: one submission id for the whole submission (the form's
 * when it sent one, a server one otherwise, so payloads queued on phones before the forms
 * sent ids still file), and the store id under one name.
 */
function normaliseRows(rows, ctx) {
  const fromForm = (rows.find(row => row && row.submissionId) || {}).submissionId;
  ctx.submissionId = fromForm || ('srv-' + Utilities.getUuid());
  if (!fromForm) note(ctx, 'submission_id_generated');
  return rows.map(row => Object.assign({}, row, {
    submissionId: ctx.submissionId,
    storeId: row.storeId || row.store || ''
  }));
}

function handleBugReport(payload, ctx) {
  ctx.logEntry.formType = 'bugReport';
  MailApp.sendEmail({
    to: BUG_REPORT_EMAIL,
    subject: payload.subject,
    body: payload.body
  });
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', message: 'Bug report sent' });
}

function handleProductionSubmission(payload, ctx) {
  const rows = normaliseRows(payload.rows || [], ctx);
  writeRecords('production', rows, ctx);
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok' });
}

function handleDeliverySubmission(payload, ctx) {
  const rows = normaliseRows(payload.rows || [], ctx);
  writeRecords('deliveries', rows, ctx);

  // HACCP violation alerts, still on the legacy tracker and still per row until the
  // violations rebuild. The rows are already written, so a failure here must not fail the
  // submission: losing an alert is recoverable, losing the record is not.
  rows.forEach(row => {
    try {
      onViolationDetected(row, `Store ${row.store}`);
    } catch (alertError) {
      Logger.log(`Warning: Violation check failed for ${row.store}: ${alertError}`);
    }
  });

  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok' });
}

/**
 * Photos arrive in a second request, after the delivery rows are already written — the form
 * submits data first so a photo failure cannot cost the HACCP record. Linking still targets
 * the legacy sheet until the photos rebuild.
 */
function handlePhotoUpload(payload, ctx) {
  Logger.log('[PHOTO UPLOAD] ENTERED BRANCH - Starting photo upload handler');
  const photos = payload.photos;
  ctx.submissionId = (photos && photos.submissionId) || null;

  // Resolve the spreadsheet before touching Drive: a bad SPREADSHEET_ID is a configuration
  // error, and failing here avoids orphaning files we would then fail to link.
  const ss = openSpreadsheet();
  const saved = savePhotosToDrive(photos);

  try {
    linkPhotosToDeliveryRow(ss, photos, saved, ctx.logEntry);
  } catch (sheetError) {
    // Drive write succeeded but the sheet update failed. Report success anyway — the photos
    // exist, and a retry would duplicate them. The discrepancy goes to the execution record.
    Logger.log(`[PHOTO UPLOAD] ERROR: Photos saved to Drive but sheet update failed. storeId=${photos.storeId}, date=${photos.date}, driver=${photos.driver}, beforeUrl=${saved.beforeUrl}, afterUrl=${saved.afterUrl}, error=${sheetError.toString()}`);
    ctx.logEntry.notes = `Drive OK, sheet update failed: ${sheetError.toString()}`;
  }

  ctx.logEntry.rowCount = saved.savedCount;
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', savedPhotos: saved.savedCount });
}
