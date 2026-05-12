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
  updateCurrentDate();

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
    renderDeliveries();
    renderProduction();
    renderFoodSafety();
    renderWaste();
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

// Toggle dashboard info panel
function toggleDashboardInfo() {
  const info = document.getElementById('dashboard-info');
  info.style.display = info.style.display === 'none' ? 'block' : 'none';
}

// Toggle HACCP policy panel
function toggleHACCPPolicy() {
  const policy = document.getElementById('haccp-policy');
  policy.style.display = policy.style.display === 'none' ? 'block' : 'none';
}

// Load config.json (config.local.json in dev)
async function loadConfig() {
  try {
    const response = await fetch('config.json');
    if (!response.ok) throw new Error('config.json not found');
    CONFIG = await response.json();
    console.log('[Config] Loaded:', CONFIG);
  } catch (e) {
    console.error('[Config] Failed to load config.json:', e);
    updateStatus('error', 'Config file missing');
    showConfigInstructions();
  }
}

function showConfigInstructions() {
  document.getElementById('panel-overview').innerHTML = `
    <div style="padding:40px;text-align:center;background:var(--red-lt);border:2px solid var(--red);border-radius:12px;margin:20px;">
      <h2 style="font-family:'Syne',sans-serif;color:var(--red);margin-bottom:16px;">Configuration Required</h2>
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
    renderOverview();
    renderDeliveries();
    renderProduction();
    renderFoodSafety();
    renderWaste();
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

  // Today's Metrics
  const deliveriesToday = DATA.deliveries.filter(d => (d.date || '').slice(0, 10) === today).length;
  const productionToday = DATA.production.filter(p => (p.date || '').slice(0, 10) === today).length;
  const violationsToday = countViolations(DATA.deliveries.filter(d => (d.date || '').slice(0, 10) === today));
  const wasteThisWeek = DATA.waste
    .filter(w => new Date(w.date) >= weekStart)
    .reduce((sum, w) => sum + (parseInt(w.qtyRemoved) || 0), 0);

  document.getElementById('metric-deliveries').textContent = deliveriesToday;
  document.getElementById('metric-production').textContent = productionToday;
  document.getElementById('metric-violations').textContent = violationsToday;
  document.getElementById('metric-waste').textContent = wasteThisWeek;

  // Add critical alert styling if violations > 5
  const violationCard = document.getElementById('metric-violations').closest('.metric-card');
  if (violationsToday > 5) {
    violationCard.classList.add('critical');
  } else {
    violationCard.classList.remove('critical');
  }

  // System Overview Stats
  const totalDeliveries = DATA.deliveries.length;
  const totalProduction = DATA.production.length;
  const activeStores = new Set(DATA.deliveries.map(d => d.store).filter(Boolean)).size;

  document.getElementById('stat-total-deliveries').textContent = totalDeliveries.toLocaleString();
  document.getElementById('stat-total-production').textContent = totalProduction.toLocaleString();
  document.getElementById('stat-total-stores').textContent = activeStores;

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
    // storeId is already the full store name from the delivery data
    const storeName = storeId || 'Unknown Store';
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

function hasHACCPViolation(delivery) {
  const coolerTemp = parseFloat(delivery.coolerTemp);
  const arrivalTemp = parseFloat(delivery.arrivalTemp);
  return coolerTemp > 41 || arrivalTemp > 41;
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
        ${totalViolations === 0 ? '<p style="color:var(--green);font-weight:600;margin-top:12px;">All checks passed this week</p>' : ''}
      </div>
    `;
  }).join('');
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
  chart: null
};

function renderDeliveries() {
  // Default to last 7 days
  setDeliveryQuickRange(7);
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
  const today = new Date();
  let filtered = [...DATA.deliveries];

  if (range === 'today') {
    const todayStr = today.toISOString().split('T')[0];
    filtered = filtered.filter(d => (d.date || '').slice(0, 10) === todayStr);
  } else if (range !== 'all') {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - range);
    const startStr = startDate.toISOString().split('T')[0];
    filtered = filtered.filter(d => (d.date || '').slice(0, 10) >= startStr);
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
  DELIVERY_STATE.filtered = DATA.deliveries.filter(d => d.date >= startDate && d.date <= endDate);

  updateDeliveryMetrics();
  updateDeliveryChart();
  displayDeliveryTable();
}

