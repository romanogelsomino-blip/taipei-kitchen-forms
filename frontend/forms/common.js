// forms/common.js — shared by the production and delivery forms.
//
// Plain script, no modules: the forms are static files on GitHub Pages with no build step.
// Each page loads config.js, env-banner.js, this file, then its own forms/<name>.js.

// ─── Configuration ───────────────────────────────────────────────────────────
// The backend endpoint comes from config.js, generated per environment at build time —
// never hardcoded here. See scripts/write-frontend-config.js.
const GOOGLE_SCRIPT_URL = (window.APP_CONFIG && window.APP_CONFIG.webAppUrl) || null;

// ─── Submissions, dates and temperatures ────────────────────────────────────

const NY_TZ = 'America/New_York';
const TEMP_LIMIT_F = 41;   // HACCP cold-holding limit; the dashboard uses the same number

/**
 * One id for a whole submission: every row of it and, on the delivery form, the photos that
 * follow in a second request. It is how the backend links the photos to the right rows.
 */
function newSubmissionId() {
  const c = window.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;   // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;   // variant
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}

/**
 * Today in New York as `YYYY-MM-DD`. A UTC date would read as tomorrow after 8pm Eastern,
 * which is inside the evening shift, and the backend files each record under this date.
 */
function localDateISO() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: NY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}

/** Colour a temperature input: red above the cold-holding limit, green below it. */
function flagTemp(el) {
  const value = parseFloat(el.value);
  el.style.borderColor = value > TEMP_LIMIT_F ? 'var(--red)' : (value > 0 ? 'var(--green)' : '');
  el.style.background  = value > TEMP_LIMIT_F ? 'var(--red-lt)' : '';
}

// ─── Talking to the backend ──────────────────────────────────────────────────

/**
 * POST a payload and report what the backend said.
 *
 * `Content-Type: text/plain` is load-bearing. It keeps this a "simple request", so the
 * browser sends no preflight; Apps Script does not answer OPTIONS, and a preflighted request
 * fails outright. The web app returns `Access-Control-Allow-Origin: *`, so with `mode: cors`
 * the reply is readable and a submission can be confirmed rather than assumed.
 *
 * Returns { ok, data, error }. Never throws: the caller decides what a failure means.
 */
async function postToBackend(payload) {
  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method:  'POST',
      mode:    'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify(payload)
    });
    if (!response.ok) return { ok: false, error: 'HTTP ' + response.status };

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Apps Script serves an error page for a few minutes after a redeploy.
      return { ok: false, error: 'the server did not answer with JSON' };
    }
    if (data.status !== 'ok') return { ok: false, data: data, error: data.message || 'the server rejected the submission' };
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message || 'no connection' };
  }
}

// ─── Reference lists ─────────────────────────────────────────────────────────
// Kitchens, supervisors, dishes, stores and drivers come from data/<list>.json, one file per
// list, published by the site build from the dashboard's Config tab. They are static files
// on the same host as this page, so they cost what the page cost. An entry is
// { id, name, active, sortOrder } (stores add location); the forms show active ones only.

