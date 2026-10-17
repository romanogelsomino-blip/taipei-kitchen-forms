// forms/production.js — the kitchen's per-batch production log. Loads after forms/common.js.

let DISHES       = [];   // active dish names, set once the reference lists load
let DISH_ENTRIES = [];   // the same dishes with their System IDs
let KITCHENS     = [];   // active kitchen entries, likewise

const supervisorPicker = createPeoplePicker({
  selectId: 'f-supervisor',
  customId: 'f-supervisor-custom',
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

/** The reason as the sheet records it: the typed text when "Other (specify)" is chosen, else the option. */
function effectiveDiscardReason(data) {
  return data.discardReason === '__other__' ? (data.discardReasonCustom || '').trim() : data.discardReason;
}

/**
 * What one dish still needs, or null. Only the produced count is required outright — the
 * rest stand at zero — but a discard has to say why it was discarded.
 */
function dishProblem(data) {
  if (data.produced === '') {
    return { id: 'modal-produced', message: 'Enter a produced count for this dish. Enter 0 if none were made.' };
  }
  if ((parseInt(data.discarded) || 0) > 0 && !effectiveDiscardReason(data)) {
    return {
      id: data.discardReason === '__other__' ? 'modal-discard-reason-custom' : 'modal-discard-reason',
      message: 'Say why this dish was discarded.'
    };
  }
  return null;
}

// Per-dish entries survive a reload: a production session can run for hours in the kitchen.
const dishEntry = createDishEntry({
  dishes: () => DISHES,
  fields: [
    { key: 'produced',            id: 'modal-produced' },
    { key: 'discarded',           id: 'modal-discarded' },
    { key: 'discardReason',       id: 'modal-discard-reason' },
    { key: 'discardReasonCustom', id: 'modal-discard-reason-custom' }
  ],
  status(data) {
    if (data.produced !== '') return 'complete';
    return (data.discarded !== '' || effectiveDiscardReason(data)) ? 'partial' : 'empty';
  },
  validate: dishProblem,
  totals: [
    { key: 'produced',  id: 'total-produced' },
    { key: 'discarded', id: 'total-discarded' }
  ],
  storageKey: 'tk_production_dish_data',
  onOpen()  { handleDiscardReasonChange(false); },
  onClear() { handleDiscardReasonChange(false); }
});

function handleDiscardReasonChange(focusCustom) {
  const select = document.getElementById('modal-discard-reason');
  const custom = document.getElementById('modal-discard-reason-custom');
  const isOther = select.value === '__other__';
  custom.style.display = isOther ? 'block' : 'none';
  if (!isOther) custom.value = '';
  if (isOther && focusCustom) custom.focus();
}

// ═══════════════════════════════════════════════════════════════════════════
// Page load
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  const lists = await loadReferenceLists(['kitchens', 'supervisors', 'dishes']);
  DISH_ENTRIES = activeEntries(lists, 'dishes');
  DISHES       = DISH_ENTRIES.map(dish => dish.name);
  KITCHENS     = activeEntries(lists, 'kitchens');
  populateKitchens();
  applyKitchenParam();

  document.getElementById('f-date').value = localDateISO();
  dishEntry.buildList();
  supervisorPicker.load(activeNames(lists, 'supervisors'));
  lastSubmission.offerIfRecent();
});

// ─── Production kitchen ───────────────────────────────────
// Option values are the kitchen's System ID; the payload writes its name, System ID and
// Kitchen ID from the matching entry, so the sheet's Production Kitchen column still holds
// the name the dashboard groups on.
function populateKitchens() {
  const select = document.getElementById('f-kitchen');
  while (select.options.length > 1) select.remove(1);
  KITCHENS.forEach(kitchen => {
    const option = document.createElement('option');
    option.value = kitchen.id;
    option.textContent = kitchen.name;
    select.appendChild(option);
  });
}

/** The kitchen entry chosen in the dropdown, or null. */
function selectedKitchen() {
  const id = document.getElementById('f-kitchen').value;
  return KITCHENS.find(k => k.id === id) || null;
}

// The landing page opens this form with ?kitchen=<System ID>, the way QR codes open the
// delivery form with ?store=<store number>. Unknown ids leave the dropdown on "— Select —".
function applyKitchenParam() {
  const id = new URLSearchParams(window.location.search).get('kitchen');
  if (id && KITCHENS.some(k => k.id === id)) document.getElementById('f-kitchen').value = id;
}

// ─── Batch cook times ────────────────────────────────────
function timeDiff(t1, t2) {
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

/** Minutes as the cell shows them: "45 min" up to an hour, "5h 00m" beyond it. */
function formatCookTime(minutes) {
  if (minutes < 60) return minutes + ' min';
  return Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm';
}

// The cell shows a readable duration; the minute count the sheet stores rides on
// data-minutes, so the display format and the stored value never have to agree.
function calcBatchCook() {
  const start = document.getElementById('b-cook-start').value;
  const end   = document.getElementById('b-cook-end').value;
  const cell  = document.getElementById('b-cook-time');
  if (start && end) {
    let diff = timeDiff(start, end);
    if (diff < 0) diff += 1440;
    cell.dataset.minutes = diff;
    cell.textContent = formatCookTime(diff);
    cell.style.color = diff > 0 ? 'var(--orange)' : 'var(--red)';
  }
}

// ─── Payload ──────────────────────────────────────────────
// One row per dish, keyed to match the Production tab's schema in backend/Schemas.gs.
// One submission id covers the whole batch.
function buildPayload() {
  const submissionId = newSubmissionId();
  const date       = document.getElementById('f-date').value;
  const chosen     = selectedKitchen();
  const kitchen    = chosen ? chosen.name : '';
  const supervisor = supervisorPicker.value();

  // Shared batch values
  const cookTemp   = document.getElementById('b-cook-temp').value;
  const cookStart  = document.getElementById('b-cook-start').value;
  const cookEnd    = document.getElementById('b-cook-end').value;
  const cookTime   = document.getElementById('b-cook-time').dataset.minutes || '';
  const dishSystemIdOf = name => (DISH_ENTRIES.find(d => d.name === name) || {}).id || '';

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, kitchen, supervisor,
      kitchenSystemId: chosen ? chosen.id : '',
      kitchenId:       chosen ? chosen.kitchenId : '',
      dish:          dish,
      dishSystemId:  dishSystemIdOf(dish),
      qtyProduced:   data.produced || '0',
      qtyDiscarded:  data.discarded || '0',
      discardReason: effectiveDiscardReason(data),
      cookTemp:      cookTemp,
      cookStart:     cookStart,
      cookEnd:       cookEnd,
      cookTime:      cookTime,
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
    { id: 'b-cook-end',                label: 'Cook End' }
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

  // Reset the cook time display and the minutes it carries
  const cookTime = document.getElementById('b-cook-time');
  cookTime.textContent = '—';
  cookTime.style.color = 'var(--orange)';
  delete cookTime.dataset.minutes;
  document.getElementById('f-date').value = localDateISO();
}
