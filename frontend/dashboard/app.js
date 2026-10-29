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
  production: [],
  packaging: [],
  deliveries: [],
  sales: [],
  waste: [],
  stores: [],
  reference: null,   // the six reference lists plus their version, for the Config panel
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
  setupEnvironmentToggle();
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
    await loadDemoData();
    updateStatus('demo', 'Demo Mode (sample data)');
    renderProduction();
    renderPackaging();
    renderDeliveries();
    renderSales();
    renderFoodSafety();
  }
});

// Update current date/time in header
/**
 * The same page in the other environment. Production is published at the site root and
 * staging under /staging/, so the two differ by one path segment. The query and hash come
 * along, which keeps you on the panel you were looking at.
 */
function otherEnvironment() {
  const path = window.location.pathname;
  const onStaging = path.indexOf('/staging/') !== -1;
  const target = onStaging
    ? path.replace('/staging/', '/')
    : path.replace('/dashboard/', '/staging/dashboard/');
  return {
    name: onStaging ? 'production' : 'staging',
    href: target + window.location.search + window.location.hash
  };
}

/**
 * Offer the other environment, in the place that suits who needs it.
 *
 * On staging the question goes in the warning banner, because someone there may be looking
 * at test data believing it is real and the banner is already interrupting them. On
 * production it goes quietly at the foot of the home panel: the only person who wants
 * staging is looking for it on purpose, and the production header stays clean.
 */
function setupEnvironmentToggle() {
  const other = otherEnvironment();
  const link = document.createElement('a');
  link.href = other.href;

  if (other.name === 'production') {
    const banner = document.getElementById('env-banner');
    if (!banner) return;
    link.className = 'env-banner-link';
    link.textContent = 'Open production';
    banner.appendChild(document.createTextNode(' \u00b7 Looking for the real dashboard? '));
    banner.appendChild(link);
    return;
  }

  const note = document.getElementById('home-env-note');
  if (!note) return;
  link.textContent = 'Open the staging dashboard';
  note.appendChild(document.createTextNode('Want to test features? '));
  note.appendChild(link);
  note.hidden = false;
}

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

