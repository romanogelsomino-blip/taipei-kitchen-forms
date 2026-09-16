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

// ─── Batch cook & cool times ─────────────────────────────
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

function calcBatchCool() {
  const nextAM = document.getElementById('b-cool-next-am').checked;
  const cell   = document.getElementById('b-cool-time');
  if (nextAM) { cell.textContent = 'Overnight'; cell.style.color = 'var(--green)'; return; }
  const start = document.getElementById('b-cool-start').value;
  const end   = document.getElementById('b-cool-end').value;
  if (start && end) {
    let diff = timeDiff(start, end);
    if (diff < 0) diff += 1440;
    cell.textContent = diff + ' min';
    if (diff > 360)      cell.style.color = 'var(--red)';
    else if (diff > 240) cell.style.color = 'var(--orange)';
    else                 cell.style.color = 'var(--green)';
  }
}

function toggleBatchNextAM() {
  const checked = document.getElementById('b-cool-next-am').checked;
  const coolEnd = document.getElementById('b-cool-end');
  coolEnd.disabled = checked;
  coolEnd.style.opacity = checked ? '0.3' : '1';
  if (checked) {
    document.getElementById('b-cool-time').textContent = 'Overnight';
    document.getElementById('b-cool-time').style.color = 'var(--green)';
  } else {
    document.getElementById('b-cool-time').textContent = '—';
    document.getElementById('b-cool-time').style.color = 'var(--orange)';
  }
}

// ─── Payload ──────────────────────────────────────────────
// One row per dish, keyed to match the Production tab's schema in backend/Schemas.gs.
// One submission id covers the whole batch.
function buildPayload() {
  const submissionId = newSubmissionId();
  const date       = document.getElementById('f-date').value;
  const shift      = document.getElementById('f-shift').value;
  const kitchen    = document.getElementById('f-kitchen').value;
  const supervisor = supervisorPicker.value();

  // Shared batch values
  const cookTemp   = document.getElementById('b-cook-temp').value;
  const cookStart  = document.getElementById('b-cook-start').value;
  const cookEnd    = document.getElementById('b-cook-end').value;
  const cookTime   = document.getElementById('b-cook-time').textContent.replace(' min','').replace('—','');
  const coolStart  = document.getElementById('b-cool-start').value;
  const nextAM     = document.getElementById('b-cool-next-am').checked;
  const coolEnd    = nextAM ? 'Next Morning' : document.getElementById('b-cool-end').value;
  const coolTime   = nextAM ? 'Overnight' : document.getElementById('b-cool-time').textContent.replace(' min','').replace('—','');
  const finalTemp  = document.getElementById('b-final-temp').value;

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, shift, kitchen, supervisor,
      dish:          dish,
      qtyProduced:   data.produced || '0',
      qtyDiscarded:  data.discarded || '0',
      discardReason: data.discardReason,
      cookTemp:      cookTemp,
      cookStart:     cookStart,
      cookEnd:       cookEnd,
      cookTime:      cookTime,
      coolStart:     coolStart,
      coolEnd:       coolEnd,
      coolTime:      coolTime,
      finalTemp:     finalTemp,
      formType:      'production',
      clientTimestamp: new Date().toISOString()
    });
  });
  return rows;
}

// ─── Submit ───────────────────────────────────────────────
async function submitForm() {
  const supervisor = supervisorPicker.value();
  const kitchen    = document.getElementById('f-kitchen').value;
  if (!supervisor) { alert('Please select a supervisor before submitting.'); return; }
  if (!kitchen)    { alert('Please select the production kitchen before submitting.'); return; }

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

  try {
    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: payload, formType: 'production' })
    });
    showStatus('✅', 'Submitted!', payload.length + ' dish rows saved to Google Sheets.');
    showStatusDone();

    // T-041: Save last submission values for quick recall
    lastSubmission.save();
  } catch(e) {
    localStorage.setItem('tk_prod_backup_' + Date.now(), JSON.stringify(payload));
    showStatus('❌', 'Connection Error', 'Could not reach Google Sheets. Data saved locally — retry when connected.');
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

  // Reset batch display fields
  ['b-cook-time','b-cool-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '—'; el.style.color = 'var(--orange)'; }
  });
  document.getElementById('b-final-temp').style.borderColor = '';
  document.getElementById('b-final-temp').style.background  = '';
  document.getElementById('b-cool-end').disabled = false;
  document.getElementById('b-cool-end').style.opacity = '1';
  document.getElementById('f-date').value = localDateISO();
}
