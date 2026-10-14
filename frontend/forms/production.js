// forms/production.js — the kitchen's per-batch production log. Loads after forms/common.js.

let DISHES   = FALLBACK_DATA.dishes;
let KITCHENS = FALLBACK_DATA.kitchens;

const supervisorPicker = createPeoplePicker({
  selectId: 'f-supervisor',
  customId: 'f-supervisor-custom',
  file:     'supervisors.json',
  key:      'supervisors',
  fallback: ["Anna", "Lucia", "Jiang", "Guy"],
  addLabel: '+ Add new supervisor'
});

// T-041: one-tap recall of the previous submission's supervisor and kitchen
const lastSubmission = createRecall({
  storageKey: 'tk_production_last_submission',
  capture() {
    const snap = supervisorPicker.snapshot();
    return {
      supervisor: supervisorPicker.value(),
      supervisorSelectValue: snap.select,
      supervisorCustomValue: snap.custom,
      kitchen: document.getElementById('f-kitchen').value
    };
  },
  restore(values) {
    supervisorPicker.restore({ select: values.supervisorSelectValue, custom: values.supervisorCustomValue });
    document.getElementById('f-kitchen').value = values.kitchen;
  }
});

/**
 * What one dish still needs, or null. Only the produced count is required outright — the
 * rest stand at zero — but a discard has to say why it was discarded.
 */
function dishProblem(data) {
  if (data.produced === '') {
    return { id: 'modal-produced', message: 'Enter a produced count for this dish. Enter 0 if none were made.' };
  }
  if ((parseInt(data.discarded) || 0) > 0 && !(data.discardReason || '').trim()) {
    return { id: 'modal-discard-reason', message: 'Say why this dish was discarded.' };
  }
  return null;
}

// Per-dish entries survive a reload: a production session can run for hours in the kitchen.
const dishEntry = createDishEntry({
  dishes: () => DISHES,
  fields: [
    { key: 'produced',      id: 'modal-produced' },
    { key: 'discarded',     id: 'modal-discarded' },
    { key: 'discardReason', id: 'modal-discard-reason' }
  ],
  status(data) {
    if (data.produced !== '') return 'complete';
    return (data.discarded !== '' || data.discardReason) ? 'partial' : 'empty';
  },
  validate: dishProblem,
  totals: [
    { key: 'produced',  id: 'total-produced' },
    { key: 'discarded', id: 'total-discarded' }
  ],
  storageKey: 'tk_production_dish_data'
});

// ═══════════════════════════════════════════════════════════════════════════
// Page load
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const data = await loadStoresData();
  DISHES   = activeDishNames(data, DISHES);
  KITCHENS = activeEntries(data, 'kitchens', KITCHENS);
  populateKitchens();
  applyKitchenParam();

  document.getElementById('f-date').value = localDateISO();
  dishEntry.buildList();
  supervisorPicker.load();
  lastSubmission.offerIfRecent();
});

// ─── Production kitchen ───────────────────────────────────
// The sheet's Kitchen column holds the display name, so option values are names, not ids.
function populateKitchens() {
  const select = document.getElementById('f-kitchen');
  while (select.options.length > 1) select.remove(1);
  KITCHENS.forEach(kitchen => {
    const option = document.createElement('option');
    option.value = kitchen.name;
    option.textContent = kitchen.name;
    select.appendChild(option);
  });
}

// The landing page opens this form with ?kitchen=<id>, the way QR codes open the delivery
// form with ?store=<id>. Unknown ids leave the dropdown on "— Select —".
function applyKitchenParam() {
  const id = new URLSearchParams(window.location.search).get('kitchen');
  const kitchen = id && KITCHENS.find(k => k.id === id);
  if (kitchen) document.getElementById('f-kitchen').value = kitchen.name;
}

