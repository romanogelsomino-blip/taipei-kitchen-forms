// forms/production.js — the kitchen's per-batch production log. Loads after forms/common.js.

// ─── Fallback dish list (used when data/stores.json cannot be fetched) ───────
let DISHES = ['General Tso Chicken Bento', 'Sesame Chicken Bento', 'Bento Chicken Lo Mein', 'Bento Shrimp Lo Mein', 'Bento Smoked Pork Lo Mein', 'Bento Sweet & Sour Chicken', 'Bourbon Chicken Bento', 'Broccoli Chicken Bento', 'Hot Spicy Chicken Bento', 'Bento Steamed Dumplings', 'Chicken Egg Roll', 'Pork Egg Roll', 'Shrimp Egg Roll'];

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
    { key: 'discardReason', id: 'modal-discard-reason' },
    { key: 'qa',            id: 'modal-qa', default: 'pass' },
    { key: 'qaNotes',       id: 'modal-qa-notes' },
    { key: 'initials',      id: 'modal-initials' }
  ],
  status(data) {
    if (data.produced && data.initials) return 'complete'; // key fields filled
    return (data.produced || data.discarded || data.qaNotes || data.initials) ? 'partial' : 'empty';
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
  DISHES = activeDishNames(await loadStoresData(), DISHES);

  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  dishEntry.buildList();
  updateBatchId();
  supervisorPicker.load();
  lastSubmission.offerIfRecent();
});

// ─── Batch ID management ─────────────────────────────────
let batchCounter = 1;

function updateBatchId() {
  const date = document.getElementById('f-date').value || new Date().toISOString().slice(0,10);
  const formatted = date.replace(/-/g, '/');
  document.getElementById('batch-id-display').textContent = formatted + '  ·  B' + batchCounter;
}

function changeBatch(dir) {
  batchCounter = Math.max(1, batchCounter + dir);
  updateBatchId();
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

function flagBatchTemp(el) {
  const val = parseFloat(el.value);
  el.style.borderColor = val > 41 ? 'var(--red)' : (val > 0 ? 'var(--green)' : '');
  el.style.background  = val > 41 ? 'var(--red-lt)' : '';
}

// ─── Payload ──────────────────────────────────────────────
// One row per dish. Keys match PRODUCTION_LOG_COLUMNS in backend/Code.gs.
function buildPayload() {
  const date       = document.getElementById('f-date').value;
  const shift      = document.getElementById('f-shift').value;
  const kitchen    = document.getElementById('f-kitchen').value;
  const supervisor = supervisorPicker.value();
  const genNotes   = document.getElementById('f-general-notes').value;
  const qaNotes    = document.getElementById('f-quality-notes').value;

  // Shared batch values
  const batchId    = document.getElementById('batch-id-display').textContent;
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
      date, shift, kitchen, supervisor,
      dish:          dish,
      batch:         batchId,
      cookTemp:      cookTemp,
      cookStart:     cookStart,
      cookEnd:       cookEnd,
      cookTime:      cookTime,
      qtyProduced:   data.produced || '0',
      qtyDiscarded:  data.discarded || '0',
      discardReason: data.discardReason,
      coolStart:     coolStart,
      coolEnd:       coolEnd,
      coolTime:      coolTime,
      finalTemp:     finalTemp,
      qa:            data.qa,
      qaNotes:       data.qaNotes,
      initials:      data.initials,
      generalNotes:  genNotes,
      batchQANotes:  qaNotes,
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
  batchCounter = 1;
  document.getElementById('f-date').value = new Date().toISOString().slice(0,10);
  updateBatchId();
}
