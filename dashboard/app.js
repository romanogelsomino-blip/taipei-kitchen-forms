// Taipei Kitchen Dashboard — Client-Side Application
// T-048: Dashboard shell + T-051-T-055: Panel implementations

// ═══════════════════════════════════════════════════════════════════════════
// Configuration & State
// ═══════════════════════════════════════════════════════════════════════════

let CONFIG = { webAppUrl: null };
let DATA = {
  deliveries: [],
  production: [],
  waste: [],
  stores: [],
  lastUpdated: null
};
let REFRESH_INTERVAL = null;
const POLL_INTERVAL_MS = 10000; // T-055: 10-second polling
const DEMO_MODE = true; // Enable demo data for local development

// ═══════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupNavigation();
  setupDateDefaults();

  // Check if we should use demo data or real API
  if (CONFIG.webAppUrl && CONFIG.webAppUrl !== 'DEMO_MODE') {
    // Production mode: fetch from real Google Apps Script
    await fetchData();
    startAutoRefresh(); // T-055: Start 10s polling
  } else {
    // Demo mode: use mock data for local development
    loadDemoData();
    updateStatus('demo', 'Demo Mode (sample data)');
    renderOverview();
    renderReconciliation();
    renderFoodSafety();
    populateFilters();
  }
});

// Load config.local.json
async function loadConfig() {
  try {
    const response = await fetch('config.local.json');
    if (!response.ok) throw new Error('config.local.json not found');
    CONFIG = await response.json();
    console.log('[Config] Loaded:', CONFIG);
  } catch (e) {
    console.error('[Config] Failed to load config.local.json:', e);
    updateStatus('error', 'Config file missing');
    showConfigInstructions();
  }
}

