// Photos.gs — delivery photos in Drive and their links on the delivery rows.
//
// Photos file under PHOTO_FOLDER_ID/<YYYY>/<MM>/<DD>/, resolved through DriveTree (cached,
// locked, exact name). They arrive in a second request after the delivery rows are written,
// and the links go onto every row of that delivery in the monthly Deliveries tab: matched by
// submission id, or by store, date and driver for payloads sent before the forms carried one.


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
/**
 * The name one photo is stored under: store, date, which shot, and the first 8 characters of
 * the submission id, in the same short form the violation ids use.
 *
 * The id is what makes the name identify one delivery. Without it two deliveries to the same
 * store on one day produce the same name, so a stray file cannot be traced back and a saved
 * file cannot safely be reused. Payloads queued before the forms sent ids fall back to the
 * older name.
 */
function photoFileName(photos, filedDate, which) {
  const id = photos.submissionId ? String(photos.submissionId).replace(/-/g, '').slice(0, 8) : '';
  return photos.storeId + '_' + filedDate + '_' + which + (id ? '_' + id : '') + '.jpg';
}

/** The file of that exact name already in the folder, or null. */
function findPhotoFile(folder, name) {
  return firstNamed(folder.getFilesByName(name), name);
}

/**
 * Save the before and after photos of one delivery into its day folder.
 * Returns { date, beforeUrl, afterUrl, savedCount }; `date` is the day they filed under.
 *
 * A photo already saved under this name is reused rather than written again. That is what
 * makes a retry safe when the first attempt stored the files but failed to link them: the
 * rows get their links without a second copy appearing in Drive.
 */
function savePhotosToDrive(photos, ctx) {
  const filed = partitionDateFor(photos.date);
  if (filed.fallback) note(ctx, 'photo_date_fallback=' + filed.fallback + ':' + String(photos.date));
  const saved = { date: filed.date, beforeUrl: null, afterUrl: null, savedCount: 0, reusedCount: 0 };
  let folder = null;
  ['before', 'after'].forEach(which => {
    const photo = photos[which];
    if (!photo || !photo.data) return;
    if (!folder) folder = photoDayFolder(filed.date, true);

    const name = photoFileName(photos, filed.date, which);
    const existing = photos.submissionId ? findPhotoFile(folder, name) : null;
    if (existing) {
      saved[which + 'Url'] = existing.getUrl();
      saved.reusedCount += 1;
      return;
    }

    const base64 = String(photo.data).replace(/^data:[^,]*,/, '');
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), photo.mimeType || 'image/jpeg', name);
    saved[which + 'Url'] = folder.createFile(blob).getUrl();
    saved.savedCount += 1;
  });
  if (saved.reusedCount) note(ctx, 'photos_reused=' + saved.reusedCount);
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

/**
 * Whether this submission's delivery rows already carry photo links. A replayed upload would
 * otherwise create a second set of files in Drive and leave the first set orphaned.
 */
function photosAlreadyLinked(photos) {
  if (!photos.submissionId) return false;   // no id: fall back to the store/date/driver match
  const filed = partitionDateFor(photos.date);
  const opened = openMonthly(monthKeyOfDate(filed.date), false);
  const sheet = opened && opened.ss.getSheetByName('Deliveries');
  if (!sheet || sheet.getLastRow() < 2) return false;
  const schema = schemaFor('Deliveries');
  return readRows(sheet.getDataRange().getValues(), schema).records
    .some(r => String(r.submissionId) === String(photos.submissionId) &&
               (r.beforePhotoLink || r.afterPhotoLink));
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

