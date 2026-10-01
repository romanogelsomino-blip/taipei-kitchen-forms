// Taipei Kitchen Dashboard — Client-Side Application
//
// Sentry was removed 2026-09-02. Its DSN pointed at a project on the former
// contractor's account, so nobody here could read the error stream — it looked like
// coverage without being coverage. If JS error tracking is wanted again, create a
// project on an account we control and re-add it deliberately.

// ═══════════════════════════════════════════════════════════════════════════
// Configuration & State
// ═══════════════════════════════════════════════════════════════════════════

let CONFIG = { webAppUrl: null };
let DATA = {
  deliveries: [],
  production: [],
  waste: [],
  stores: [],
  violations: [],
  window: null,
  lastUpdated: null
};

// The dashboard asks the backend for a date window rather than the whole store. The backend
// reads one spreadsheet per month and caps a request at six of them.
const TEMP_LIMIT_F = 41;   // regulatory cold-holding limit; matches the backend and the forms
const WINDOW_MAX_MONTHS = 6;
let REQUESTED_FROM = null;
let REFRESH_INTERVAL = null;
// Submissions arrive a few dozen times a day, and the Refresh button is instant, so polling
// is a safety net rather than a live feed. It stops entirely while the tab is in the
// background: an unattended tab used to poll all night for nobody.
const POLL_INTERVAL_MS = 15 * 60 * 1000;
let LAST_FETCH_AT = 0;
const DEMO_MODE = true; // Enable demo data for local development

// ═══════════════════════════════════════════════════════════════════════════
// Date Normalization Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Any date the API sends as `YYYY-MM-DD`. A leading calendar date is taken as written, which
 * is what the backend means by it; parsing one into a Date would read it as UTC midnight and
 * land on the day before in New York.
 */
function normalizeDate(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const leading = dateInput.match(/^(\d{4}-\d{2}-\d{2})/);
    if (leading) return leading[1];
  }
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    return isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-CA');
  } catch {
    return '';
  }
}

/** Today in New York as `YYYY-MM-DD`. The kitchens and stores are all in that zone. */
function getTodayDate() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  return part('year') + '-' + part('month') + '-' + part('day');
}

/** `YYYY-MM-DD` shifted by whole days. Calendar arithmetic, no time zone involved. */
function addDaysISO(iso, days) {
  const date = new Date(iso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month `iso` falls in. */
function firstOfMonthISO(iso) {
  return iso.slice(0, 7) + '-01';
}

/** First day of the month `months` before the one `iso` falls in. */
function monthsBackISO(iso, months) {
  const [year, month] = iso.slice(0, 7).split('-').map(Number);
  const index = year * 12 + (month - 1) - months;
  return Math.floor(index / 12) + '-' + String((index % 12) + 1).padStart(2, '0') + '-01';
}

/** A `YYYY-MM-DD` as a local Date at midday, for day-of-week and label formatting only. */
function localDate(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Select Dropdown Component
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a multi-select dropdown component
 * @param {string} containerId - ID of the container element
 * @param {Array} options - Array of {value, label} objects
 * @param {string} placeholder - Placeholder text
 * @param {Function} onChange - Callback when selection changes
 * @returns {Object} - Component instance with getValue() method
 */
function createMultiSelect(containerId, options, placeholder, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  const id = `ms-${Math.random().toString(36).substr(2, 9)}`;
  const selectedValues = new Set();

  // Build HTML
  container.innerHTML = `
    <div class="multiselect">
      <div class="multiselect-button" id="${id}-button">
        <span id="${id}-text" class="placeholder">${placeholder}</span>
        <span class="multiselect-arrow">▼</span>
      </div>
      <div class="multiselect-dropdown" id="${id}-dropdown"></div>
    </div>
  `;

  const button = document.getElementById(`${id}-button`);
  const dropdown = document.getElementById(`${id}-dropdown`);
  const textEl = document.getElementById(`${id}-text`);

  // Populate options
  dropdown.innerHTML = options.map(opt => `
    <div class="multiselect-option">
      <input type="checkbox" id="${id}-opt-${opt.value}" value="${opt.value}">
      <label for="${id}-opt-${opt.value}">${opt.label}</label>
    </div>
  `).join('');

  // Toggle dropdown
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    // Close all other multi-selects
    document.querySelectorAll('.multiselect-dropdown.open').forEach(el => {
      el.classList.remove('open');
      el.previousElementSibling.classList.remove('open');
    });
    if (!isOpen) {
      dropdown.classList.add('open');
      button.classList.add('open');
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      dropdown.classList.remove('open');
      button.classList.remove('open');
    }
  });

  // Handle checkbox changes
  dropdown.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedValues.add(checkbox.value);
      } else {
        selectedValues.delete(checkbox.value);
      }
      updateButtonText();
      if (onChange) onChange(Array.from(selectedValues));
    });
  });

  function updateButtonText() {
    const count = selectedValues.size;
    if (count === 0) {
      textEl.innerHTML = `<span class="placeholder">${placeholder}</span>`;
    } else if (count === 1) {
      const selected = options.find(o => o.value === Array.from(selectedValues)[0]);
      textEl.innerHTML = selected ? selected.label : `${count} selected`;
    } else {
      textEl.innerHTML = `<span class="selected-count">${count} selected</span>`;
    }
  }

  return {
    getValue: () => Array.from(selectedValues),
    setValue: (values) => {
      selectedValues.clear();
      dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      values.forEach(val => {
        selectedValues.add(val);
        const cb = dropdown.querySelector(`input[value="${val}"]`);
        if (cb) cb.checked = true;
      });
      updateButtonText();
    },
    clear: () => {
      selectedValues.clear();
      dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      updateButtonText();
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  setupNavigation();
  loadHomeLocations();
  updateCurrentDate();

  // Check if we should use demo data or real API
  if (CONFIG.webAppUrl && CONFIG.webAppUrl !== 'DEMO_MODE') {
    // Production mode: fetch from real Google Apps Script
    await fetchData();
    startAutoRefresh();
    watchTabVisibility();
  } else {
    // Demo mode: use mock data for local development
    loadDemoData();
    updateStatus('demo', 'Demo Mode (sample data)');
    renderProduction();
    renderDeliveries();
    renderFoodSafety();
  }
});

// Update current date/time in header
function updateCurrentDate() {
  const now = new Date();
  const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);
  // Update every minute
  setInterval(() => {
    const now = new Date();
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);
  }, 60000);
}

// Read config.js, generated per environment at build time (see
// scripts/write-frontend-config.js). Loaded by a <script> tag ahead of this file, so it is
// already on window — no fetch, nothing to fail over the network.
function loadConfig() {
  if (window.APP_CONFIG && window.APP_CONFIG.webAppUrl) {
    CONFIG = window.APP_CONFIG;
    console.log('[Config] Loaded:', CONFIG);
    return;
  }
  console.warn('[Config] config.js missing or has no webAppUrl');
  // Without a backend the dashboard falls back to sample data further down, and the panels
  // must survive to show it. Replacing them with instructions is only right when it cannot.
  if (!DEMO_MODE) {
    updateStatus('error', 'Config file missing');
    showConfigInstructions();
  }
}

