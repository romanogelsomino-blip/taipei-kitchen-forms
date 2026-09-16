// Photos.gs — delivery photos in Drive and their links on the delivery rows.
//
// Photos file under PHOTO_FOLDER_ID/<YYYY>/<MM>/<DD>/, resolved through DriveTree (cached,
// locked, exact name). They arrive in a second request after the delivery rows are written,
// and the links go onto every row of that delivery in the monthly Deliveries tab: matched by
// submission id, or by store, date and driver for payloads sent before the forms carried one.

const PHOTO_DRIFT = { days: 7, threshold: 0.05 };

/** The photo root for this environment, by id only: a wrong id or a sharing gap fails loudly instead of minting a second folder. */
function getPhotoRootFolder() {
  const id = requireProperty('PHOTO_FOLDER_ID');
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error(
      'PHOTO_FOLDER_ID "' + id + '" is not accessible to the account this deployment ' +
      'runs as (executeAs: USER_DEPLOYING). Fix the property or the folder sharing. ' +
      'Underlying error: ' + e.toString()
    );
  }
}

/**
 * <root>/<YYYY>/<MM>/<DD> for a `YYYY-MM-DD` date. With `create`, missing levels are created
 * under the lock; without it, null as soon as a level is missing.
 */
function photoDayFolder(isoDate, create) {
  const step = create ? resolveChildFolder : findChildFolder;
  const parts = isoDate.split('-');
  let folder = getPhotoRootFolder();
  for (let i = 0; i < parts.length && folder; i++) folder = step(folder, parts[i]);
  return folder || null;
}

/**
 * Save the before and after photos of one delivery into its day folder.
 * Returns { date, beforeUrl, afterUrl, savedCount }; `date` is the day they filed under.
 */
function savePhotosToDrive(photos, ctx) {
  const filed = partitionDateFor(photos.date);
  if (filed.fallback) note(ctx, 'photo_date_fallback=' + filed.fallback + ':' + String(photos.date));
  const saved = { date: filed.date, beforeUrl: null, afterUrl: null, savedCount: 0 };
  let folder = null;
  ['before', 'after'].forEach(which => {
    const photo = photos[which];
    if (!photo || !photo.data) return;
    if (!folder) folder = photoDayFolder(filed.date, true);
    const base64 = String(photo.data).replace(/^data:[^,]*,/, '');
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64),
      photo.mimeType || 'image/jpeg',
      photos.storeId + '_' + filed.date + '_' + which + '.jpg'
    );
    saved[which + 'Url'] = folder.createFile(blob).getUrl();
    saved.savedCount += 1;
  });
  return saved;
}

/**
 * The monthly Deliveries rows an upload belongs to: every row with its submission id, or,
 * for payloads without one, every row with its store, date and driver whose link cells are
 * still empty. Returns { sheet, idx, rows } with rows as 1-based sheet row numbers.
 */
function findPhotoRows(photos, filedDate) {
  const opened = openMonthly(monthKeyOfDate(filedDate), false);
  const sheet = opened && opened.ss.getSheetByName('Deliveries');
  if (!sheet || sheet.getLastRow() < 2) return { sheet: sheet || null, idx: null, rows: [] };
  const schema = schemaFor('Deliveries');
  const values = sheet.getDataRange().getValues();
  const idx = headerIndex(values[0], schema).idx;
  const wanted = photos.submissionId
    ? r => String(r.submissionId) === String(photos.submissionId)
    : r => String(r.storeId) === String(photos.storeId) && String(r.date) === String(photos.date) &&
           String(r.driver) === String(photos.driver) && !r.beforePhotoLink && !r.afterPhotoLink;
  return { sheet, idx, rows: readRows(values, schema).records.filter(wanted).map(r => r._row) };
}

/** Write the links onto every matched row of the monthly Deliveries tab. Returns the row count. */
function linkPhotosMonthly(photos, saved) {
  const found = findPhotoRows(photos, saved.date);
  if (!found.rows.length) return 0;
  [['beforePhotoLink', saved.beforeUrl], ['afterPhotoLink', saved.afterUrl]].forEach(([key, url]) => {
    if (!url) return;
    if (found.idx[key] < 0) throw new Error('No "' + schemaFor('Deliveries').find(c => c.key === key).header + '" column on Deliveries');
    fillColumnRows(found.sheet, found.idx[key] + 1, found.rows, url);
  });
  return found.rows.length;
}

/** Set one value in one column on a set of rows, with one write per run of consecutive rows. */
function fillColumnRows(sheet, column, rowNumbers, value) {
  const sorted = rowNumbers.slice().sort((a, b) => a - b);
  let start = 0;
  while (start < sorted.length) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    const count = end - start + 1;
    sheet.getRange(sorted[start], column, count, 1).setValues(Array.from({ length: count }, () => [value]));
    start = end + 1;
  }
}

/**
 * Compare the photos in Drive with the links on the delivery rows over the last seven New
 * York days: each day folder against the distinct links on rows dated that day. Emails when
 * the totals differ by more than the threshold. Never creates folders. Returns the summary.
 */
function checkPhotoDrift() {
  const today = todayNY();
  const dates = [];
  for (let i = PHOTO_DRIFT.days - 1; i >= 0; i--) dates.push(addDays(today, -i));
  const monthKeys = dates.map(monthKeyOfDate).filter((k, i, all) => all.indexOf(k) === i);
  const read = readMonthlyRows(monthKeys, 'Deliveries');

  const linked = {}; // date → { url: true }
  read.records.forEach(r => {
    if (dates.indexOf(String(r.date)) < 0) return;
    [r.beforePhotoLink, r.afterPhotoLink].forEach(url => {
      if (url) (linked[r.date] = linked[r.date] || {})[String(url)] = true;
    });
  });

  const days = dates.map(date => {
    const folder = photoDayFolder(date, false);
    let inDrive = 0;
    if (folder) {
      const files = folder.getFiles();
      while (files.hasNext()) { files.next(); inDrive += 1; }
    }
    return { date: date, inDrive: inDrive, linked: Object.keys(linked[date] || {}).length };
  });
  const drivePhotos = days.reduce((n, d) => n + d.inDrive, 0);
  const linkedPhotos = days.reduce((n, d) => n + d.linked, 0);
  const drift = drivePhotos ? Math.abs(drivePhotos - linkedPhotos) / drivePhotos : (linkedPhotos ? 1 : 0);
  const summary = {
    from: dates[0], to: today, drivePhotos: drivePhotos, linkedPhotos: linkedPhotos, drift: drift,
    alerted: false, days: days.filter(d => d.inDrive !== d.linked), missingMonths: read.missing
  };

  if (drift > PHOTO_DRIFT.threshold) {
    sendMail(
      alertRecipients(),
      'Taipei Kitchen photo drift ' + (drift * 100).toFixed(1) + '% (' + summary.from + ' to ' + summary.to + ')',
      'Drive holds ' + drivePhotos + ' delivery photos for ' + summary.from + ' to ' + summary.to +
        '; the delivery rows link ' + linkedPhotos + '.\n\nDays that differ:\n' +
        summary.days.map(d => '  ' + d.date + ': ' + d.inDrive + ' in Drive, ' + d.linked + ' linked').join('\n') +
        '\n\nThe Executions tab lists each photos_only request; notes of photo_orphan or photo_link_failed name the uploads that did not link.'
    );
    summary.alerted = true;
  }
  Logger.log('[Photo Drift] ' + JSON.stringify(summary));
  return summary;
}
