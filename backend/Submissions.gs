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

/**
 * What each form requires on every row, mirroring what the form itself refuses to submit
 * without: `text` must be non-blank, `numbers` must parse, and `reasons` names the reason a
 * non-zero count needs. The temperatures are the rules of the same source in
 * violationSources(), so a temperature that is checked is also required. Presence only:
 * nothing here checks a name against the reference lists.
 */
function requiredFields() {
  return {
    production: { tab: 'Production', text: ['date', 'kitchen', 'cook', 'cookStart', 'cookEnd', 'dish'],
                  numbers: ['qtyProduced', 'qtyDiscarded'], reasons: { qtyDiscarded: 'discardReason' } },
    packaging:  { tab: 'Packaging', text: ['date', 'time', 'kitchen', 'driver', 'store', 'dish'],
                  numbers: ['loaded', 'discarded'], reasons: { discarded: 'discardReason' } },
    delivery:   { tab: 'Deliveries', text: ['date', 'driver', 'arrive', 'storeId', 'dish', 'casePrefillPercent', 'receivedBy'],
                  numbers: ['added', 'before', 'removed'], reasons: { removed: 'reason' } }
  };
}

/**
 * Refuse a submission that is empty or missing anything its form requires. Null when it is
 * complete, else the response to send. Checked before writing, so a refused submission writes
 * nothing; the form keeps it on the device.
 */
function refuseIncomplete(rows, source, ctx) {
  const spec = requiredFields()[source];
  const schema = schemaFor(spec.tab);
  const headerOf = key => (schema.find(col => col.key === key) || {}).header || key;
  const blank = value => String(value === undefined || value === null ? '' : value).trim() === '';
  const notNumber = value => isNaN(parseFloat(value));
  const numbers = spec.numbers.concat(violationSources()[source].rules.map(rule => rule.key));

  const missing = [];
  const add = label => { if (missing.indexOf(label) < 0) missing.push(label); };
  if (!rows.length) add('at least one dish');
  rows.forEach(row => {
    spec.text.forEach(key => { if (blank(row[key])) add(headerOf(key)); });
    numbers.forEach(key => { if (notNumber(row[key])) add(headerOf(key)); });
    Object.keys(spec.reasons).forEach(countKey => {
      const reasonKey = spec.reasons[countKey];
      if ((parseFloat(row[countKey]) || 0) > 0 && blank(row[reasonKey])) add(headerOf(reasonKey) + ' (for ' + headerOf(countKey) + ')');
    });
  });
  if (!missing.length) return null;

  const message = 'Required and missing: ' + missing.join(', ');
  ctx.logEntry.status = 'REJECTED';
  ctx.logEntry.errorMessage = message;
  note(ctx, 'incomplete_submission');
  return jsonResponse({ status: 'error', message: message });
}

function handleBugReport(payload, ctx) {
  ctx.logEntry.formType = 'bugReport';
  const sent = sendMail(supportRecipients(), payload.subject, payload.body);
  if (sent.note) note(ctx, sent.note);
  if (sent.status !== 'SUCCESS') note(ctx, 'bug_report_mail_failed=' + sent.error);
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', message: 'Bug report sent' });
}

/**
 * One production run: the rows are written, then the run's cook temperature is checked.
 * Written first, checked second, for the same reason as deliveries.
 */
function handleProductionSubmission(payload, ctx) {
  const rows = normaliseRows(payload.rows || [], ctx);
  const refused = refuseIncomplete(rows, 'production', ctx);
  if (refused) return refused;
  writeRecords('production', rows, ctx);
  if (!ctx.duplicate) {
    try {
      checkViolations(rows, ctx, 'production');
    } catch (alertError) {
      note(ctx, 'violation_check_failed=' + alertError.message);
      Logger.log(`Warning: violation check failed: ${alertError}`);
    }
  }
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', duplicate: !!ctx.duplicate });
}