function showConfigInstructions() {
  document.getElementById('panel-home').innerHTML = `
    <div style="padding:40px;text-align:center;background:var(--red-lt);border:2px solid var(--red);border-radius:12px;margin:20px;">
      <h2 style="font-family:'Syne',sans-serif;color:var(--red);margin-bottom:16px;">Configuration Required</h2>
      <p style="font-size:0.95rem;color:var(--mid);margin-bottom:20px;">
        <code style="background:#fff;padding:2px 6px;border-radius:3px;font-family:'DM Mono',monospace;">frontend/config.js</code> is missing. It is generated per environment, never committed — run:
      </p>
      <pre style="background:var(--dark);color:#0f0;padding:20px;border-radius:8px;text-align:left;font-family:'DM Mono',monospace;font-size:0.85rem;overflow-x:auto;">npm run env:staging      # or env:production</pre>
      <p style="font-size:0.85rem;color:var(--soft);margin-top:16px;">
        Then refresh this page. <br>
        If you are seeing this on a deployed site, the deploy workflow failed to write it.
      </p>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
// Demo Data (for local development)
// ═══════════════════════════════════════════════════════════════════════════

function loadDemoData() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  DATA = {
    stores: [
      { id: '6006', name: 'Store 6006', location: 'Lancaster, PA' },
      { id: '6061', name: 'Store 6061', location: 'York, PA' },
      { id: '6253', name: 'Store 6253', location: 'Harrisburg, PA' },
      { id: '6331', name: 'Store 6331', location: 'Camp Hill, PA' },
      { id: '6443', name: 'Store 6443', location: 'Mechanicsburg, PA' },
      { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
      { id: '6564', name: 'Store 6564', location: 'Hershey, PA' }
    ],
    deliveries: [
      { submittedAt: `${today}T08:32:15.000Z`, date: today, driver: 'Owen', store: '6006', arrivalTime: '08:30', coolerTemp: 38, dish: 'Spring Roll (Veg)', qtyAdded: 24, removed: 2, reason: 'Out of date', receivedBy: 'Amanda' },
      { submittedAt: `${today}T09:15:42.000Z`, date: today, driver: 'Owen', store: '6061', arrivalTime: '09:10', coolerTemp: 39, dish: 'Shrimp Egg Roll', qtyAdded: 30, removed: 0, reason: '', receivedBy: 'Michael' },
      { submittedAt: `${today}T09:48:20.000Z`, date: today, driver: 'Owen', store: '6253', arrivalTime: '09:45', coolerTemp: 37, dish: 'Chicken Lo Mein', qtyAdded: 18, removed: 1, reason: 'Damaged', receivedBy: 'Sarah' },
      { submittedAt: `${today}T10:25:33.000Z`, date: today, driver: 'Andy', store: '6331', arrivalTime: '10:20', coolerTemp: 40, dish: 'Spring Roll (Veg)', qtyAdded: 20, removed: 0, reason: '', receivedBy: 'James' },
      { submittedAt: `${today}T11:05:18.000Z`, date: today, driver: 'Andy', store: '6443', arrivalTime: '11:00', coolerTemp: 42, dish: 'Beef Chow Fun', qtyAdded: 15, removed: 3, reason: 'Quality Issue', receivedBy: 'Lisa', violation: true },
      { submittedAt: `${yesterday}T08:45:22.000Z`, date: yesterday, driver: 'Sam Blumenthal', store: '6542', arrivalTime: '08:40', coolerTemp: 38, dish: 'Pork Dumpling', qtyAdded: 28, removed: 1, reason: 'Out of date', receivedBy: 'Tom' },
      { submittedAt: `${yesterday}T09:20:55.000Z`, date: yesterday, driver: 'Sam Blumenthal', store: '6564', arrivalTime: '09:15', coolerTemp: 39, dish: 'Spring Roll (Veg)', qtyAdded: 25, removed: 0, reason: '', receivedBy: 'Emily' }
    ],
    production: [
      { submittedAt: `${today}T06:15:33.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Lucia', dish: 'Spring Roll (Veg)', qtyProduced: 120, qtyDiscarded: 2, discardReason: 'Quality Issue' },
      { submittedAt: `${today}T06:45:10.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Lucia', dish: 'Shrimp Egg Roll', qtyProduced: 96, qtyDiscarded: 0, discardReason: '' },
      { submittedAt: `${today}T07:20:47.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Anna', dish: 'Chicken Lo Mein', qtyProduced: 48, qtyDiscarded: 1, discardReason: 'Temperature' },
      { submittedAt: `${yesterday}T06:30:12.000Z`, date: yesterday, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Jiang', dish: 'Beef Chow Fun', qtyProduced: 36, qtyDiscarded: 0, discardReason: '' },
      { submittedAt: `${yesterday}T07:05:28.000Z`, date: yesterday, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Jiang', dish: 'Pork Dumpling', qtyProduced: 72, qtyDiscarded: 1, discardReason: 'Out of date' }
    ],
    waste: [
      { date: today, store: '6006', dish: 'Spring Roll (Veg)', removed: 2, qtyRemoved: 2, reason: 'Out of date' },
      { date: today, store: '6253', dish: 'Chicken Lo Mein', removed: 1, qtyRemoved: 1, reason: 'Damaged' },
      { date: today, store: '6443', dish: 'Beef Chow Fun', removed: 3, qtyRemoved: 3, reason: 'Quality Issue' },
      { date: yesterday, store: '6542', dish: 'Pork Dumpling', removed: 1, qtyRemoved: 1, reason: 'Out of date' }
    ],
    lastUpdated: new Date().toISOString()
  };

  console.log('[Demo] Loaded sample data:', DATA);
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Fetching (T-049 integration)
// ═══════════════════════════════════════════════════════════════════════════

/** The window loaded by default: the month containing today minus 30 days, through today. */
function defaultWindow() {
  const to = getTodayDate();
  return { from: firstOfMonthISO(addDaysISO(to, -30)), to: to };
}

/** The earliest `from` the backend will serve in one request. */
function earliestWindowFrom() {
  return monthsBackISO(getTodayDate(), WINDOW_MAX_MONTHS - 1);
}

/**
 * Widen the loaded window when a panel asks for dates before it. Narrowing never refetches:
 * the data is already in hand and filtering it is instant.
 */
async function ensureWindow(from) {
  if (!from || !CONFIG.webAppUrl) return;
  if (REQUESTED_FROM && from >= REQUESTED_FROM) return;
  const earliest = earliestWindowFrom();
  await fetchData({ from: from < earliest ? earliest : from, to: getTodayDate() });
}

/** `Updated 10:32`, plus the window once the backend reports which one it served. */
function statusText() {
  const at = new Date(DATA.lastUpdated || Date.now()).toLocaleTimeString();
  const win = DATA.window;
  if (!win || !win.from || !win.to) return `Updated ${at}`;
  const label = iso => localDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `Updated ${at} · ${label(win.from)} – ${label(win.to)}`;
}

async function fetchData(opts) {
  if (!CONFIG.webAppUrl) return;

  const win = (opts && opts.from) ? { from: opts.from, to: opts.to || getTodayDate() }
            : REQUESTED_FROM ? { from: REQUESTED_FROM, to: getTodayDate() }
            : defaultWindow();
  REQUESTED_FROM = win.from;

  updateStatus('loading', 'Fetching data...');

  try {
    const url = `${CONFIG.webAppUrl}?from=${encodeURIComponent(win.from)}&to=${encodeURIComponent(win.to)}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.status === 'error') throw new Error(data.message || 'backend returned an error');

    // Merge properties instead of replacing to preserve violations array
    DATA.deliveries = data.deliveries || [];
    DATA.production = data.production || [];
    DATA.waste = data.waste || [];
    DATA.stores = data.stores || [];
    DATA.window = data.window || null;   // absent until the backend serves windows
    DATA.lastUpdated = data.lastUpdated || null;
    LAST_FETCH_AT = Date.now();

    console.log('[Data] Fetched:', DATA);

    // Fetch violations tracker data (await to prevent race condition)
    await fetchViolations(win);

    updateStatus('connected', statusText());

    // Production precedes delivery: food is cooked before it is delivered.
    renderProduction();
    renderDeliveries();
    renderFoodSafety();
  } catch (e) {
    console.error('[Data] Fetch failed:', e);
    updateStatus('error', `Fetch failed: ${e.message}`);
  }
}

// Fetch violations from tracker
async function fetchViolations(win) {
  if (!CONFIG.webAppUrl) {
    DATA.violations = [];
    return;
  }

  try {
    const range = win || defaultWindow();
    const url = `${CONFIG.webAppUrl}?action=getViolations&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.status === 'ok') {
      DATA.violations = data.violations || [];
      console.log('[Violations] Fetched:', DATA.violations.length);
    } else {
      console.warn('[Violations] API returned non-ok status:', {
        status: data.status,
        message: data.message || 'No message',
        response: data
      });
      DATA.violations = [];
    }
  } catch (e) {
    console.warn('[Violations] Endpoint not available or fetch failed (this is okay if endpoint not deployed):', e.message);
    DATA.violations = [];
  }
}

// T-055: Auto-refresh polling at 10s
function startAutoRefresh() {
  stopAutoRefresh();
  REFRESH_INTERVAL = setInterval(() => { fetchData(); }, POLL_INTERVAL_MS);
  console.log(`[Polling] every ${POLL_INTERVAL_MS / 60000} min while the tab is visible`);
}

function stopAutoRefresh() {
  if (REFRESH_INTERVAL) clearInterval(REFRESH_INTERVAL);
  REFRESH_INTERVAL = null;
}

/**
 * Poll only a tab someone is looking at. Returning to a tab that has gone stale refreshes
 * once straight away, so what is on screen is never older than the moment it was looked at.
 */
function watchTabVisibility() {
  document.addEventListener('visibilitychange', () => {
    if (!CONFIG.webAppUrl) return;
    if (document.hidden) {
      stopAutoRefresh();
      console.log('[Polling] paused, tab hidden');
      return;
    }
    if (Date.now() - LAST_FETCH_AT >= POLL_INTERVAL_MS) fetchData();
    startAutoRefresh();
  });
}

function updateStatus(state, message) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  dot.className = 'status-dot';
  text.className = 'status-text';

  if (state === 'connected') {
    dot.classList.add('connected');
    text.classList.add('connected');
  } else if (state === 'error') {
    dot.classList.add('error');
    text.classList.add('error');
  } else if (state === 'demo') {
    dot.classList.add('demo');
    text.classList.add('demo');
  }
  text.textContent = message;
}

// ═══════════════════════════════════════════════════════════════════════════
// Navigation
// ═══════════════════════════════════════════════════════════════════════════

function setupNavigation() {
  // Setup desktop nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = link.dataset.panel;
      showPanel(panel);
    });
  });

  // Setup mobile nav links
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = link.dataset.panel;
      showPanel(panel);
    });
  });
}