// Used when a list cannot be fetched: offline past the browser's cache, or a local server
// started from frontend/ where data/ is not reachable. A last resort that only has to let a
// driver log a delivery; the published files are what is current.
const FALLBACK_DATA = {
  kitchens: [
    { id: 'legacy-park', name: 'Legacy Park', active: true, sortOrder: 1 },
    { id: '6112',        name: 'Store 6112',  active: true, sortOrder: 2 },
    { id: 'other',       name: 'Other',       active: true, sortOrder: 3 }
  ],
  supervisors: [
    { id: 'anna',  name: 'Anna',  active: true, sortOrder: 1 },
    { id: 'lucia', name: 'Lucia', active: true, sortOrder: 2 },
    { id: 'jiang', name: 'Jiang', active: true, sortOrder: 3 },
    { id: 'guy',   name: 'Guy',   active: true, sortOrder: 4 }
  ],
  dishes: [
    { id: 'gen-tso',          name: 'General Tso Chicken Bento',  active: true, sortOrder: 1 },
    { id: 'sesame',           name: 'Sesame Chicken Bento',       active: true, sortOrder: 2 },
    { id: 'lo-mein-chicken',  name: 'Bento Chicken Lo Mein',      active: true, sortOrder: 3 },
    { id: 'lo-mein-shrimp',   name: 'Bento Shrimp Lo Mein',       active: true, sortOrder: 4 },
    { id: 'lo-mein-pork',     name: 'Bento Smoked Pork Lo Mein',  active: true, sortOrder: 5 },
    { id: 'sweet-sour',       name: 'Bento Sweet & Sour Chicken', active: true, sortOrder: 6 },
    { id: 'bourbon',          name: 'Bourbon Chicken Bento',      active: true, sortOrder: 7 },
    { id: 'broccoli',         name: 'Broccoli Chicken Bento',     active: true, sortOrder: 8 },
    { id: 'hot-spicy',        name: 'Hot Spicy Chicken Bento',    active: true, sortOrder: 9 },
    { id: 'dumplings',        name: 'Bento Steamed Dumplings',    active: true, sortOrder: 10 },
    { id: 'egg-roll-chicken', name: 'Chicken Egg Roll',           active: true, sortOrder: 11 },
    { id: 'egg-roll-pork',    name: 'Pork Egg Roll',              active: true, sortOrder: 12 },
    { id: 'egg-roll-shrimp',  name: 'Shrimp Egg Roll',            active: true, sortOrder: 13 }
  ],
  stores: [
    { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA',        active: true, sortOrder: 1 },
    { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA',                     active: true, sortOrder: 2 },
    { id: '6112', name: 'Store 6112', location: '255 S Spring Garden St, Carlisle, PA', active: true, sortOrder: 3 },
    { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA',                   active: true, sortOrder: 4 },
    { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA',                    active: true, sortOrder: 5 },
    { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA',                     active: true, sortOrder: 6 },
    { id: '6542', name: 'Store 6542', location: 'Carlisle, PA',                         active: true, sortOrder: 7 },
    { id: '6564', name: 'Store 6564', location: 'Harrisburg (Gayson Rd), PA',           active: true, sortOrder: 8 }
  ],
  drivers: [
    { id: 'owen',           name: 'Owen',           active: true, sortOrder: 1 },
    { id: 'sam-blumenthal', name: 'Sam Blumenthal', active: true, sortOrder: 2 },
    { id: 'andy',           name: 'Andy',           active: true, sortOrder: 3 }
  ]
};

/**
 * The lists a form needs, keyed by name: { kitchens: [...], dishes: [...] }. Fetched in
 * parallel; a list that cannot be fetched falls back to FALLBACK_DATA for that list alone,
 * so one missing file does not take the others down with it.
 */
async function loadReferenceLists(keys) {
  const lists = {};
  await Promise.all(keys.map(async key => {
    try {
      const response = await fetch('data/' + key + '.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data[key])) throw new Error('no ' + key + ' array in the file');
      lists[key] = data[key];
      console.log('[Reference] ' + key + ': ' + data[key].length + ' entries, ' + (data.version || 'no version'));
    } catch (e) {
      console.warn('[Reference] ' + key + '.json unavailable, using the built-in fallback:', e.message);
      lists[key] = FALLBACK_DATA[key] || [];
    }
  }));
  return lists;
}

/** Active entries of one list in display order. */
function activeEntries(lists, key) {
  return ((lists && lists[key]) || [])
    .filter(entry => entry.active)
    .slice()
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

/** Active names of one list in display order: what the pickers and the dish cards show. */
function activeNames(lists, key) {
  return activeEntries(lists, key).map(entry => entry.name);
}

// ─── People picker ───────────────────────────────────────────────────────────
// A <select> of names, ending in a "+ Add new…" option that reveals a free-text input.
// Drivers on the delivery form, supervisors on the production form. A name typed under
// "+ Add new" is recorded as typed; it joins the list only when added on the dashboard.
function createPeoplePicker({ selectId, customId, addLabel }) {
  const select = () => document.getElementById(selectId);
  const custom = () => document.getElementById(customId);
  let people = [];

  function populate() {
    const sel = select();
    while (sel.options.length > 1) sel.remove(1);
    people.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      sel.appendChild(option);
    });
    const other = document.createElement('option');
    other.value = '__custom__';
    other.textContent = addLabel;
    sel.appendChild(other);
  }

  /** Fill the picker from the names the form loaded. */
  function load(names) {
    people = names || [];
    populate();
  }

  function handleChange() {
    const isCustom = select().value === '__custom__';
    custom().style.display = isCustom ? 'block' : 'none';
    if (isCustom) custom().focus();
    else custom().value = '';
  }

  /** The chosen name: the typed one when "+ Add new" is selected, with its spacing normalised so one person cannot become two. */
  function value() {
    return select().value === '__custom__' ? custom().value.replace(/\s+/g, ' ').trim() : select().value;
  }

  /** The control a validation message should point at: the typed input when "+ Add new" is chosen. */
  function activeId() {
    return select().value === '__custom__' ? customId : selectId;
  }

  /** Raw select and custom-input values, for last-submission recall. */
  function snapshot() {
    return { select: select().value, custom: custom().value };
  }

  function restore(snap) {
    select().value = snap.select;
    if (snap.select === '__custom__') {
      custom().style.display = 'block';
      custom().value = snap.custom;
    } else {
      custom().style.display = 'none';
    }
  }

  return { load, handleChange, value, activeId, snapshot, restore };
}

// ─── Last-submission recall ──────────────────────────────────────────────────
// After a successful submit the form remembers a few values (who, where) so the next one
// can restore them with a tap. `capture` returns the values to keep, `restore` applies
// them, and the button is offered for 24 hours.
function createRecall({ storageKey, capture, restore }) {
  function save() {
    localStorage.setItem(storageKey, JSON.stringify({ ...capture(), timestamp: new Date().toISOString() }));
    console.log('[Recall] Saved last submission values');
  }

  function recall() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const lastValues = JSON.parse(saved);
      restore(lastValues);
      console.log('[Recall] Restored last submission from', lastValues.timestamp);

      const btn = document.getElementById('recall-btn');
      const originalText = btn.textContent;
      btn.textContent = '✓ Values Restored';
      btn.style.background = '#27AE60';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = 'var(--green)';
      }, 2000);
    } catch (e) {
      console.error('[Recall] Failed to restore:', e);
    }
  }

  function offerIfRecent() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      const lastValues = JSON.parse(saved);
      const savedDate = new Date(lastValues.timestamp);
      const hoursSince = (new Date() - savedDate) / 1000 / 60 / 60;
      if (hoursSince < 24) {
        document.getElementById('recall-btn').style.display = 'block';
        console.log('[Recall] Last submission available from', savedDate.toLocaleString());
      }
    } catch (e) {
      console.error('[Recall] Failed to check last submission:', e);
    }
  }

  return { save, recall, offerIfRecent };
}