function applyDeliveryAdvancedFilters() {
  const driver = document.getElementById('delivery-driver-filter').value;
  const store = document.getElementById('delivery-store-filter').value;
  const dish = document.getElementById('delivery-dish-filter').value;
  const search = document.getElementById('delivery-search').value.toLowerCase();

  let filtered = [...DELIVERY_STATE.filtered];

  if (driver) filtered = filtered.filter(d => d.driver === driver);
  if (store) filtered = filtered.filter(d => d.store === store);
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
  document.getElementById('delivery-driver-filter').value = '';
  document.getElementById('delivery-store-filter').value = '';
  document.getElementById('delivery-dish-filter').value = '';
  document.getElementById('delivery-search').value = '';
  setDeliveryQuickRange(7); // Reset to default
}

function updateDeliveryMetrics() {
  const filtered = DELIVERY_STATE.filtered;
  const totalDeliveries = filtered.length;
  const totalUnitsDelivered = filtered.reduce((sum, d) => sum + (parseInt(d.added) || 0), 0);
  const uniqueStores = new Set(filtered.map(d => d.store)).size;
  const uniqueDrivers = new Set(filtered.map(d => d.driver)).size;

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

  const storeSelect = document.getElementById('delivery-store-filter');
  storeSelect.innerHTML = '<option value="">All Stores</option>';
  const storesInFiltered = new Set(filtered.map(d => d.store).filter(Boolean));
  Array.from(storesInFiltered).sort().forEach(storeName => {
    storeSelect.innerHTML += `<option value="${storeName}">${storeName}</option>`;
  });
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
    const storeName = DATA.stores.find(s => s.id === d.store)?.name || `Store ${d.store}`;
    const hasViolation = hasHACCPViolation(d);
    const rowStyle = hasViolation ? 'style="background:#FADBD8;border-left:4px solid var(--red);"' : '';
    const tempIcon = hasViolation ? '⚠️ ' : '';
    return `
      <tr ${rowStyle}>
        <td>${d.date}</td>
        <td>${d.arrive || 'N/A'}</td>
        <td>${d.driver}</td>
        <td>${tempIcon}${storeName}</td>
        <td>${d.dish}</td>
        <td>${d.added || 0}</td>
        <td>${d.removed || 0}</td>
        <td>${d.receivedBy || 'N/A'}</td>
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
          <th>Dish</th>
          <th>Added</th>
          <th>Removed</th>
          <th>Received By</th>
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
  advancedFilters: {
    shift: '',
    kitchen: '',
    supervisor: '',
    dish: '',
    qa: '',
    search: ''
  }
};

function renderProduction() {
  // Default to last 7 days
  setProductionQuickRange(7);
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
  const today = new Date();
  let filtered = [...DATA.production];

  if (range === 'today') {
    const todayStr = today.toISOString().split('T')[0];
    filtered = filtered.filter(p => (p.date || '').slice(0, 10) === todayStr);
  } else if (range !== 'all') {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - range);
    const startStr = startDate.toISOString().split('T')[0];
    filtered = filtered.filter(p => (p.date || '').slice(0, 10) >= startStr);
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

  let filtered = [...DATA.production];
  filtered = filtered.filter(p => p.date >= startDate && p.date <= endDate);

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
  const qaPassCount = filtered.filter(p => p.qa === 'Pass').length;
  const qaPassRate = totalBatches > 0 ? ((qaPassCount / totalBatches) * 100).toFixed(1) : '0.0';

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
    <div class="metric-card ${qaPassRate < 95 ? 'alert' : ''}">
      <div class="metric-label">QA Pass Rate</div>
      <div class="metric-value">${qaPassRate}%</div>
      <div class="metric-sub">${qaPassCount} of ${totalBatches} passed</div>
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
  populateSelect('production-qa-filter', new Set(filtered.map(p => p.qa).filter(Boolean)));
}

function applyProductionAdvancedFilters() {
  PRODUCTION_STATE.advancedFilters = {
    shift: document.getElementById('production-shift-filter').value,
    kitchen: document.getElementById('production-kitchen-filter').value,
    supervisor: document.getElementById('production-supervisor-filter').value,
    dish: document.getElementById('production-dish-filter').value,
    qa: document.getElementById('production-qa-filter').value,
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
  document.getElementById('production-qa-filter').value = '';
  document.getElementById('production-search').value = '';
  PRODUCTION_STATE.advancedFilters = {
    shift: '',
    kitchen: '',
    supervisor: '',
    dish: '',
    qa: '',
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
  if (filters.qa) filtered = filtered.filter(p => p.qa === filters.qa);
  if (filters.search) {
    filtered = filtered.filter(p => {
      return (p.date && p.date.toLowerCase().includes(filters.search)) ||
             (p.shift && p.shift.toLowerCase().includes(filters.search)) ||
             (p.kitchen && p.kitchen.toLowerCase().includes(filters.search)) ||
             (p.supervisor && p.supervisor.toLowerCase().includes(filters.search)) ||
             (p.dish && p.dish.toLowerCase().includes(filters.search)) ||
             (p.batch && p.batch.toLowerCase().includes(filters.search)) ||
             (p.qa && p.qa.toLowerCase().includes(filters.search));
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

  const rows = pageData.map(p => {
    const qaClass = p.qa === 'Pass' ? '' : (p.qa === 'Fail' ? 'style="color:var(--red);font-weight:600;"' : '');
    return `
      <tr>
        <td>${p.date}</td>
        <td>${p.shift}</td>
        <td>${p.kitchen}</td>
        <td>${p.supervisor}</td>
        <td>${p.dish}</td>
        <td>${p.batch}</td>
        <td>${p.qtyProduced || 0}</td>
        <td>${p.qtyDiscarded || 0}</td>
        <td ${qaClass}>${p.qa || 'N/A'}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Shift</th>
          <th>Kitchen</th>
          <th>Supervisor</th>
          <th>Dish</th>
          <th>Batch</th>
          <th>Produced</th>
          <th>Discarded</th>
          <th>QA</th>
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

const WASTE_STATE = {
  quickRange: 30,
  filtered: [],
  charts: {
    byStore: null,
    byDish: null,
    byReason: null,
    trend: null
  }
};

function renderWaste() {
  // Default to last 30 days
  setWasteQuickRange(30);
}

function setWasteQuickRange(range) {
  WASTE_STATE.quickRange = range;

  // Update button states
  document.querySelectorAll('#panel-waste .btn-time-range').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-range') == range) {
      btn.classList.add('active');
    }
  });

  // Filter by date range
  const today = new Date();
  let filtered = [...DATA.waste];

  if (range !== 'all') {
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - range);
    const startStr = startDate.toISOString().split('T')[0];
    filtered = filtered.filter(w => w.date >= startStr);
  }

  WASTE_STATE.filtered = filtered;
  updateWasteMetrics();
  updateWasteCharts();
}