function showPanel(panelName) {
  // Update desktop nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.panel === panelName);
  });

  // Update mobile nav links
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.panel === panelName);
  });

  // Update panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });

  // Render panel-specific content
  if (panelName === 'shrink') {
    populateShrinkFilters(); // Populate filter dropdowns
    renderShrinkDashboard();
  }

  // Scroll to top on mobile when switching panels
  if (window.innerWidth <= 768) {
    window.scrollTo(0, 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Home panel: form launchers
// ═══════════════════════════════════════════════════════════════════════════
// One launcher per form so the two cannot be confused. A kitchen opens the production
// log with ?kitchen=<id>; a store opens the delivery form with ?store=<id>. The lists come
// from data/stores.json, the same file the forms read.

const HOME_FORMS = {
  production: { page: '../taipei_production_form3.html', param: 'kitchen', selectId: 'home-kitchen', buttonId: 'home-open-production', label: 'Open Production Log', prompt: 'Select a kitchen' },
  delivery:   { page: '../taipei_delivery_form3.html',   param: 'store',   selectId: 'home-store',   buttonId: 'home-open-delivery',   label: 'Open Delivery Form',   prompt: 'Select a store',   qrLabel: 'Store QR code',   qrCaption: 'Delivery Form' }
};

async function loadHomeLocations() {
  const status = document.getElementById('home-locations-status');
  try {
    const response = await fetch('../data/stores.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const kitchens = (data.kitchens || []).filter(k => k.active);
    const stores = (data.stores || []).filter(s => s.active);
    const storeText = s => s.location ? `${s.name} · ${s.location}` : s.name;

    fillHomeSelect('home-kitchen', kitchens, k => k.name);
    fillHomeSelect('home-store', stores, storeText);
    fillHomeSelect('home-qr-store', stores, storeText);
    status.textContent = '';
  } catch (e) {
    console.error('[Home] Could not load data/stores.json:', e);
    status.textContent = 'The kitchen and store lists could not be loaded. Reload to try again.';
  }
  homeUpdateLaunchers();
  homeQrUpdate();
}

function fillHomeSelect(id, entries, text) {
  const select = document.getElementById(id);
  while (select.options.length > 1) select.remove(1);
  entries.forEach(entry => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = text(entry);
    select.appendChild(option);
  });
}

/** Where a launcher will go, or null while nothing is selected. */
function homeTarget(kind) {
  const form = HOME_FORMS[kind];
  const id = document.getElementById(form.selectId).value;
  return id ? `${form.page}?${form.param}=${encodeURIComponent(id)}` : null;
}

function homeUpdateLaunchers() {
  Object.keys(HOME_FORMS).forEach(kind => {
    const form = HOME_FORMS[kind];
    const ready = homeTarget(kind) !== null;

    const button = document.getElementById(form.buttonId);
    button.disabled = !ready;
    button.textContent = ready ? form.label : form.prompt;

  });
}

/** The QR card carries its own store picker, so it does not depend on a choice made above. */
function homeQrUpdate() {
  const chosen = document.getElementById('home-qr-store').value;
  const button = document.getElementById('home-qr-generate');
  button.disabled = !chosen;
  button.textContent = chosen ? 'Generate QR code' : 'Select a store';
}

/**
 * The absolute address a QR code has to carry. `homeTarget` is relative to this page, which
 * is what a link needs and what a phone camera cannot use. Resolving against the current
 * location also means a code generated on the staging dashboard points at the staging form.
 */
function homeQrUrl(storeId) {
  const form = HOME_FORMS.delivery;
  const target = `${form.page}?${form.param}=${encodeURIComponent(storeId)}`;
  return new URL(target, window.location.href).href;
}

/** Draw the QR for the chosen location, at a size worth printing. */
function homeGenerateQr() {
  const status = document.getElementById('home-qr-status');
  const output = document.getElementById('home-qr-output');
  const select = document.getElementById('home-qr-store');
  if (!select.value) return;
  const url = homeQrUrl(select.value);

  if (typeof qrcode !== 'function') {
    output.hidden = true;
    status.textContent = 'The QR code library could not be loaded. Check the connection and reload.';
    return;
  }

  const code = qrcode(0, 'M');   // smallest symbol that fits, medium error correction
  code.addData(url);
  code.make();

  const modules = code.getModuleCount();
  const scale = 12;              // large enough that a printed code scans from a metre away
  const quiet = 4;               // the quiet zone the spec requires around the symbol
  const size = (modules + quiet * 2) * scale;

  const canvas = document.getElementById('home-qr-canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1C1C1C';
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (code.isDark(row, col)) {
        ctx.fillRect((col + quiet) * scale, (row + quiet) * scale, scale, scale);
      }
    }
  }

  document.getElementById('home-qr-label').textContent =
    'Delivery Form — ' + select.options[select.selectedIndex].textContent;
  document.getElementById('home-qr-url').textContent = url;

  const download = document.getElementById('home-qr-download');
  download.href = canvas.toDataURL('image/png');
  download.download = 'taipei-delivery-' + select.value + '.png';

  output.hidden = false;
  status.textContent = '';
}

/** Print the code on its own page, captioned, so it can go straight on a wall. */
function homePrintQr() {
  const canvas = document.getElementById('home-qr-canvas');
  const label = document.getElementById('home-qr-label').textContent;
  const url = document.getElementById('home-qr-url').textContent;
  const sheet = window.open('', '_blank', 'width=700,height=800');
  if (!sheet) {
    document.getElementById('home-qr-status').textContent =
      'The print window was blocked. Download the PNG and print that instead.';
    return;
  }
  sheet.document.write(
    '<title>' + label + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;text-align:center;padding:40px}' +
    'img{width:380px;height:380px}h1{font-size:1.2rem;margin:20px 0 6px}' +
    'p{font-size:0.7rem;color:#555;word-break:break-all;margin:0 auto;max-width:60ch}</style>' +
    '<img src="' + canvas.toDataURL('image/png') + '">' +
    '<h1>' + label + '</h1><p>' + url + '</p>'
  );
  sheet.document.close();
  sheet.focus();
  sheet.print();
}

function homeOpen(kind) {
  const url = homeTarget(kind);
  if (url) window.location.href = url;
}

// ═══════════════════════════════════════════════════════════════════════════
// T-051: Overview Panel
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Whether a delivery row breached the cold-holding limit on either temperature it records.
 * The limit matches TEMP_LIMIT_F in the backend and the forms; all three must agree.
 */
