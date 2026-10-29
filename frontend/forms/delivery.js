// forms/delivery.js — the driver's per-store delivery form. Loads after forms/common.js.

let DISHES = [];        // active dish names, set once the reference lists load
let DISH_ENTRIES = [];  // the same dishes with their System IDs
let STORES = [];        // active store entries, likewise

// The QR code at each store opens this page with ?store=<System ID>. Codes printed before
// System IDs existed carry the store number instead, and both are accepted. Either way
// `storeId` ends up as the store number, which every delivery row and photo name carries.
// A code for a store that is no longer on the list is refused: it was retired on purpose.
const params = new URLSearchParams(window.location.search);
const storeParam = params.get('store') || '';
let storeId   = storeParam;
let storeData = null;         // the store's list entry, set once the store list has loaded
let storeUnknown = false;     // the code named a store the list does not have

// Compressed base64 photos, attached to the submission
const photoData = { before: null, after: null };

const driverPicker = createPeoplePicker({
  selectId: 'f-driver',
  customId: 'f-driver-custom',
  addLabel: '+ Add new driver'
});

// ═══════════════════════════════════════════════════════════════════════════
// T-008: Client-Side Image Compression
// ═══════════════════════════════════════════════════════════════════════════
const PHOTO_MAX_WIDTH = 1600;
const PHOTO_MAX_HEIGHT = 1600;
const PHOTO_QUALITY = 0.85;

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const originalSize = Math.round(e.target.result.length * 0.75 / 1024);

        if (width > PHOTO_MAX_WIDTH || height > PHOTO_MAX_HEIGHT) {
          const ratio = Math.min(PHOTO_MAX_WIDTH / width, PHOTO_MAX_HEIGHT / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
        const compressedSize = Math.round(compressedDataUrl.length * 0.75 / 1024);

        console.log(`[Image] Compressed ${file.name}: ${originalSize}KB → ${compressedSize}KB (${width}x${height})`);
        resolve({
          dataUrl: compressedDataUrl,
          originalSize,
          compressedSize,
          dimensions: `${width}x${height}`
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Dish entry
// ═══════════════════════════════════════════════════════════════════════════

// Per-dish quantities live in memory for this stop only. They are deliberately not
// persisted: the next QR scan is a different store, and counts carrying over from the
// previous stop would be worse than retyping them.

function effectiveReason(data) {
  return data.reason === '__other__' ? (data.reasonCustom || '').trim() : data.reason;
}

/**
 * What one dish still needs, or null. Only the added count is required outright — the rest
 * stand at zero — but a removal has to say why the product came off the shelf.
 */
function dishProblem(data) {
  if (data.added === '') {
    return { id: 'modal-added', message: 'Enter how many were added to the shelf. Enter 0 if none.' };
  }
  if ((parseInt(data.removed) || 0) > 0 && !effectiveReason(data)) {
    return {
      id: data.reason === '__other__' ? 'modal-reason-custom' : 'modal-reason',
      message: 'Say why this product was removed from the shelf.'
    };
  }
  return null;
}

/** Same output the old table's calc cell produced: '—' until something is entered, '⚠ Check' if negative. */
function computeAfter(data) {
  if (data.added === '' && data.before === '' && data.removed === '') return '—';
  const after = (parseInt(data.before) || 0) + (parseInt(data.added) || 0) - (parseInt(data.removed) || 0);
  return after >= 0 ? String(after) : '⚠ Check';
}

/** One-line recap for the card, in the same phrasing as the trip summary. */
function dishCardSummary(data) {
  const parts = [];
  if (data.added !== '')   parts.push(`+${data.added} added`);
  if (data.before !== '')  parts.push(`${data.before} before`);
  if (data.removed !== '') parts.push(`−${data.removed} removed`);
  const after = computeAfter(data);
  if (after !== '—') parts.push(`→ ${after} after`);
  return parts.join(' · ');
}

const dishEntry = createDishEntry({
  dishes: () => DISHES,
  fields: [
    { key: 'added',        id: 'modal-added' },
    { key: 'before',       id: 'modal-before' },
    { key: 'removed',      id: 'modal-removed' },
    { key: 'reason',       id: 'modal-reason' },
    { key: 'reasonCustom', id: 'modal-reason-custom' }
  ],
  status(data) {
    if (data.added !== '') return 'complete';
    return (data.before !== '' || data.removed !== '' || effectiveReason(data)) ? 'partial' : 'empty';
  },
  summary: dishCardSummary,
  validate: dishProblem,
  totals: [
    { key: 'added',   id: 'total-added' },
    { key: 'removed', id: 'total-removed' }
  ],
  onOpen()  { handleModalReasonChange(false); recalcModal(); },
  onClear() { handleModalReasonChange(false); recalcModal(); }
});

function handleModalReasonChange(focusCustom) {
  const select = document.getElementById('modal-reason');
  const custom = document.getElementById('modal-reason-custom');
  const isOther = select.value === '__other__';
  custom.style.display = isOther ? 'block' : 'none';
  if (!isOther) custom.value = '';
  if (isOther && focusCustom) custom.focus();
}

function recalcModal() {
  const after = computeAfter(dishEntry.readModal());
  const cell  = document.getElementById('modal-after');
  cell.textContent = after;
  cell.style.color = after === '⚠ Check' ? 'var(--red)' : (after === '—' ? 'var(--soft)' : 'var(--green)');
}

// ═══════════════════════════════════════════════════════════════════════════
// Page load
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const lists = await loadReferenceLists(['stores', 'drivers', 'dishes']);
  STORES = activeEntries(lists, 'stores');
  DISH_ENTRIES = activeEntries(lists, 'dishes');
  DISHES = DISH_ENTRIES.map(dish => dish.name);

  storeData = STORES.find(s => s.id === storeParam) || STORES.find(s => s.storeId === storeParam) || null;
  if (storeData) {
    storeId = storeData.storeId;
    document.getElementById('store-title').textContent    = storeData.name + ' · ' + storeData.location;
    document.getElementById('store-location').textContent = 'Giant Food Stores — Bento Program';
    document.getElementById('store-header').style.display = 'block';
    document.title = 'Taipei Kitchen · Delivery · ' + storeData.name;
  } else if (storeParam) {
    // Number or System ID, a store the list does not have is a retired store, or a code from
    // the other environment. Refuse rather than file rows against it.
    storeUnknown = true;
    storeId = '';
    document.getElementById('store-title').textContent    = 'Unknown store';
    document.getElementById('store-location').textContent = UNKNOWN_STORE_MESSAGE;
    document.getElementById('store-header').style.display = 'block';
    document.getElementById('submit-btn').disabled = true;
  }

  const now = new Date();
  document.getElementById('f-date').value   = localDateISO();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('f-arrive').value = hh + ':' + mm;

  dishEntry.buildList();
  driverPicker.load(activeEntries(lists, 'drivers'));
  reportAbandonedSubmissions();
});

// ── Photo handling ─────────────────────────────────────────
async function previewPhoto(input, previewId, zoneId) {
  const container = document.getElementById(previewId);
  const zone      = document.getElementById(zoneId);
  const which     = zoneId.includes('before') ? 'before' : 'after';
  container.innerHTML = '';
  if (!input.files.length) return;
  const file   = input.files[0];

  try {
    // T-008: Compress image before storing
    const compressed = await compressImage(file);

    const img = document.createElement('img');
    img.src   = compressed.dataUrl;
    container.appendChild(img);

    // Store compressed base64 (strip the data:image/...;base64, prefix)
    photoData[which] = {
      data:     compressed.dataUrl.split(',')[1],
      mimeType: 'image/jpeg',
      name:     file.name,
      originalSize: compressed.originalSize,
      compressedSize: compressed.compressedSize
    };

    zone.classList.add('has-photo');
    clearMissing(zone);
    document.getElementById('icon-'  + which).textContent = '✅';
    document.getElementById('label-' + which).textContent = `Photo ready (${compressed.compressedSize}KB)`;
  } catch (e) {
    console.error('[Image] Compression failed:', e);
    // Fallback to original if compression fails
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      container.appendChild(img);
      photoData[which] = {
        data: e.target.result.split(',')[1],
        mimeType: file.type,
        name: file.name
      };
      zone.classList.add('has-photo');
      clearMissing(zone);
      document.getElementById('icon-' + which).textContent = '✅';
      document.getElementById('label-' + which).textContent = 'Photo ready';
    };
    reader.readAsDataURL(file);
  }
}

// ── Payload ────────────────────────────────────────────────
// One row per dish, keyed to match the Deliveries tab's schema in backend/Schemas.gs.
// One submission id covers the rows and the photos that follow in a second request.
function buildPayload() {
  const submissionId = newSubmissionId();
  const date   = document.getElementById('f-date').value;
  const driver = driverPicker.value();
  const driverSystemId = driverPicker.systemId();
  const arrive = document.getElementById('f-arrive').value;
  const arrivalTemp = document.getElementById('f-arrival-temp').value;
  const ctTemp    = document.getElementById('f-cooler-temp').value;
  const casePrefill = document.getElementById('f-case-prefill').value;
  const notes  = document.getElementById('f-notes').value;
  const rcvd   = document.getElementById('f-received-by').value;
  // The store number keys everything downstream; the name and System IDs come from the
  // store's list entry. The backend writes these as sent.
  const store  = storeData ? storeData.name : '';
  const storeIdClean = storeId;
  const storeSystemId = storeData ? storeData.id : '';
  const dishSystemIdOf = name => (DISH_ENTRIES.find(d => d.name === name) || {}).id || '';

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, driver, driverSystemId, store, storeId: storeIdClean, storeSystemId, arrive,
      dishSystemId: dishSystemIdOf(dish),
      arrivalTemp: arrivalTemp,
      coolerTemp: ctTemp,
      casePrefillPercent: casePrefill,
      dish,
      added:   data.added   || '0',
      before:  data.before  || '0',
      removed: data.removed || '0',
      reason:  effectiveReason(data),
      after:   computeAfter(data),
      notes, receivedBy: rcvd,
      formType: 'delivery',
      clientTimestamp: new Date().toISOString()
    });
  });

  return {
    rows,
    formType: 'delivery',
    photos: {
      submissionId,
      before: photoData.before,
      after:  photoData.after,
      storeId: storeIdClean,
      storeName: store,
      date,
      driver
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T-007: Offline Queue System
// ═══════════════════════════════════════════════════════════════════════════
// ─── Retry pacing ──────────────────────────────────────────
// Both queues back off: the wait doubles from the queue's own tick up to a half-hour ceiling,
// inside a four-hour window. A flat tick is wrong in both directions — too slow for the case
// that clears in seconds, and hundreds of pointless re-posts for the case that does not. The
// ceiling stops the doubling running away: without it the tenth wait is over eight hours, so
// something stuck overnight would sit untried until the middle of the next day.
const RETRY_CEILING_MS = 30 * 60 * 1000;
const RETRY_WINDOW_MS  = 4 * 60 * 60 * 1000;

/** When an entry that has failed `attempts` times should next be tried, in epoch ms. */
function nextAttemptAt(attempts, baseMs) {
  return Date.now() + Math.min(baseMs * Math.pow(2, Math.max(0, attempts - 1)), RETRY_CEILING_MS);
}

/** Whether an entry is due. One that has never been tried is due at once. */
function retryDue(entry) {
  return !entry.nextAttempt || entry.nextAttempt <= Date.now();
}

/** Whether something queued at `queuedAtMs` has outlived the window. An unreadable stamp
 *  reads as not expired, so a parse failure never throws work away. */
function pastRetryWindow(queuedAtMs) {
  return Date.now() - queuedAtMs > RETRY_WINDOW_MS;
}

// Returns false when the write failed, which on a phone means the storage quota is full.
// The caller has to say so: an unhandled throw here leaves the overlay stuck on "Submitting"
// with the button disabled, and the driver with no way to tell the delivery was not kept.
// The queued-at time is the key's own suffix, so an entry carries no second copy of it.
const SUBMISSION_RETRY_BASE_MS = 30 * 1000;

function queueSubmission(payload) {
  const queueKey = 'tk_queue_' + Date.now();
  try {
    localStorage.setItem(queueKey, JSON.stringify({ payload: payload, attempts: 0, nextAttempt: 0 }));
  } catch (e) {
    console.error('[Queue] Could not save submission offline:', e);
    return false;
  }
  console.log('[Queue] Saved submission offline:', queueKey);
  return true;
}

function getQueuedSubmissions() {
  return Object.keys(localStorage).filter(k => k.startsWith('tk_queue_')).map(key => {
    try {
      return { key: key, queuedAt: Number(key.slice('tk_queue_'.length)), entry: JSON.parse(localStorage.getItem(key)) };
    } catch (e) {
      console.error('[Queue] Unreadable entry, dropping:', key, e);
      localStorage.removeItem(key);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Four hours without a connection is not a blip. Stop re-posting, but keep the payload under
 * its own key and say so on the next page load: this delivery was never recorded and has to
 * be entered again, and dropping it in silence is how a store visit goes missing.
 */
function abandonSubmission(item) {
  try {
    localStorage.setItem('tk_failed_' + item.queuedAt, JSON.stringify(item.entry));
  } catch (e) {
    console.error('[Queue] Could not keep the abandoned submission:', e);
  }
  localStorage.removeItem(item.key);
  console.warn('[Queue] Past the retry window, no longer retrying:', item.key);
}

/** Tell the driver about any delivery the retry window ran out on, once. */
function reportAbandonedSubmissions() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tk_failed_'));
  if (!keys.length) return;
  const when = keys
    .map(k => new Date(Number(k.slice('tk_failed_'.length))).toLocaleString())
    .join('\n• ');
  keys.forEach(k => localStorage.removeItem(k));
  alert('A delivery could not be sent and is no longer being retried:\n\n• ' + when +
        '\n\nNothing was recorded for it. Please enter that delivery again.');
}

async function retryQueuedSubmissions() {
  const queued = getQueuedSubmissions();
  if (queued.length === 0) return;

  for (const item of queued) {
    if (pastRetryWindow(item.queuedAt)) { abandonSubmission(item); continue; }
    if (!retryDue(item.entry)) continue;

    // Only drop it once the backend confirms. A submission the backend already holds is
    // reported as a duplicate, which counts as confirmed: the rows are there.
    const sent = await postToBackend(item.entry.payload);
    if (sent.ok) {
      localStorage.removeItem(item.key);
      console.log('[Queue] Confirmed:', item.key, sent.data && sent.data.duplicate ? '(already recorded)' : '');
    } else {
      item.entry.attempts += 1;
      item.entry.nextAttempt = nextAttemptAt(item.entry.attempts, SUBMISSION_RETRY_BASE_MS);
      localStorage.setItem(item.key, JSON.stringify(item.entry));
      console.log(`[Queue] Still failing (attempt ${item.entry.attempts}):`, item.key, sent.error);
    }
  }
}

// The tick only decides how often the queue is looked at; nextAttempt decides what is due.
setInterval(retryQueuedSubmissions, 30000);

// ─── T-044: Photo Retry Queue ─────────────────────────────
const PHOTO_RETRY_BASE_MS = 2 * 60 * 1000;

/** Keep a photo upload for the retry loop. Returns false when the device has no room left. */
function queuePhotoRetry(photoPayload) {
  try {
    const queue = JSON.parse(localStorage.getItem('tk_delivery_photo_queue') || '[]');
    queue.push({
      payload: photoPayload,
      timestamp: new Date().toISOString(),
      attempts: 0,
      nextAttempt: 0
    });
    localStorage.setItem('tk_delivery_photo_queue', JSON.stringify(queue));
    console.log('[Photo Retry] Queued photo upload for retry. Queue size:', queue.length);
    return true;
  } catch (e) {
    console.error('[Photo Retry] Failed to queue photos:', e);
    return false;
  }
}

function clearPhotoRetryQueue() {
  localStorage.removeItem('tk_delivery_photo_queue');
  console.log('[Photo Retry] Queue cleared');
}

async function retryQueuedPhotos() {
  const queue = JSON.parse(localStorage.getItem('tk_delivery_photo_queue') || '[]');
  if (queue.length === 0) return;

  console.log(`[Photo Retry] Attempting to upload ${queue.length} queued photo batch(es)`);

  // Everything that is to stay queued, whether it was tried this pass or is not due yet.
  const remaining = [];

  for (const item of queue) {
    // Photos are the recoverable half: the delivery rows carry the HACCP record, and a driver
    // can retake a shelf photo. So the window expiring drops them rather than raising an alarm.
    if (pastRetryWindow(Date.parse(item.timestamp))) {
      console.warn('[Photo Retry] Past the retry window, dropping:', item.timestamp);
      continue;
    }
    if (!retryDue(item)) { remaining.push(item); continue; }

    const sent = await postToBackend(item.payload);
    // `pending` means the files are stored but the delivery rows are not there yet to carry
    // the links. The backend reuses the stored files on the next attempt, so retrying costs
    // nothing in Drive and is the only thing that finishes the upload.
    const pending = sent.ok && sent.data && sent.data.pending;
    if (sent.ok && !pending) {
      console.log('[Photo Retry] Confirmed upload from', item.timestamp);
    } else {
      item.attempts++;
      item.nextAttempt = nextAttemptAt(item.attempts, PHOTO_RETRY_BASE_MS);
      remaining.push(item);
      console.log(`[Photo Retry] ${pending ? 'Waiting on the delivery rows' : 'Still failing'} (attempt ${item.attempts}):`,
        item.timestamp, sent.error || '');
    }
  }

  if (remaining.length > 0) {
    localStorage.setItem('tk_delivery_photo_queue', JSON.stringify(remaining));
    console.log(`[Photo Retry] ${remaining.length} photo batch(es) still queued`);
  } else {
    clearPhotoRetryQueue();
    console.log('[Photo Retry] All queued photos successfully uploaded!');
  }
}

// T-044: Retry queued photos every 2 minutes
setInterval(retryQueuedPhotos, 120000);

// T-044: Try once on page load in case there are queued photos from previous sessions
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(retryQueuedPhotos, 5000); // Wait 5s after page load to retry
});

// ─── Validation ────────────────────────────────────────────
// Everything the delivery record needs. Store notes are the one optional field. Specs run in
// page order so the field scrolled to is the topmost one outstanding.
const UNKNOWN_STORE_MESSAGE = 'This QR code points at a store that is no longer on the list. Ask the office for a new code.';

function formIsComplete() {
  if (storeUnknown) {
    alert(UNKNOWN_STORE_MESSAGE);
    return false;
  }
  const missing = missingFields([
    { id: 'f-date',                label: 'Date' },
    { id: driverPicker.activeId(), label: 'Driver', value: driverPicker.value() },
    { id: 'f-arrive',              label: 'Arrival Time' },
    { id: 'f-arrival-temp',        label: 'Arrival Product Temp °F' },
    { id: 'f-cooler-temp',         label: 'Store Cooler Temp °F' },
    { id: 'zone-before',           label: 'Before Stocking Photo', value: photoData.before ? 'taken' : '' },
    { id: 'f-case-prefill',        label: 'Case Fill Level Before Stocking' },
    { id: 'zone-after',            label: 'After Stocking Photo',  value: photoData.after  ? 'taken' : '' },
    { id: 'f-received-by',         label: 'Received By' }
  ]);
  if (missing.length) {
    reportMissing('Fill these in before submitting:', missing);
    return false;
  }

  const dishes = dishEntry.invalidDishes();
  if (dishes.length) {
    reportMissing('Every dish needs an added count, 0 included. Still to enter:', dishes);
    return false;
  }
  return true;
}

// ─── T-045: Trip Summary Screen ───────────────────────────
function showSummary() {
  if (!formIsComplete()) return;

  const driver = driverPicker.value();
  const payload = buildPayload();
  const date = document.getElementById('f-date').value;

  document.getElementById('sum-store').textContent = storeData ? storeData.name : `Store ${storeId}`;
  document.getElementById('sum-driver').textContent = driver;
  document.getElementById('sum-date').textContent = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  // Built with textContent, never innerHTML: dish names are edited on the dashboard and must
  // render as text whatever they contain.
  const dishContainer = document.getElementById('sum-dishes');
  dishContainer.textContent = '';
  if (payload.rows.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'color:var(--mid);font-style:italic;';
    none.textContent = 'No dishes entered';
    dishContainer.appendChild(none);
  } else {
    payload.rows.forEach(row => {
      const line = document.createElement('div');
      line.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;';
      const parts = [];
      if (row.added) parts.push(`+${row.added} added`);
      if (row.before) parts.push(`${row.before} before`);
      if (row.removed) parts.push(`−${row.removed} removed`);
      if (row.after && row.after !== '—') parts.push(`→ ${row.after} after`);
      if (row.dish) {
        const name = document.createElement('strong');
        name.textContent = row.dish;
        line.appendChild(name);
        if (parts.length) line.appendChild(document.createTextNode(' · '));
      }
      line.appendChild(document.createTextNode(parts.join(' · ')));
      dishContainer.appendChild(line);
    });
  }

  document.getElementById('summary-overlay').classList.add('show');
}

function closeSummary() {
  document.getElementById('summary-overlay').classList.remove('show');
}

function confirmSubmit() {
  closeSummary();
  submitForm();
}

// ─── Submit ────────────────────────────────────────────────
async function submitForm() {
  if (!formIsComplete()) return;

  if (!GOOGLE_SCRIPT_URL) {
    showStatus('⚠️', 'Not Configured', 'config.js is missing or has no webAppUrl. Locally, run: npm run env:staging');
    showStatusDone();
    return;
  }

  showStatus('⏳', 'Submitting…', 'Step 1 of 2 — Saving delivery data to Google Sheets…');
  document.getElementById('submit-btn').disabled = true;

  const payload = buildPayload();

  // ── Step 1: Send data rows (no photos) ──────────────────
  const dataPayload = {
    rows:     payload.rows,
    formType: payload.formType,
    photos:   { submissionId: payload.photos.submissionId, storeId: payload.photos.storeId,
                storeName: payload.photos.storeName, date: payload.photos.date, driver: payload.photos.driver }
  };

  const wrote = await postToBackend(dataPayload);
  if (!wrote.ok) {
    if (!queueSubmission(dataPayload)) {
      showStatus('❌', 'Not Saved',
        'This delivery could not be kept for retry: storage on this device is full. Leave this ' +
        `page open and press Submit again once you have a connection. (${wrote.error})`);
      showStatusDone();
      document.getElementById('submit-btn').disabled = false;
      return;
    }
    // The photos go to their own queue rather than riding along with the rows, which carry
    // only photo metadata. An upload that reaches the backend before its rows is answered
    // `pending` and stays queued, so the two queues may drain in either order.
    const photosKept = queuePhotoRetry({ formType: 'photos_only', photos: payload.photos });
    showStatus('❌', 'Offline Mode',
      'Submission queued and will retry automatically every 30 seconds. Leave this page open.' +
      (photosKept ? '' : ' The photos could not be kept — storage on this device is full — so retake them once the delivery has saved.') +
      ` (${wrote.error})`);
    showStatusDone();
    document.getElementById('submit-btn').disabled = false;
    return;
  }

  // ── Step 2: Send photos separately if present ────────────
  const hasPhotos = photoData.before || photoData.after;
  console.log('[Photo Debug] hasPhotos:', hasPhotos, 'photoData:', photoData);
  if (hasPhotos) {
    // T-044: Show detailed photo upload status
    const photoCount = (photoData.before ? 1 : 0) + (photoData.after ? 1 : 0);
    const photoTypes = [];
    if (photoData.before) photoTypes.push('before-stocking');
    if (photoData.after) photoTypes.push('after-stocking');
    showStatus('⏳', 'Almost done…',
      `Step 2 of 2 — Uploading ${photoCount} photo${photoCount > 1 ? 's' : ''} (${photoTypes.join(', ')}) to Google Drive…`);

    const photoPayload = {
      formType: 'photos_only',
      photos:   payload.photos
    };
    console.log('[Photo Debug] Sending photo payload:', JSON.stringify({
      formType: photoPayload.formType,
      hasBeforeData: !!photoPayload.photos?.before?.data,
      hasAfterData: !!photoPayload.photos?.after?.data,
      storeId: photoPayload.photos?.storeId,
      driver: photoPayload.photos?.driver
    }));
    const sent = await postToBackend(photoPayload);
    // Anything but a linked upload goes to the queue, `pending` included: the rows were just
    // written, so pending here means they were not found and the links still have to land.
    if (sent.ok && !(sent.data && sent.data.pending)) {
      showStatus('✅', 'All Done!',
        payload.rows.length + ' dish rows saved for ' +
        (storeData ? storeData.name : 'store ' + storeId) + '. ' +
        `${photoCount} photo${photoCount > 1 ? 's' : ''} uploaded. You can close this page.`);
    } else {
      queuePhotoRetry(photoPayload);
      showStatus('⚠️', 'Mostly Done',
        'Delivery data saved ✓. ' +
        `${photoCount} photo${photoCount > 1 ? 's' : ''} queued and will upload automatically. Leave this page open. (${sent.error})`);
    }
  } else {
    showStatus('✅', 'Submitted!',
      payload.rows.length + ' dish rows saved for ' +
      (storeData ? storeData.name : 'store ' + storeId) + '. No photos attached. You can close this page.');
  }

  showStatusDone();
}

function clearAll() {
  if (!confirm('Clear all entries?')) return;
  document.querySelectorAll('input:not([type=file]), select, textarea').forEach(el => el.value = '');
  dishEntry.reset();
  document.querySelectorAll('.' + INVALID_CLASS).forEach(clearMissing);
  document.getElementById('before-previews').innerHTML = '';
  document.getElementById('after-previews').innerHTML  = '';
  ['before','after'].forEach(w => {
    photoData[w] = null;
    const zone = document.getElementById('zone-' + w);
    zone.classList.remove('has-photo');
    document.getElementById('icon-'  + w).textContent = w === 'before' ? '📸' : '📷';
    document.getElementById('label-' + w).textContent = 'Tap to take photo';
  });
  document.getElementById('f-date').value = localDateISO();
}