function showConfigInstructions() {
  document.getElementById('panel-overview').innerHTML = `
    <div style="padding:40px;text-align:center;background:var(--red-lt);border:2px solid var(--red);border-radius:12px;margin:20px;">
      <h2 style="font-family:'Syne',sans-serif;color:var(--red);margin-bottom:16px;">⚙️ Configuration Required</h2>
      <p style="font-size:0.95rem;color:var(--mid);margin-bottom:20px;">
        Create a file named <code style="background:#fff;padding:2px 6px;border-radius:3px;font-family:'DM Mono',monospace;">config.local.json</code> in the <code>/dashboard</code> directory with the following content:
      </p>
      <pre style="background:var(--dark);color:#0f0;padding:20px;border-radius:8px;text-align:left;font-family:'DM Mono',monospace;font-size:0.85rem;overflow-x:auto;">{
  "webAppUrl": "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE"
}</pre>
      <p style="font-size:0.85rem;color:var(--soft);margin-top:16px;">
        After creating the file, refresh this page. <br>
        <strong>Note:</strong> config.local.json is gitignored for security.
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
      { submittedAt: `${today}T06:15:33.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Lucia', dish: 'Spring Roll (Veg)', batch: 'B-2024-001', qtyProduced: 120, qtyDiscarded: 2, discardReason: 'Quality Issue', qa: 'Pass', initials: 'L' },
      { submittedAt: `${today}T06:45:10.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Lucia', dish: 'Shrimp Egg Roll', batch: 'B-2024-002', qtyProduced: 96, qtyDiscarded: 0, discardReason: '', qa: 'Pass', initials: 'L' },
      { submittedAt: `${today}T07:20:47.000Z`, date: today, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Anna', dish: 'Chicken Lo Mein', batch: 'B-2024-003', qtyProduced: 48, qtyDiscarded: 1, discardReason: 'Temperature', qa: 'Pass', initials: 'A' },
      { submittedAt: `${yesterday}T06:30:12.000Z`, date: yesterday, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Jiang', dish: 'Beef Chow Fun', batch: 'B-2024-004', qtyProduced: 36, qtyDiscarded: 0, discardReason: '', qa: 'Pass', initials: 'J' },
      { submittedAt: `${yesterday}T07:05:28.000Z`, date: yesterday, shift: 'Morning', kitchen: 'Store 6112', supervisor: 'Jiang', dish: 'Pork Dumpling', batch: 'B-2024-005', qtyProduced: 72, qtyDiscarded: 1, discardReason: 'Out of date', qa: 'Pass', initials: 'J' }
    ],
    waste: [
      { date: today, store: '6006', dish: 'Spring Roll (Veg)', qtyRemoved: 2, reason: 'Out of date' },
      { date: today, store: '6253', dish: 'Chicken Lo Mein', qtyRemoved: 1, reason: 'Damaged' },
      { date: today, store: '6443', dish: 'Beef Chow Fun', qtyRemoved: 3, reason: 'Quality Issue' },
      { date: yesterday, store: '6542', dish: 'Pork Dumpling', qtyRemoved: 1, reason: 'Out of date' }
    ],
    lastUpdated: new Date().toISOString()
  };

  console.log('[Demo] Loaded sample data:', DATA);
}

// ═══════════════════════════════════════════════════════════════════════════
// Data Fetching (T-049 integration)
// ═══════════════════════════════════════════════════════════════════════════

async function fetchData() {
  if (!CONFIG.webAppUrl) return;

  updateStatus('loading', 'Fetching data...');

  try {
    const url = CONFIG.webAppUrl;
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    DATA = data;
    console.log('[Data] Fetched:', DATA);

    updateStatus('connected', `Updated ${new Date(DATA.lastUpdated).toLocaleTimeString()}`);
    renderOverview(); // T-051
    renderReconciliation(); // T-053
    renderFoodSafety(); // T-054
    populateFilters(); // T-052
  } catch (e) {
    console.error('[Data] Fetch failed:', e);
    updateStatus('error', 'Fetch failed');
  }
}

// T-055: Auto-refresh polling at 10s
function startAutoRefresh() {
  if (REFRESH_INTERVAL) clearInterval(REFRESH_INTERVAL);
  REFRESH_INTERVAL = setInterval(() => {
    fetchData();
  }, POLL_INTERVAL_MS);
  console.log(`[Polling] Started at ${POLL_INTERVAL_MS / 1000}s interval`);
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
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = link.dataset.panel;
      showPanel(panel);
    });
  });
}

function showPanel(panelName) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.panel === panelName);
  });
  // Update panels
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${panelName}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// T-051: Overview Panel
// ═══════════════════════════════════════════════════════════════════════════

function renderOverview() {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = getWeekStart(new Date());

  // Metrics
  const deliveriesToday = DATA.deliveries.filter(d => d.date === today).length;
  const productionToday = DATA.production.filter(p => p.date === today).length;
  const violationsToday = countViolations(DATA.deliveries.filter(d => d.date === today));
  const wasteThisWeek = DATA.waste
    .filter(w => new Date(w.date) >= weekStart)
    .reduce((sum, w) => sum + (parseInt(w.qtyRemoved) || 0), 0);

  document.getElementById('metric-deliveries').textContent = deliveriesToday;
  document.getElementById('metric-production').textContent = productionToday;
  document.getElementById('metric-violations').textContent = violationsToday;
  document.getElementById('metric-waste').textContent = wasteThisWeek;

  // Top 5 stores by volume
  renderTopStores();

  // Recent submissions feed
  renderRecentFeed();
}

function renderTopStores() {
  const storeCounts = {};
  DATA.deliveries.forEach(d => {
    storeCounts[d.store] = (storeCounts[d.store] || 0) + 1;
  });

  const sorted = Object.entries(storeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const container = document.getElementById('top-stores-list');
  if (sorted.length === 0) {
    container.innerHTML = '<div class="loading">No delivery data yet</div>';
    return;
  }

  container.innerHTML = sorted.map(([storeId, count]) => {
    const storeName = DATA.stores.find(s => s.id === storeId)?.name || `Store ${storeId}`;
    return `
      <div class="store-item">
        <span class="store-name">${storeName}</span>
        <span class="store-volume">${count} deliveries</span>
      </div>
    `;
  }).join('');
}

function renderRecentFeed() {
  const combined = [
    ...DATA.deliveries.map(d => ({ ...d, type: 'delivery', time: d.submittedAt })),
    ...DATA.production.map(p => ({ ...p, type: 'production', time: p.submittedAt }))
  ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 10);

  const container = document.getElementById('recent-feed');
  if (combined.length === 0) {
    container.innerHTML = '<div class="loading">No submissions yet</div>';
    return;
  }

  container.innerHTML = combined.map(item => {
    const time = new Date(item.time).toLocaleTimeString();
    const typeClass = item.type;
    let text = '';

    if (item.type === 'delivery') {
      const storeName = DATA.stores.find(s => s.id === item.store)?.name || `Store ${item.store}`;
      text = `${item.driver} delivered to ${storeName}`;
    } else {
      text = `${item.supervisor} logged production batch ${item.batch}`;
    }

    const violationClass = item.type === 'delivery' && hasViolation(item) ? 'violation' : '';

    return `
      <div class="feed-item ${typeClass} ${violationClass}">
        <span class="feed-time">${time}</span>
        <span class="feed-text">${text}</span>
      </div>
    `;
  }).join('');
}

function hasViolation(delivery) {
  const temp = parseFloat(delivery.coolerTemp);
  return temp > 41;
}

function countViolations(deliveries) {
  return deliveries.filter(hasViolation).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// T-053: Daily Reconciliation Panel
// ═══════════════════════════════════════════════════════════════════════════

function loadReconciliation() {
  const date = document.getElementById('recon-date').value;
  if (!date) return;

  const deliveriesOnDate = DATA.deliveries.filter(d => d.date === date);
  const productionOnDate = DATA.production.filter(p => p.date === date);

  // Aggregate by dish
  const dishData = {};

  productionOnDate.forEach(p => {
    if (!dishData[p.dish]) dishData[p.dish] = { produced: 0, delivered: 0, sold: 0 };
    dishData[p.dish].produced += parseInt(p.qtyProduced) || 0;
  });

  deliveriesOnDate.forEach(d => {
    if (!dishData[d.dish]) dishData[d.dish] = { produced: 0, delivered: 0, sold: 0 };
    dishData[d.dish].delivered += parseInt(d.added) || 0;
  });

  // Sold data (placeholder for POS integration)
  // For now, sold = null

  const tbody = document.getElementById('recon-tbody');
  if (Object.keys(dishData).length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No data for this date</td></tr>';
    return;
  }

  tbody.innerHTML = Object.entries(dishData).map(([dish, data]) => {
    const loss = data.produced - data.delivered;
    const lossClass = loss > 0 ? 'loss' : (loss < 0 ? 'loss positive' : '');
    return `
      <tr>
        <td>${dish}</td>
        <td>${data.produced}</td>
        <td>${data.delivered}</td>
        <td>—</td>
        <td class="${lossClass}">${loss}</td>
      </tr>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// T-054: Weekly Food Safety Summary Panel
// ═══════════════════════════════════════════════════════════════════════════

function loadFoodSafety() {
  const weekEnd = document.getElementById('safety-week-end').value;
  if (!weekEnd) return;

  const weekEndDate = new Date(weekEnd);
  const weekStart = new Date(weekEndDate);
  weekStart.setDate(weekStart.getDate() - 6);

  const weekDeliveries = DATA.deliveries.filter(d => {
    const date = new Date(d.date);
    return date >= weekStart && date <= weekEndDate;
  });

  // Group by store
  const storeViolations = {};
  weekDeliveries.forEach(d => {
    if (!storeViolations[d.store]) {
      storeViolations[d.store] = { coolerViolations: 0, deliveryTempViolations: 0 };
    }
    if (parseFloat(d.coolerTemp) > 41) storeViolations[d.store].coolerViolations++;
    if (parseFloat(d.arrivalTemp) > 41) storeViolations[d.store].deliveryTempViolations++;
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

    return `
      <div class="safety-store-card">
        <div class="safety-store-name">${storeName}</div>
        <div class="safety-violations">
          <div>
            <div class="violation-count ${countClass}">${violations.coolerViolations}</div>
            <div class="violation-label">Cooler Temp Violations</div>
          </div>
          <div>
            <div class="violation-count ${countClass}">${violations.deliveryTempViolations}</div>
            <div class="violation-label">Delivery Temp Violations</div>
          </div>
        </div>
        ${totalViolations === 0 ? '<p style="color:var(--green);font-weight:600;margin-top:12px;">✓ All checks passed this week</p>' : ''}
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// T-052: Filters & Drilldowns
// ═══════════════════════════════════════════════════════════════════════════

function populateFilters() {
  // Populate month dropdown
  const months = new Set();
  [...DATA.deliveries, ...DATA.production].forEach(item => {
    if (item.date) {
      const month = item.date.slice(0, 7); // YYYY-MM
      months.add(month);
    }
  });

  const monthSelect = document.getElementById('filter-month');
  monthSelect.innerHTML = '<option value="">All Time</option>';
  Array.from(months).sort().reverse().forEach(month => {
    const option = document.createElement('option');
    option.value = month;
    option.textContent = new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    monthSelect.appendChild(option);
  });

  // Populate driver dropdown
  const drivers = new Set(DATA.deliveries.map(d => d.driver).filter(Boolean));
  const driverSelect = document.getElementById('filter-driver');
  driverSelect.innerHTML = '<option value="">All Drivers</option>';
  Array.from(drivers).sort().forEach(driver => {
    const option = document.createElement('option');
    option.value = driver;
    option.textContent = driver;
    driverSelect.appendChild(option);
  });

  // Populate store dropdown
  const storeSelect = document.getElementById('filter-store');
  storeSelect.innerHTML = '<option value="">All Stores</option>';
  DATA.stores.forEach(store => {
    const option = document.createElement('option');
    option.value = store.id;
    option.textContent = store.name;
    storeSelect.appendChild(option);
  });
}

function applyFilters() {
  const month = document.getElementById('filter-month').value;
  const driver = document.getElementById('filter-driver').value;
  const store = document.getElementById('filter-store').value;
  const dateStart = document.getElementById('filter-date-start').value;
  const dateEnd = document.getElementById('filter-date-end').value;

  let filtered = [...DATA.deliveries];

  if (month) {
    filtered = filtered.filter(d => d.date && d.date.startsWith(month));
  }

  if (driver) {
    filtered = filtered.filter(d => d.driver === driver);
  }

  if (store) {
    filtered = filtered.filter(d => d.store === store);
  }

  if (dateStart) {
    filtered = filtered.filter(d => d.date >= dateStart);
  }

  if (dateEnd) {
    filtered = filtered.filter(d => d.date <= dateEnd);
  }

  displayFilteredResults(filtered);

  // Update URL with filters (T-052: shareable URLs)
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (driver) params.set('driver', driver);
  if (store) params.set('store', store);
  if (dateStart) params.set('start', dateStart);
  if (dateEnd) params.set('end', dateEnd);

  const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.pushState({}, '', newUrl);
}

function displayFilteredResults(results) {
  const container = document.getElementById('filtered-results');
  if (results.length === 0) {
    container.innerHTML = '<p class="hint">No results match these filters</p>';
    return;
  }

  container.innerHTML = `
    <p style="margin-bottom:16px;font-weight:600;">Found ${results.length} deliveries</p>
    <div style="display:grid;gap:10px;">
      ${results.slice(0, 50).map(d => {
        const storeName = DATA.stores.find(s => s.id === d.store)?.name || `Store ${d.store}`;
        return `
          <div class="feed-item delivery">
            <span class="feed-time">${d.date} ${d.arrive || ''}</span>
            <span class="feed-text">${d.driver} → ${storeName} • ${d.dish}</span>
          </div>
        `;
      }).join('')}
    </div>
    ${results.length > 50 ? `<p style="margin-top:16px;color:var(--soft);font-size:0.85rem;">Showing first 50 of ${results.length} results</p>` : ''}
  `;
}

function clearFilters() {
  document.getElementById('filter-month').value = '';
  document.getElementById('filter-driver').value = '';
  document.getElementById('filter-store').value = '';
  document.getElementById('filter-date-start').value = '';
  document.getElementById('filter-date-end').value = '';
  document.getElementById('filtered-results').innerHTML = '<p class="hint">Apply filters above to see results</p>';
  window.history.pushState({}, '', window.location.pathname);
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function setupDateDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('recon-date').value = today;

  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + (6 - weekEnd.getDay())); // Next Saturday
  document.getElementById('safety-week-end').value = weekEnd.toISOString().slice(0, 10);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}
