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
 * Fill what the Reference sheet knows about rows the form could only partly describe. A
 * delivery form has the store number from its QR code and the dish name; a production form
 * has the kitchen's name, and when current its ids, and the dish name. The sheet carries the
 * store's name and every System ID, so a stale phone or a rename cannot leave a row keyless.
 * Best effort: a row the lists cannot place is written as sent.
 */
function enrichRows(kind, rows, ctx) {
  let ref;
  try {
    ref = referencePayload();
  } catch (e) {
    note(ctx, 'reference_unavailable=' + e.message);
    return rows;
  }
  const norm = value => String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
  const named = (list, value) => (norm(value) && ref[list].find(entry => norm(entry.name) === norm(value))) || null;
  return rows.map(row => {
    const out = Object.assign({}, row);
    const dish = named('dishes', row.dish);
    if (!out.dishSystemId && dish) out.dishSystemId = dish.id;
    if (kind === 'deliveries') {
      const store = row.storeId ? ref.stores.find(s => String(s.storeId) === String(row.storeId)) : null;
      if (store) {
        out.store = store.name;
        out.storeSystemId = store.id;
      } else if (!out.store || String(out.store) === String(out.storeId)) {
        out.store = row.storeId ? 'Store ' + row.storeId : '';   // a number the lists do not know, named the way the dashboard names it
      }
    } else {
      const kitchen = (row.kitchenSystemId && ref.kitchens.find(k => k.id === row.kitchenSystemId)) || named('kitchens', row.kitchen);
      if (kitchen) {
        if (!out.kitchenSystemId) out.kitchenSystemId = kitchen.id;
        if (!out.kitchenId) out.kitchenId = kitchen.kitchenId;
      }
    }
    return out;
  });
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
  const rows = enrichRows('production', normaliseRows(payload.rows || [], ctx), ctx);
  writeRecords('production', rows, ctx);
  ctx.logEntry.status = 'SUCCESS';
  return jsonResponse({ status: 'ok', duplicate: !!ctx.duplicate });
}

function handleDeliverySubmission(payload, ctx) {
  const rows = enrichRows('deliveries', normaliseRows(payload.rows || [], ctx), ctx);
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
    checkViolations(rows, ctx);
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