// ─── Status overlay ──────────────────────────────────────────────────────────
function showStatus(icon, title, msg) {
  document.getElementById('s-icon').textContent  = icon;
  document.getElementById('s-title').textContent = title;
  document.getElementById('s-msg').textContent   = msg;
  document.getElementById('status-overlay').classList.add('show');
}

function closeStatus() {
  document.getElementById('status-overlay').classList.remove('show');
}

/** Reveal the overlay's Done button. */
function showStatusDone() {
  document.getElementById('s-btn').style.display = 'block';
}

// ─── Required values ─────────────────────────────────────────────────────────
// Every field on both forms is required except the delivery notes and, inside a dish, the
// counts that stand at zero. A blank one is outlined, the first is scrolled to and focused,
// and one message names them all: a phone in a cooler aisle should not be answering alerts
// one at a time.

const INVALID_CLASS = 'invalid';

/** Drop a control's missing-value outline. */
function clearMissing(el) {
  if (el && el.classList) el.classList.remove(INVALID_CLASS);
}

// Filling anything in clears its outline, so the form quietens as it is completed.
document.addEventListener('input',  e => clearMissing(e.target));
document.addEventListener('change', e => clearMissing(e.target));

/**
 * The labels of every required field still blank, each outlined and the first one focused.
 * A spec is { id, label, value?, when? }: `value` replaces the control's own, for the people
 * pickers and photo zones which hold their value elsewhere; `when` makes the rule conditional.
 * List the specs in page order, so the field scrolled to is the topmost one outstanding.
 */