function updateWasteMetrics() {
  const filtered = WASTE_STATE.filtered;
  const totalWaste = filtered.reduce((sum, w) => sum + (parseInt(w.qtyRemoved) || 0), 0);
  const wasteEvents = filtered.length;
  const avgPerEvent = wasteEvents > 0 ? Math.round(totalWaste / wasteEvents) : 0;

  // Calculate top reason
  const wasteByReason = {};
  filtered.forEach(w => {
    const reason = w.reason || 'Unknown';
    wasteByReason[reason] = (wasteByReason[reason] || 0) + (parseInt(w.qtyRemoved) || 0);
  });
  const topReason = Object.entries(wasteByReason).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('waste-metrics').innerHTML = `
    <div class="metric-card alert">
      <div class="metric-label">Total Waste</div>
      <div class="metric-value">${totalWaste.toLocaleString()}</div>
      <div class="metric-sub">Units discarded</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Waste Events</div>
      <div class="metric-value">${wasteEvents.toLocaleString()}</div>
      <div class="metric-sub">${avgPerEvent} avg units/event</div>
    </div>
    <div class="metric-card">
      <div class="metric-label">Top Waste Reason</div>
      <div class="metric-value" style="font-size:1.3rem;">${topReason ? topReason[0] : 'N/A'}</div>
      <div class="metric-sub">${topReason ? topReason[1] + ' units' : ''}</div>
    </div>
  `;
}

