// forms/packaging.js — the driver's per-cooler packaging form, filled at the kitchen before
// the route: one cooler per store, its temperature, and what went in. Loads after
// forms/common.js.

let DISHES = [];        // active dish names, set once the reference lists load
let DISH_ENTRIES = [];  // the same dishes with their System IDs
let STORES = [];        // active store entries, for the intended-store picker
let KITCHENS = [];      // active kitchen entries, for the header

// The kitchen's QR code opens this page with ?kitchen=<System ID>, as the dashboard's
// launcher does. There is no kitchen picker: a code for a kitchen the list does not have, or
// no code at all, is refused.
const params = new URLSearchParams(window.location.search);
const kitchenParam = params.get('kitchen') || '';
let kitchenData = null;      // the kitchen's list entry, set once the lists load
let kitchenUnknown = false;  // nothing to file the rows under
const UNKNOWN_KITCHEN_MESSAGE = kitchenParam
  ? 'This code points at a kitchen that is no longer on the list. Ask the office for a new code.'
  : 'Open this form from the kitchen\'s QR code or from the dashboard.';

const driverPicker = createPeoplePicker({
  selectId: 'f-driver',
  customId: 'f-driver-custom',
  addLabel: '+ Add new driver'
});

/** The reason as the sheet records it: the typed text when "Other (specify)" is chosen, else the option. */
function effectiveDiscardReason(data) {
  return data.discardReason === '__other__' ? (data.discardReasonCustom || '').trim() : data.discardReason;
}

/**
 * What one dish still needs, or null. Only the loaded count is required outright — a dish
 * not in this cooler is 0 — but a discard has to say why.
 */
function dishProblem(data) {
  if (data.loaded === '') {
    return { id: 'modal-loaded', message: 'Enter how many were loaded. Enter 0 if none of this dish went in.' };
  }
  if ((parseInt(data.discarded) || 0) > 0 && !effectiveDiscardReason(data)) {
    return {
      id: data.discardReason === '__other__' ? 'modal-discard-reason-custom' : 'modal-discard-reason',
      message: 'Say why this dish was discarded.'
    };
  }
  return null;
}

/** One-line recap for the card. */
function dishCardSummary(data) {
  const parts = [];
  if (data.loaded !== '')    parts.push(`+${data.loaded} loaded`);
  if (data.discarded !== '' && data.discarded !== '0') parts.push(`−${data.discarded} discarded`);
  return parts.join(' · ');
}

// Entries are not persisted: a cooler is minutes of work, and the next cooler must start clean.
const dishEntry = createDishEntry({
  dishes: () => DISHES,
  fields: [
    { key: 'loaded',              id: 'modal-loaded' },
    { key: 'discarded',           id: 'modal-discarded' },
    { key: 'discardReason',       id: 'modal-discard-reason' },
    { key: 'discardReasonCustom', id: 'modal-discard-reason-custom' }
  ],
  status(data) {
    if (data.loaded !== '') return 'complete';
    return (data.discarded !== '' || effectiveDiscardReason(data)) ? 'partial' : 'empty';
  },
  summary: dishCardSummary,
  validate: dishProblem,
  totals: [
    { key: 'loaded',    id: 'total-loaded' },
    { key: 'discarded', id: 'total-discarded' }
  ],
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
  const lists = await loadReferenceLists(['kitchens', 'stores', 'drivers', 'dishes']);
  KITCHENS     = activeEntries(lists, 'kitchens');
  STORES       = activeEntries(lists, 'stores');
  DISH_ENTRIES = activeEntries(lists, 'dishes');
  DISHES       = DISH_ENTRIES.map(dish => dish.name);

  kitchenData = KITCHENS.find(k => k.id === kitchenParam) || null;
  const header = document.getElementById('kitchen-header');
  if (kitchenData) {
    document.getElementById('kitchen-title').textContent    = kitchenData.name + (kitchenData.location ? ' · ' + kitchenData.location : '');
    document.getElementById('kitchen-location').textContent = 'Pickup — one cooler per store';
    document.title = 'Taipei Kitchen · Packaging · ' + kitchenData.name;
  } else {
    kitchenUnknown = true;
    document.getElementById('kitchen-title').textContent    = 'Unknown kitchen';
    document.getElementById('kitchen-location').textContent = UNKNOWN_KITCHEN_MESSAGE;
    document.getElementById('submit-btn').disabled = true;
  }
  header.style.display = 'block';

  populateStores();
  setNow();
  dishEntry.buildList();
  driverPicker.load(activeNames(lists, 'drivers'));
});