/**
 * One cooler loaded at a kitchen for one store: the rows are written, then its temperature is
 * checked the way a delivery's are. Written first, checked second, for the same reason as
 * deliveries: losing an alert is recoverable, losing the record is not.
 */
function handlePackagingSubmission(payload, ctx) {
  const rows = normaliseRows(payload.rows || [], ctx);
  const refused = refuseIncomplete(rows, 'packaging', ctx);
  if (refused) return refused;
  writeRecords('packaging', rows, ctx);
  if (!ctx.duplicate) {
    try {
      checkViolations(rows, ctx, 'packaging');
    } catch (alertError) {
      note(ctx, 'violation_check_failed=' + alertError.message);
      Logger.log(`Warning: violation check failed: ${alertError}`);
    }
  }
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', duplicate: !!ctx.duplicate });
}

function handleDeliverySubmission(payload, ctx) {
  const rows = normaliseRows(payload.rows || [], ctx);
  const refused = refuseIncomplete(rows, 'delivery', ctx);
  if (refused) return refused;
  writeRecords('deliveries', rows, ctx);

  // A replay has already been checked and alerted on; checking again would send a second
  // email for one bad reading.
  if (ctx.duplicate) {
    ctx.logEntry.status = 'SUCCESS';
    return jsonResponse({ status: 'ok', duplicate: true });
  }

  // HACCP violation alerts, once for the submission. The rows are already written, so a
  // failure here must not fail the submission: losing an alert is recoverable, losing the
  // record is not.
  try {
    checkViolations(rows, ctx, 'delivery');
  } catch (alertError) {
    note(ctx, 'violation_check_failed=' + alertError.message);
    Logger.log(`Warning: violation check failed: ${alertError}`);
  }

  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', duplicate: !!ctx.duplicate });
}

/**
 * Photos arrive in a second request, after the delivery rows are written: the form submits
 * data first so a photo failure cannot cost the HACCP record. The files are saved once and
 * the links written to every row of the delivery.
 *
 * An upload whose rows have not arrived yet is answered with `pending`, and the form keeps it
 * queued rather than reporting it done. The stored files are reused on the retry, so the two
 * requests may arrive in either order. A linking failure is noted, never thrown: the photos
 * exist either way.
 */
function handlePhotoUpload(payload, ctx) {
  const photos = payload.photos || {};
  ctx.submissionId = photos.submissionId || null;
  if (!photos.submissionId) note(ctx, 'photo_match=store_date_driver');

  // A replayed upload would save a second copy to Drive and relink to it, orphaning the
  // first. The links already on the rows say the work is done.
  if (photosAlreadyLinked(photos)) {
    note(ctx, 'duplicate_photos=' + photos.submissionId);
    ctx.logEntry.status = 'SUCCESS';
    return jsonResponse({ status: 'ok', duplicate: true, savedPhotos: 0, linkedRows: 0 });
  }

  const saved = savePhotosToDrive(photos, ctx);
  ctx.logEntry.rowCount = saved.savedCount + saved.reusedCount;

  let linked = 0;
  if (!saved.savedCount && !saved.reusedCount) {
    note(ctx, 'photos_none');
  } else {
    try {
      linked = linkPhotosMonthly(photos, saved);
      note(ctx, linked ? 'photo_rows=' + linked : 'photo_orphan=' + photos.storeId + '/' + photos.date + '/' + photos.driver);
    } catch (e) {
      note(ctx, 'photo_link_failed=' + e.message);
    }
  }

  // Stored, but nothing carries the links yet: the delivery rows have not arrived. The
  // upload is unfinished and the caller has to send it again. Without a submission id there
  // is nothing to match on later, so that is an orphan to investigate, not one to wait for.
  const pending = !!photos.submissionId && !linked && (saved.savedCount > 0 || saved.reusedCount > 0);
  if (pending) note(ctx, 'photos_pending_rows');

  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', pending: pending, savedPhotos: saved.savedCount, reusedPhotos: saved.reusedCount, linkedRows: linked });
}