function updateWasteCharts() {
  const filtered = WASTE_STATE.filtered;

  // Aggregate data
  const wasteByStore = {};
  const wasteByDish = {};
  const wasteByReason = {};
  const wasteByDate = {};

  filtered.forEach(w => {
    const qty = parseInt(w.qtyRemoved) || 0;
    wasteByStore[w.store] = (wasteByStore[w.store] || 0) + qty;
    wasteByDish[w.dish] = (wasteByDish[w.dish] || 0) + qty;
    wasteByReason[w.reason || 'Unknown'] = (wasteByReason[w.reason || 'Unknown'] || 0) + qty;
    wasteByDate[w.date] = (wasteByDate[w.date] || 0) + qty;
  });

  // Chart 1: Waste by Store (Bar Chart)
  const storeEntries = Object.entries(wasteByStore).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const storeLabels = storeEntries.map(([storeId]) => {
    const storeName = DATA.stores.find(s => s.id === storeId)?.name || `Store ${storeId}`;
    return storeName;
  });
  const storeData = storeEntries.map(([, qty]) => qty);

  if (WASTE_STATE.charts.byStore) WASTE_STATE.charts.byStore.destroy();
  const ctx1 = document.getElementById('chart-waste-by-store').getContext('2d');
  WASTE_STATE.charts.byStore = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: storeLabels,
      datasets: [{
        label: 'Units Wasted',
        data: storeData,
        backgroundColor: 'rgba(192, 57, 43, 0.7)',
        borderColor: '#C0392B',
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
        y: { beginAtZero: true }
      }
    }
  });

  // Chart 2: Waste by Dish (Horizontal Bar Chart)
  const dishEntries = Object.entries(wasteByDish).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const dishLabels = dishEntries.map(([dish]) => dish);
  const dishData = dishEntries.map(([, qty]) => qty);

  if (WASTE_STATE.charts.byDish) WASTE_STATE.charts.byDish.destroy();
  const ctx2 = document.getElementById('chart-waste-by-dish').getContext('2d');
  WASTE_STATE.charts.byDish = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: dishLabels,
      datasets: [{
        label: 'Units Wasted',
        data: dishData,
        backgroundColor: 'rgba(192, 57, 43, 0.7)',
        borderColor: '#C0392B',
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
        x: { beginAtZero: true }
      }
    }
  });

  // Chart 3: Waste by Reason (Doughnut Chart)
  const reasonEntries = Object.entries(wasteByReason).sort((a, b) => b[1] - a[1]);
  const reasonLabels = reasonEntries.map(([reason]) => reason);
  const reasonData = reasonEntries.map(([, qty]) => qty);

  if (WASTE_STATE.charts.byReason) WASTE_STATE.charts.byReason.destroy();
  const ctx3 = document.getElementById('chart-waste-by-reason').getContext('2d');
  WASTE_STATE.charts.byReason = new Chart(ctx3, {
    type: 'doughnut',
    data: {
      labels: reasonLabels,
      datasets: [{
        data: reasonData,
        backgroundColor: [
          '#C0392B',
          '#E74C3C',
          '#EC7063',
          '#F1948A',
          '#F5B7B1',
          '#FADBD8'
        ],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 11 },
            padding: 10
          }
        }
      }
    }
  });

  // Chart 4: Waste Trend Over Time (Line Chart)
  const dateEntries = Object.entries(wasteByDate).sort((a, b) => a[0].localeCompare(b[0]));
  const trendLabels = dateEntries.map(([date]) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  const trendData = dateEntries.map(([, qty]) => qty);

  if (WASTE_STATE.charts.trend) WASTE_STATE.charts.trend.destroy();
  const ctx4 = document.getElementById('chart-waste-trend').getContext('2d');
  WASTE_STATE.charts.trend = new Chart(ctx4, {
    type: 'line',
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Daily Waste',
        data: trendData,
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
        y: { beginAtZero: true }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Food Safety Panel
// ═══════════════════════════════════════════════════════════════════════════

function renderFoodSafety() {
  // Stub function for food safety - can be expanded later
  console.log('[Food Safety] Panel rendered');
}

// ═══════════════════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════════════════

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}
