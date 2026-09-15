// Submissions.gs — what each POST does with its payload.

const BUG_REPORT_EMAIL = 'tech-support@kalispellconsulting.com';

/** Approximate decoded size of a photo payload, for the execution log. */
function photoPayloadSizeKB(photos) {
  if (!photos) return 0;
  let bytes = 0;
  if (photos.before && photos.before.data) bytes += photos.before.data.length * 0.75;
  if (photos.after && photos.after.data) bytes += photos.after.data.length * 0.75;
  return Math.round(bytes / 1024);
}

function handleBugReport(payload, logEntry) {
  logEntry.formType = 'bugReport';
  MailApp.sendEmail({
    to: BUG_REPORT_EMAIL,
    subject: payload.subject,
    body: payload.body
  });
  logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', message: 'Bug report sent' });
}

function handleDeliverySubmission(payload, logEntry) {
  const sheet = requireSheet(openSpreadsheet(), 'Delivery Log - Live');

  payload.rows.forEach(row => {
    sheet.appendRow(buildSheetRow(DELIVERY_LOG_COLUMNS, row));

    // P2.4: HACCP violation alerts. The row is already written, so a failure here must not
    // fail the submission — losing an alert is recoverable, losing the record is not.
    try {
      onViolationDetected(row, `Store ${row.store}`);
    } catch (alertError) {
      Logger.log(`Warning: Violation check failed for ${row.store}: ${alertError}`);
    }
  });

  logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok' });
}

function handleProductionSubmission(payload, logEntry) {
  const sheet = requireSheet(openSpreadsheet(), 'Production Log - Live');
  // T-027: when the server received the batch, as distinct from row.clientTimestamp.
  const ctx = { serverTimestamp: new Date().toISOString() };

  payload.rows.forEach(row => {
    sheet.appendRow(buildSheetRow(PRODUCTION_LOG_COLUMNS, row, ctx));
  });

  logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok' });
}

/**
 * Photos arrive in a second request, after the delivery row is already written — the form
 * submits data first so a photo failure cannot cost the HACCP record.
 */
function handlePhotoUpload(payload, logEntry) {
  Logger.log('[PHOTO UPLOAD] ENTERED BRANCH - Starting photo upload handler');
  const photos = payload.photos;

  // Resolve the spreadsheet before touching Drive: a bad SPREADSHEET_ID is a configuration
  // error, and failing here avoids orphaning files we would then fail to link.
  const ss = openSpreadsheet();
  const saved = savePhotosToDrive(photos);

  try {
    linkPhotosToDeliveryRow(ss, photos, saved, logEntry);
  } catch (sheetError) {
    // Drive write succeeded but the sheet update failed. Report success anyway — the photos
    // exist, and a retry would duplicate them. The discrepancy goes to the execution log.
    Logger.log(`[PHOTO UPLOAD] ERROR: Photos saved to Drive but sheet update failed. storeId=${photos.storeId}, date=${photos.date}, driver=${photos.driver}, beforeUrl=${saved.beforeUrl}, afterUrl=${saved.afterUrl}, error=${sheetError.toString()}`);
    logEntry.notes = `Drive OK, sheet update failed: ${sheetError.toString()}`;
  }

  logEntry.rowCount = saved.savedCount;
  logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', savedPhotos: saved.savedCount });
}