function missingFields(specs) {
  const labels = [];
  let first = null;
  specs.forEach(spec => {
    const el = document.getElementById(spec.id);
    const value = spec.value !== undefined ? spec.value : (el ? el.value : '');
    if ((spec.when && !spec.when()) || String(value).trim() !== '') { clearMissing(el); return; }
    labels.push(spec.label);
    if (el) { el.classList.add(INVALID_CLASS); if (!first) first = el; }
  });
  if (first) {
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.focus({ preventScroll: true });
  }
  return labels;
}

/** One alert naming everything still outstanding, capped so it stays readable on a phone. */
function reportMissing(intro, items) {
  const shown = items.slice(0, 8);
  const rest  = items.length - shown.length;
  alert(intro + '\n\n• ' + shown.join('\n• ') + (rest > 0 ? '\n• …and ' + rest + ' more' : ''));
}

// ─── Card + modal dish entry ─────────────────────────────────────────────────
// One card per dish. Tapping a card opens the modal on that dish's fields and Save & Next
// walks down the list. The engine owns the per-dish records, the card list, the progress
// counter and the totals; each form describes its fields and its completeness rule.
//
//   dishes()       current dish name list (set once the reference lists load)
//   fields         [{ key, id, default }]: record key, modal input id, empty value ('')
//   status(record) 'complete' | 'partial' | 'empty'
//   validate(record) optional { id, message } naming the first thing the dish still needs,
//                  or null when it is good; Save & Next will not leave a dish that fails it,
//                  and submit re-checks every dish through it
//   summary(record) optional card status line when the record has data
//                  (default: "Complete" / "Partial")
//   totals         [{ key, id }]: record key summed into the element with that id
//   storageKey     optional localStorage key; when set, records survive a page reload
//   onOpen()       optional hook after the modal is populated
//   onClear()      optional hook after the modal is cleared
function createDishEntry({ dishes, fields, status, summary, validate, totals = [], storageKey, onOpen, onClear }) {
  const records = {};
  let currentIndex = -1;

  function emptyRecord() {
    const record = {};
    fields.forEach(f => { record[f.key] = f.default !== undefined ? f.default : ''; });
    return record;
  }

  function get(dish) {
    return records[dish] || emptyRecord();
  }

  function ensureRecords() {
    dishes().forEach(dish => { if (!records[dish]) records[dish] = emptyRecord(); });
  }

  function persist() {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(records));
  }

  if (storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        Object.assign(records, JSON.parse(saved));
        console.log('[Dish Data] Restored from localStorage');
      } catch (e) {
        console.warn('[Dish Data] Could not restore saved data');
      }
    }
  }

  function buildList() {
    ensureRecords();
    const container = document.getElementById('dish-list');
    container.innerHTML = '';

    dishes().forEach((dish, index) => {
      const state = status(records[dish]);
      const icon  = state === 'complete' ? '✓' : (state === 'partial' ? '◐' : '○');
      const cls   = state === 'complete' ? 'complete' : (state === 'partial' ? 'partial' : '');
      const text  = state === 'empty' ? 'Not Started'
                  : summary ? summary(records[dish])
                  : (state === 'complete' ? 'Complete' : 'Partial');

      const card = document.createElement('div');
      card.className = 'dish-card' + (state === 'complete' ? ' completed' : '');
      card.dataset.index = index;
      card.onclick = () => open(index);

      // Built with textContent, never innerHTML: dish names are edited on the dashboard and
      // must render as text whatever they contain.
      const left = document.createElement('div');
      left.className = 'dish-card-left';
      const name = document.createElement('div');
      name.className = 'dish-card-name';
      name.textContent = dish;
      const statusLine = document.createElement('div');
      statusLine.className = 'dish-card-status' + (cls ? ' ' + cls : '');
      statusLine.textContent = text;
      left.append(name, statusLine);
      const iconBox = document.createElement('div');
      iconBox.className = 'dish-card-icon';
      iconBox.textContent = icon;
      card.append(left, iconBox);
      container.appendChild(card);
    });

    updateProgress();
  }

  function updateProgress() {
    const list = dishes();
    const complete = list.filter(dish => status(get(dish)) === 'complete').length;
    document.getElementById('progress-text').textContent = `${complete} of ${list.length} completed`;
    totals.forEach(t => {
      const sum = list.reduce((acc, dish) => acc + (parseInt(get(dish)[t.key]) || 0), 0);
      document.getElementById(t.id).textContent = sum;
    });
  }

  function open(index) {
    currentIndex = index;
    const list = dishes();
    const dish = list[index];
    const record = get(dish);

    document.getElementById('modal-dish-name').textContent = dish;
    document.getElementById('modal-dish-progress').textContent = `Dish ${index + 1} of ${list.length}`;
    fields.forEach(f => { document.getElementById(f.id).value = record[f.key]; });
    if (onOpen) onOpen();

    document.getElementById('save-next-btn').textContent = index === list.length - 1 ? 'Save & Close' : 'Save & Next';
    document.getElementById('dish-modal').classList.add('show');

    // Focus synchronously, inside the tap that opened the modal. Both mobile browsers gate the
    // on-screen keyboard on user activation, so deferring this to a timer leaves the caret in
    // the field with no keypad and the driver tapping the box a second time. `.show` sets
    // display in this same task, so the field is focusable by now; preventScroll keeps the
    // slide-up animation from jumping.
    const first = document.getElementById(fields[0].id);
    first.focus({ preventScroll: true });
    first.select();   // a count already entered is replaced by what is typed, not appended to
  }

  function close() {
    document.getElementById('dish-modal').classList.remove('show');
    currentIndex = -1;
  }

  function clear() {
    if (!confirm('Clear this dish\'s data?')) return;
    const empty = emptyRecord();
    fields.forEach(f => { document.getElementById(f.id).value = empty[f.key]; });
    if (onClear) onClear();
  }

  /** The modal's current field values as a record. */
  function readModal() {
    const record = {};
    fields.forEach(f => { record[f.key] = document.getElementById(f.id).value; });
    return record;
  }

  function saveAndNext() {
    if (currentIndex < 0) return;
    const record = readModal();
    const problem = validate && validate(record);
    if (problem) {
      const el = document.getElementById(problem.id);
      if (el) { el.classList.add(INVALID_CLASS); el.focus(); }
      alert(problem.message);
      return;
    }
    const list = dishes();
    records[list[currentIndex]] = record;
    persist();
    buildList();
    if (currentIndex < list.length - 1) open(currentIndex + 1);
    else close();
  }

  /** Dish names whose record still fails `validate`, in list order. */
  function invalidDishes() {
    return validate ? dishes().filter(dish => validate(get(dish))) : [];
  }

  /** Forget every dish, drop the stored copy, and redraw. */
  function reset() {
    dishes().forEach(dish => { records[dish] = emptyRecord(); });
    if (storageKey) localStorage.removeItem(storageKey);
    buildList();
  }

  return { get, buildList, open, close, clear, saveAndNext, readModal, invalidDishes, reset };
}
