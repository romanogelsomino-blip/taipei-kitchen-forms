// Submissions.gs — what each POST does with its payload.

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
  const sent = sendMail(supportRecipients(), payload.subject, payload.body);
  if (sent.note) note(ctx, sent.note);
  if (sent.status !== 'SUCCESS') note(ctx, 'bug_report_mail_failed=' + sent.error);
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

  // HACCP violation alerts, once for the submission. The rows are already written, so a
  // failure here must not fail the submission: losing an alert is recoverable, losing the
  // record is not.
  try {
    checkViolations(rows, ctx);
  } catch (alertError) {
    note(ctx, 'violation_check_failed=' + alertError.message);
    Logger.log(`Warning: violation check failed: ${alertError}`);
  }

  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok' });
}

/**
 * Photos arrive in a second request, after the delivery rows are written: the form submits
 * data first so a photo failure cannot cost the HACCP record. The files are saved once and
 * the links written to every row of the delivery. A linking failure is noted, never thrown:
 * the photos exist, and a retry would duplicate them.
 */
function handlePhotoUpload(payload, ctx) {
  const photos = payload.photos || {};
  const targets = getWriteTargets();
  ctx.submissionId = photos.submissionId || null;
  if (!photos.submissionId) note(ctx, 'photo_match=store_date_driver');

  const saved = savePhotosToDrive(photos, ctx);
  ctx.logEntry.rowCount = saved.savedCount;

  let linked = 0;
  if (!saved.savedCount) {
    note(ctx, 'photos_none');
  } else {
    try {
      linked = linkPhotosMonthly(photos, saved);
      note(ctx, linked ? 'photo_rows=' + linked : 'photo_orphan=' + photos.storeId + '/' + photos.date + '/' + photos.driver);
    } catch (e) {
      note(ctx, 'photo_link_failed=' + e.message);
    }
    if (targets.legacy) {
      try {
        note(ctx, 'legacy_photo_rows=' + legacyLinkPhotos(photos, saved));
      } catch (e) {
        note(ctx, 'legacy_photo_failed=' + e.message);
      }
    }
  }

  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', savedPhotos: saved.savedCount, linkedRows: linked });
}
