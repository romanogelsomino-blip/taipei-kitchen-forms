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
  return data.reason === '__other__' ? data.reasonCustom.trim() : data.reason;
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
    const hasData = data.added !== '' || data.before !== '' || data.removed !== '' || effectiveReason(data);
    if (data.added !== '' && data.before !== '') return 'complete';
    return hasData ? 'partial' : 'empty';
  },
  summary: dishCardSummary,
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
  document.getElementById('f-date').value   = now.toISOString().slice(0,10);
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
      document.getElementById('icon-' + which).textContent = '✅';
      document.getElementById('label-' + which).textContent = 'Photo ready';
    };
    reader.readAsDataURL(file);
  }
}

// ── Payload ────────────────────────────────────────────────
// One row per dish. Keys match DELIVERY_LOG_COLUMNS in backend/Code.gs.
function buildPayload() {
  const date   = document.getElementById('f-date').value;
  const driver = driverPicker.value();
  const arrive = document.getElementById('f-arrive').value;
  const ctTemp    = document.getElementById('f-cooler-temp').value;
  const ctCond    = document.getElementById('f-cooler-cond').value;
  const casePrefill = document.getElementById('f-case-prefill').value;
  const notes  = document.getElementById('f-notes').value;
  const rcvd   = document.getElementById('f-received-by').value;
  const store  = storeId;  // Send only store ID, not full name (dashboard will format it)
  const storeIdClean = storeId;

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      date, driver, store, storeId: storeIdClean, arrive,
      coolerTemp: ctTemp, coolerCond: ctCond,
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
function queueSubmission(payload) {
  const queueKey = 'tk_queue_' + Date.now();
  localStorage.setItem(queueKey, JSON.stringify(payload));
  console.log('[Queue] Saved submission offline:', queueKey);
  return queueKey;
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
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data)
      });
      localStorage.removeItem(item.key);
      console.log('[Queue] Successfully uploaded:', item.key);
    } catch (e) {
      console.log('[Queue] Retry failed:', item.key, e.message);
    }
  }
}

// Auto-retry queued submissions every 30 seconds
setInterval(retryQueuedSubmissions, 30000);

// ─── T-044: Photo Retry Queue ─────────────────────────────
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
  } catch (e) {
    console.error('[Photo Retry] Failed to queue photos:', e);
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
    // Skip if too many attempts (max 10)
    if (item.attempts >= 10) {
      console.log('[Photo Retry] Max attempts reached, dropping:', item.timestamp);
      continue;
    }

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      console.log('[Photo Retry] Successfully uploaded photos from', item.timestamp);
    } catch (e) {
      item.attempts++;
      stillFailed.push(item);
      console.log(`[Photo Retry] Still failing (attempt ${item.attempts}/10):`, item.timestamp);
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

// ─── T-045: Trip Summary Screen ───────────────────────────
function showSummary() {
  const driver = driverPicker.value();
  if (!driver) { alert('Please select a driver before submitting.'); return; }

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
  const driver = driverPicker.value();
  if (!driver) { alert('Please select a driver before submitting.'); return; }

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
    photos:   { storeId: payload.photos.storeId, storeName: payload.photos.storeName,
                date: payload.photos.date, driver: payload.photos.driver }
  };

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(dataPayload)
    });
  } catch(e) {
    // T-007: Queue for retry instead of just backup
    queueSubmission(dataPayload);
    showStatus('❌', 'Offline Mode', 'Submission queued. Will auto-retry when back online (every 30s).');
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
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(photoPayload)
      });
      showStatus('✅', 'All Done!',
        payload.rows.length + ' dish rows saved to Google Sheets for ' +
        (storeData ? storeData.name : 'store ' + storeId) + '. ' +
        `${photoCount} photo${photoCount > 1 ? 's' : ''} uploaded to Google Drive.`);

      // T-044: Clear photo retry queue on success
      clearPhotoRetryQueue();
    } catch(e) {
      // T-044: Queue photos for retry
      queuePhotoRetry(photoPayload);
      showStatus('⚠️', 'Mostly Done',
        'Delivery data saved to Google Sheets ✓. ' +
        `${photoCount} photo${photoCount > 1 ? 's' : ''} queued for retry — will auto-upload when connection improves.`);
    }
  } else {
    showStatus('✅', 'Submitted!',
      payload.rows.length + ' dish rows saved to Google Sheets for ' +
      (storeData ? storeData.name : 'store ' + storeId) + '. No photos attached.');
  }

  // T-041: Save last submission values for quick recall
  lastSubmission.save();

  showStatusDone();
}

function clearAll() {
  if (!confirm('Clear all entries?')) return;
  document.querySelectorAll('input:not([type=file]), select, textarea').forEach(el => el.value = '');
  dishEntry.reset();
  document.getElementById('before-previews').innerHTML = '';
  document.getElementById('after-previews').innerHTML  = '';
  ['before','after'].forEach(w => {
    photoData[w] = null;
    const zone = document.getElementById('zone-' + w);
    zone.classList.remove('has-photo');
    document.getElementById('icon-'  + w).textContent = w === 'before' ? '📸' : '📷';
    document.getElementById('label-' + w).textContent = 'Tap to take photo';
  });
  const now = new Date();
  document.getElementById('f-date').value = now.toISOString().slice(0,10);
}