function hasTemperatureViolation(delivery) {
  return [delivery.coolerTemp, delivery.arrivalTemp]
    .some(value => parseFloat(value) > TEMP_LIMIT_F);
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW HIGH-VALUE WIDGETS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// T-053: Daily Reconciliation Panel
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// T-054: Weekly Food Safety Summary Panel
// ═══════════════════════════════════════════════════════════════════════════

function loadFoodSafety() {
  const weekEnd = document.getElementById('safety-week-end').value;
  if (!weekEnd) return;

  const weekStart = addDaysISO(weekEnd, -6);
  ensureWindow(weekStart);

  const weekDeliveries = DATA.deliveries.filter(d => {
    const date = normalizeDate(d.date);
    return date >= weekStart && date <= weekEnd;
  });

  // Group by store
  const storeViolations = {};
  weekDeliveries.forEach(d => {
    if (!storeViolations[d.store]) {
      storeViolations[d.store] = { coolerViolations: 0, deliveryTempViolations: 0 };
    }
    if (hasTemperatureViolation(d)) {
      storeViolations[d.store].coolerViolations++;
      // Note: deliveryTempViolations deprecated (arrivalTemp no longer tracked)
    }
  });

  const container = document.getElementById('safety-summary');
  if (Object.keys(storeViolations).length === 0) {
    container.innerHTML = '<div class="loading">No data for this week</div>';
    return;
  }

  container.innerHTML = Object.entries(storeViolations).map(([storeId, violations]) => {
    const storeName = DATA.stores.find(s => s.id === storeId)?.name || `Store ${storeId}`;
    const totalViolations = violations.coolerViolations + violations.deliveryTempViolations;
    const countClass = totalViolations === 0 ? 'zero' : '';
    const clickableClass = totalViolations === 0 ? '' : 'clickable';

    return `
      <div class="safety-store-card">
        <div class="safety-store-name">${storeName}</div>
        <div class="safety-violations">
          <div>
            <div class="violation-count ${countClass} ${clickableClass}"
                 onclick="${violations.coolerViolations > 0 ? `openViolationModal('${storeId}', 'cooler', '${weekStart}', '${weekEnd}')` : ''}">
              ${violations.coolerViolations}
            </div>
            <div class="violation-label">Cooler Temp Violations</div>
          </div>
          <div>
            <div class="violation-count ${countClass} ${clickableClass}"
                 onclick="${violations.deliveryTempViolations > 0 ? `openViolationModal('${storeId}', 'delivery', '${weekStart}', '${weekEnd}')` : ''}">
              ${violations.deliveryTempViolations}
            </div>
            <div class="violation-label">Delivery Temp Violations</div>
          </div>
        </div>
        ${totalViolations === 0 ? '<p style="color:var(--green);font-weight:600;margin-top:12px;">All checks passed this week</p>' : ''}
      </div>
    `;
  }).join('');
}

function openViolationModal(storeId, violationType, weekStart, weekEnd) {
  const storeName = DATA.stores.find(s => s.id === storeId)?.name || `Store ${storeId}`;

  // Filter deliveries for this store and date range
  const storeDeliveries = DATA.deliveries.filter(d => {
    const date = normalizeDate(d.date);
    return d.store === storeId && date >= weekStart && date <= weekEnd;
  });

  // Filter for cooler temp violations (arrivalTemp no longer tracked)
  const violations = storeDeliveries.filter(d => {
    return hasTemperatureViolation(d);
  });

  const violationTypeLabel = 'Cooler Temp';
  const tempField = 'coolerTemp';
  const threshold = TEMP_LIMIT_F + '°F';

  // Build modal content
  const modalContent = `
    <div class="violation-modal-header">
      <h2>${violationTypeLabel} Violations</h2>
      <p>${storeName} • ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
    </div>
    <div class="violation-modal-body">
      ${violations.length === 0 ? '<p class="hint">No violations found</p>' : `
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Recorded Temp</th>
              <th>Threshold</th>
              <th>Received By</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${violations.map(v => `
              <tr>
                <td>${v.date}</td>
                <td>${v.arrive || 'N/A'}</td>
                <td style="color: var(--red); font-weight: 600;">${v[tempField]}°F</td>
                <td>${threshold}</td>
                <td>${v.receivedBy || 'N/A'}</td>
                <td>${v.notes || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </div>
    <div class="violation-modal-footer">
      <button class="btn btn-secondary" onclick="closeViolationModal()">Close</button>
      <button class="btn btn-primary" onclick="window.print()">Export to PDF</button>
    </div>
  `;

  // Show modal
  const modal = document.getElementById('violation-modal');
  const modalBody = document.getElementById('violation-modal-content');
  modalBody.innerHTML = modalContent;
  modal.style.display = 'flex';
}

function closeViolationModal() {
  document.getElementById('violation-modal').style.display = 'none';
}

// Violation Alert Banner Functions
/** Jump to a panel from outside the nav, as the violation banner does. */
function navigateTo(panelName) {
  showPanel(panelName);
  const link = document.querySelector(`.nav-link[data-panel="${panelName}"]`);
  if (link) {
    document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-panel="${panelName}"]`).forEach(el => el.classList.add('active'));
  }
}

function dismissViolationBanner() {
  document.getElementById('violation-alert-banner').style.display = 'none';
  localStorage.setItem('violation-banner-dismissed', new Date().toISOString());
}

function checkForViolations() {
  // Count recent violations (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // FIX: Use DATA.violations tracker instead of scanning deliveries for temp violations
  const recentViolations = (DATA.violations || []).filter(v => {
    const date = new Date(v.timestamp);
    return date >= sevenDaysAgo && (v.status || 'open') !== 'resolved';
  });

  if (recentViolations.length > 0) {
    // Check if banner was dismissed in the last hour
    const dismissed = localStorage.getItem('violation-banner-dismissed');
    if (dismissed) {
      const dismissedTime = new Date(dismissed);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (dismissedTime > oneHourAgo) {
        return; // Don't show banner if dismissed within last hour
      }
    }

    // Show banner
    document.getElementById('violation-alert-count').textContent = recentViolations.length;
    document.getElementById('violation-alert-banner').style.display = 'block';
  } else {
    document.getElementById('violation-alert-banner').style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Deliveries Panel - Professional Implementation
// ═══════════════════════════════════════════════════════════════════════════

// State management for deliveries panel
const DELIVERY_STATE = {
  currentPage: 1,
  perPage: 20,
  filtered: [],
  quickRange: 7, // Default: last 7 days
  chart: null,
  isInitialized: false,
  // Persistent filter state
  filters: {
    driver: '',
    stores: [],  // Multi-select: array of store IDs
    daysOfWeek: [],  // Multi-select: array of day numbers (0=Sun, 6=Sat)
    caseFullness: [],  // Multi-select: array of fullness ranges
    dish: '',
    search: ''
  },
  // Multi-select component instances
  multiSelects: {
    store: null,
    dayOfWeek: null,
    caseFullness: null
  }
};

function renderDeliveries() {
  // Only set defaults on first load, preserve filters on refresh
  if (!DELIVERY_STATE.isInitialized) {
    DELIVERY_STATE.isInitialized = true;
    setDeliveryQuickRange(7);
  } else {
    // On refresh: re-apply current filters without resetting UI
    setDeliveryQuickRange(DELIVERY_STATE.quickRange);
    applyDeliveryAdvancedFilters();
  }
}

function setDeliveryQuickRange(range) {
  DELIVERY_STATE.quickRange = range;
  DELIVERY_STATE.currentPage = 1;

  // Update button states
  document.querySelectorAll('#panel-deliveries .btn-time-range').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.range == range) btn.classList.add('active');
  });

  // Filter data by date range
  const today = getTodayDate();
  let filtered = [...DATA.deliveries];

  if (range === 'today') {
    filtered = filtered.filter(d => normalizeDate(d.date) === today);
  } else if (range === 'all') {
    ensureWindow(earliestWindowFrom());
  } else {
    const startStr = addDaysISO(today, -range);
    ensureWindow(startStr);
    filtered = filtered.filter(d => normalizeDate(d.date) >= startStr);
  }

  DELIVERY_STATE.filtered = filtered;
  updateDeliveryMetrics();
  updateDeliveryChart();
  populateDeliveryFilters();
  displayDeliveryTable();
}

function applyDeliveryCustomRange() {
  const startDate = document.getElementById('delivery-custom-start').value;
  const endDate = document.getElementById('delivery-custom-end').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }

  // Clear quick range selection
  document.querySelectorAll('#panel-deliveries .btn-time-range').forEach(btn => {
    btn.classList.remove('active');
  });

  DELIVERY_STATE.quickRange = 'custom';
  DELIVERY_STATE.currentPage = 1;
  ensureWindow(startDate);
  DELIVERY_STATE.filtered = DATA.deliveries.filter(d => {
    const date = normalizeDate(d.date);
    return date >= startDate && date <= endDate;
  });

  updateDeliveryMetrics();
  updateDeliveryChart();
  displayDeliveryTable();
}

function applyDeliveryAdvancedFilters() {
  // Get current filter values from UI (or use saved state on refresh)
  const dateFrom = document.getElementById('delivery-date-from')?.value || DELIVERY_STATE.filters.dateFrom || '';
  const dateTo = document.getElementById('delivery-date-to')?.value || DELIVERY_STATE.filters.dateTo || '';
  const driver = document.getElementById('delivery-driver-filter')?.value || DELIVERY_STATE.filters.driver;
  const dish = document.getElementById('delivery-dish-filter')?.value || DELIVERY_STATE.filters.dish;
  const search = (document.getElementById('delivery-search')?.value || DELIVERY_STATE.filters.search).toLowerCase();

  // Multi-select values come from state (updated via onChange callbacks)
  const stores = DELIVERY_STATE.filters.stores || [];
  const daysOfWeek = DELIVERY_STATE.filters.daysOfWeek || [];
  const caseFullness = DELIVERY_STATE.filters.caseFullness || [];

  // Save filter state for persistence across refreshes
  DELIVERY_STATE.filters = { dateFrom, dateTo, driver, stores, daysOfWeek, caseFullness, dish, search };

  // Restore UI state (in case this is called after data refresh)
  if (document.getElementById('delivery-driver-filter')) {
    document.getElementById('delivery-driver-filter').value = driver;
  }
  if (document.getElementById('delivery-dish-filter')) {
    document.getElementById('delivery-dish-filter').value = dish;
  }
  if (document.getElementById('delivery-search')) {
    document.getElementById('delivery-search').value = DELIVERY_STATE.filters.search;
  }
  if (document.getElementById('delivery-date-from')) {
    document.getElementById('delivery-date-from').value = dateFrom;
  }
  if (document.getElementById('delivery-date-to')) {
    document.getElementById('delivery-date-to').value = dateTo;
  }

  // Restore multi-select values
  if (DELIVERY_STATE.multiSelects.store && stores.length > 0) {
    DELIVERY_STATE.multiSelects.store.setValue(stores);
  }
  if (DELIVERY_STATE.multiSelects.dayOfWeek && daysOfWeek.length > 0) {
    DELIVERY_STATE.multiSelects.dayOfWeek.setValue(daysOfWeek.map(d => d.toString()));
  }
  if (DELIVERY_STATE.multiSelects.caseFullness && caseFullness.length > 0) {
    DELIVERY_STATE.multiSelects.caseFullness.setValue(caseFullness);
  }

  let filtered = [...DELIVERY_STATE.filtered];

  // Apply date range filter
  if (dateFrom || dateTo) {
    filtered = filtered.filter(d => {
      if (!d.date) return false;
      const deliveryDate = d.date.split('T')[0]; // Get YYYY-MM-DD part
      if (dateFrom && deliveryDate < dateFrom) return false;
      if (dateTo && deliveryDate > dateTo) return false;
      return true;
    });
  }

  // Apply filters
  if (driver) filtered = filtered.filter(d => d.driver === driver);

  // Multi-select store filter
  if (stores.length > 0) {
    filtered = filtered.filter(d => stores.includes(d.store));
  }

  // Day of week filter
  if (daysOfWeek.length > 0) {
    filtered = filtered.filter(d => {
      if (!d.date) return false;
      const dayOfWeek = localDate(d.date).getDay();
      return daysOfWeek.includes(dayOfWeek);
    });
  }

  // Case fullness filter
  if (caseFullness.length > 0) {
    filtered = filtered.filter(d => {
      return caseFullness.includes(d.casePrefillPercent);
    });
  }

  if (dish) filtered = filtered.filter(d => d.dish === dish);
  if (search) {
    filtered = filtered.filter(d =>
      d.driver?.toLowerCase().includes(search) ||
      d.dish?.toLowerCase().includes(search) ||
      d.receivedBy?.toLowerCase().includes(search) ||
      DATA.stores.find(s => s.id === d.store)?.name.toLowerCase().includes(search)
    );
  }

  DELIVERY_STATE.filtered = filtered;
  DELIVERY_STATE.currentPage = 1;
  updateDeliveryMetrics();
  displayDeliveryTable();
}

function clearAllDeliveryFilters() {
  // Clear single-select UI
  document.getElementById('delivery-driver-filter').value = '';
  document.getElementById('delivery-dish-filter').value = '';
  document.getElementById('delivery-search').value = '';
  document.getElementById('delivery-date-from').value = '';
  document.getElementById('delivery-date-to').value = '';

  // Clear multi-select components
  if (DELIVERY_STATE.multiSelects.store) {
    DELIVERY_STATE.multiSelects.store.clear();
  }
  if (DELIVERY_STATE.multiSelects.dayOfWeek) {
    DELIVERY_STATE.multiSelects.dayOfWeek.clear();
  }
  if (DELIVERY_STATE.multiSelects.caseFullness) {
    DELIVERY_STATE.multiSelects.caseFullness.clear();
  }

  // Clear saved filter state
  DELIVERY_STATE.filters = { dateFrom: '', dateTo: '', driver: '', stores: [], daysOfWeek: [], caseFullness: [], dish: '', search: '' };

  setDeliveryQuickRange(7); // Reset to default
}

function updateDeliveryMetrics() {
  const filtered = DELIVERY_STATE.filtered;
  const totalDeliveries = filtered.length;
  const totalUnitsDelivered = filtered.reduce((sum, d) => sum + (parseInt(d.added) || 0), 0);
  const uniqueStores = new Set(filtered.map(d => d.store)).size;
  const uniqueDrivers = new Set(filtered.map(d => d.driver)).size;

  // Calculate average case fullness
  const fullnessMap = { '0-25%': 12.5, '25-50%': 37.5, '50-75%': 62.5, '75-100%': 87.5 };
  const deliveriesWithFullness = filtered.filter(d => d.casePrefillPercent && fullnessMap[d.casePrefillPercent]);
  const avgFullness = deliveriesWithFullness.length > 0
    ? deliveriesWithFullness.reduce((sum, d) => sum + fullnessMap[d.casePrefillPercent], 0) / deliveriesWithFullness.length
    : 0;

  // Calculate fullness by store
  const fullnessByStore = {};
  deliveriesWithFullness.forEach(d => {
    if (!fullnessByStore[d.store]) {
      fullnessByStore[d.store] = { sum: 0, count: 0 };
    }
    fullnessByStore[d.store].sum += fullnessMap[d.casePrefillPercent];
    fullnessByStore[d.store].count++;
  });

  const storeBreakdown = Object.entries(fullnessByStore)
    .map(([storeId, data]) => {
      const storeName = DATA.stores.find(s => s.id === storeId)?.name || `Store ${storeId}`;
      const avg = data.sum / data.count;
      return `${storeName}: ${avg.toFixed(0)}%`;
    })
    .join(' • ');

  document.getElementById('delivery-metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total Deliveries</div>
      <div class="metric-value">${totalDeliveries.toLocaleString()}</div>
      <div class="metric-sub">${uniqueDrivers} driver${uniqueDrivers !== 1 ? 's' : ''}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Units Delivered</div>
      <div class="metric-value">${totalUnitsDelivered.toLocaleString()}</div>
      <div class="metric-sub">Across ${uniqueStores} store${uniqueStores !== 1 ? 's' : ''}</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Average per Delivery</div>
      <div class="metric-value">${totalDeliveries > 0 ? (totalUnitsDelivered / totalDeliveries).toFixed(1) : '0'}</div>
      <div class="metric-sub">Units per drop</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg Case Fullness</div>
      <div class="metric-value">${avgFullness.toFixed(0)}%</div>
      <div class="metric-sub" style="font-size: 0.75rem;">${storeBreakdown || 'No data'}</div>
    </div>
  `;
}

function updateDeliveryChart() {
  const filtered = DELIVERY_STATE.filtered;

  // Group by date
  const byDate = {};
  filtered.forEach(d => {
    if (!byDate[d.date]) byDate[d.date] = 0;
    byDate[d.date]++;
  });

  const sortedDates = Object.keys(byDate).sort();
  const counts = sortedDates.map(date => byDate[date]);

  // Destroy old chart if exists
  if (DELIVERY_STATE.chart) {
    DELIVERY_STATE.chart.destroy();
  }

  const ctx = document.getElementById('chart-delivery-volume').getContext('2d');
  DELIVERY_STATE.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Deliveries per Day',
        data: counts,
        borderColor: '#C0392B',
        backgroundColor: 'rgba(192, 57, 43, 0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function populateDeliveryFilters() {
  const filtered = DELIVERY_STATE.filtered;
  const populateSelect = (id, items) => {
    const select = document.getElementById(id);
    const defaultText = select.querySelector('option').textContent;
    select.innerHTML = `<option value="">${defaultText}</option>`;
    Array.from(items).sort().forEach(item => {
      select.innerHTML += `<option value="${item}">${item}</option>`;
    });
  };

  populateSelect('delivery-driver-filter', new Set(filtered.map(d => d.driver).filter(Boolean)));
  populateSelect('delivery-dish-filter', new Set(filtered.map(d => d.dish).filter(Boolean)));

  // Initialize Store Multi-Select (only once)
  if (!DELIVERY_STATE.multiSelects.store) {
    const storeOptions = DATA.stores.map(s => ({ value: s.id, label: s.name }));
    DELIVERY_STATE.multiSelects.store = createMultiSelect(
      'delivery-store-multiselect-container',
      storeOptions,
      'All Stores',
      (selectedStores) => {
        DELIVERY_STATE.filters.stores = selectedStores;
      }
    );
  }

  // Initialize Day of Week Multi-Select (only once)
  if (!DELIVERY_STATE.multiSelects.dayOfWeek) {
    const dowOptions = [
      { value: '0', label: 'Sunday' },
      { value: '1', label: 'Monday' },
      { value: '2', label: 'Tuesday' },
      { value: '3', label: 'Wednesday' },
      { value: '4', label: 'Thursday' },
      { value: '5', label: 'Friday' },
      { value: '6', label: 'Saturday' }
    ];
    DELIVERY_STATE.multiSelects.dayOfWeek = createMultiSelect(
      'delivery-dow-multiselect-container',
      dowOptions,
      'All Days',
      (selectedDays) => {
        DELIVERY_STATE.filters.daysOfWeek = selectedDays.map(d => parseInt(d));
      }
    );
  }

  // Initialize Case Fullness Multi-Select (only once)
  if (!DELIVERY_STATE.multiSelects.caseFullness) {
    const fullnessOptions = [
      { value: '0-25%', label: '0-25% (Nearly Empty)' },
      { value: '25-50%', label: '25-50% (Low)' },
      { value: '50-75%', label: '50-75% (Moderate)' },
      { value: '75-100%', label: '75-100% (Nearly Full)' }
    ];
    DELIVERY_STATE.multiSelects.caseFullness = createMultiSelect(
      'delivery-fullness-multiselect-container',
      fullnessOptions,
      'All Fullness Levels',
      (selectedFullness) => {
        DELIVERY_STATE.filters.caseFullness = selectedFullness;
      }
    );
  }
}

function displayDeliveryTable() {
  const filtered = DELIVERY_STATE.filtered;
  const perPage = DELIVERY_STATE.perPage;
  const currentPage = DELIVERY_STATE.currentPage;
  const totalPages = Math.ceil(filtered.length / perPage);

  // Update record count
  document.getElementById('delivery-record-count').textContent =
    `${filtered.length.toLocaleString()} record${filtered.length !== 1 ? 's' : ''}`;

  // Get current page data
  const startIdx = (currentPage - 1) * perPage;
  const endIdx = startIdx + perPage;
  const pageData = filtered.slice(startIdx, endIdx);

  const container = document.getElementById('delivery-table-container');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint">No deliveries match the current filters</p>';
    document.getElementById('delivery-pagination').style.display = 'none';
    return;
  }

  const rows = pageData.map(d => {
    // Extract store ID from either format:
    // - New format: "6542" (just ID)
    // - Old format: "Store 6542 – Carlisle, PA" (full name with ID)
    let storeId = d.store;
    const idMatch = d.store?.toString().match(/\b(\d{4})\b/); // Extract 4-digit ID
    if (idMatch) {
      storeId = idMatch[1];
    }

    // Look up store name by ID, or use original value if no match
    const storeData = DATA.stores.find(s => s.id === storeId);
    const storeName = storeData ? `${storeData.name} – ${storeData.location}` : d.store;

    const hasViolation = hasTemperatureViolation(d);
    const rowStyle = hasViolation ? 'style="background:#FADBD8;border-left:4px solid var(--red);"' : '';
    const tempIcon = hasViolation ? '⚠️ ' : '';

    // Photo thumbnails
    let photoCell = 'N/A';
    if (d.beforePhotoLink || d.afterPhotoLink) {
      const photos = [];
      if (d.beforePhotoLink) photos.push(`<a href="${d.beforePhotoLink}" target="_blank" title="Before Photo">📷 Before</a>`);
      if (d.afterPhotoLink) photos.push(`<a href="${d.afterPhotoLink}" target="_blank" title="After Photo">📷 After</a>`);
      photoCell = photos.join(' ');
    }

    return `
      <tr ${rowStyle}>
        <td>${d.date}</td>
        <td>${d.arrive || 'N/A'}</td>
        <td>${d.driver}</td>
        <td>${tempIcon}${storeName}</td>
        <td>${d.casePrefillPercent || 'N/A'}</td>
        <td>${d.dish}</td>
        <td>${d.added || 0}</td>
        <td>${d.removed || 0}</td>
        <td>${d.receivedBy || 'N/A'}</td>
        <td>${photoCell}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Arrival</th>
          <th>Driver</th>
          <th>Store</th>
          <th>Case Fullness</th>
          <th>Dish</th>
          <th>Added</th>
          <th>Removed</th>
          <th>Received By</th>
          <th>Photos</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Update pagination
  if (totalPages > 1) {
    document.getElementById('delivery-pagination').style.display = 'flex';
    document.getElementById('delivery-page-info').textContent = `Page ${currentPage} of ${totalPages}`;
  } else {
    document.getElementById('delivery-pagination').style.display = 'none';
  }
}

function changeDeliveryPageSize() {
  DELIVERY_STATE.perPage = parseInt(document.getElementById('delivery-per-page').value);
  DELIVERY_STATE.currentPage = 1;
  displayDeliveryTable();
}

function prevDeliveryPage() {
  if (DELIVERY_STATE.currentPage > 1) {
    DELIVERY_STATE.currentPage--;
    displayDeliveryTable();
  }
}

function nextDeliveryPage() {
  const totalPages = Math.ceil(DELIVERY_STATE.filtered.length / DELIVERY_STATE.perPage);
  if (DELIVERY_STATE.currentPage < totalPages) {
    DELIVERY_STATE.currentPage++;
    displayDeliveryTable();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Production Panel
// ═══════════════════════════════════════════════════════════════════════════

const PRODUCTION_STATE = {
  currentPage: 1,
  perPage: 20,
  filtered: [],
  quickRange: 7,
  chart: null,
  isInitialized: false,
  advancedFilters: {
    shift: '',
    kitchen: '',
    supervisor: '',
    dish: '',
    search: ''
  }
};

function renderProduction() {
  // Only set defaults on first load, preserve filters on refresh
  if (!PRODUCTION_STATE.isInitialized) {
    PRODUCTION_STATE.isInitialized = true;
    setProductionQuickRange(7);
  } else {
    setProductionQuickRange(PRODUCTION_STATE.quickRange);
    applyProductionAdvancedFilters();
  }
}

function setProductionQuickRange(range) {
  PRODUCTION_STATE.quickRange = range;
  PRODUCTION_STATE.currentPage = 1;

  // Update button states
  document.querySelectorAll('#panel-production .btn-time-range').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-range') == range) {
      btn.classList.add('active');
    }
  });

  // Filter by date range
  const today = getTodayDate();
  let filtered = [...DATA.production];

  if (range === 'today') {
    filtered = filtered.filter(p => normalizeDate(p.date) === today);
  } else if (range === 'all') {
    ensureWindow(earliestWindowFrom());
  } else {
    const startStr = addDaysISO(today, -range);
    ensureWindow(startStr);
    filtered = filtered.filter(p => normalizeDate(p.date) >= startStr);
  }

  PRODUCTION_STATE.filtered = filtered;
  updateProductionMetrics();
  updateProductionChart();
  populateProductionFilters();
  displayProductionTable();
}

function applyProductionCustomRange() {
  const startDate = document.getElementById('production-custom-start').value;
  const endDate = document.getElementById('production-custom-end').value;

  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }

  PRODUCTION_STATE.currentPage = 1;

  // Remove active state from quick buttons
  document.querySelectorAll('#panel-production .btn-time-range').forEach(btn => {
    btn.classList.remove('active');
  });

  ensureWindow(startDate);
  const filtered = DATA.production.filter(p => {
    const date = normalizeDate(p.date);
    return date >= startDate && date <= endDate;
  });

  PRODUCTION_STATE.filtered = filtered;
  updateProductionMetrics();
  updateProductionChart();
  populateProductionFilters();
  displayProductionTable();
}

function updateProductionMetrics() {
  const filtered = PRODUCTION_STATE.filtered;
  const totalBatches = filtered.length;
  const totalProduced = filtered.reduce((sum, p) => sum + (parseInt(p.qtyProduced) || 0), 0);
  const totalDiscarded = filtered.reduce((sum, p) => sum + (parseInt(p.qtyDiscarded) || 0), 0);

  document.getElementById('production-metrics').innerHTML = `
    <div class="metric-card">
      <div class="metric-label">Total Batches</div>
      <div class="metric-value">${totalBatches.toLocaleString()}</div>
      <div class="metric-sub">Production runs logged</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Units Produced</div>
      <div class="metric-value">${totalProduced.toLocaleString()}</div>
      <div class="metric-sub">${totalDiscarded.toLocaleString()} discarded</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Avg Batch Size</div>
      <div class="metric-value">${totalBatches > 0 ? Math.round(totalProduced / totalBatches) : 0}</div>
      <div class="metric-sub">Units per batch</div>
    </div>
  `;
}

function updateProductionChart() {
  const filtered = PRODUCTION_STATE.filtered;

  // Group by date
  const byDate = {};
  filtered.forEach(p => {
    if (!byDate[p.date]) byDate[p.date] = 0;
    byDate[p.date] += parseInt(p.qtyProduced) || 0;
  });

  const sortedDates = Object.keys(byDate).sort();
  const counts = sortedDates.map(date => byDate[date]);

  // Destroy old chart if exists
  if (PRODUCTION_STATE.chart) {
    PRODUCTION_STATE.chart.destroy();
  }

  const ctx = document.getElementById('chart-production-volume').getContext('2d');
  PRODUCTION_STATE.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: sortedDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{
        label: 'Units Produced per Day',
        data: counts,
        borderColor: '#3498DB',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function populateProductionFilters() {
  const filtered = PRODUCTION_STATE.filtered;

  const populateSelect = (id, items) => {
    const select = document.getElementById(id);
    const currentValue = select.value;
    const defaultText = select.querySelector('option').textContent;
    select.innerHTML = `<option value="">${defaultText}</option>`;
    Array.from(items).sort().forEach(item => {
      select.innerHTML += `<option value="${item}">${item}</option>`;
    });
    select.value = currentValue;
  };

  // Normalize supervisor names to remove duplicates with trailing spaces
  const normalizeName = (name) => name ? name.trim() : '';

  populateSelect('production-shift-filter', new Set(filtered.map(p => p.shift).filter(Boolean)));
  populateSelect('production-kitchen-filter', new Set(filtered.map(p => p.kitchen).filter(Boolean)));
  populateSelect('production-supervisor-filter', new Set(filtered.map(p => normalizeName(p.supervisor)).filter(Boolean)));
  populateSelect('production-dish-filter', new Set(filtered.map(p => p.dish).filter(Boolean)));
}

function applyProductionAdvancedFilters() {
  PRODUCTION_STATE.advancedFilters = {
    shift: document.getElementById('production-shift-filter').value,
    kitchen: document.getElementById('production-kitchen-filter').value,
    supervisor: document.getElementById('production-supervisor-filter').value,
    dish: document.getElementById('production-dish-filter').value,
    search: document.getElementById('production-search').value.toLowerCase()
  };
  PRODUCTION_STATE.currentPage = 1;
  displayProductionTable();
}

function clearAllProductionFilters() {
  document.getElementById('production-shift-filter').value = '';
  document.getElementById('production-kitchen-filter').value = '';
  document.getElementById('production-supervisor-filter').value = '';
  document.getElementById('production-dish-filter').value = '';
  document.getElementById('production-search').value = '';
  PRODUCTION_STATE.advancedFilters = {
    shift: '',
    kitchen: '',
    supervisor: '',
    dish: '',
    search: ''
  };
  PRODUCTION_STATE.currentPage = 1;
  displayProductionTable();
}

function displayProductionTable() {
  let filtered = [...PRODUCTION_STATE.filtered];

  // Apply advanced filters
  const filters = PRODUCTION_STATE.advancedFilters;
  if (filters.shift) filtered = filtered.filter(p => p.shift === filters.shift);
  if (filters.kitchen) filtered = filtered.filter(p => p.kitchen === filters.kitchen);
  if (filters.supervisor) filtered = filtered.filter(p => p.supervisor === filters.supervisor);
  if (filters.dish) filtered = filtered.filter(p => p.dish === filters.dish);
  if (filters.search) {
    filtered = filtered.filter(p => {
      return (p.date && p.date.toLowerCase().includes(filters.search)) ||
             (p.shift && p.shift.toLowerCase().includes(filters.search)) ||
             (p.kitchen && p.kitchen.toLowerCase().includes(filters.search)) ||
             (p.supervisor && p.supervisor.toLowerCase().includes(filters.search)) ||
             (p.dish && p.dish.toLowerCase().includes(filters.search)) ||
             (p.discardReason && p.discardReason.toLowerCase().includes(filters.search));
    });
  }

  const perPage = PRODUCTION_STATE.perPage;
  const currentPage = PRODUCTION_STATE.currentPage;
  const totalPages = Math.ceil(filtered.length / perPage);

  // Get current page data
  const startIdx = (currentPage - 1) * perPage;
  const endIdx = startIdx + perPage;
  const pageData = filtered.slice(startIdx, endIdx);

  const container = document.getElementById('production-table-container');
  document.getElementById('production-record-count').textContent = `${filtered.length} records`;

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint">No production batches match the filters</p>';
    document.getElementById('production-pagination').style.display = 'none';
    return;
  }

  const rows = pageData.map(p => `
      <tr>
        <td>${normalizeDate(p.date)}</td>
        <td>${p.shift || ''}</td>
        <td>${p.kitchen || ''}</td>
        <td>${p.supervisor || ''}</td>
        <td>${p.dish || ''}</td>
        <td>${p.qtyProduced || 0}</td>
        <td>${p.qtyDiscarded || 0}</td>
        <td>${p.discardReason || ''}</td>
      </tr>
    `).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Shift</th>
          <th>Kitchen</th>
          <th>Supervisor</th>
          <th>Dish</th>
          <th>Produced</th>
          <th>Discarded</th>
          <th>Discard Reason</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Show/hide pagination
  if (totalPages > 1) {
    document.getElementById('production-pagination').style.display = 'flex';
    document.getElementById('production-page-info').textContent = `Page ${currentPage} of ${totalPages}`;
  } else {
    document.getElementById('production-pagination').style.display = 'none';
  }
}

function changeProductionPageSize() {
  PRODUCTION_STATE.perPage = parseInt(document.getElementById('production-per-page').value);
  PRODUCTION_STATE.currentPage = 1;
  displayProductionTable();
}

function prevProductionPage() {
  if (PRODUCTION_STATE.currentPage > 1) {
    PRODUCTION_STATE.currentPage--;
    displayProductionTable();
  }
}

function nextProductionPage() {
  const filtered = PRODUCTION_STATE.filtered;
  const totalPages = Math.ceil(filtered.length / PRODUCTION_STATE.perPage);
  if (PRODUCTION_STATE.currentPage < totalPages) {
    PRODUCTION_STATE.currentPage++;
    displayProductionTable();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Waste Analysis Panel
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// Food Safety Panel
// ═══════════════════════════════════════════════════════════════════════════

function renderFoodSafety() {
  // Check for violations and update alert banner
  checkForViolations();
  // Load violations queue
  refreshViolationsQueue();
  console.log('[Food Safety] Panel rendered');
}

let violationStatusFilter = 'all'; // all, open, resolved — a violation is open until it is resolved

function refreshViolationsQueue() {
  const container = document.getElementById('violations-queue');
  if (!container) return;

  // Defensive: ensure violations array exists
  if (!DATA.violations || !Array.isArray(DATA.violations)) {
    console.warn('[Violations] DATA.violations is not an array, initializing to empty array');
    DATA.violations = [];
  }

  // Apply status filter
  let filteredViolations = DATA.violations;
  if (violationStatusFilter !== 'all') {
    // FIX: Default to 'open' status if violation doesn't have status field
    filteredViolations = DATA.violations.filter(v => (v.status || 'open') === violationStatusFilter);
  }

  // Sort newest first
  filteredViolations = filteredViolations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (filteredViolations.length === 0) {
    const message = violationStatusFilter === 'all'
      ? '✓ No violations found'
      : `✓ No ${violationStatusFilter} violations`;
    container.innerHTML = `<div class="loading" style="color: var(--green);">${message}</div>`;
    return;
  }

  container.innerHTML = filteredViolations.map(v => {
    const statusBadge = getStatusBadge(v.status);
    const timestamp = new Date(v.timestamp);
    const displayDate = timestamp.toLocaleDateString();
    const displayTime = timestamp.toLocaleTimeString();

    return `
      <div class="violation-queue-item" data-violation-id="${v.violationId}">
        <div class="violation-queue-header">
          <div class="violation-queue-badge">${v.violationType}</div>
          ${statusBadge}
          <div class="violation-queue-date">${displayDate} ${displayTime}</div>
        </div>
        <div class="violation-queue-details">
          <div class="violation-queue-store">📍 ${v.storeName}</div>
          <div class="violation-queue-temp" style="color: var(--red); font-weight: 700;">${v.value}°F</div>
          ${v.resolvedAt ? `<div class="violation-queue-resolved">✅ Resolved ${new Date(v.resolvedAt).toLocaleDateString()} by ${v.resolvedBy}</div>` : ''}
        </div>
        <div class="violation-queue-actions">
          ${v.status !== 'resolved' ? `
            <button class="violation-queue-btn" onclick="markViolationResolved('${v.violationId}')">
              Mark Resolved
            </button>
          ` : `
            <button class="violation-queue-btn" disabled style="opacity: 0.5;">
              Resolved
            </button>
          `}
          <button class="violation-queue-btn-secondary" onclick="openViolationDetailsModal('${v.violationId}')">
            View Details
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function getStatusBadge(status) {
  const badges = {
    'open': '<span class="status-badge status-open">Open</span>',
    'resolved': '<span class="status-badge status-resolved">Resolved</span>'
  };
  return badges[status] || badges['open'];
}

function setViolationFilter(status) {
  violationStatusFilter = status;

  // Update filter button states
  const buttons = document.querySelectorAll('.violation-filter-btn');
  buttons.forEach((btn, index) => {
    btn.classList.remove('active');
    // Match button to status by order: all, open, resolved
    const statuses = ['all', 'open', 'resolved'];
    if (statuses[index] === status) {
      btn.classList.add('active');
    }
  });

  refreshViolationsQueue();
}

async function markViolationResolved(violationId) {
  if (!CONFIG.webAppUrl) {
    alert('Backend not configured. Cannot update violation status.');
    return;
  }

  if (!confirm('Mark this violation as resolved?')) return;

  try {
    const url = `${CONFIG.webAppUrl}?action=updateViolationStatus` +
      `&violationId=${encodeURIComponent(violationId)}&status=resolved&resolvedBy=${encodeURIComponent('Dashboard User')}`;
    const response = await fetch(url, { method: 'GET', mode: 'cors' });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.status === 'ok') {
      // Update local data
      const violation = DATA.violations.find(v => v.violationId === violationId);
      if (violation) {
        violation.status = 'resolved';
        violation.resolvedAt = new Date().toISOString();
        violation.resolvedBy = 'Dashboard User';
      }
      refreshViolationsQueue();
      alert('Violation marked as resolved!');
    } else {
      throw new Error(data.message);
    }
  } catch (e) {
    console.error('[Violation] Update failed:', e);
    alert(`Failed to update violation: ${e.message}`);
  }
}

function openViolationDetailsModal(violationId) {
  const violation = DATA.violations.find(v => v.violationId === violationId);
  if (!violation) return;

  const timestamp = new Date(violation.timestamp);

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Violation Details</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        ${getStatusBadge(violation.status)}
        <p><strong>Type:</strong> ${violation.violationType}</p>
        <p><strong>Store:</strong> ${violation.storeName} (${violation.storeId})</p>
        <p><strong>Timestamp:</strong> ${timestamp.toLocaleString()}</p>
        <p><strong>Temperature:</strong> <span style="color: var(--red); font-weight: 700;">${violation.value}°F</span></p>
        <p><strong>Violation ID:</strong> <code>${violation.violationId}</code></p>
        ${violation.resolvedAt ? `
          <p><strong>Resolved:</strong> ${new Date(violation.resolvedAt).toLocaleString()}</p>
          <p><strong>Resolved By:</strong> ${violation.resolvedBy}</p>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// SHRINK TRACKING DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

let shrinkTimeRange = 'today';
let shrinkCharts = {};
let shrinkTableData = [];
let shrinkCurrentPage = 1;
const SHRINK_ROWS_PER_PAGE = 25;

function applyShrinkFilter(range) {
  shrinkTimeRange = range;

  // Update button states
  const buttons = document.querySelectorAll('#panel-shrink .filter-btn');
  buttons.forEach((btn, index) => {
    btn.classList.remove('active');
    // Match button to range by order: today, 7days, 30days, all
    const ranges = ['today', '7days', '30days', 'all'];
    if (ranges[index] === range) {
      btn.classList.add('active');
    }
  });

  // Refresh shrink data
  renderShrinkDashboard();
}

function renderShrinkDashboard() {
  // Calculate date range
  const today = new Date();
  let startDate;

  switch(shrinkTimeRange) {
    case 'today':
      startDate = new Date(today);
      startDate.setHours(0, 0, 0, 0);
      break;
    case '7days':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30days':
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case 'all':
      startDate = new Date(0); // Unix epoch
      break;
  }

  // Filter deliveries by date range
  const startStr = normalizeDate(startDate);
  ensureWindow(startStr);
  const filteredDeliveries = DATA.deliveries.filter(d => normalizeDate(d.date) >= startStr);

  // Calculate shrink metrics
  const totalLoaded = filteredDeliveries.reduce((sum, d) => sum + (parseInt(d.added) || 0), 0);
  const totalShrink = filteredDeliveries.reduce((sum, d) => sum + (parseInt(d.removed) || 0), 0);
  const shrinkRate = totalLoaded > 0 ? ((totalShrink / totalLoaded) * 100).toFixed(2) : 0;

  // Calculate shrink by store
  const shrinkByStore = {};
  filteredDeliveries.forEach(d => {
    if (!shrinkByStore[d.store]) {
      shrinkByStore[d.store] = { loaded: 0, shrink: 0 };
    }
    shrinkByStore[d.store].loaded += parseInt(d.added) || 0;
    shrinkByStore[d.store].shrink += parseInt(d.removed) || 0;
  });

  // Find highest shrink store
  let highestShrinkStore = '';
  let highestShrinkRate = 0;
  Object.entries(shrinkByStore).forEach(([store, data]) => {
    const rate = data.loaded > 0 ? (data.shrink / data.loaded) * 100 : 0;
    if (rate > highestShrinkRate) {
      highestShrinkRate = rate;
      highestShrinkStore = store;
    }
  });

  // Update metrics
  document.getElementById('shrink-total-loaded').textContent = totalLoaded.toLocaleString();
  document.getElementById('shrink-total-shrink').textContent = totalShrink.toLocaleString();
  document.getElementById('shrink-rate').textContent = shrinkRate + '%';
  // Show only store ID (operators know stores by number)
  document.getElementById('shrink-top-store').textContent = highestShrinkStore ? `Store ${highestShrinkStore}` : 'N/A';

  // Add alert styling if shrink rate is high
  const shrinkRateCard = document.getElementById('shrink-rate').closest('.metric-card');
  if (parseFloat(shrinkRate) > 10) {
    shrinkRateCard.style.borderColor = 'var(--red)';
    shrinkRateCard.style.background = '#FEE';
  } else {
    shrinkRateCard.style.borderColor = '';
    shrinkRateCard.style.background = '';
  }

  // Render charts
  renderShrinkCharts(filteredDeliveries, shrinkByStore);

  // Render detailed table
  renderShrinkTable(filteredDeliveries);
}

function renderShrinkCharts(deliveries, shrinkByStore) {
  // Destroy existing charts
  Object.values(shrinkCharts).forEach(chart => chart.destroy());
  shrinkCharts = {};

  // Chart 1: Shrink Rate by Store (Bar)
  const storeLabels = Object.keys(shrinkByStore);
  const storeRates = storeLabels.map(store => {
    const data = shrinkByStore[store];
    return data.loaded > 0 ? ((data.shrink / data.loaded) * 100).toFixed(2) : 0;
  });

  const ctx1 = document.getElementById('chart-shrink-by-store');
  shrinkCharts.byStore = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: storeLabels,
      datasets: [{
        label: 'Shrink Rate %',
        data: storeRates,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: '#DC2626',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Shrink Rate %' }
        }
      }
    }
  });

  // Chart 2: Shrink Trend Over Time (Line)
  const shrinkByDate = {};
  deliveries.forEach(d => {
    const dateStr = normalizeDate(d.date);
    if (!dateStr) return; // Skip invalid dates
    if (!shrinkByDate[dateStr]) {
      shrinkByDate[dateStr] = { loaded: 0, shrink: 0 };
    }
    // FIX: Use 'added' field (production format) with fallback to 'qtyAdded' (demo format)
    shrinkByDate[dateStr].loaded += parseInt(d.added || d.qtyAdded) || 0;
    shrinkByDate[dateStr].shrink += parseInt(d.removed) || 0;
  });

  const sortedDates = Object.keys(shrinkByDate).sort();
  const trendRates = sortedDates.map(date => {
    const data = shrinkByDate[date];
    return data.loaded > 0 ? ((data.shrink / data.loaded) * 100).toFixed(2) : 0;
  });

  const ctx2 = document.getElementById('chart-shrink-trend');
  shrinkCharts.trend = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets: [{
        label: 'Shrink Rate %',
        data: trendRates,
        borderColor: '#DC2626',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Shrink Rate %' }
        }
      }
    }
  });

  // Chart 3: Top 10 Items by Shrink (Horizontal Bar)
  const shrinkByItem = {};
  deliveries.forEach(d => {
    const item = d.dish;
    if (!shrinkByItem[item]) {
      shrinkByItem[item] = 0;
    }
    shrinkByItem[item] += parseInt(d.removed) || 0;
  });

  const topItems = Object.entries(shrinkByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const ctx3 = document.getElementById('chart-shrink-by-item');
  shrinkCharts.byItem = new Chart(ctx3, {
    type: 'bar',
    data: {
      labels: topItems.map(([item]) => item),
      datasets: [{
        label: 'Total Shrink',
        data: topItems.map(([, shrink]) => shrink),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: '#DC2626',
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: { display: true, text: 'Units Shrink' }
        }
      }
    }
  });

  // Chart 4: Loaded vs Shrink by Store (Grouped Bar)
  const ctx4 = document.getElementById('chart-loaded-vs-shrink');
  shrinkCharts.loadedVsShrink = new Chart(ctx4, {
    type: 'bar',
    data: {
      labels: storeLabels,
      datasets: [
        {
          label: 'Loaded',
          data: storeLabels.map(store => shrinkByStore[store].loaded),
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: '#16A34A',
          borderWidth: 1
        },
        {
          label: 'Shrink',
          data: storeLabels.map(store => shrinkByStore[store].shrink),
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#DC2626',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Units' }
        }
      }
    }
  });

  // Chart 5: why it came off the shelf. The reason is the only thing here that says whether
  // shrink is a forecasting problem or a handling one.
  const byReason = {};
  deliveries.forEach(d => {
    const units = parseInt(d.removed, 10) || 0;
    if (units <= 0) return;
    const reason = (d.reason || '').trim() || 'Unspecified';
    byReason[reason] = (byReason[reason] || 0) + units;
  });
  const reasons = Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a]);

  shrinkCharts.byReason = new Chart(document.getElementById('chart-shrink-by-reason'), {
    type: 'doughnut',
    data: {
      labels: reasons,
      datasets: [{
        data: reasons.map(reason => byReason[reason]),
        backgroundColor: ['#DC2626', '#EA580C', '#CA8A04', '#65A30D', '#0891B2', '#7C3AED', '#9B9B9B'],
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'right' } }
    }
  });
}

function renderShrinkTable(deliveries) {
  // Prepare table data
  shrinkTableData = deliveries
    .filter(d => parseInt(d.added || d.qtyAdded) > 0 || parseInt(d.removed) > 0)
    .map(d => {
      const loaded = parseInt(d.added || d.qtyAdded) || 0;
      const shrink = parseInt(d.removed) || 0;
      return {
        date: normalizeDate(d.date),
        store: d.store || 'Unknown',
        item: d.dish || 'Unknown',
        loaded: loaded,
        shrink: shrink,
        rate: (loaded > 0 ? ((shrink / loaded) * 100).toFixed(2) : 0),
        reason: d.reason || 'N/A'
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Render table (show first 50 rows)
  updateShrinkTableDisplay();
}

function updateShrinkTableDisplay() {
  const tbody = document.getElementById('shrink-table-body');
  const searchTerm = (document.getElementById('shrink-search')?.value || '').toLowerCase();

  // Filter by search
  const filtered = shrinkTableData.filter(row =>
    row.date.includes(searchTerm) ||
    row.store.toLowerCase().includes(searchTerm) ||
    row.item.toLowerCase().includes(searchTerm)
  );

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No matching records</td></tr>';
    document.getElementById('shrink-pagination').innerHTML = '';
    return;
  }

  // Calculate pagination
  const totalPages = Math.ceil(filtered.length / SHRINK_ROWS_PER_PAGE);
  if (shrinkCurrentPage > totalPages) shrinkCurrentPage = 1;

  const startIdx = (shrinkCurrentPage - 1) * SHRINK_ROWS_PER_PAGE;
  const endIdx = startIdx + SHRINK_ROWS_PER_PAGE;
  const displayData = filtered.slice(startIdx, endIdx);

  // Render table rows
  tbody.innerHTML = displayData.map(row => `
    <tr>
      <td>${row.date}</td>
      <td style="font-weight: 600; color: var(--dark);">${row.store}</td>
      <td>${row.item}</td>
      <td>${row.loaded}</td>
      <td style="color: ${row.shrink > 0 ? '#DC2626' : 'inherit'}">${row.shrink}</td>
      <td style="color: ${parseFloat(row.rate) > 10 ? '#DC2626' : 'inherit'}; font-weight: ${parseFloat(row.rate) > 10 ? '600' : 'normal'}">${row.rate}%</td>
      <td>${row.reason}</td>
    </tr>
  `).join('');

  // Render pagination controls
  renderShrinkPagination(filtered.length, totalPages);
}

function renderShrinkPagination(totalRecords, totalPages) {
  const pagination = document.getElementById('shrink-pagination');

  if (totalPages <= 1) {
    pagination.innerHTML = `<p style="margin: 0; color: var(--soft); text-align: center;">Showing all ${totalRecords} records</p>`;
    return;
  }

  const startRecord = ((shrinkCurrentPage - 1) * SHRINK_ROWS_PER_PAGE) + 1;
  const endRecord = Math.min(shrinkCurrentPage * SHRINK_ROWS_PER_PAGE, totalRecords);

  // Generate page buttons (show max 7: first, ..., current-1, current, current+1, ..., last)
  let pageButtons = '';

  if (totalPages <= 7) {
    // Show all pages
    for (let i = 1; i <= totalPages; i++) {
      pageButtons += `<button onclick="goToShrinkPage(${i})" class="pagination-btn ${i === shrinkCurrentPage ? 'active' : ''}">${i}</button>`;
    }
  } else {
    // Show first page
    pageButtons += `<button onclick="goToShrinkPage(1)" class="pagination-btn ${1 === shrinkCurrentPage ? 'active' : ''}">1</button>`;

    if (shrinkCurrentPage > 3) {
      pageButtons += `<span class="pagination-ellipsis">...</span>`;
    }

    // Show pages around current
    const start = Math.max(2, shrinkCurrentPage - 1);
    const end = Math.min(totalPages - 1, shrinkCurrentPage + 1);

    for (let i = start; i <= end; i++) {
      pageButtons += `<button onclick="goToShrinkPage(${i})" class="pagination-btn ${i === shrinkCurrentPage ? 'active' : ''}">${i}</button>`;
    }

    if (shrinkCurrentPage < totalPages - 2) {
      pageButtons += `<span class="pagination-ellipsis">...</span>`;
    }

    // Show last page
    pageButtons += `<button onclick="goToShrinkPage(${totalPages})" class="pagination-btn ${totalPages === shrinkCurrentPage ? 'active' : ''}">${totalPages}</button>`;
  }

  pagination.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-top: 16px;">
      <div style="color: var(--soft); font-size: 0.9rem;">
        Showing ${startRecord}-${endRecord} of ${totalRecords} records
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button onclick="goToShrinkPage(${shrinkCurrentPage - 1})" ${shrinkCurrentPage === 1 ? 'disabled' : ''} class="pagination-btn">← Prev</button>
        ${pageButtons}
        <button onclick="goToShrinkPage(${shrinkCurrentPage + 1})" ${shrinkCurrentPage === totalPages ? 'disabled' : ''} class="pagination-btn">Next →</button>
      </div>
    </div>
  `;
}

function goToShrinkPage(page) {
  const totalPages = Math.ceil(shrinkTableData.length / SHRINK_ROWS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  shrinkCurrentPage = page;
  updateShrinkTableDisplay();
}

function filterShrinkTable() {
  shrinkCurrentPage = 1; // Reset to first page on search
  updateShrinkTableDisplay();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Advanced Shrink Filters & Export
// ═══════════════════════════════════════════════════════════════════════════════

function populateShrinkFilters() {
  // Populate Store dropdown
  const stores = [...new Set(DATA.deliveries.map(d => d.store))].filter(s => s).sort();
  const storeSelect = document.getElementById('shrink-store-filter');
  storeSelect.innerHTML = '<option value="">All Stores</option>' +
    stores.map(store => `<option value="${store}">Store ${store}</option>`).join('');

  // Populate Item dropdown
  const items = [...new Set(DATA.deliveries.map(d => d.dish))].filter(i => i).sort();
  const itemSelect = document.getElementById('shrink-item-filter');
  itemSelect.innerHTML = '<option value="">All Items</option>' +
    items.map(item => `<option value="${item}">${item}</option>`).join('');
}

function applyAdvancedShrinkFilters() {
  const startDate = document.getElementById('shrink-date-start').value;
  const endDate = document.getElementById('shrink-date-end').value;
  const store = document.getElementById('shrink-store-filter').value;
  const item = document.getElementById('shrink-item-filter').value;

  // Clear quick filter button states
  document.querySelectorAll('#panel-shrink .filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Filter deliveries
  let filtered = DATA.deliveries;

  // Date range filter
  if (startDate) {
    ensureWindow(startDate);
    filtered = filtered.filter(d => normalizeDate(d.date) >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(d => normalizeDate(d.date) <= endDate);
  }

  // Store filter
  if (store) {
    filtered = filtered.filter(d => d.store === store);
  }

  // Item filter
  if (item) {
    filtered = filtered.filter(d => d.dish === item);
  }

  // Update metrics
  const totalLoaded = filtered.reduce((sum, d) => sum + (parseInt(d.added) || 0), 0);
  const totalShrink = filtered.reduce((sum, d) => sum + (parseInt(d.removed) || 0), 0);
  const shrinkRate = totalLoaded > 0 ? ((totalShrink / totalLoaded) * 100).toFixed(2) : 0;

  // Calculate shrink by store
  const shrinkByStore = {};
  filtered.forEach(d => {
    if (!shrinkByStore[d.store]) {
      shrinkByStore[d.store] = { loaded: 0, shrink: 0 };
    }
    shrinkByStore[d.store].loaded += parseInt(d.added) || 0;
    shrinkByStore[d.store].shrink += parseInt(d.removed) || 0;
  });

  // Find highest shrink store
  let highestShrinkStore = '';
  let highestShrinkRate = 0;
  Object.entries(shrinkByStore).forEach(([s, data]) => {
    const rate = data.loaded > 0 ? (data.shrink / data.loaded) * 100 : 0;
    if (rate > highestShrinkRate) {
      highestShrinkRate = rate;
      highestShrinkStore = s;
    }
  });

  // Update metrics display
  document.getElementById('shrink-total-loaded').textContent = totalLoaded.toLocaleString();
  document.getElementById('shrink-total-shrink').textContent = totalShrink.toLocaleString();
  document.getElementById('shrink-rate').textContent = shrinkRate + '%';
  document.getElementById('shrink-top-store').textContent = highestShrinkStore ? `Store ${highestShrinkStore}` : 'N/A';

  // Update charts and table
  renderShrinkCharts(filtered, shrinkByStore);
  renderShrinkTable(filtered);
}

function exportShrinkToCSV() {
  // Get current filtered data from shrinkTableData
  if (!shrinkTableData || shrinkTableData.length === 0) {
    alert('No data to export');
    return;
  }

  // Create CSV header
  const headers = ['Date', 'Store', 'Item', 'Loaded (Qty Added)', 'Shrink (Qty Removed)', 'Shrink Rate %', 'Reason'];
  let csv = headers.join(',') + '\n';

  // Add data rows
  shrinkTableData.forEach(row => {
    const csvRow = [
      row.date,
      row.store,
      `"${row.dish}"`, // Quote in case of commas in dish name
      row.loaded,
      row.shrink,
      row.shrinkRate,
      `"${row.reason || ''}"` // Quote reason field
    ];
    csv += csvRow.join(',') + '\n';
  });

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  // Generate filename with timestamp
  const timestamp = getTodayDate();
  link.setAttribute('href', url);
  link.setAttribute('download', `shrink-report-${timestamp}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Settings Panel Functions
// ═══════════════════════════════════════════════════════════════════════════════

// Settings object with defaults
// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Collapsible Sidebar (CSS-based, no JS needed)
// Sidebar starts collapsed (70px) and expands on hover (220px)
// ═══════════════════════════════════════════════════════════════════════════════