// Option values are the store's System ID; the payload writes its name, System ID and store
// number from the matching entry, the same three the delivery rows carry.
function populateStores() {
  const select = document.getElementById('f-store');
  while (select.options.length > 1) select.remove(1);
  STORES.forEach(store => {
    const option = document.createElement('option');
    option.value = store.id;
    option.textContent = store.location ? store.name + ' · ' + store.location : store.name;
    select.appendChild(option);
  });
}

/** The store entry chosen in the dropdown, or null. */
function selectedStore() {
  const id = document.getElementById('f-store').value;
  return STORES.find(s => s.id === id) || null;
}

/** Today and the current wall-clock time, for a cooler being probed right now. */
function setNow() {
  const now = new Date();
  document.getElementById('f-date').value = localDateISO();
  document.getElementById('f-time').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

// ─── Payload ──────────────────────────────────────────────
// One row per dish, keyed to match the Packaging tab's schema in backend/Schemas.gs. One
// submission id covers the cooler. The cooler's temperature rides on every row.
function buildPayload() {
  const submissionId = newSubmissionId();
  const date   = document.getElementById('f-date').value;
  const time   = document.getElementById('f-time').value;
  const driver = driverPicker.value();
  const coolerTemp = document.getElementById('f-cooler-temp').value;
  const notes  = document.getElementById('f-notes').value;
  const store  = selectedStore();
  const dishSystemIdOf = name => (DISH_ENTRIES.find(d => d.name === name) || {}).id || '';

  const rows = [];
  DISHES.forEach(dish => {
    const data = dishEntry.get(dish);
    rows.push({
      submissionId,
      date, time,
      kitchen:         kitchenData ? kitchenData.name : '',
      kitchenSystemId: kitchenData ? kitchenData.id : '',
      kitchenId:       kitchenData ? kitchenData.kitchenId : '',
      driver,
      store:           store ? store.name : '',
      storeId:         store ? store.storeId : '',
      storeSystemId:   store ? store.id : '',
      dish,
      dishSystemId:    dishSystemIdOf(dish),
      loaded:          data.loaded || '0',
      discarded:       data.discarded || '0',
      discardReason:   effectiveDiscardReason(data),
      coolerTemp,
      notes,
      formType:        'packaging',
      clientTimestamp: new Date().toISOString()
    });
  });
  return rows;
}

// ─── Validation ───────────────────────────────────────────
// Everything a cooler record needs. Notes are the one optional field. Specs run in page order
// so the field scrolled to is the topmost one outstanding.
function formIsComplete() {
  if (kitchenUnknown) {
    alert(UNKNOWN_KITCHEN_MESSAGE);
    return false;
  }
  const missing = missingFields([
    { id: 'f-date',                label: 'Date' },
    { id: driverPicker.activeId(), label: 'Driver', value: driverPicker.value() },
    { id: 'f-time',                label: 'Time' },
    { id: 'f-store',               label: 'Intended Store' },
    { id: 'f-cooler-temp',         label: 'Cooler Temp °F' }
  ]);
  if (missing.length) {
    reportMissing('Fill these in before submitting:', missing);
    return false;
  }

  const dishes = dishEntry.invalidDishes();
  if (dishes.length) {
    reportMissing('Every dish needs a loaded count, 0 included. Still to enter:', dishes);
    return false;
  }
  return true;
}

// ─── Review ───────────────────────────────────────────────
function showSummary() {
  if (!formIsComplete()) return;

  const store = selectedStore();
  const rows = buildPayload();
  document.getElementById('sum-store').textContent  = store ? store.name : '—';
  document.getElementById('sum-temp').textContent   = document.getElementById('f-cooler-temp').value + '°F';
  document.getElementById('sum-driver').textContent = driverPicker.value();

  // Built with textContent, never innerHTML: dish names are edited on the dashboard and must
  // render as text whatever they contain.
  const dishContainer = document.getElementById('sum-dishes');
  dishContainer.textContent = '';
  rows.forEach(row => {
    const line = document.createElement('div');
    line.style.cssText = 'padding:4px 0;border-bottom:1px solid #f0f0f0;';
    const name = document.createElement('strong');
    name.textContent = row.dish;
    line.appendChild(name);
    const parts = [`+${row.loaded} loaded`];
    if (row.discarded !== '0') parts.push(`−${row.discarded} discarded (${row.discardReason})`);
    line.appendChild(document.createTextNode(' · ' + parts.join(' · ')));
    dishContainer.appendChild(line);
  });

  document.getElementById('summary-overlay').classList.add('show');
}

function closeSummary() {
  document.getElementById('summary-overlay').classList.remove('show');
}

function confirmSubmit() {
  closeSummary();
  submitForm();
}

// ─── Submit ───────────────────────────────────────────────
async function submitForm() {
  if (!formIsComplete()) return;

  const nextButton = document.getElementById('s-next-btn');
  nextButton.style.display = 'none';
  showStatus('⏳', 'Submitting…', 'Sending to Google Sheets…');
  document.getElementById('submit-btn').disabled = true;

  const payload = buildPayload();
  const store = selectedStore();

  if (!GOOGLE_SCRIPT_URL) {
    console.log('DEMO MODE — would send:', payload);
    setTimeout(() => {
      showStatus('⚠️', 'Demo Mode', 'config.js is missing or has no webAppUrl. Locally, run: npm run env:staging');
      showStatusDone();
      document.getElementById('submit-btn').disabled = false;
    }, 700);
    return;
  }

  const wrote = await postToBackend({ rows: payload, formType: 'packaging' });
  if (wrote.ok) {
    showStatus('✅', 'Cooler recorded', payload.length + ' dish rows saved for ' + (store ? store.name : 'the store') + '. Load the next cooler, or close this page.');
    nextButton.style.display = 'block';
    showStatusDone();
  } else {
    // Kept locally so nothing is lost, but not resent by itself: the driver is at the kitchen
    // and can press Submit again, and a silent resend is what puts duplicate rows in a sheet.
    localStorage.setItem('tk_packaging_backup_' + Date.now(), JSON.stringify(payload));
    showStatus('❌', 'Not Saved',
      `The cooler was not recorded and has been kept on this device. Press Submit again when you have a connection. (${wrote.error})`);
    showStatusDone();
    document.getElementById('submit-btn').disabled = false;
  }
}

/** The next cooler: same kitchen, same driver, everything else cleared, time set to now. */
function nextCooler() {
  closeStatus();
  document.getElementById('f-store').value = '';
  document.getElementById('f-cooler-temp').value = '';
  document.getElementById('f-notes').value = '';
  dishEntry.reset();
  document.querySelectorAll('.' + INVALID_CLASS).forEach(clearMissing);
  flagTemp(document.getElementById('f-cooler-temp'));
  setNow();
  document.getElementById('submit-btn').disabled = false;
  window.scrollTo(0, 0);
}

function clearAll() {
  if (!confirm('Clear all entries on this form?')) return;
  document.querySelectorAll('input:not([type=file]), select, textarea').forEach(el => { el.value = ''; });
  driverPicker.handleChange();
  dishEntry.reset();
  document.querySelectorAll('.' + INVALID_CLASS).forEach(clearMissing);
  flagTemp(document.getElementById('f-cooler-temp'));
  setNow();
}
