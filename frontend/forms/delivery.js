// forms/delivery.js — the driver's per-store delivery form. Loads after forms/common.js.

let DISHES = FALLBACK_DATA.dishes;
let STORES = FALLBACK_DATA.stores;

// The QR code at each store opens this page with ?store=<id>.
const params = new URLSearchParams(window.location.search);
let storeId   = params.get('store') || '';
let storeData = null; // Set once the store list has loaded

// Compressed base64 photos, attached to the submission
const photoData = { before: null, after: null };

const driverPicker = createPeoplePicker({
  selectId: 'f-driver',
  customId: 'f-driver-custom',
  file:     'drivers.json',
  key:      'drivers',
  fallback: ["Owen", "Sam Blumenthal", "Andy"],
  addLabel: '+ Add new driver'
});

// T-041: one-tap recall of the previous submission's driver
const lastSubmission = createRecall({
  storageKey: 'tk_delivery_last_submission',
  capture() {
    const snap = driverPicker.snapshot();
    return { driver: driverPicker.value(), driverSelectValue: snap.select, driverCustomValue: snap.custom };
  },
  restore(values) {
    driverPicker.restore({ select: values.driverSelectValue, custom: values.driverCustomValue });
  }
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
  const data = await loadStoresData();
  STORES = activeEntries(data, 'stores', STORES);
  DISHES = activeDishNames(data, DISHES);

  storeData = STORES.find(s => s.id === storeId);
  if (storeData) {
    document.getElementById('store-title').textContent    = storeData.name + ' · ' + storeData.location;
    document.getElementById('store-location').textContent = 'Giant Food Stores — Bento Program';
    document.getElementById('store-header').style.display = 'block';
    document.title = 'Taipei Kitchen · Delivery · ' + storeData.name;
  }

  const now = new Date();
  document.getElementById('f-date').value   = localDateISO();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('f-arrive').value = hh + ':' + mm;

  dishEntry.buildList();
  driverPicker.load();
  lastSubmission.offerIfRecent();
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
  const arrive = document.getElementById('f-arrive').value;
  const arrivalTemp = document.getElementById('f-arrival-temp').value;
  const ctTemp    = document.getElementById('f-cooler-temp').value;
  const casePrefill = document.getElementById('f-case-prefill').value;
  const notes  = document.getElementById('f-notes').value;
  const rcvd   = document.getElementById('f-received-by').value;
  const store  = storeId;  // Send only store ID, not full name (dashboard will format it)
  const storeIdClean = storeId;

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, driver, store, storeId: storeIdClean, arrive,
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
// Returns false when the write failed, which on a phone means the storage quota is full.
// The caller has to say so: an unhandled throw here leaves the overlay stuck on "Submitting"
// with the button disabled, and the driver with no way to tell the delivery was not kept.
function queueSubmission(payload) {
  const queueKey = 'tk_queue_' + Date.now();
  try {
    localStorage.setItem(queueKey, JSON.stringify(payload));
  } catch (e) {
    console.error('[Queue] Could not save submission offline:', e);
    return false;
  }
  console.log('[Queue] Saved submission offline:', queueKey);
  return true;
}

function getQueuedSubmissions() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('tk_queue_'));
  return keys.map(k => ({ key: k, data: JSON.parse(localStorage.getItem(k)) }));
}

async function retryQueuedSubmissions() {
  const queued = getQueuedSubmissions();
  if (queued.length === 0) return;

  console.log(`[Queue] Retrying ${queued.length} queued submissions...`);
  for (const item of queued) {
    // Only drop it once the backend confirms. A submission the backend already holds is
    // reported as a duplicate, which counts as confirmed: the rows are there.
    const sent = await postToBackend(item.data);
    if (sent.ok) {
      localStorage.removeItem(item.key);
      console.log('[Queue] Confirmed:', item.key, sent.data && sent.data.duplicate ? '(already recorded)' : '');
    } else {
      console.log('[Queue] Still failing:', item.key, sent.error);
    }
  }
}

// Auto-retry queued submissions every 30 seconds
setInterval(retryQueuedSubmissions, 30000);

// ─── T-044: Photo Retry Queue ─────────────────────────────
// A queued upload is kept for a day. The delivery rows retry until they land, and the photos
// have to outlive that: the ten-attempt cap this replaced gave up after twenty minutes, which
// is shorter than a bad stretch of store Wi-Fi.
const PHOTO_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Keep a photo upload for the retry loop. Returns false when the device has no room left. */
function queuePhotoRetry(photoPayload) {
  try {
    const queue = JSON.parse(localStorage.getItem('tk_delivery_photo_queue') || '[]');
    queue.push({
      payload: photoPayload,
      timestamp: new Date().toISOString(),
      attempts: 0
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

  const stillFailed = [];

  for (const item of queue) {
    if (Date.now() - Date.parse(item.timestamp) > PHOTO_RETRY_WINDOW_MS) {
      console.log('[Photo Retry] Past the retry window, dropping:', item.timestamp);
      continue;
    }

    const sent = await postToBackend(item.payload);
    // `pending` means the files are stored but the delivery rows are not there yet to carry
    // the links. The backend reuses the stored files on the next attempt, so retrying costs
    // nothing in Drive and is the only thing that finishes the upload.
    const pending = sent.ok && sent.data && sent.data.pending;
    if (sent.ok && !pending) {
      console.log('[Photo Retry] Confirmed upload from', item.timestamp);
    } else {
      item.attempts++;
      stillFailed.push(item);
      console.log(`[Photo Retry] ${pending ? 'Waiting on the delivery rows' : 'Still failing'} (attempt ${item.attempts}):`,
        item.timestamp, sent.error || '');
    }
  }

  if (stillFailed.length > 0) {
    localStorage.setItem('tk_delivery_photo_queue', JSON.stringify(stillFailed));
    console.log(`[Photo Retry] ${stillFailed.length} photo batch(es) still pending`);
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
function formIsComplete() {
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
  const storeData = STORES.find(s => s.id === storeId);
  const date = document.getElementById('f-date').value;

  document.getElementById('sum-store').textContent = storeData ? storeData.name : `Store ${storeId}`;
  document.getElementById('sum-driver').textContent = driver;
  document.getElementById('sum-date').textContent = new Date(date).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  const dishContainer = document.getElementById('sum-dishes');
  if (payload.rows.length === 0) {
    dishContainer.innerHTML = '<div style="color:var(--mid);font-style:italic;">No dishes entered</div>';
  } else {
    const dishLines = payload.rows.map(row => {
      const parts = [];
      if (row.dish) parts.push(`<strong>${row.dish}</strong>`);
      if (row.added) parts.push(`+${row.added} added`);
      if (row.before) parts.push(`${row.before} before`);
      if (row.removed) parts.push(`−${row.removed} removed`);
      if (row.after && row.after !== '—') parts.push(`→ ${row.after} after`);
      return `<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;">${parts.join(' · ')}</div>`;
    });
    dishContainer.innerHTML = dishLines.join('');
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

  // T-041: Save last submission values for quick recall
  lastSubmission.save();

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
