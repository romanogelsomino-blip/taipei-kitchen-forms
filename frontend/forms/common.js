// forms/common.js — shared by the production and delivery forms.
//
// Plain script, no modules: the forms are static files on GitHub Pages with no build step.
// Each page loads config.js, env-banner.js, this file, then its own forms/<name>.js.

// ─── Configuration ───────────────────────────────────────────────────────────
// The backend endpoint comes from config.js, generated per environment at build time —
// never hardcoded here. See scripts/write-frontend-config.js.
const GOOGLE_SCRIPT_URL = (window.APP_CONFIG && window.APP_CONFIG.webAppUrl) || null;

// ─── Stores & dishes ─────────────────────────────────────────────────────────
// data/stores.json holds the store and dish lists. Cached in localStorage for an hour so a
// phone on store Wi-Fi is not refetching it at every stop.
async function loadStoresData() {
  const CACHE_KEY = 'tk_stores_data';
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        console.log('[Stores] Loaded from cache (expires in ' + Math.round((CACHE_TTL - (Date.now() - timestamp)) / 60000) + ' min)');
        return data;
      }
    } catch (e) {
      console.warn('[Stores] Cache parse error, fetching fresh data');
    }
  }

  try {
    const response = await fetch('data/stores.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    console.log('[Stores] Fetched from server and cached');
    return data;
  } catch (e) {
    console.warn('[Stores] Could not fetch stores.json. Using fallback hardcoded list. Error:', e.message);
    return null;
  }
}

/** Active dish names in display order, or `fallback` when stores.json was unavailable. */
function activeDishNames(storesData, fallback) {
  if (!storesData || !storesData.dishes) return fallback;
  const names = storesData.dishes
    .filter(d => d.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(d => d.name);
  console.log('[Stores] Loaded ' + names.length + ' active dishes from JSON');
  return names;
}

// ─── People picker ───────────────────────────────────────────────────────────
// A <select> of names from data/<file>, ending in a "+ Add new…" option that reveals a
// free-text input. Drivers on the delivery form, supervisors on the production form.
function createPeoplePicker({ selectId, customId, file, key, fallback, addLabel }) {
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

  async function load() {
    try {
      const response = await fetch('data/' + file);
      const data = await response.json();
      people = data[key] || [];
    } catch (e) {
      console.error('Failed to load ' + key + ':', e);
      people = fallback;
    }
    populate();
  }

  function handleChange() {
    const isCustom = select().value === '__custom__';
    custom().style.display = isCustom ? 'block' : 'none';
    if (isCustom) custom().focus();
    else custom().value = '';
  }

  /** The chosen name: the typed one when "+ Add new" is selected. */
  function value() {
    return select().value === '__custom__' ? custom().value.trim() : select().value;
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

  return { load, handleChange, value, snapshot, restore };
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

// ─── Card + modal dish entry ─────────────────────────────────────────────────
// One card per dish. Tapping a card opens the modal on that dish's fields and Save & Next
// walks down the list. The engine owns the per-dish records, the card list, the progress
// counter and the totals; each form describes its fields and its completeness rule.
//
//   dishes()       current dish name list (changes once stores.json loads)
//   fields         [{ key, id, default }]: record key, modal input id, empty value ('')
//   status(record) 'complete' | 'partial' | 'empty'
//   summary(record) optional card status line when the record has data
//                  (default: "Complete" / "Partial")
//   totals         [{ key, id }]: record key summed into the element with that id
//   storageKey     optional localStorage key; when set, records survive a page reload
//   onOpen()       optional hook after the modal is populated
//   onClear()      optional hook after the modal is cleared
function createDishEntry({ dishes, fields, status, summary, totals = [], storageKey, onOpen, onClear }) {
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
      card.innerHTML = `
      <div class="dish-card-left">
        <div class="dish-card-name">${dish}</div>
        <div class="dish-card-status ${cls}">${text}</div>
      </div>
      <div class="dish-card-icon">${icon}</div>
    `;
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
    setTimeout(() => document.getElementById(fields[0].id).focus(), 300);
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
    const list = dishes();
    records[list[currentIndex]] = readModal();
    persist();
    buildList();
    if (currentIndex < list.length - 1) open(currentIndex + 1);
    else close();
  }

  /** Forget every dish, drop the stored copy, and redraw. */
  function reset() {
    dishes().forEach(dish => { records[dish] = emptyRecord(); });
    if (storageKey) localStorage.removeItem(storageKey);
    buildList();
  }

  return { get, buildList, open, close, clear, saveAndNext, readModal, reset };
}