async function loadDemoData() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // The store list and the Config panel's lists come from the same published data/*.json
  // the forms read, so demo mode shows real ids rather than a second copy of them.
  const published = await loadStaticReference();
  const reference = { version: published.version, updatedAt: '', source: 'static' };
  CONFIG_LISTS.forEach(def => { reference[def.key] = published.lists[def.key].entries; });

  DATA = {
    // As the backend's storeList(): `id` is the store number the records carry, `key` the UUID.
    stores: reference.stores.map(s => ({ id: s.storeId, key: s.id, name: s.name, location: s.location, verified: s.verified, deletedAt: s.deletedAt })),
    reference: reference,
    deliveries: [
      { submittedAt: `${today}T08:32:15.000Z`, date: today, driver: 'Owen', store: '6006', arrivalTime: '08:30', coolerTemp: 38, dish: 'Spring Roll (Veg)', qtyAdded: 24, removed: 2, reason: 'Out of date', receivedBy: 'Amanda' },
      { submittedAt: `${today}T09:15:42.000Z`, date: today, driver: 'Owen', store: '6061', arrivalTime: '09:10', coolerTemp: 39, dish: 'Shrimp Egg Roll', qtyAdded: 30, removed: 0, reason: '', receivedBy: 'Michael' },
      { submittedAt: `${today}T09:48:20.000Z`, date: today, driver: 'Owen', store: '6253', arrivalTime: '09:45', coolerTemp: 37, dish: 'Chicken Lo Mein', qtyAdded: 18, removed: 1, reason: 'Damaged', receivedBy: 'Sarah' },
      { submittedAt: `${today}T10:25:33.000Z`, date: today, driver: 'Andy', store: '6331', arrivalTime: '10:20', coolerTemp: 40, dish: 'Spring Roll (Veg)', qtyAdded: 20, removed: 0, reason: '', receivedBy: 'James' },
      { submittedAt: `${today}T11:05:18.000Z`, date: today, driver: 'Andy', store: '6443', arrivalTime: '11:00', coolerTemp: 42, dish: 'Beef Chow Fun', qtyAdded: 15, removed: 3, reason: 'Quality Issue', receivedBy: 'Lisa', violation: true },
      { submittedAt: `${yesterday}T08:45:22.000Z`, date: yesterday, driver: 'Sam Blumenthal', store: '6542', arrivalTime: '08:40', coolerTemp: 38, dish: 'Pork Dumpling', qtyAdded: 28, removed: 1, reason: 'Out of date', receivedBy: 'Tom' },
      { submittedAt: `${yesterday}T09:20:55.000Z`, date: yesterday, driver: 'Sam Blumenthal', store: '6564', arrivalTime: '09:15', coolerTemp: 39, dish: 'Spring Roll (Veg)', qtyAdded: 25, removed: 0, reason: '', receivedBy: 'Emily' }
    ],
    packaging: [
      { submissionId: 'demo-cooler-1', date: today, time: '06:40', kitchen: 'Taipei Kitchen', kitchenId: 'legacy-park', driver: 'Owen', store: '6006', storeName: 'Store 6006', dish: 'Spring Roll (Veg)', loaded: 24, discarded: 0, discardReason: '', productTemp: 36, notes: '' },
      { submissionId: 'demo-cooler-1', date: today, time: '06:40', kitchen: 'Taipei Kitchen', kitchenId: 'legacy-park', driver: 'Owen', store: '6006', storeName: 'Store 6006', dish: 'Shrimp Egg Roll', loaded: 30, discarded: 1, discardReason: 'Damaged', productTemp: 36, notes: '' },
      { submissionId: 'demo-cooler-2', date: today, time: '06:52', kitchen: 'Taipei Kitchen', kitchenId: 'legacy-park', driver: 'Owen', store: '6061', storeName: 'Store 6061', dish: 'Chicken Lo Mein', loaded: 18, discarded: 0, discardReason: '', productTemp: 43, notes: 'Cooler was slow to come down' },
      { submissionId: 'demo-cooler-2', date: today, time: '06:52', kitchen: 'Taipei Kitchen', kitchenId: 'legacy-park', driver: 'Owen', store: '6061', storeName: 'Store 6061', dish: 'Beef Chow Fun', loaded: 15, discarded: 0, discardReason: '', productTemp: 43, notes: 'Cooler was slow to come down' }
    ],
    production: [
      { submittedAt: `${today}T06:15:33.000Z`, date: today, kitchen: 'Store 6112', cook: 'Lucia', dish: 'Spring Roll (Veg)', qtyProduced: 120, qtyDiscarded: 2, discardReason: 'Quality Issue' },
      { submittedAt: `${today}T06:45:10.000Z`, date: today, kitchen: 'Store 6112', cook: 'Lucia', dish: 'Shrimp Egg Roll', qtyProduced: 96, qtyDiscarded: 0, discardReason: '' },
      { submittedAt: `${today}T07:20:47.000Z`, date: today, kitchen: 'Store 6112', cook: 'Anna', dish: 'Chicken Lo Mein', qtyProduced: 48, qtyDiscarded: 1, discardReason: 'Temperature' },
      { submittedAt: `${yesterday}T06:30:12.000Z`, date: yesterday, kitchen: 'Store 6112', cook: 'Jiang', dish: 'Beef Chow Fun', qtyProduced: 36, qtyDiscarded: 0, discardReason: '' },
      { submittedAt: `${yesterday}T07:05:28.000Z`, date: yesterday, kitchen: 'Store 6112', cook: 'Jiang', dish: 'Pork Dumpling', qtyProduced: 72, qtyDiscarded: 1, discardReason: 'Out of date' }
    ],
    sales: [
      { date: today, store: '6006', storeName: 'Store 6006', dish: 'General Tso Chicken Bento', units: 18, transactions: 17, netSales: 179.82, grossSales: 179.82, returnedUnits: 0, upc: '00024575600000', dishSystemId: 'c727a826-a4db-4a49-87d2-5c6615f44585', storeId: '6006' },
      { date: today, store: '6006', storeName: 'Store 6006', dish: 'Shrimp Egg Roll', units: 22, transactions: 20, netSales: 176.00, grossSales: 176.00, returnedUnits: 1, upc: '00024577200000', dishSystemId: 'f48bebe2-0e28-42f7-a1cc-1163022b2ee0', storeId: '6006' },
      { date: today, store: '6061', storeName: 'Store 6061', dish: 'Sesame Chicken Bento', units: 25, transactions: 23, netSales: 249.75, grossSales: 249.75, returnedUnits: 0, upc: '00024576100000', dishSystemId: '0aec557c-dad3-4cff-ba6c-fc6b1cb72c02', storeId: '6061' },
      { date: today, store: '6061', storeName: 'Store 6061', dish: 'NON-TAIPEI DISH', units: 140, transactions: 118, netSales: 1764.60, grossSales: 1764.60, returnedUnits: 0, upc: '00023830700000', dishSystemId: '00000000-0000-4000-8000-000000000001', storeId: '6061' },
      { date: yesterday, store: '6006', storeName: 'Store 6006', dish: 'General Tso Chicken Bento', units: 21, transactions: 19, netSales: 209.79, grossSales: 209.79, returnedUnits: 0, upc: '00024575600000', dishSystemId: 'c727a826-a4db-4a49-87d2-5c6615f44585', storeId: '6006' },
      { date: yesterday, store: '6253', storeName: 'Store 6253', dish: 'Bento Chicken Lo Mein', units: 14, transactions: 14, netSales: 125.86, grossSales: 125.86, returnedUnits: 0, upc: '00022738800000', dishSystemId: '903ec8bc-2403-40a5-a8ae-3703c356d2eb', storeId: '6253' }
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

    DATA.production = data.production || [];
    DATA.packaging = data.packaging || [];
    DATA.deliveries = data.deliveries || [];
    DATA.sales = data.sales || [];
    DATA.waste = data.waste || [];
    DATA.violations = data.violations || [];
    DATA.stores = data.stores || [];
    DATA.reference = data.reference || null;
    DATA.window = data.window || null;   // absent until the backend serves windows
    DATA.lastUpdated = data.lastUpdated || null;
    LAST_FETCH_AT = Date.now();

    console.log('[Data] Fetched:', DATA);
    updateStatus('connected', statusText());

    // Production precedes delivery: food is cooked before it is delivered.
    renderProduction();
    renderPackaging();
    renderDeliveries();
    renderSales();
    renderFoodSafety();
    configOnDataRefresh();   // the Config panel decides for itself what a poll may touch
  } catch (e) {
    console.error('[Data] Fetch failed:', e);
    updateStatus('error', `Fetch failed: ${e.message}`);
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
  if (panelName === 'config') renderConfig();

  // Scroll to top on mobile when switching panels
  if (window.innerWidth <= 768) {
    window.scrollTo(0, 0);
  }
}

/** An element with a class and text. Built nodes carry server strings as text, never as HTML. */
function makeEl(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ═══════════════════════════════════════════════════════════════════════════
// Home panel: form launchers
// ═══════════════════════════════════════════════════════════════════════════
// One launcher per form so the two cannot be confused. A kitchen opens the production
// log with ?kitchen=<id>; a store opens the delivery form with ?store=<id>. The lists come
// from data/kitchens.json and data/stores.json, the same files the forms read.

const HOME_FORMS = {
  production: { page: '../taipei_production_form3.html', param: 'kitchen', list: 'kitchens', selectId: 'home-kitchen',      label: 'Open Production Log', noun: 'kitchen', caption: 'Production Log', file: k => 'taipei-production-' + (k.kitchenId || k.id) },
  packaging:  { page: '../taipei_packaging_form.html',   param: 'kitchen', list: 'kitchens', selectId: 'home-pack-kitchen', label: 'Open Packaging Form', noun: 'kitchen', caption: 'Packaging Form', file: k => 'taipei-packaging-' + (k.kitchenId || k.id) },
  delivery:   { page: '../taipei_delivery_form3.html',   param: 'store',   list: 'stores',   selectId: 'home-store',        label: 'Open Delivery Form',  noun: 'store',   caption: 'Delivery Form',  file: s => 'taipei-delivery-' + (s.storeId || s.id) }   // QR files are named by the organisation's own id, which is how a printed code is recognised
};

const HOME_LISTS = { kitchens: [], stores: [] };   // the entries behind the home page's pickers

/** Whether a reference entry is one the forms offer: verified, not switched off, not deleted. Same rule as forms/common.js. */
function referenceOffered(entry) {
  return entry.active !== false && entry.verified !== false && !entry.deletedAt;
}

async function loadHomeLocations() {
  const status = document.getElementById('home-locations-status');
  try {
    await Promise.all(Object.keys(HOME_LISTS).map(async key => {
      const response = await fetch('../data/' + key + '.json');
      if (!response.ok) throw new Error(key + '.json: HTTP ' + response.status);
      const data = await response.json();
      HOME_LISTS[key] = (data[key] || []).filter(referenceOffered)
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    }));
    // Links and QR codes carry the entry's System ID. The delivery form resolves the store
    // number from it, and still accepts the number itself, which codes printed earlier carry.
    Object.values(HOME_FORMS).forEach(form => fillHomeSelect(form.selectId, HOME_LISTS[form.list], homeEntryText, e => e.id));
    status.textContent = '';
  } catch (e) {
    console.error('[Home] Could not load the kitchen and store lists:', e);
    status.textContent = 'The kitchen and store lists could not be loaded. Reload to try again.';
  }
  homeUpdateLaunchers();
}

function homeEntryText(entry) {
  return entry.location ? `${entry.name} · ${entry.location}` : entry.name;
}

function fillHomeSelect(id, entries, text, value) {
  const select = document.getElementById(id);
  while (select.options.length > 1) select.remove(1);
  entries.forEach(entry => {
    const option = document.createElement('option');
    option.value = value ? value(entry) : entry.id;
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

/** Each card's two buttons follow its picker; a change of location also retires the code drawn for the old one. */
function homeUpdateLaunchers() {
  Object.keys(HOME_FORMS).forEach(kind => {
    const form = HOME_FORMS[kind];
    const ready = homeTarget(kind) !== null;
    const open = document.getElementById('home-open-' + kind);
    open.disabled = !ready;
    open.textContent = ready ? form.label : `Select a ${form.noun}`;
    document.getElementById('home-qr-' + kind).disabled = !ready;
    const output = document.getElementById('home-qr-output-' + kind);
    if (output.dataset.systemId && output.dataset.systemId !== document.getElementById(form.selectId).value) output.hidden = true;
  });
}

/**
 * The absolute address a QR code has to carry. `homeTarget` is relative to this page, which
 * is what a link needs and what a phone camera cannot use. Resolving against the current
 * location also means a code generated on the staging dashboard points at the staging form.
 */
function homeQrUrl(kind) {
  return new URL(homeTarget(kind), window.location.href).href;
}

/** Draw the code for the card's chosen location into that card, at a size worth printing. */
function homeGenerateQr(kind) {
  const form = HOME_FORMS[kind];
  const select = document.getElementById(form.selectId);
  const output = document.getElementById('home-qr-output-' + kind);
  const status = document.getElementById('home-locations-status');
  if (!select.value) return;
  const url = homeQrUrl(kind);

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

  const canvas = output.querySelector('.home-qr-canvas');
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

  output.querySelector('.home-qr-label').textContent = form.caption + ' — ' + select.options[select.selectedIndex].textContent;
  output.querySelector('.home-qr-url').textContent = url;
  const download = output.querySelector('.home-qr-download');
  download.href = canvas.toDataURL('image/png');
  const entry = HOME_LISTS[form.list].find(e => e.id === select.value);
  download.download = form.file(entry || { id: select.value }) + '.png';

  output.dataset.systemId = select.value;
  output.hidden = false;
  status.textContent = '';
}

/** Print a card's code on its own page, captioned, so it can go straight on a wall. */
function homePrintQr(kind) {
  const output = document.getElementById('home-qr-output-' + kind);
  const canvas = output.querySelector('.home-qr-canvas');
  const label = output.querySelector('.home-qr-label').textContent;
  const url = output.querySelector('.home-qr-url').textContent;
  const sheet = window.open('', '_blank', 'width=700,height=800');
  if (!sheet) {
    document.getElementById('home-locations-status').textContent =
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

// The rule names in backend/Violations.gs, by the kind of location each applies to.
const VIOLATION_TYPES = {
  Kitchen: ['Product Loading Temperature'],
  Store:   ['Store Cooler Temperature', 'Product Arrival Temperature']
};

/**
 * The store a row belongs to: by the System ID the row carries, else by the store number a
 * row from before System IDs carries under storeId, or under store, bare or inside a name.
 * Null when neither is on the list.
 */
function storeOf(row) {
  const key = String(row.storeSystemId || '').trim().toLowerCase();
  const byKey = key ? DATA.stores.find(s => String(s.key).toLowerCase() === key) : null;
  if (byKey) return byKey;
  const number = String(row.storeId || '').trim() || (String(row.store || '').match(/\b(\d{4})\b/) || [])[1] || '';
  return (number && DATA.stores.find(s => String(s.id) === number)) || null;
}

/** A row's store as it should read: the list's current name, else what the row says. */
function storeNameOf(row) {
  const store = storeOf(row);
  return store ? store.name : String(row.storeName || row.store || '');
}

/**
 * Per-location counts for the week ending on the chosen day, from the Violations tab: one per
 * violation, split by type. A kitchen that loaded coolers or a store that was delivered to
 * that week with no violation shows zeros, so the week reads as a checklist. Kitchens come
 * first. A type the table above does not know gets its own column on that card.
 */
function loadFoodSafety() {
  const weekEnd = document.getElementById('safety-week-end').value;
  const container = document.getElementById('safety-summary');
  if (!weekEnd) return;
  const weekStart = addDaysISO(weekEnd, -6);
  ensureWindow(weekStart);   // a wider window refetches and re-renders this panel

  const inWeek = date => { const d = normalizeDate(date); return d >= weekStart && d <= weekEnd; };
  const locations = new Map();   // "<type>:<System ID, or the own id of a row without one>" → { type, name, counts }
  const location = (type, id, name) => {
    const key = type + ':' + String(id || name || '');
    if (!locations.has(key)) locations.set(key, { type: type, name: name || (type + ' ' + id), counts: {} });
    return locations.get(key);
  };
  (DATA.packaging || []).filter(r => inWeek(r.date)).forEach(r => location('Kitchen', r.kitchenSystemId || r.kitchenId, r.kitchen));
  DATA.deliveries.filter(d => inWeek(d.date)).forEach(d => { const store = storeOf(d); location('Store', store ? store.key : (d.storeId || d.store), storeNameOf(d)); });
  (DATA.violations || []).filter(v => inWeek(v.date)).forEach(v => {
    const where = location(v.locationType || 'Store', v.locationSystemId || v.locationId, v.location);
    where.counts[v.violationType] = (where.counts[v.violationType] || 0) + 1;
  });

  container.textContent = '';
  if (!locations.size) {
    container.appendChild(makeEl('div', 'loading', 'No coolers, deliveries or violations in this week.'));
    return;
  }
  const order = { Kitchen: 0, Store: 1 };
  Array.from(locations.values())
    .sort((a, b) => (order[a.type] - order[b.type]) || a.name.localeCompare(b.name))
    .forEach(where => {
      const types = (VIOLATION_TYPES[where.type] || []).slice();
      Object.keys(where.counts).forEach(type => { if (!types.includes(type)) types.push(type); });
      const card = makeEl('div', 'safety-store-card');
      const title = makeEl('div', 'safety-store-name', where.name);
      title.appendChild(makeEl('span', 'violation-location-type', where.type));
      card.appendChild(title);
      const counts = makeEl('div', 'safety-violations');
      types.forEach(type => {
        const n = where.counts[type] || 0;
        const cell = makeEl('div');
        cell.appendChild(makeEl('div', 'violation-count' + (n ? '' : ' zero'), String(n)));
        cell.appendChild(makeEl('div', 'violation-label', type));
        counts.appendChild(cell);
      });
      card.appendChild(counts);
      if (!Object.values(where.counts).some(Boolean)) card.appendChild(makeEl('p', 'safety-all-clear', 'No violations this week'));
      container.appendChild(card);
    });
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
// Packaging panel
// ═══════════════════════════════════════════════════════════════════════════
// One cooler per row: a submission's dish rows folded into their totals, with the dish lines
// a tap away. Ranges work as on the other panels: filter what is loaded, widen when asked.

const PACKAGING_STATE = {
  quickRange: 7,
  page: 1,
  perPage: 25,
  coolers: [],
  open: {},   // cooler key → true while its dish lines are shown
  isInitialized: false
};

function renderPackaging() {
  PACKAGING_STATE.isInitialized = true;
  setPackagingQuickRange(PACKAGING_STATE.quickRange);
}

function setPackagingQuickRange(range) {
  PACKAGING_STATE.quickRange = range;
  PACKAGING_STATE.page = 1;
  document.querySelectorAll('#panel-packaging .btn-time-range').forEach(btn => btn.classList.toggle('active', btn.dataset.range == range));

  const today = getTodayDate();
  let rows = DATA.packaging || [];
  if (range === 'today') {
    rows = rows.filter(r => normalizeDate(r.date) === today);
  } else if (range === 'all') {
    ensureWindow(earliestWindowFrom());
  } else {
    const start = addDaysISO(today, -range);
    ensureWindow(start);
    rows = rows.filter(r => normalizeDate(r.date) >= start);
  }
  PACKAGING_STATE.coolers = packagingCoolers(rows);
  updatePackagingMetrics();
  displayPackagingTable();
}

/** Dish rows folded into coolers, newest first. */
function packagingCoolers(rows) {
  const coolers = new Map();
  rows.forEach(r => {
    const key = r.submissionId || [r.date, r.time, r.kitchen, r.store].join('|');
    if (!coolers.has(key)) {
      coolers.set(key, {
        key, date: r.date, time: r.time || '', kitchen: r.kitchen || '', driver: r.driver || '',
        storeName: storeNameOf(r), productTemp: r.productTemp, notes: r.notes || '',
        loaded: 0, discarded: 0, dishes: []
      });
    }
    const cooler = coolers.get(key);
    cooler.loaded += parseInt(r.loaded, 10) || 0;
    cooler.discarded += parseInt(r.discarded, 10) || 0;
    cooler.dishes.push(r);
  });
  return Array.from(coolers.values()).sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
}

function updatePackagingMetrics() {
  const coolers = PACKAGING_STATE.coolers;
  const loaded = coolers.reduce((sum, c) => sum + c.loaded, 0);
  const discarded = coolers.reduce((sum, c) => sum + c.discarded, 0);
  const temps = coolers.map(c => parseFloat(c.productTemp)).filter(t => !isNaN(t));
  const warmest = temps.length ? Math.max(...temps) : null;
  const over = temps.filter(t => t > TEMP_LIMIT_F).length;

  const grid = document.getElementById('packaging-metrics');
  grid.textContent = '';
  [
    ['Coolers Loaded', coolers.length.toLocaleString(), 'One per store per pickup', false],
    ['Items Loaded', loaded.toLocaleString(), discarded.toLocaleString() + ' discarded at loading', false],
    ['Warmest Product', warmest === null ? '—' : warmest + '°F', 'Limit ' + TEMP_LIMIT_F + '°F', warmest !== null && warmest > TEMP_LIMIT_F],
    ['Over Limit', over.toLocaleString(), 'Coolers with product above ' + TEMP_LIMIT_F + '°F', over > 0]
  ].forEach(([label, value, sub, alert]) => {
    const card = makeEl('div', 'metric-card' + (alert ? ' alert' : ''));
    card.appendChild(makeEl('div', 'metric-label', label));
    card.appendChild(makeEl('div', 'metric-value', value));
    card.appendChild(makeEl('div', 'metric-sub', sub));
    grid.appendChild(card);
  });
}

function displayPackagingTable() {
  const coolers = PACKAGING_STATE.coolers;
  const container = document.getElementById('packaging-table-container');
  const pagination = document.getElementById('packaging-pagination');
  document.getElementById('packaging-record-count').textContent = coolers.length + ' cooler' + (coolers.length === 1 ? '' : 's');
  container.textContent = '';
  if (!coolers.length) {
    container.appendChild(makeEl('p', 'hint', 'No coolers in this range'));
    pagination.hidden = true;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(coolers.length / PACKAGING_STATE.perPage));
  PACKAGING_STATE.page = Math.min(Math.max(1, PACKAGING_STATE.page), totalPages);
  const start = (PACKAGING_STATE.page - 1) * PACKAGING_STATE.perPage;
  const page = coolers.slice(start, start + PACKAGING_STATE.perPage);

  const table = makeEl('table', 'data-table packaging-table');
  const thead = makeEl('thead');
  const headRow = makeEl('tr');
  ['Date', 'Time', 'Kitchen', 'Driver', 'Intended Store', 'Loaded', 'Discarded', 'Product Temp'].forEach(h => headRow.appendChild(makeEl('th', '', h)));
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = makeEl('tbody');
  page.forEach(cooler => {
    const warm = parseFloat(cooler.productTemp) > TEMP_LIMIT_F;
    const row = makeEl('tr', 'packaging-cooler' + (warm ? ' is-warm' : '') + (PACKAGING_STATE.open[cooler.key] ? ' is-open' : ''));
    [normalizeDate(cooler.date), cooler.time, cooler.kitchen, cooler.driver, cooler.storeName,
     String(cooler.loaded), String(cooler.discarded), isNaN(parseFloat(cooler.productTemp)) ? '—' : parseFloat(cooler.productTemp) + '°F']
      .forEach(text => row.appendChild(makeEl('td', '', text)));
    row.onclick = () => {
      PACKAGING_STATE.open[cooler.key] = !PACKAGING_STATE.open[cooler.key];
      displayPackagingTable();
    };
    tbody.appendChild(row);
    if (PACKAGING_STATE.open[cooler.key]) tbody.appendChild(packagingDishesRow(cooler));
  });
  table.appendChild(tbody);
  container.appendChild(table);

  pagination.hidden = totalPages <= 1;
  document.getElementById('packaging-page-info').textContent = 'Page ' + PACKAGING_STATE.page + ' of ' + totalPages;
}

/** The dish lines of one cooler, as a row spanning the table. */
function packagingDishesRow(cooler) {
  const row = makeEl('tr', 'packaging-dishes');
  const cell = makeEl('td');
  cell.colSpan = 8;
  const inner = makeEl('table', 'packaging-dishes-table');
  const head = makeEl('tr');
  ['Dish', 'Loaded', 'Discarded', 'Reason'].forEach(h => head.appendChild(makeEl('th', '', h)));
  inner.appendChild(head);
  cooler.dishes.forEach(d => {
    const line = makeEl('tr');
    [d.dish || '', String(d.loaded || 0), String(d.discarded || 0), d.discardReason || ''].forEach(text => line.appendChild(makeEl('td', '', text)));
    inner.appendChild(line);
  });
  cell.appendChild(inner);
  if (cooler.notes) cell.appendChild(makeEl('p', 'packaging-notes', 'Notes: ' + cooler.notes));
  row.appendChild(cell);
  return row;
}

function packagingPage(delta) {
  PACKAGING_STATE.page += delta;
  displayPackagingTable();
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
      storeNameOf(d).toLowerCase().includes(search)
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
    const storeName = storeNameOf(d);
    if (!fullnessByStore[storeName]) {
      fullnessByStore[storeName] = { sum: 0, count: 0 };
    }
    fullnessByStore[storeName].sum += fullnessMap[d.casePrefillPercent];
    fullnessByStore[storeName].count++;
  });

  const storeBreakdown = Object.entries(fullnessByStore)
    .map(([storeName, data]) => {
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
    const storeData = storeOf(d);
    const storeName = storeData ? `${storeData.name} – ${storeData.location}` : String(d.store || '');

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
    kitchen: '',
    cook: '',
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

  // Normalize cook names to remove duplicates with trailing spaces
  const normalizeName = (name) => name ? name.trim() : '';

  populateSelect('production-kitchen-filter', new Set(filtered.map(p => p.kitchen).filter(Boolean)));
  populateSelect('production-cook-filter', new Set(filtered.map(p => normalizeName(p.cook)).filter(Boolean)));
  populateSelect('production-dish-filter', new Set(filtered.map(p => p.dish).filter(Boolean)));
}

function applyProductionAdvancedFilters() {
  PRODUCTION_STATE.advancedFilters = {
    kitchen: document.getElementById('production-kitchen-filter').value,
    cook: document.getElementById('production-cook-filter').value,
    dish: document.getElementById('production-dish-filter').value,
    search: document.getElementById('production-search').value.toLowerCase()
  };
  PRODUCTION_STATE.currentPage = 1;
  displayProductionTable();
}

function clearAllProductionFilters() {
  document.getElementById('production-kitchen-filter').value = '';
  document.getElementById('production-cook-filter').value = '';
  document.getElementById('production-dish-filter').value = '';
  document.getElementById('production-search').value = '';
  PRODUCTION_STATE.advancedFilters = {
    kitchen: '',
    cook: '',
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
  if (filters.kitchen) filtered = filtered.filter(p => p.kitchen === filters.kitchen);
  if (filters.cook) filtered = filtered.filter(p => p.cook === filters.cook);
  if (filters.dish) filtered = filtered.filter(p => p.dish === filters.dish);
  if (filters.search) {
    filtered = filtered.filter(p => {
      return (p.date && p.date.toLowerCase().includes(filters.search)) ||
             (p.kitchen && p.kitchen.toLowerCase().includes(filters.search)) ||
             (p.cook && p.cook.toLowerCase().includes(filters.search)) ||
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
        <td>${p.kitchen || ''}</td>
        <td>${p.cook || ''}</td>
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
          <th>Kitchen</th>
          <th>Cook</th>
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
  const week = document.getElementById('safety-week-end');
  if (week && !week.value) week.value = getTodayDate();   // the current week, until someone picks another
  checkForViolations();   // the banner
  loadFoodSafety();
  renderViolations();
}

// ═══════════════════════════════════════════════════════════════════════════
// Sales panel
// ═══════════════════════════════════════════════════════════════════════════
// Sales rows are one store, dish and day each, from the retailer's export. The panel sums
// our dishes by day, store and dish for the chosen range, and sets them against what the
// deliveries put on the shelf over the same days. The retailer's other Asian-deli lines,
// filed under the reserved NON-TAIPEI DISH, appear only as the denominator of one number:
// our share of what the store rang up in that category.

const SALES_CATCHALL_ID = '00000000-0000-4000-8000-000000000001';   // the reserved NON-TAIPEI DISH; see backend/ReferenceSeed.gs
const SALES_STATE = {
  quickRange: 7,
  rows: [],          // our dishes' sales rows in range
  otherNet: {},      // store number -> net sales of everything else in the category, in range
  delivered: {},     // store number -> units added to shelves in range
  chart: null
};

function renderSales() {
  setSalesQuickRange(SALES_STATE.quickRange);
}

function setSalesQuickRange(range) {
  SALES_STATE.quickRange = range;
  document.querySelectorAll('#panel-sales .btn-time-range').forEach(btn => btn.classList.toggle('active', btn.dataset.range == range));

  const today = getTodayDate();
  let start = null;
  if (range === 'today') start = today;
  else if (range === 'all') ensureWindow(earliestWindowFrom());
  else { start = addDaysISO(today, -range); ensureWindow(start); }
  const inRange = r => !start || normalizeDate(r.date) >= start;

  const sales = (DATA.sales || []).filter(inRange);
  SALES_STATE.rows = sales.filter(r => r.dishSystemId !== SALES_CATCHALL_ID);
  const otherNet = {};
  sales.filter(r => r.dishSystemId === SALES_CATCHALL_ID).forEach(r => { otherNet[String(r.store)] = (otherNet[String(r.store)] || 0) + salesNumber(r.netSales); });
  SALES_STATE.otherNet = otherNet;
  const delivered = {};
  DATA.deliveries.filter(inRange).forEach(d => { delivered[String(d.store)] = (delivered[String(d.store)] || 0) + (parseInt(d.added, 10) || 0); });
  SALES_STATE.delivered = delivered;

  updateSalesMetrics();
  updateSalesChart();
  displaySalesByStore();
  displaySalesByDish();
}

const salesNumber = n => (Number(n) || 0);
const salesMoney = n => '$' + salesNumber(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const salesPercent = (part, whole) => whole > 0 ? Math.round(part / whole * 100) + '%' : '—';

function updateSalesMetrics() {
  const rows = SALES_STATE.rows;
  const units = rows.reduce((s, r) => s + salesNumber(r.units), 0);
  const net = rows.reduce((s, r) => s + salesNumber(r.netSales), 0);
  const returned = rows.reduce((s, r) => s + salesNumber(r.returnedUnits), 0);
  const delivered = Object.values(SALES_STATE.delivered).reduce((s, n) => s + n, 0);
  const otherNet = Object.values(SALES_STATE.otherNet).reduce((s, n) => s + n, 0);

  const grid = document.getElementById('sales-metrics');
  grid.textContent = '';
  [
    ['Units Sold', units.toLocaleString(), returned ? returned.toLocaleString() + ' returned' : 'No returns'],
    ['Net Sales', salesMoney(net), units ? salesMoney(net / units) + ' per unit' : '—'],
    ['Sell-through', salesPercent(units, delivered), units.toLocaleString() + ' sold of ' + delivered.toLocaleString() + ' delivered'],
    ['Share of Asian Deli', salesPercent(net, net + otherNet), 'of ' + salesMoney(net + otherNet) + ' rung up in the category']
  ].forEach(([label, value, sub]) => {
    const card = makeEl('div', 'metric-card');
    card.appendChild(makeEl('div', 'metric-label', label));
    card.appendChild(makeEl('div', 'metric-value', value));
    card.appendChild(makeEl('div', 'metric-sub', sub));
    grid.appendChild(card);
  });
}

function updateSalesChart() {
  const byDate = {};
  SALES_STATE.rows.forEach(r => { const d = normalizeDate(r.date); byDate[d] = (byDate[d] || 0) + salesNumber(r.units); });
  const dates = Object.keys(byDate).sort();
  if (SALES_STATE.chart) SALES_STATE.chart.destroy();
  const ctx = document.getElementById('chart-sales-units').getContext('2d');
  SALES_STATE.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
      datasets: [{ label: 'Units sold', data: dates.map(d => byDate[d]), borderColor: '#27AE60', backgroundColor: 'rgba(39, 174, 96, 0.1)', tension: 0.3, fill: true }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

/** A table built from rows of cells, headers first; cells are text. */
function salesTable(headers, rows) {
  const table = makeEl('table', 'data-table');
  const thead = makeEl('thead');
  const head = makeEl('tr');
  headers.forEach(h => head.appendChild(makeEl('th', '', h)));
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = makeEl('tbody');
  rows.forEach(cells => {
    const tr = makeEl('tr');
    cells.forEach(text => tr.appendChild(makeEl('td', '', text)));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

function salesEmpty(container, what) {
  container.textContent = '';
  container.appendChild(makeEl('p', 'hint', what));
}

function displaySalesByStore() {
  const container = document.getElementById('sales-by-store');
  const byStore = {};
  SALES_STATE.rows.forEach(r => {
    const key = String(r.storeSystemId || r.storeId || r.store);
    const s = byStore[key] || (byStore[key] = { name: storeNameOf(r), units: 0, transactions: 0, net: 0 });
    s.units += salesNumber(r.units);
    s.transactions += salesNumber(r.transactions);
    s.net += salesNumber(r.netSales);
  });
  const stores = Object.entries(byStore).sort((a, b) => b[1].net - a[1].net);
  if (!stores.length) return salesEmpty(container, 'No sales rows in this range.');
  container.textContent = '';
  container.appendChild(salesTable(
    ['Store', 'Units', 'Transactions', 'Net Sales', 'Delivered', 'Sell-through', 'Share of Asian Deli'],
    stores.map(([number, s]) => {
      const delivered = SALES_STATE.delivered[number] || 0;
      const other = SALES_STATE.otherNet[number] || 0;
      return [s.name, s.units.toLocaleString(), s.transactions.toLocaleString(), salesMoney(s.net), delivered.toLocaleString(), salesPercent(s.units, delivered), salesPercent(s.net, s.net + other)];
    })
  ));
}

function displaySalesByDish() {
  const container = document.getElementById('sales-by-dish');
  const byDish = {};
  SALES_STATE.rows.forEach(r => {
    const key = String(r.dishSystemId || r.dish);
    const d = byDish[key] || (byDish[key] = { name: r.dish, units: 0, transactions: 0, net: 0, returned: 0 });
    d.units += salesNumber(r.units);
    d.transactions += salesNumber(r.transactions);
    d.net += salesNumber(r.netSales);
    d.returned += salesNumber(r.returnedUnits);
  });
  const dishes = Object.values(byDish).sort((a, b) => b.units - a.units);
  if (!dishes.length) return salesEmpty(container, 'No sales rows in this range.');
  container.textContent = '';
  container.appendChild(salesTable(
    ['Dish', 'Units', 'Transactions', 'Net Sales', 'Avg Net per Unit', 'Returned'],
    dishes.map(d => [d.name, d.units.toLocaleString(), d.transactions.toLocaleString(), salesMoney(d.net), d.units ? salesMoney(d.net / d.units) : '—', d.returned.toLocaleString()])
  ));
}

// ═══════════════════════════════════════════════════════════════════════════
// Sales import
// ═══════════════════════════════════════════════════════════════════════════
// The retailer's export is read in this browser, never uploaded. Its transaction lines are
// reduced to one row per store, UPC and day, previewed, and sent to the backend a month at a
// time as { type: 'sales', rows }. The backend resolves stores and dishes and replaces rows
// in place, so the same week can be imported twice. The parser knows the DAX export's
// columns by their names, not their positions, and reads the date out of the Transaction
// Id, which the export carries it in.

const SALES_IMPORT_MAX_LINES = 50000;   // a week is about 5,000; past this, ask for a shorter export rather than freeze the tab
const SALES_IMPORT = { file: null, months: null, busy: false };

/** Column indexes by what the importer needs, matched on header text with the retailer's numeric prefixes ("06 Store") dropped. */
function salesImportColumns(headerRow) {
  const normal = cell => String(cell === undefined || cell === null ? '' : cell).replace(/^\d+\s+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const headers = headerRow.map(normal);
  const wanted = { store: 'store', upc: 'upc', transactionId: 'transaction id', gross: 'product gross sales', net: 'product net sales', units: 'scanned units', city: 'city' };
  const at = {};
  const missing = [];
  Object.keys(wanted).forEach(key => {
    at[key] = headers.indexOf(wanted[key]);
    if (at[key] < 0 && key !== 'city') missing.push(wanted[key]);
  });
  if (missing.length) throw new Error('The sheet has no column for: ' + missing.join(', ') + '. Expected the DAX export\'s columns.');
  return at;
}

/** The first sheet whose first row is the export's header row, with its rows as arrays. */
function salesImportSheet(workbook) {
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' });
    const first = rows.findIndex(row => row.some(cell => String(cell).trim() !== ''));
    if (first < 0) continue;
    try {
      const columns = salesImportColumns(rows[first]);
      return { name: name, columns: columns, lines: rows.slice(first + 1) };
    } catch (e) {
      // not this sheet; the DAX file's first sheet is its report description
    }
  }
  throw new Error('No sheet in the file has the export\'s columns (Store, UPC, Transaction Id, Product Net Sales, Scanned Units).');
}

/** Transaction lines reduced to one row per store, UPC and day. */
function salesImportReduce(lines, at) {
  const cell = (line, key) => (at[key] < 0 ? '' : line[at[key]]);
  const rows = {};
  let kept = 0;
  let skipped = 0;
  const bad = [];
  lines.forEach((line, i) => {
    const storeText = String(cell(line, 'store') || '').trim();
    const upcText = String(cell(line, 'upc') || '').trim();
    const idText = String(cell(line, 'transactionId') || '').replace(/\D/g, '');
    if (!storeText && !upcText && !idText) { skipped += 1; return; }   // a blank line, as the export ends with
    const store = (storeText.match(/(\d+)\s*$/) || [])[1];
    let upc = (upcText.match(/^\d+/) || [])[0] || '';
    if (upc && upc.length < 14) upc = upc.padStart(14, '0');   // a UPC saved through a spreadsheet that dropped its leading zeros
    const date = /^\d{8}/.test(idText) ? idText.slice(0, 4) + '-' + idText.slice(4, 6) + '-' + idText.slice(6, 8) : '';
    const dateOk = date && !isNaN(new Date(date + 'T12:00:00Z').getTime()) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
    if (!store || upc.length !== 14 || !dateOk) {
      if (bad.length < 5) bad.push('line ' + (i + 2) + ': ' + [storeText || '(no store)', upcText || '(no UPC)', idText || '(no transaction id)'].join(' / '));
      skipped += 1;
      return;
    }
    const units = Math.round(Number(cell(line, 'units')) || 0);
    const net = Number(cell(line, 'net')) || 0;
    const gross = Number(cell(line, 'gross')) || 0;
    const key = date + '|' + store + '|' + upc;
    const row = rows[key] || (rows[key] = { date: date, storeId: store, upc: upc, city: String(cell(line, 'city') || '').trim(), units: 0, netSales: 0, grossSales: 0, returnedUnits: 0, baskets: new Set() });
    row.units += units;
    row.netSales += net;
    row.grossSales += gross;
    if (units < 0) row.returnedUnits += -units;
    row.baskets.add(idText);
    kept += 1;
  });
  const out = Object.values(rows).map(row => ({
    date: row.date, storeId: row.storeId, upc: row.upc, city: row.city,
    units: row.units, transactions: row.baskets.size,
    netSales: Math.round(row.netSales * 100) / 100, grossSales: Math.round(row.grossSales * 100) / 100,
    returnedUnits: row.returnedUnits
  })).sort((a, b) => (a.date + a.storeId + a.upc).localeCompare(b.date + b.storeId + b.upc));
  return { rows: out, kept: kept, skipped: skipped, bad: bad };
}

function salesImportSay(text, bad) {
  const status = document.getElementById('sales-import-status');
  status.textContent = text;
  status.className = 'hint' + (bad ? ' bad' : '');
}

function salesImportReset() {
  SALES_IMPORT.file = null;
  SALES_IMPORT.months = null;
  document.getElementById('sales-import-preview').hidden = true;
  document.getElementById('sales-import-preview').textContent = '';
  document.getElementById('sales-import-go').disabled = true;
}

async function salesImportPick(input) {
  const file = input.files && input.files[0];
  salesImportReset();
  document.getElementById('sales-import-name').textContent = file ? file.name : '';
  salesImportSay('');
  if (!file) return;
  if (typeof XLSX === 'undefined') return salesImportSay('The spreadsheet library could not be loaded. Check the connection and reload.', true);

  salesImportSay('Reading ' + file.name + '…');
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', dense: true });
    const sheet = salesImportSheet(workbook);
    if (sheet.lines.length > SALES_IMPORT_MAX_LINES) {
      throw new Error('The sheet has ' + sheet.lines.length.toLocaleString() + ' lines; the importer takes up to ' + SALES_IMPORT_MAX_LINES.toLocaleString() + '. Export a shorter range.');
    }
    const reduced = salesImportReduce(sheet.lines, sheet.columns);
    if (!reduced.rows.length) throw new Error('No usable lines: every line lacked a store, a 14-digit UPC or a dated Transaction Id.' + (reduced.bad.length ? ' First: ' + reduced.bad[0] : ''));

    const months = {};
    reduced.rows.forEach(row => { const m = row.date.slice(0, 7); (months[m] = months[m] || []).push(row); });
    SALES_IMPORT.file = file.name;
    SALES_IMPORT.months = months;
    salesImportPreview(reduced, months);
    document.getElementById('sales-import-go').disabled = !CONFIG.webAppUrl;
    salesImportSay(CONFIG.webAppUrl ? '' : 'Demo mode: there is no backend to import into.', !CONFIG.webAppUrl);
  } catch (e) {
    console.error('[Sales import]', e);
    salesImportSay(e.message || String(e), true);
  }
}

/** What the import will do, from the reduced rows and the reference lists: the user confirms against this. */
function salesImportPreview(reduced, months) {
  const reference = DATA.reference || {};
  const knownStores = new Set((reference.stores || []).map(s => String(s.storeId)));
  const knownUpcs = new Set((reference.dishes || []).map(d => String(d.upc)).filter(Boolean));
  const dates = reduced.rows.map(r => r.date).sort();
  const stores = Array.from(new Set(reduced.rows.map(r => r.storeId))).sort();
  const newStores = stores.filter(s => !knownStores.has(s));
  const other = reduced.rows.filter(r => !knownUpcs.has(r.upc));
  const otherUpcs = new Set(other.map(r => r.upc));
  const returns = reduced.rows.filter(r => r.returnedUnits > 0).length;

  const box = document.getElementById('sales-import-preview');
  box.textContent = '';
  const line = (label, value, warn) => {
    const row = makeEl('div', 'sales-import-line' + (warn ? ' warn' : ''));
    row.appendChild(makeEl('span', 'sales-import-label', label));
    row.appendChild(makeEl('span', 'sales-import-value', value));
    box.appendChild(row);
  };
  line('Days', dates[0] + ' to ' + dates[dates.length - 1] + ' (' + new Set(dates).size + ' days)');
  line('Lines read', reduced.kept.toLocaleString() + (reduced.skipped ? ', ' + reduced.skipped.toLocaleString() + ' skipped' : ''), reduced.bad.length > 0);
  if (reduced.bad.length) line('Skipped because', reduced.bad.join('; ') + (reduced.skipped > reduced.bad.length ? '; …' : ''), true);
  line('Rows to write', reduced.rows.length.toLocaleString() + ' — ' + Object.keys(months).sort().map(m => m + ': ' + months[m].length.toLocaleString()).join(', '));
  line('Stores', stores.length + (newStores.length ? ' — ' + newStores.length + ' not on the list, to be added unverified: ' + newStores.join(', ') : ', all on the list'), newStores.length > 0);
  line('Our dishes', (reduced.rows.length - other.length).toLocaleString() + ' rows; ' + other.length.toLocaleString() + ' rows of ' + otherUpcs.size + ' other items go to NON-TAIPEI DISH');
  if (returns) line('Returns', returns.toLocaleString() + ' rows carry returned units');
  box.hidden = false;
}

/** Send the months in order, one request each; a failure stops there with the earlier months written. */
async function salesImportRun() {
  if (SALES_IMPORT.busy || !SALES_IMPORT.months) return;
  if (!CONFIG.webAppUrl) return salesImportSay('Demo mode: there is no backend to import into.', true);
  const months = Object.keys(SALES_IMPORT.months).sort();
  const button = document.getElementById('sales-import-go');
  SALES_IMPORT.busy = true;
  button.disabled = true;
  const done = [];
  try {
    for (const month of months) {
      const rows = SALES_IMPORT.months[month];
      salesImportSay('Writing ' + month + ' (' + rows.length.toLocaleString() + ' rows)…' + (done.length ? ' Done: ' + done.join('; ') : ''));
      const sent = await dashboardPost({ type: 'sales', rows: rows });
      if (!sent.ok) throw new Error(month + ': ' + sent.error);
      const r = sent.data;
      done.push(month + ' ' + r.added.toLocaleString() + ' added, ' + r.updated.toLocaleString() + ' replaced' +
        (r.storesCreated && r.storesCreated.length ? ', stores added: ' + r.storesCreated.join(', ') : ''));
    }
    salesImportSay('Imported ' + SALES_IMPORT.file + '. ' + done.join('; ') + '. Verify any added store on the Config tab.');
    document.getElementById('sales-import-file').value = '';
    salesImportReset();
    document.getElementById('sales-import-name').textContent = '';
    fetchData();   // the Sales panel below, and the reference lists if a store was added
  } catch (e) {
    console.error('[Sales import]', e);
    salesImportSay('Stopped: ' + (e.message || String(e)) + (done.length ? ' Already written: ' + done.join('; ') + '. Import again to finish; written months are replaced, not doubled.' : ''), true);
    button.disabled = false;
  } finally {
    SALES_IMPORT.busy = false;
  }
}

// ─── Violations ──────────────────────────────────────────────────────────────
// One card per violation, built with DOM calls and textContent: store names, notes and
// corrective actions are typed by people. A violation is resolved on its own card by naming
// the supervisor and the corrective action; both are required here and on the backend.

let violationStatusFilter = 'open';   // open | resolved | all
let violationRange = 30;              // 'today' | 7 | 30 | 'all', by the reading's date, like the other panels' ranges
const VIOLATION_DRAFTS = {};          // violationId → what has been typed on its card, kept across re-renders

function setViolationFilter(status) {
  violationStatusFilter = status;
  document.querySelectorAll('.violation-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === status));
  renderViolations();
}

/** Pick a range; a wider one widens the loaded window first, which re-renders on arrival. */
function setViolationRange(range) {
  violationRange = range;
  document.querySelectorAll('.violations-range .btn-time-range').forEach(btn => btn.classList.toggle('active', btn.dataset.range == range));
  const from = violationRangeStart();
  if (from) ensureWindow(from);
  renderViolations();
}

/** The first date the chosen range covers, or null for a range the loaded window already bounds. */
function violationRangeStart() {
  const today = getTodayDate();
  if (violationRange === 'today') return today;
  if (violationRange === 'all') return earliestWindowFrom();
  return addDaysISO(today, -violationRange);
}

function violationNode(tag, cls, text) {
  return makeEl(tag, cls, text);
}

function violationField(label, value) {
  const field = violationNode('div', 'violation-field');
  field.appendChild(violationNode('span', 'violation-field-label', label));
  field.appendChild(violationNode('span', 'violation-field-value', value));
  return field;
}

function violationTemp(value) {
  const n = parseFloat(value);
  return isNaN(n) ? '—' : n + '°F';
}

function violationWhen(instant) {
  const date = new Date(instant);
  return isNaN(date) ? String(instant || '') : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Active supervisors by name, for the "resolved by" picker. */
function violationResolvers() {
  const list = (DATA.reference && DATA.reference.supervisors) || [];
  return list.filter(referenceOffered)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
    .map(s => s.name);
}

function renderViolations() {
  const container = document.getElementById('violations-queue');
  if (!container) return;
  const all = Array.isArray(DATA.violations) ? DATA.violations : [];
  const from = violationRangeStart();
  const shown = all
    .filter(v => normalizeDate(v.date) >= from)
    .filter(v => violationStatusFilter === 'all' || (v.status || 'open') === violationStatusFilter)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));   // newest first

  container.textContent = '';
  if (!shown.length) {
    const span = violationRange === 'today' ? 'today' : violationRange === 'all' ? 'in the loaded window' : 'in the last ' + violationRange + ' days';
    const what = violationStatusFilter === 'all' ? 'violations' : violationStatusFilter + ' violations';
    container.appendChild(violationNode('div', 'violations-empty', 'No ' + what + ' ' + span + '.'));
    return;
  }
  const resolvers = violationResolvers();
  shown.forEach(v => container.appendChild(violationCard(v, resolvers)));
}

function violationCard(v, resolvers) {
  const resolved = v.status === 'resolved';
  const card = violationNode('article', 'violation-card' + (resolved ? ' resolved' : ''));
  card.dataset.violationId = v.violationId;

  const head = violationNode('div', 'violation-head');
  head.appendChild(violationNode('span', 'violation-status ' + (resolved ? 'is-resolved' : 'is-open'), resolved ? 'Resolved' : 'Open'));
  const where = violationNode('span', 'violation-store', v.location || 'Unknown location');
  where.appendChild(violationNode('span', 'violation-location-type', v.locationType || 'Store'));
  head.appendChild(where);
  head.appendChild(violationNode('span', 'violation-when', 'Detected ' + violationWhen(v.timestamp)));
  card.appendChild(head);

  // The reading: the type says which temperature this is, the value sits beside it with the limit.
  const reading = violationNode('div', 'violation-reading');
  reading.appendChild(violationNode('span', 'violation-reading-type', v.violationType || 'Temperature'));
  reading.appendChild(violationNode('span', 'violation-reading-value', violationTemp(v.value)));
  reading.appendChild(violationNode('span', 'violation-reading-limit', 'limit ' + TEMP_LIMIT_F + '°F'));
  card.appendChild(reading);

  const meta = violationNode('div', 'violation-meta');
  if (v.driver) meta.appendChild(violationField('Driver', v.driver));
  meta.appendChild(violationField('Notes', v.notes || 'None'));
  card.appendChild(meta);

  if (resolved) {
    const done = violationNode('div', 'violation-resolution');
    done.appendChild(violationField('Resolved', violationWhen(v.resolvedAt) + (v.resolvedBy ? ' by ' + v.resolvedBy : '')));
    done.appendChild(violationField('Corrective action', v.correctiveAction || 'Not recorded'));
    card.appendChild(done);
    return card;
  }

  const draft = VIOLATION_DRAFTS[v.violationId] || (VIOLATION_DRAFTS[v.violationId] = { resolvedBy: '', correctiveAction: '' });
  const form = violationNode('div', 'violation-resolve');

  const who = violationNode('label', 'violation-resolve-field');
  who.appendChild(violationNode('span', 'violation-resolve-label', 'Resolved by'));
  const select = document.createElement('select');
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = resolvers.length ? '— Select a supervisor —' : 'No supervisors on the list';
  select.appendChild(blank);
  resolvers.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
  select.value = draft.resolvedBy;
  select.disabled = !resolvers.length;
  select.onchange = () => { draft.resolvedBy = select.value; select.classList.remove('missing'); };
  who.appendChild(select);
  form.appendChild(who);

  const what = violationNode('label', 'violation-resolve-field grow');
  what.appendChild(violationNode('span', 'violation-resolve-label', 'Corrective action taken'));
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 500;
  input.placeholder = 'e.g. Product discarded; cooler reset and rechecked at 38°F';
  input.value = draft.correctiveAction;
  input.oninput = () => { draft.correctiveAction = input.value; input.classList.remove('missing'); };
  what.appendChild(input);
  form.appendChild(what);

  const button = violationNode('button', 'btn-apply-filters violation-resolve-btn', 'Mark resolved');
  button.type = 'button';
  form.appendChild(button);
  card.appendChild(form);

  const status = violationNode('div', 'violation-resolve-status');
  card.appendChild(status);
  button.onclick = () => resolveViolation(v, { select, input, button, status });
  return card;
}

async function resolveViolation(v, ui) {
  const resolvedBy = ui.select.value;
  const correctiveAction = ui.input.value.replace(/\s+/g, ' ').trim();
  const refuse = (message, control) => {
    ui.status.textContent = message;
    ui.status.className = 'violation-resolve-status bad';
    if (control) { control.classList.add('missing'); control.focus(); }
  };
  if (!resolvedBy) return refuse('Choose who resolved it.', ui.select);
  if (!correctiveAction) return refuse('Describe the corrective action taken.', ui.input);
  if (!CONFIG.webAppUrl) return refuse('Demo mode: there is no backend to record this.');
  if (!v.month) return refuse('This violation has no month file and cannot be resolved here.');

  ui.button.disabled = true;
  ui.status.className = 'violation-resolve-status';
  ui.status.textContent = 'Saving…';
  try {
    const sent = await dashboardPost({ type: 'resolveViolation', violationId: v.violationId, month: v.month, resolvedBy, correctiveAction });
    if (!sent.ok) throw new Error(sent.error);
    const data = sent.data;
    Object.assign(v, { status: 'resolved', resolvedAt: data.resolvedAt, resolvedBy: data.resolvedBy, correctiveAction: data.correctiveAction });
    delete VIOLATION_DRAFTS[v.violationId];
    renderViolations();
    checkForViolations();
  } catch (e) {
    ui.button.disabled = false;
    refuse('Not saved: ' + e.message);
  }
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
// Config panel: the reference lists
// ═══════════════════════════════════════════════════════════════════════════════
// Six lists, one on screen at a time. The owner edits a buffer per list and saves it as a
// batch of ops (type: 'config'); the backend writes the Reference sheet and asks GitHub to
// republish data/<list>.json for the forms. A row is never removed from the sheet: an entry
// is deleted (Deleted At set; folded away here, restorable) and a dish may also be switched
// off, and ids never change once saved. Store numbers are on printed QR codes. Kitchens,
// stores and dishes are stored in the records with their System ID and read back under
// their current name, so renaming them is safe; cooks, drivers and supervisors are stored
// by name alone, so a rename there splits history and the panel says so before it happens.
//
// Every server-supplied string is set with textContent or .value, never innerHTML: these
// names are edited on a web page and reach every form.

// The order of the strip, the backend payload and the sheet's tabs alike.
const CONFIG_LISTS = [
  { key: 'kitchens',    label: 'Kitchens',    noun: 'kitchen',    byName: false,
    attrs: [
      { key: 'kitchenType', label: 'Kitchen Type', kind: 'type' },
      { key: 'kitchenId',   label: 'Kitchen ID',   kind: 'orgId', uniqueWith: 'kitchenType' },
      { key: 'location',    label: 'Location',     kind: 'text', required: true, editable: true }
    ],
    verified: true,
    blurb: 'Where batches are cooked and coolers are loaded. The production and packaging forms carry the kitchen name, and its QR code carries its System ID. The Kitchen ID is the identifier the organisation named by Kitchen Type uses for it.' },
  { key: 'stores',      label: 'Stores',      noun: 'store',      byName: false,
    attrs: [
      { key: 'storeType', label: 'Store Type', kind: 'type' },
      { key: 'storeId',   label: 'Store ID',   kind: 'orgId', uniqueWith: null, printed: true },   // in the QR code posted at the store and in every delivery row
      { key: 'location',  label: 'Location',   kind: 'text', required: true, editable: true }
    ],
    verified: true,
    blurb: 'Where coolers are bound for and deliveries go. The packaging and delivery forms carry the store name, and its QR code carries its System ID. The Store ID is the identifier the organisation named by Store Type uses for it: for a Giant store, its store number.' },
  { key: 'dishes',      label: 'Dishes',      noun: 'dish',       byName: false,
    attrs: [{ key: 'upc', label: 'UPC', kind: 'upc' }],   // Giant's 14-digit code for the dish, which its sales rows carry; set when the dish is added, not edited here
    activeToggle: true,   // the one list with a pause switch as well as delete: a dish is tried for a while, then kept or not
    verified: true,
    blurb: 'What is cooked, loaded and delivered. All three forms show these as cards, in this order. Switch a dish off to pause it without losing its place; delete it to retire it.' },
  // `records` names where a form's free-text "+ Add new" lands, so the unlisted-names card
  // can offer what was typed. Only the two people pickers accept typed names.
  { key: 'cooks',       label: 'Cooks',       noun: 'cook',       byName: true, attrs: [],
    records: [{ source: 'production', field: 'cook' }],
    blurb: 'Who cooks a batch. The production form offers these and also accepts a typed name.' },
  { key: 'drivers',     label: 'Drivers',     noun: 'driver',     byName: true, attrs: [],
    records: [{ source: 'deliveries', field: 'driver' }],
    blurb: 'Who loads the coolers and delivers. The packaging and delivery forms offer these and also accept a typed name.' },
  { key: 'supervisors', label: 'Supervisors', noun: 'supervisor', byName: true, attrs: [],
    blurb: 'Who may resolve a violation. The dashboard offers these on a violation\'s card; no form reads them.' }
];
const CONFIG_TYPES_FALLBACK = { kitchens: ['Taipei', 'Giant'], stores: ['Giant'] };   // what the backend serves as `types`; for a payload without it
const CONFIG_ORG_ID_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;                     // the backend's rule: URL- and filename-safe

const CONFIG_PANEL = {
  list: 'kitchens',
  loaded: null,     // the reference payload the buffers were taken from; its version goes back with a save
  buffer: {},       // list key -> entries as the owner has edited them; new ones carry _new: true, a _tmp ref and no id
  editing: null,    // { key, ref } of the one card whose name and switch are open; everything else is read-only
  showDeleted: false,   // whether the current list's deleted entries are unfolded
  busy: false
};
let CONFIG_MODAL_RESOLVE = null;

function configEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function configCapitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What identifies an entry across re-renders: its UUID, or the temporary ref a new one carries until it is saved. */
function configEntryRef(entry) {
  return entry.id || entry._tmp;
}

function configTempRef() {
  return 'new-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function configListDef(key) {
  return CONFIG_LISTS.find(def => def.key === key) || CONFIG_LISTS[0];
}

/** The allowed values of a list's Type attribute, as the backend serves them. */
function configTypes(key) {
  const served = CONFIG_PANEL.loaded && CONFIG_PANEL.loaded.types && CONFIG_PANEL.loaded.types[key];
  return served || CONFIG_TYPES_FALLBACK[key] || [];
}

/** Trimmed, internal whitespace collapsed: the form the backend stores and compares on. */
function configNormalise(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\s+/g, ' ').trim();
}

function configSetStatus(text, cls) {
  const status = document.getElementById('config-status');
  status.textContent = text;
  status.className = 'config-status' + (cls ? ' ' + cls : '');
}

/** The six published data/<list>.json files, as the site publishes them. */
async function loadStaticReference() {
  const out = { version: null, lists: {} };
  await Promise.all(CONFIG_LISTS.map(async def => {
    try {
      const response = await fetch('../data/' + def.key + '.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      out.lists[def.key] = { entries: data[def.key] || [], version: data.version || null, generatedAt: data.generatedAt || null };
      if (!out.version && data.version) out.version = data.version;
    } catch (e) {
      out.lists[def.key] = { entries: [], version: null, generatedAt: null, error: e.message };
    }
  }));
  return out;
}

// ─── Buffers ─────────────────────────────────────────────────────────────────

/**
 * Take the buffers from a reference payload. A list with unsaved edits keeps them, except
 * the one just saved (`savedKey`), which is replaced by what the server wrote.
 */
function configLoadFrom(reference, savedKey) {
  const keep = {};
  if (CONFIG_PANEL.loaded) CONFIG_LISTS.forEach(def => { keep[def.key] = def.key !== savedKey && configDiffOps(def.key).length > 0; });
  CONFIG_PANEL.loaded = reference;
  CONFIG_LISTS.forEach(def => {
    if (keep[def.key]) return;
    CONFIG_PANEL.buffer[def.key] = (reference[def.key] || []).map(entry => Object.assign({}, entry));
  });
}

function configAnyDirty() {
  return !!CONFIG_PANEL.loaded && CONFIG_LISTS.some(def => configDiffOps(def.key).length > 0);
}

/**
 * The ops that take the loaded list to the buffer: adds, updates, setActives, and one
 * reorder when the existing entries moved. A new entry lands at the end on the server and
 * has no id until then, so it cannot be moved before it is saved.
 */
function configDiffOps(key) {
  const def = configListDef(key);
  const loaded = (CONFIG_PANEL.loaded && CONFIG_PANEL.loaded[key]) || [];
  const buffer = CONFIG_PANEL.buffer[key] || [];
  const before = {};
  loaded.forEach(entry => { before[entry.id] = entry; });
  const ops = [];

  buffer.forEach(entry => {
    if (entry._new) {
      const add = { name: configNormalise(entry.name) };
      def.attrs.forEach(attr => { add[attr.key] = configNormalise(entry[attr.key]); });
      ops.push({ op: 'add', entry: add });
      return;
    }
    const was = before[entry.id];
    if (!was) return;
    const patch = {};
    if (configNormalise(entry.name) !== configNormalise(was.name)) patch.name = configNormalise(entry.name);
    def.attrs.forEach(attr => {
      if (configNormalise(entry[attr.key]) !== configNormalise(was[attr.key])) patch[attr.key] = configNormalise(entry[attr.key]);
    });
    if (def.verified && !!entry.verified !== !!was.verified) patch.verified = !!entry.verified;
    if (Object.keys(patch).length) ops.push({ op: 'update', entry: Object.assign({ id: entry.id }, patch) });
    if (def.activeToggle && !!entry.active !== !!was.active) ops.push({ op: 'setActive', id: entry.id, active: !!entry.active });
    if (!!entry.deletedAt !== !!was.deletedAt) ops.push({ op: entry.deletedAt ? 'delete' : 'restore', id: entry.id });
  });

  const existing = buffer.filter(entry => !entry._new).map(entry => entry.id);
  if (existing.join('\n') !== loaded.map(entry => entry.id).join('\n')) ops.push({ op: 'reorder', order: existing });
  return ops;
}

/** Problems in one list's buffer, mirroring what the backend refuses: [{ index?, message }]. */
function configValidate(key) {
  const def = configListDef(key);
  const buffer = CONFIG_PANEL.buffer[key] || [];
  const problems = [];
  const seen = {};
  buffer.forEach((entry, index) => {
    const name = configNormalise(entry.name);
    if (!name) { problems.push({ index: index, message: 'A name is required.' }); return; }
    if (name.length > 80) problems.push({ index: index, message: 'Names are at most 80 characters.' });
    if (/[\u0000-\u001F\u007F]/.test(name) || name.charAt(0) === '=') problems.push({ index: index, message: 'That name cannot be stored as written.' });
    const lower = name.toLowerCase();
    if (seen[lower] !== undefined) problems.push({ index: index, message: 'Another ' + def.noun + ' on this list already has this name.' });
    seen[lower] = index;

    def.attrs.forEach(attr => {
      const value = configNormalise(entry[attr.key]);
      if (attr.kind === 'type') {
        if (!value) problems.push({ index: index, message: attr.label + ' is required.' });
        else if (configTypes(key).indexOf(value) < 0) problems.push({ index: index, message: attr.label + ' must be one of ' + configTypes(key).join(', ') + '.' });
      } else if (attr.kind === 'orgId') {
        if (!value) problems.push({ index: index, message: attr.label + ' is required.' });
        else if (value.length > 40 || !CONFIG_ORG_ID_PATTERN.test(value)) problems.push({ index: index, message: attr.label + ' may only contain letters, digits and single hyphens.' });
        else if (buffer.some((other, j) => j !== index
            && configNormalise(other[attr.key]).toLowerCase() === value.toLowerCase()
            && (!attr.uniqueWith || configNormalise(other[attr.uniqueWith]) === configNormalise(entry[attr.uniqueWith])))) {
          problems.push({ index: index, message: 'Another ' + def.noun + ' already has ' + attr.label + ' ' + value + (attr.uniqueWith ? ' for that type' : '') + '.' });
        }
      } else if (attr.kind === 'upc') {
        if (!value) problems.push({ index: index, message: attr.label + ' is required.' });
        else if (!/^\d{14}$/.test(value)) problems.push({ index: index, message: attr.label + ' must be the 14 digits of the code.' });
        else if (buffer.some((other, j) => j !== index && configNormalise(other[attr.key]) === value)) problems.push({ index: index, message: 'Another ' + def.noun + ' already has UPC ' + value + '.' });
      } else if (value.length > 120) {
        problems.push({ index: index, message: attr.label + ' is at most 120 characters.' });
      } else if (attr.required && !value) {
        // Required on a new entry and on an edit that blanked it; a row seeded without one is shown as "—" and left alone.
        const was = ((CONFIG_PANEL.loaded && CONFIG_PANEL.loaded[key]) || []).find(e => e.id === entry.id);
        if (entry._new || (was && configNormalise(was[attr.key]))) problems.push({ index: index, message: attr.label + ' is required.' });
      }
    });
  });
  if (buffer.length && !buffer.some(entry => (!def.activeToggle || entry.active) && !entry.deletedAt)) {
    problems.push({ message: 'At least one ' + def.noun + ' must stay' + (def.activeToggle ? ' active and' : '') + ' not deleted.' });
  }
  return problems;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * The showPanel hook. The panel never re-renders on a poll: fetchData refreshes
 * DATA.reference every fifteen minutes, and that would wipe an unsaved buffer. A fresher
 * payload is adopted only while nothing is dirty.
 */
function renderConfig() {
  const fresh = DATA.reference;
  if (fresh && (!CONFIG_PANEL.loaded || (fresh.version !== CONFIG_PANEL.loaded.version && !configAnyDirty()))) {
    configLoadFrom(fresh);
  }
  if (!CONFIG_PANEL.loaded) {
    configSetStatus(CONFIG.webAppUrl ? 'Waiting for the dashboard data to load…' : 'Demo mode: the published lists could not be read.', '');
    return;
  }
  configRenderStrip();
  configRenderList();
  configRenderAdd();
  configRefreshActions();
  configRenderUnlisted();
  configRenderPublished();
  if (!CONFIG.webAppUrl) configSetStatus('Demo mode: no backend configured. These are the published lists, read-only.', '');
}

/** After a poll: with unsaved edits on screen, only the unlisted-names card may change. */
function configOnDataRefresh() {
  if (!document.getElementById('panel-config').classList.contains('active')) return;
  if (configAnyDirty()) configRenderUnlisted();
  else renderConfig();
}

function configRenderStrip() {
  const strip = document.getElementById('config-lists');
  strip.textContent = '';
  CONFIG_LISTS.forEach(def => {
    const pending = configDiffOps(def.key).length;
    const button = configEl('button', 'btn-time-range' + (def.key === CONFIG_PANEL.list ? ' active' : ''), pending ? def.label + ' (' + pending + ')' : def.label);
    button.onclick = () => configSelectList(def.key);
    strip.appendChild(button);
  });
}

function configSelectList(key) {
  CONFIG_PANEL.list = key;
  CONFIG_PANEL.editing = null;
  CONFIG_PANEL.showDeleted = false;
  configSetStatus('', '');
  renderConfig();
}

function configToggleDeleted() {
  CONFIG_PANEL.showDeleted = !CONFIG_PANEL.showDeleted;
  configRenderList();
}

function configMoveButton(glyph, disabled, onclick, readOnly) {
  const button = configEl('button', 'config-move', glyph);
  button.type = 'button';
  button.disabled = disabled || readOnly;
  button.onclick = onclick;
  return button;
}

/** One labelled field of an entry card. */
function configField(label, valueNode, extraClass) {
  const field = configEl('div', 'config-field' + (extraClass ? ' ' + extraClass : ''));
  field.appendChild(configEl('span', 'config-field-label', label));
  field.appendChild(valueNode);
  return field;
}

/** A plain value, truncated with an ellipsis when its column is narrower than it, the whole text in the tooltip. */
function configTextValue(text, muted) {
  const node = configEl('span', 'config-field-value text' + (muted ? ' muted' : ''), text);
  if (!muted) node.title = text;
  return node;
}

/** An identifier shortened to `truncateAt` characters, with the whole value in the tooltip and a Copy button. */
function configIdValue(full, truncateAt) {
  const text = String(full || '');
  const value = configEl('span', 'config-field-value');
  const code = configEl('code', '', text.length > truncateAt ? text.slice(0, truncateAt) + '…' : text);
  code.title = text;
  value.appendChild(code);
  if (text) {
    const copy = configEl('button', 'config-copy', 'Copy');
    copy.type = 'button';
    copy.title = 'Copy ' + text;
    copy.onclick = () => configCopy(text, copy);
    value.appendChild(copy);
  }
  return value;
}

async function configCopy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch (e) {
    window.prompt('Copy this value:', text);   // no clipboard access: hand it over the old way
  }
  setTimeout(() => { button.textContent = 'Copy'; }, 1200);
}

/** Open one card for editing, or close it. One card at a time, so it is clear which entry is being changed. */
function configToggleEdit(key, ref) {
  const current = CONFIG_PANEL.editing;
  CONFIG_PANEL.editing = current && current.key === key && current.ref === ref ? null : { key: key, ref: ref };
  configRenderList();
  if (CONFIG_PANEL.editing) {
    const input = document.querySelector('#config-rows .config-card.editing .config-input');
    if (input) { input.focus(); input.select(); }
  }
}

/** A text input for a field under Edit. */
function configInput(value, placeholder, maxLength, oninput) {
  const input = configEl('input', 'config-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder;
  input.maxLength = maxLength;
  input.oninput = () => oninput(input.value);
  return input;
}

/** Indices of the entries a list shows as cards: not deleted. Moves happen among these, skipping deleted rows in between. */
function configVisibleIndices(buffer) {
  return buffer.map((entry, i) => (entry.deletedAt ? -1 : i)).filter(i => i >= 0);
}

/**
 * One list's entries as cards of labelled fields: ID, name, the list's attributes, Active.
 * The fields sit on a grid whose columns are fixed per list, so every card lines up whatever
 * its values. Read-only until a card's Edit button is pressed; then its name, its location
 * and its Active switch open, and it can be deleted. Type and organisation id are set when
 * an entry is added. Deleted entries are folded away below the list, each with Restore.
 */
function configRenderList() {
  const def = configListDef(CONFIG_PANEL.list);
  const readOnly = !CONFIG.webAppUrl;
  document.getElementById('config-list-title').textContent = def.label;
  document.getElementById('config-list-blurb').textContent = def.blurb;

  const container = document.getElementById('config-rows');
  container.className = 'config-rows ' + (def.attrs.length ? 'with-attrs attrs-' + def.attrs.length : 'no-attrs') + (def.activeToggle ? ' with-active' : '');   // picks the column template
  container.textContent = '';
  const buffer = CONFIG_PANEL.buffer[def.key] || [];
  const loadedById = {};
  (CONFIG_PANEL.loaded[def.key] || []).forEach(entry => { loadedById[entry.id] = entry; });
  const problems = {};
  configValidate(def.key).forEach(problem => { if (problem.index !== undefined && !problems[problem.index]) problems[problem.index] = problem.message; });
  const visible = configVisibleIndices(buffer);
  const movable = visible.filter(i => !buffer[i]._new);   // new entries land at the end on save and cannot be moved before it
  const nameLabel = configCapitalise(def.noun) + ' Name';
  const deleted = buffer.map((entry, i) => (entry.deletedAt ? i : -1)).filter(i => i >= 0);

  const renderCard = index => {
    const entry = buffer[index];
    const ref = configEntryRef(entry);
    const isDeleted = !!entry.deletedAt;
    const editing = !readOnly && !isDeleted && !!CONFIG_PANEL.editing && CONFIG_PANEL.editing.key === def.key && CONFIG_PANEL.editing.ref === ref;
    const wrap = configEl('div', 'config-entry');
    wrap.dataset.index = index;
    const unverified = def.verified && !entry._new && entry.verified === false;
    const card = configEl('div', 'config-card' + (def.activeToggle && !entry.active ? ' inactive' : '') + (unverified ? ' unverified' : '') + (isDeleted ? ' deleted' : '') + (problems[index] ? ' invalid' : '') + (editing ? ' editing' : ''));

    const move = configEl('div', 'config-card-move');
    const at = movable.indexOf(index);
    move.appendChild(configMoveButton('↑', at <= 0, () => configMove(def.key, index, -1), readOnly || isDeleted));
    move.appendChild(configMoveButton('↓', at < 0 || at >= movable.length - 1, () => configMove(def.key, index, 1), readOnly || isDeleted));

    const fields = configEl('div', 'config-card-fields');
    fields.appendChild(configField('System ID', entry._new ? configTextValue('assigned on save', true) : configIdValue(entry.id, 8)));
    fields.appendChild(configField(nameLabel, editing
      ? configInput(entry.name, nameLabel, 80, value => configEdit(def.key, index, 'name', value))
      : configTextValue(entry.name || '—', !entry.name), 'config-field-name'));
    def.attrs.forEach(attr => {
      const value = configNormalise(entry[attr.key]);
      let node;
      if (editing && attr.editable) node = configInput(entry[attr.key], attr.label, 120, v => configEdit(def.key, index, attr.key, v));
      else if (attr.kind === 'orgId') node = configIdValue(value, 12);
      else if (attr.kind === 'upc') node = configIdValue(value, 14);
      else node = configTextValue(value || '—', !value);
      fields.appendChild(configField(attr.label, node));
    });

    if (isDeleted) {
      const when = new Date(entry.deletedAt);
      fields.appendChild(configField('Deleted', configTextValue(isNaN(when.getTime()) ? entry.deletedAt : when.toLocaleDateString(), false)));
    } else if (def.activeToggle) {
      const toggle = configEl('label', 'config-switch' + (editing ? '' : ' disabled'));
      const checkbox = configEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!entry.active;
      checkbox.disabled = !editing;
      checkbox.onchange = () => configEdit(def.key, index, 'active', checkbox.checked);
      toggle.append(checkbox, configEl('span', 'config-switch-track'), configEl('span', 'config-switch-text', entry.active ? 'Active' : 'Inactive'));
      fields.appendChild(configField('Active', toggle));
    }

    const actions = configEl('div', 'config-card-actions');
    if (!readOnly && isDeleted) {
      const restore = configEl('button', 'btn-clear-filters config-edit', 'Restore');
      restore.type = 'button';
      restore.onclick = () => configEdit(def.key, index, 'deletedAt', '');
      actions.appendChild(restore);
    } else if (!readOnly) {
      const edit = configEl('button', 'btn-clear-filters config-edit', editing ? 'Done' : 'Edit');
      edit.type = 'button';
      edit.onclick = () => configToggleEdit(def.key, ref);
      actions.appendChild(edit);
      if (editing && unverified) {
        const verify = configEl('button', 'btn-apply-filters config-edit', 'Verify');
        verify.type = 'button';
        verify.onclick = () => configEdit(def.key, index, 'verified', true);
        actions.appendChild(verify);
      }
      if (editing) {
        // A new entry is only in this buffer, so removing it is free; a saved one is deleted
        // in the sheet on Save and can be restored from the deleted list.
        const remove = configEl('button', 'btn-clear-filters config-delete', entry._new ? 'Remove' : 'Delete');
        remove.type = 'button';
        remove.onclick = () => (entry._new ? configRemoveNew(def.key, index) : configEdit(def.key, index, 'deletedAt', new Date().toISOString()));   // the server stamps its own instant on save
        actions.appendChild(remove);
      }
    }

    card.append(move, fields, actions);
    wrap.appendChild(card);
    const warn = configRowWarning(def, entry, loadedById[entry.id], problems[index]);
    if (warn) wrap.appendChild(warn);
    container.appendChild(wrap);
  };

  visible.forEach(renderCard);
  if (!visible.length) container.appendChild(configEl('p', 'home-status', deleted.length ? 'Every ' + def.noun + ' on this list is deleted.' : 'Nothing on this list yet.'));

  if (deleted.length) {
    const toggle = configEl('button', 'config-deleted-toggle', (CONFIG_PANEL.showDeleted ? 'Hide ' : 'Show ') + deleted.length + ' deleted ' + def.noun + (deleted.length === 1 ? '' : 's'));
    toggle.type = 'button';
    toggle.onclick = configToggleDeleted;
    container.appendChild(toggle);
    if (CONFIG_PANEL.showDeleted) deleted.forEach(renderCard);
  }
}

/** The note under a row: a validation problem, or what the pending change means for history. */
function configRowWarning(def, entry, was, problem) {
  if (problem) return configEl('div', 'config-warn', problem);
  if (entry._new || !was) return null;
  const printed = def.attrs.find(attr => attr.kind === 'orgId' && attr.printed);
  if (printed) {
    const from = configNormalise(was[printed.key]);
    if (from && configNormalise(entry[printed.key]) !== from) {
      return configEl('div', 'config-warn', 'Changing the ' + printed.label + ' re-keys this ' + def.noun + ': the QR code printed with ' + from + ' will no longer match it, and past delivery records keep the old number. To move to a new number, add the new ' + def.noun + ' and deactivate this one.');
    }
  }
  const oldName = configNormalise(was.name);
  const newName = configNormalise(entry.name);
  if (oldName && oldName !== newName) {
    if (def.byName) {
      return configEl('div', 'config-warn', 'Renaming splits this ' + def.noun + '\'s history: records already filed as "' + oldName + '" keep that name and will show separately in reports. To retire a ' + def.noun + ' instead, add the new one and deactivate the old.');
    }
    return configEl('div', 'config-warn safe', 'Safe: records carry this ' + def.noun + '\'s System ID, so renaming only changes the label.');
  }
  if (def.activeToggle && !entry.active && was.active) {
    return configEl('div', 'config-warn', 'Removed from the forms on their next load. Past records keep it.');
  }
  if (def.verified && entry.verified === false && !entry.deletedAt) {
    return configEl('div', 'config-warn unverified', 'Unverified: an import created this ' + def.noun + ' from the data it met. Check the name and details, then Edit and press Verify; the forms do not offer it until then.');
  }
  return null;
}

/** Update one row's class and note after a keystroke, without rebuilding the inputs under the caret. */
function configRefreshEntry(key, index) {
  const def = configListDef(key);
  const wrap = document.querySelector('#config-rows .config-entry[data-index="' + index + '"]');
  if (!wrap) return;
  const entry = CONFIG_PANEL.buffer[key][index];
  const problem = configValidate(key).find(p => p.index === index);
  const card = wrap.querySelector('.config-card');
  card.classList.toggle('invalid', !!problem);
  card.classList.toggle('inactive', !entry.active);
  const old = wrap.querySelector('.config-warn');
  if (old) old.remove();
  const was = (CONFIG_PANEL.loaded[key] || []).find(e => e.id === entry.id);
  const warn = configRowWarning(def, entry, was, problem && problem.message);
  if (warn) wrap.appendChild(warn);
}

/** The control for one attribute on the add row. Ids are `config-add-<attr key>`. */
function configAddControl(def, attr) {
  if (attr.kind === 'type') {
    const select = configEl('select', 'config-type');
    select.id = 'config-add-' + attr.key;
    configTypes(def.key).forEach(type => {
      const option = configEl('option', '', type);
      option.value = type;
      select.appendChild(option);
    });
    return select;
  }
  const input = configEl('input', 'config-' + attr.kind);
  input.type = 'text';
  input.id = 'config-add-' + attr.key;
  input.placeholder = attr.label;
  input.maxLength = attr.kind === 'orgId' ? 40 : attr.kind === 'upc' ? 14 : 120;
  return input;
}

function configRenderAdd() {
  const def = configListDef(CONFIG_PANEL.list);
  const add = document.getElementById('config-add');
  add.textContent = '';
  add.hidden = !CONFIG.webAppUrl;
  if (add.hidden) return;
  const byKind = kind => def.attrs.filter(attr => attr.kind === kind);

  add.appendChild(configEl('h3', 'config-add-title', 'Add ' + configCapitalise(def.noun)));
  byKind('type').forEach(attr => add.appendChild(configAddControl(def, attr)));
  byKind('orgId').forEach(attr => add.appendChild(configAddControl(def, attr)));
  const name = configEl('input');
  name.type = 'text';
  name.id = 'config-add-name';
  name.placeholder = 'New ' + def.noun + ' name';
  name.maxLength = 80;
  name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); configAdd(); } };
  add.appendChild(name);
  byKind('text').forEach(attr => add.appendChild(configAddControl(def, attr)));
  byKind('upc').forEach(attr => add.appendChild(configAddControl(def, attr)));
  const button = configEl('button', 'btn-clear-filters', 'Add');
  button.type = 'button';
  button.onclick = configAdd;
  add.appendChild(button);

  const help = def.key === 'stores'
    ? 'The Store ID is the identifier the organisation named by Store Type uses for this store (eg for a Giant store, the store number Giant assigns it).'
    : def.key === 'kitchens'
      ? 'The Kitchen ID is the identifier the organisation named by Kitchen Type uses for this kitchen (eg for a Giant kitchen, the kitchen ID Giant assigns it).'
      : def.key === 'dishes'
        ? 'An id is assigned on save and never changes. The UPC is the 14-digit code Giant\'s sales data carries for the dish.'
        : 'An id is assigned on save and never changes.';
  add.appendChild(configEl('div', 'config-add-help', help));
}

function configRefreshActions() {
  const key = CONFIG_PANEL.list;
  const readOnly = !CONFIG.webAppUrl;
  const ops = CONFIG_PANEL.loaded ? configDiffOps(key) : [];
  const problems = CONFIG_PANEL.loaded ? configValidate(key) : [];
  document.getElementById('config-dirty').textContent = ops.length ? ops.length + ' unsaved change' + (ops.length === 1 ? '' : 's') : '';
  const save = document.getElementById('config-save');
  const discard = document.getElementById('config-discard');
  const reload = document.getElementById('config-reload');
  save.hidden = discard.hidden = reload.hidden = readOnly;
  save.disabled = readOnly || CONFIG_PANEL.busy || !ops.length || problems.length > 0;
  discard.disabled = readOnly || CONFIG_PANEL.busy || !ops.length;
  reload.disabled = readOnly || CONFIG_PANEL.busy;
  configRenderStrip();
}

// ─── Editing ─────────────────────────────────────────────────────────────────

function configEdit(key, index, field, value) {
  const entry = CONFIG_PANEL.buffer[key] && CONFIG_PANEL.buffer[key][index];
  if (!entry) return;
  entry[field] = value;
  if (field === 'deletedAt') {
    CONFIG_PANEL.editing = null;        // the card leaves the list (or comes back); nothing is open any more
    if (value) CONFIG_PANEL.showDeleted = true;
    configRenderList();
  } else if (field === 'active' || field === 'verified') {
    configRenderList();                 // the card's look, its note and the last-active guard all change
  } else {
    configRefreshEntry(key, index);
  }
  configRefreshActions();
}

/** Drop an entry that was added but never saved. Nothing is on the server, so there is nothing to confirm. */
function configRemoveNew(key, index) {
  const buffer = CONFIG_PANEL.buffer[key];
  if (!buffer[index] || !buffer[index]._new) return;
  buffer.splice(index, 1);
  CONFIG_PANEL.editing = null;
  configRenderList();
  configRefreshActions();
}

/** Swap an entry with its neighbour among the movable cards: saved and not deleted. */
function configMove(key, index, delta) {
  const buffer = CONFIG_PANEL.buffer[key];
  const movable = configVisibleIndices(buffer).filter(i => !buffer[i]._new);
  const at = movable.indexOf(index);
  if (at < 0 || at + delta < 0 || at + delta >= movable.length) return;
  const target = movable[at + delta];
  const [moved] = buffer.splice(index, 1);
  buffer.splice(target, 0, moved);
  configRenderList();
  configRefreshActions();
}

/** Refuse an Add: say why, mark the field it is about and put the cursor there. The mark clears when the field is edited. */
function configAddRefuse(control, message) {
  configSetStatus(message, 'bad');
  if (!control) return;
  control.classList.add('missing');
  control.addEventListener('input', () => control.classList.remove('missing'), { once: true });
  control.focus();
}

function configAdd() {
  const key = CONFIG_PANEL.list;
  const def = configListDef(key);
  const nameInput = document.getElementById('config-add-name');
  const name = configNormalise(nameInput.value);
  if (!name) { configAddRefuse(nameInput, 'Type a name first.'); return; }
  const entry = Object.assign({ _new: true, _tmp: configTempRef(), name: name, sortOrder: 0 }, def.activeToggle ? { active: true } : {}, def.verified ? { verified: true } : {});
  def.attrs.forEach(attr => {
    const control = document.getElementById('config-add-' + attr.key);
    entry[attr.key] = control ? configNormalise(control.value) : '';
  });
  const missing = def.attrs.find(attr => !entry[attr.key]);   // every attribute is required on a new entry
  if (missing) {
    configAddRefuse(document.getElementById('config-add-' + missing.key), missing.label + ' is required.');
    return;
  }
  CONFIG_PANEL.buffer[key].push(entry);
  configRenderList();
  configRenderAdd();
  configRefreshActions();
  configSetStatus('', '');
  document.getElementById('config-add-name').focus();
}

/** Put a name seen in the records onto the list, pending Save. */
function configUnlistedAdd(name) {
  const key = CONFIG_PANEL.list;
  if ((CONFIG_PANEL.buffer[key] || []).some(entry => configNormalise(entry.name).toLowerCase() === name.toLowerCase())) return;
  const def = configListDef(key);
  CONFIG_PANEL.buffer[key].push(Object.assign({ _new: true, _tmp: configTempRef(), name: name, sortOrder: 0 }, def.activeToggle ? { active: true } : {}, def.verified ? { verified: true } : {}));
  configRenderList();
  configRefreshActions();
  configRenderUnlisted();
}

async function configDiscard() {
  const key = CONFIG_PANEL.list;
  const ops = configDiffOps(key);
  if (!ops.length) return;
  const def = configListDef(key);
  const ok = await configConfirm('Discard ' + ops.length + ' unsaved change' + (ops.length === 1 ? '' : 's') + ' to ' + def.label + '?',
    [{ cls: '', text: 'The list goes back to what the server has. Nothing is sent.' }], 'Discard');
  if (!ok) return;
  CONFIG_PANEL.buffer[key] = (CONFIG_PANEL.loaded[key] || []).map(entry => Object.assign({}, entry));
  renderConfig();
  configSetStatus('', '');
}

async function configReload() {
  if (!CONFIG.webAppUrl || CONFIG_PANEL.busy) return;
  if (configAnyDirty()) {
    const ok = await configConfirm('Reload from the server?', [{ cls: 'caution', text: 'Unsaved changes on every list are discarded.' }], 'Reload');
    if (!ok) return;
  }
  configSetStatus('Reloading…', '');
  try {
    const response = await fetch(CONFIG.webAppUrl + '?action=reference', { mode: 'cors' });
    const data = await response.json();
    if (data.status !== 'ok') throw new Error(data.message || 'the server returned an error');
    DATA.reference = data;
    CONFIG_PANEL.buffer = {};
    configLoadFrom(data);
    renderConfig();
    configSetStatus('Reloaded.', 'ok');
  } catch (e) {
    configSetStatus('Reload failed: ' + e.message, 'bad');
  }
}

// ─── Saving ──────────────────────────────────────────────────────────────────

/** What a Save will do, one line per change, for the confirmation. */
function configChangeSummary(key) {
  const def = configListDef(key);
  const loaded = CONFIG_PANEL.loaded[key] || [];
  const buffer = CONFIG_PANEL.buffer[key] || [];
  const before = {};
  loaded.forEach(entry => { before[entry.id] = entry; });
  const items = [];

  buffer.forEach(entry => {
    const name = configNormalise(entry.name);
    if (entry._new) {
      const orgId = def.attrs.find(attr => attr.kind === 'orgId');
      items.push({ cls: 'safe', text: key === 'stores'
        ? 'Add "' + name + '" as store ' + configNormalise(entry.storeId) + '. Generate its QR code from the Home tab after saving.'
        : 'Add "' + name + '"' + (orgId ? ' (' + orgId.label + ' ' + configNormalise(entry[orgId.key]) + ')' : '') + '. Its id is assigned on save and never changes.' });
      return;
    }
    const was = before[entry.id];
    if (!was) return;
    const oldName = configNormalise(was.name);
    if (oldName !== name) {
      items.push(def.byName
        ? { cls: 'caution', text: 'Rename "' + oldName + '" to "' + name + '". Records already filed under "' + oldName + '" keep that name, so reports will show the two as separate ' + def.noun + 's.' }
        : { cls: 'safe', text: 'Rename "' + oldName + '" to "' + name + '". Safe: records carry the ' + def.noun + '\'s System ID, so history stays together.' });
    }
    def.attrs.forEach(attr => {
      const from = configNormalise(was[attr.key]);
      const to = configNormalise(entry[attr.key]);
      if (from === to) return;
      if (attr.printed) {
        items.push({ cls: 'caution', text: 'Change the ' + attr.label + ' of "' + name + '" from ' + from + ' to ' + to + '. The QR code printed with ' + from + ' will no longer match this store, past delivery records keep ' + from + ', and new ones will carry ' + to + '.' });
      } else {
        items.push({ cls: '', text: 'Change the ' + attr.label + ' of "' + name + '"' + (from ? ' from "' + from + '"' : '') + ' to "' + to + '".' });
      }
    });
    if (def.activeToggle && !!entry.active !== !!was.active) {
      if (entry.active) items.push({ cls: 'safe', text: 'Reactivate "' + name + '". The forms will offer it again on their next load.' });
      else items.push({ cls: 'caution', text: 'Deactivate "' + name + '". Removed from the forms on their next load. Past records keep it.' });
    }
    if (def.verified && entry.verified && !was.verified) {
      items.push({ cls: 'safe', text: 'Mark "' + name + '" verified. The forms will offer it on their next load.' });
    }
    if (!!entry.deletedAt !== !!was.deletedAt) {
      if (entry.deletedAt) items.push({ cls: 'caution', text: 'Delete "' + name + '". It leaves this list and the forms; past records keep it and still show its name on the dashboard. It can be restored from the deleted ' + def.noun + 's below the list.' + (key === 'stores' ? ' Its printed QR code will open a delivery form that does not recognise the store.' : '') });
      else items.push({ cls: 'safe', text: 'Restore "' + name + '". It returns to this list as it was' + (def.activeToggle && !entry.active ? ', still inactive.' : ' and to the forms on their next load.') });
    }
  });

  const existing = buffer.filter(entry => !entry._new).map(entry => entry.id);
  if (existing.join('\n') !== loaded.map(entry => entry.id).join('\n')) items.push({ cls: '', text: 'Change the order the forms show them in.' });
  return items;
}

/** The confirmation modal. Resolves true on confirm; false on cancel, Escape or a click outside. Focus lands on Cancel. */
function configConfirm(title, items, okLabel) {
  return new Promise(resolve => {
    CONFIG_MODAL_RESOLVE = resolve;
    const content = document.getElementById('config-modal-content');
    content.textContent = '';
    const header = configEl('div', 'modal-header');
    header.appendChild(configEl('h2', '', title));
    const body = configEl('div', 'modal-body');
    items.forEach(item => body.appendChild(configEl('div', 'config-modal-item' + (item.cls ? ' ' + item.cls : ''), item.text)));
    const footer = configEl('div', 'modal-footer');
    const cancel = configEl('button', 'btn-secondary', 'Cancel');
    cancel.type = 'button';
    cancel.onclick = () => configModalResolve(false);
    const ok = configEl('button', 'btn-primary', okLabel || 'Save changes');
    ok.type = 'button';
    ok.onclick = () => configModalResolve(true);
    footer.append(cancel, ok);
    content.append(header, body, footer);
    document.getElementById('config-modal').style.display = 'flex';
    cancel.focus();
  });
}

function configModalResolve(result) {
  document.getElementById('config-modal').style.display = 'none';
  const resolve = CONFIG_MODAL_RESOLVE;
  CONFIG_MODAL_RESOLVE = null;
  if (resolve) resolve(result);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && CONFIG_MODAL_RESOLVE) configModalResolve(false); });

window.addEventListener('beforeunload', e => {
  if (configAnyDirty()) { e.preventDefault(); e.returnValue = ''; }
});

/**
 * POST as the forms do: text/plain so the browser sends no preflight, which Apps Script
 * cannot answer, and the body read whatever the HTTP status, since Apps Script answers 200
 * for everything and puts the outcome in `status`. Never throws.
 */
/** POST a JSON body to the backend as text/plain (no preflight; see forms/common.js). Returns { ok, data, error }. */
async function dashboardPost(payload) {
  try {
    const response = await fetch(CONFIG.webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'the server did not answer with JSON; it may be redeploying' }; }
    if (data.status !== 'ok') return { ok: false, data: data, error: data.message || 'the server rejected the change' };
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message || 'no connection' };
  }
}

async function configSave() {
  const key = CONFIG_PANEL.list;
  const def = configListDef(key);
  if (CONFIG_PANEL.busy || !CONFIG.webAppUrl || !CONFIG_PANEL.loaded) return;
  const problems = configValidate(key);
  if (problems.length) { configSetStatus(problems[0].message, 'bad'); return; }
  const ops = configDiffOps(key);
  if (!ops.length) { configSetStatus('Nothing to save.', ''); return; }

  const items = configChangeSummary(key);
  const ok = await configConfirm('Save ' + items.length + ' change' + (items.length === 1 ? '' : 's') + ' to ' + def.label + '?', items);
  if (!ok) return;

  CONFIG_PANEL.busy = true;
  configRefreshActions();
  configSetStatus('Saving…', '');
  const result = await dashboardPost({ type: 'config', list: key, baseVersion: CONFIG_PANEL.loaded.version, publish: true, ops: ops });
  CONFIG_PANEL.busy = false;

  if (!result.ok) {
    const code = result.data && result.data.code;
    configSetStatus(code === 'conflict'
      ? 'These lists changed somewhere else since this page loaded. Your edits are still here: Reload from server to see the current lists, then redo what still applies.'
      : 'Not saved: ' + (result.error || 'unknown error') + '. Your edits are still here.', 'bad');
    configRefreshActions();
    return;
  }

  const data = result.data;
  DATA.reference = data.reference;
  configLoadFrom(data.reference, key);
  renderConfig();

  let message = 'Saved.';
  if (data.warning) message += ' ' + data.warning;
  if (data.published) message += ' Publishing to the forms now; they will have it within about ten minutes.';
  else if (data.publishError) message += ' But publishing failed: ' + data.publishError + '. The forms keep the previous lists until the next successful save or deploy.';
  configSetStatus(message, data.publishError ? 'bad' : 'ok');
  fetchData();   // the records come back resolved under the saved names, the store list follows, and every panel redraws
  setTimeout(configRenderPublished, 2 * 60 * 1000);   // the site job takes about two minutes; then check the forms' copy
}

// ─── The forms' copy, and names the list has never seen ──────────────────────

/** Whether the static file the forms read matches the version on screen. What makes a failed publish visible. */
async function configRenderPublished() {
  const line = document.getElementById('config-published');
  if (!CONFIG.webAppUrl || !CONFIG_PANEL.loaded) { line.textContent = ''; return; }
  const key = CONFIG_PANEL.list;
  try {
    const response = await fetch('../data/' + key + '.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (key !== CONFIG_PANEL.list) return;   // the list changed while this was in flight
    if (data.version === CONFIG_PANEL.loaded.version) {
      const when = data.generatedAt ? new Date(data.generatedAt) : null;
      line.textContent = 'The forms have this version (' + data.version + ')' + (when && !isNaN(when.getTime()) ? ', published ' + when.toLocaleString() : '') + '.';
    } else {
      line.textContent = 'The forms are behind: they have ' + (data.version || 'an unversioned copy') + ' and the current version is ' + CONFIG_PANEL.loaded.version + '. A publish runs after each save and takes about two minutes; if this stays behind, the publish failed and the next save or deploy will retry it.';
    }
  } catch (e) {
    line.textContent = 'Could not read the forms\' copy of ' + key + '.json (' + e.message + ').';
  }
}

/**
 * Names typed under "+ Add new" on a form that are not on the list yet, with one tap to add
 * them. Only the cook and driver pickers accept typed names, so the card shows for
 * those two lists alone. Scoped to the window the dashboard has loaded, and says so.
 */
function configRenderUnlisted() {
  const def = configListDef(CONFIG_PANEL.list);
  const card = document.getElementById('config-unlisted-card');
  card.hidden = !def.records;
  if (card.hidden) return;
  const container = document.getElementById('config-unlisted');
  const scope = document.getElementById('config-unlisted-scope');
  container.textContent = '';
  scope.textContent = '';

  const sources = { production: DATA.production || [], deliveries: DATA.deliveries || [] };
  const seen = {};
  let records = 0;
  def.records.forEach(where => {
    sources[where.source].forEach(record => {
      records += 1;
      const raw = configNormalise(record[where.field]);
      if (!raw) return;
      const lower = raw.toLowerCase();
      const entry = seen[lower] || (seen[lower] = { name: raw, count: 0, last: '' });
      entry.count += 1;
      const date = normalizeDate(record.date);
      if (date > entry.last) entry.last = date;
    });
  });
  const listed = new Set((CONFIG_PANEL.buffer[def.key] || []).map(entry => configNormalise(entry.name).toLowerCase()));
  const unlisted = Object.values(seen).filter(entry => !listed.has(entry.name.toLowerCase())).sort((a, b) => b.count - a.count);

  const win = DATA.window;
  const label = iso => localDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const range = win && win.from && win.to ? label(win.from) + ' to ' + label(win.to) : 'the loaded window';
  const sourceNames = def.records.map(where => where.source === 'production' ? 'production' : 'delivery').join(' and ');
  scope.textContent = 'Checked against ' + records + ' ' + sourceNames + ' records from ' + range + ', the dates this dashboard has loaded. Names used before that are not included. ';
  if (CONFIG.webAppUrl && REQUESTED_FROM && REQUESTED_FROM > earliestWindowFrom()) {
    const more = configEl('button', 'btn-clear-filters', 'Load six months');
    more.type = 'button';
    more.style.marginLeft = '8px';
    more.onclick = () => ensureWindow(earliestWindowFrom());
    scope.appendChild(more);
  }

  if (!unlisted.length) {
    container.appendChild(configEl('p', 'home-status', 'No unlisted ' + def.noun + 's in this window.'));
    return;
  }
  unlisted.forEach(entry => {
    const row = configEl('div', 'config-unlisted-row');
    row.appendChild(configEl('span', 'config-unlisted-name', entry.name));
    row.appendChild(configEl('span', 'config-unlisted-meta', entry.count + ' record' + (entry.count === 1 ? '' : 's') + (entry.last ? ', last ' + entry.last : '') + ' · typed with "+ Add new" on a form'));
    if (CONFIG.webAppUrl) {
      const add = configEl('button', 'btn-clear-filters', 'Add to list');
      add.type = 'button';
      add.onclick = () => configUnlistedAdd(entry.name);
      row.appendChild(add);
    }
    container.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Collapsible Sidebar (CSS-based, no JS needed)
// Sidebar starts collapsed (70px) and expands on hover (220px)
// ═══════════════════════════════════════════════════════════════════════════════