// ─── Batch cook times ────────────────────────────────────
function timeDiff(t1, t2) {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

function calcBatchCook() {
  const start = document.getElementById('b-cook-start').value;
  const end   = document.getElementById('b-cook-end').value;
  const cell  = document.getElementById('b-cook-time');
  if (start && end) {
    let diff = timeDiff(start, end);
    if (diff < 0) diff += 1440;
    cell.textContent = diff + ' min';
    cell.style.color = diff > 0 ? 'var(--orange)' : 'var(--red)';
  }
}

// ─── Payload ──────────────────────────────────────────────
// One row per dish, keyed to match the Production tab's schema in backend/Schemas.gs.
// One submission id covers the whole batch.
function buildPayload() {
  const submissionId = newSubmissionId();
  const date       = document.getElementById('f-date').value;
  const kitchen    = document.getElementById('f-kitchen').value;
  const supervisor = supervisorPicker.value();

  // Shared batch values
  const cookTemp   = document.getElementById('b-cook-temp').value;
  const cookStart  = document.getElementById('b-cook-start').value;
  const cookEnd    = document.getElementById('b-cook-end').value;
  const cookTime   = document.getElementById('b-cook-time').textContent.replace(' min','').replace('—','');
  const finalTemp  = document.getElementById('b-final-temp').value;

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, kitchen, supervisor,
      dish:          dish,
      qtyProduced:   data.produced || '0',
      qtyDiscarded:  data.discarded || '0',
      discardReason: data.discardReason,
      cookTemp:      cookTemp,
      cookStart:     cookStart,
      cookEnd:       cookEnd,
      cookTime:      cookTime,
      finalTemp:     finalTemp,
      formType:      'production',
      clientTimestamp: new Date().toISOString()
    });
  });
  return rows;
}

// ─── Validation ───────────────────────────────────────────
// Everything the batch record needs. Specs run in page order so the field scrolled to is
// the topmost one outstanding.
function formIsComplete() {
  const missing = missingFields([
    { id: 'f-date',                    label: 'Date' },
    { id: 'f-kitchen',                 label: 'Production Kitchen' },
    { id: supervisorPicker.activeId(), label: 'Head Chef / Supervisor', value: supervisorPicker.value() },
    { id: 'b-cook-temp',               label: 'Cook Temp °F' },
    { id: 'b-cook-start',              label: 'Cook Start' },
    { id: 'b-cook-end',                label: 'Cook End' },
    { id: 'b-final-temp',              label: 'Final Batch Temp °F' }
  ]);
  if (missing.length) {
    reportMissing('Fill these in before submitting:', missing);
    return false;
  }

  const dishes = dishEntry.invalidDishes();
  if (dishes.length) {
    reportMissing('Every dish needs a produced count, 0 included. Still to enter:', dishes);
    return false;
  }
  return true;
}

// ─── Submit ───────────────────────────────────────────────
async function submitForm() {
  if (!formIsComplete()) return;

  showStatus('⏳', 'Submitting…', 'Sending to Google Sheets…');
  document.getElementById('submit-btn').disabled = true;

  const payload = buildPayload();

  if (!GOOGLE_SCRIPT_URL) {
    console.log('DEMO MODE — would send:', payload);
    setTimeout(() => {
      showStatus('⚠️', 'Demo Mode', 'config.js is missing or has no webAppUrl. Locally, run: npm run env:staging');
      showStatusDone();
      document.getElementById('submit-btn').disabled = false;
    }, 700);
    return;
  }

  const wrote = await postToBackend({ rows: payload, formType: 'production' });
  if (wrote.ok) {
    showStatus('✅', 'Submitted!', payload.length + ' dish rows saved. You can close this page.');
    showStatusDone();
    lastSubmission.save();
  } else {
    // The batch is kept locally so nothing is lost, but it does not resend by itself: the
    // kitchen is at a desk and can press submit again, and a silent resend is what put
    // duplicate batches in the sheet.
    localStorage.setItem('tk_prod_backup_' + Date.now(), JSON.stringify(payload));
    showStatus('❌', 'Not Saved',
      `The batch was not recorded and has been kept on this device. Press Submit again when you have a connection. (${wrote.error})`);
    showStatusDone();
    document.getElementById('submit-btn').disabled = false;
  }
}

function clearAll() {
  if (!confirm('Clear all entries on this form?')) return;
  document.querySelectorAll('input:not([type=file]), select, textarea').forEach(el => {
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });

  dishEntry.reset();
  document.querySelectorAll('.' + INVALID_CLASS).forEach(clearMissing);

  // Reset batch display fields
  ['b-cook-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.style.color = 'var(--orange)'; }
  });
  document.getElementById('b-final-temp').style.borderColor = '';
  document.getElementById('b-final-temp').style.background  = '';
  document.getElementById('f-date').value = localDateISO();
}
