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

  if (panelName === 'settings') {
    loadSettings(); // Load saved settings into form
  }

  // Scroll to top on mobile when switching panels
  if (window.innerWidth <= 768) {
    window.scrollTo(0, 0);
  }
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

  // New high-value widgets
  renderCriticalAlerts();
  renderStorePerformance();
  renderFinancialImpact();
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
    const date = new Date(item.time);
    const time = isNaN(date.getTime()) ? '—' : date.toLocaleTimeString();
    const typeClass = item.type;
    let text = '';

    if (item.type === 'delivery') {
      const storeName = DATA.stores.find(s => s.id === item.store)?.name || `Store ${item.store}`;
      text = `${item.driver || 'Unknown'} delivered to ${storeName}`;
    } else {
      text = `${item.supervisor || 'Unknown'} logged production batch ${item.batch || '—'}`;
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
// NEW HIGH-VALUE WIDGETS
// ═══════════════════════════════════════════════════════════════════════════

function renderCriticalAlerts() {
  const today = new Date().toISOString().slice(0, 10);
  const todayDeliveries = DATA.deliveries.filter(d => (d.date || '').slice(0, 10) === today);

  const alerts = [];

  // Check for temperature violations
  const violations = todayDeliveries.filter(d => hasViolation(d));
  if (violations.length > 0) {
    alerts.push({
      level: 'critical',
      message: `${violations.length} temperature violation${violations.length > 1 ? 's' : ''} today`,
      details: violations.map(v => `Store ${v.store}: ${v.coolerTemp}°F`).slice(0, 3).join(', ')
    });
  }

  // Check for high shrink stores
  const shrinkByStore = {};
  todayDeliveries.forEach(d => {
    if (!shrinkByStore[d.store]) shrinkByStore[d.store] = { added: 0, removed: 0 };
    shrinkByStore[d.store].added += parseInt(d.added) || 0;
    shrinkByStore[d.store].removed += parseInt(d.removed) || 0;
  });

  Object.entries(shrinkByStore).forEach(([store, data]) => {
    const rate = data.added > 0 ? (data.removed / data.added) * 100 : 0;
    if (rate > 15) {
      alerts.push({
        level: 'warning',
        message: `Store ${store}: ${rate.toFixed(1)}% shrink rate`,
        details: `${data.removed} units shrink out of ${data.added} loaded`
      });
    }
  });

  const container = document.getElementById('critical-alerts-content');

  if (alerts.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--green);font-weight:600;">✅ All systems normal - no critical alerts</div>';
    return;
  }

  container.innerHTML = alerts.map(alert => `
    <div style="padding:12px;margin-bottom:8px;border-left:4px solid ${alert.level === 'critical' ? 'var(--red)' : '#F59E0B'};background:${alert.level === 'critical' ? 'var(--red-lt)' : '#FEF3C7'};border-radius:4px;">
      <div style="font-weight:600;color:${alert.level === 'critical' ? 'var(--red)' : '#B45309'};margin-bottom:4px;">${alert.message}</div>
      <div style="font-size:0.85rem;color:var(--mid);">${alert.details}</div>
    </div>
  `).join('');
}

function renderStorePerformance() {
  // Calculate shrink rate per store
  const storeMetrics = {};

  DATA.deliveries.forEach(d => {
    const store = d.store;
    if (!storeMetrics[store]) {
      storeMetrics[store] = { added: 0, removed: 0, violations: 0, deliveries: 0 };
    }
    storeMetrics[store].added += parseInt(d.added) || 0;
    storeMetrics[store].removed += parseInt(d.removed) || 0;
    if (hasViolation(d)) storeMetrics[store].violations++;
    storeMetrics[store].deliveries++;
  });

  // Calculate rates and rank
  const ranked = Object.entries(storeMetrics).map(([store, data]) => ({
    store,
    shrinkRate: data.added > 0 ? (data.removed / data.added) * 100 : 0,
    violationRate: data.deliveries > 0 ? (data.violations / data.deliveries) * 100 : 0,
    ...data
  })).filter(s => s.deliveries >= 5); // Only stores with 5+ deliveries

  // Sort by shrink rate
  ranked.sort((a, b) => a.shrinkRate - b.shrinkRate);

  const bestStores = ranked.slice(0, 3);
  const problemStores = ranked.slice(-3).reverse();

  // Render best performers
  const bestContainer = document.getElementById('best-stores-list');
  bestContainer.innerHTML = bestStores.map((s, i) => `
    <div style="padding:10px;margin-bottom:8px;background:var(--green-lt);border-radius:6px;border:1px solid var(--green);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;color:var(--dark);">Store ${s.store}</span>
          <div style="font-size:0.8rem;color:var(--mid);margin-top:2px;">${s.deliveries} deliveries</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:1.1rem;color:var(--green);">${s.shrinkRate.toFixed(1)}%</div>
          <div style="font-size:0.75rem;color:var(--mid);">shrink rate</div>
        </div>
      </div>
    </div>
  `).join('') || '<div style="padding:16px;text-align:center;color:var(--soft);">Not enough data</div>';

  // Render problem stores
  const problemContainer = document.getElementById('problem-stores-list');
  problemContainer.innerHTML = problemStores.map((s, i) => `
    <div style="padding:10px;margin-bottom:8px;background:var(--red-lt);border-radius:6px;border:1px solid var(--red);">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:600;color:var(--dark);">Store ${s.store}</span>
          <div style="font-size:0.8rem;color:var(--mid);margin-top:2px;">${s.violations} violations</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;font-size:1.1rem;color:var(--red);">${s.shrinkRate.toFixed(1)}%</div>
          <div style="font-size:0.75rem;color:var(--mid);">shrink rate</div>
        </div>
      </div>
    </div>
  `).join('') || '<div style="padding:16px;text-align:center;color:var(--soft);">Not enough data</div>';
}

function renderFinancialImpact() {
  const weekStart = getWeekStart(new Date());
  const weekDeliveries = DATA.deliveries.filter(d => new Date(d.date) >= weekStart);

  const totalAdded = weekDeliveries.reduce((sum, d) => sum + (parseInt(d.added) || 0), 0);
  const totalShrink = weekDeliveries.reduce((sum, d) => sum + (parseInt(d.removed) || 0), 0);
  const shrinkRate = totalAdded > 0 ? (totalShrink / totalAdded) * 100 : 0;

  // Estimate cost (assuming avg $5 per unit - client can adjust)
  const avgUnitCost = 5;
  const totalLoadedValue = totalAdded * avgUnitCost;
  const shrinkCost = totalShrink * avgUnitCost;
  const targetShrinkRate = 5; // Industry standard
  const potentialSavings = totalAdded > 0 ? ((shrinkRate - targetShrinkRate) / 100) * totalLoadedValue : 0;

  const container = document.getElementById('financial-metrics');
  container.innerHTML = `
    <div style="padding:12px 0;">
      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem;color:var(--soft);text-transform:uppercase;margin-bottom:4px;">Total Loaded (This Week)</div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--dark);">$${totalLoadedValue.toLocaleString()}</div>
        <div style="font-size:0.8rem;color:var(--mid);">${totalAdded.toLocaleString()} units @ $${avgUnitCost}/unit</div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:0.75rem;color:var(--soft);text-transform:uppercase;margin-bottom:4px;">Shrink Cost</div>
        <div style="font-size:1.5rem;font-weight:700;color:var(--red);">$${shrinkCost.toLocaleString()}</div>
        <div style="font-size:0.8rem;color:var(--mid);">${shrinkRate.toFixed(1)}% shrink rate</div>
      </div>

      ${potentialSavings > 0 ? `
      <div style="padding:12px;background:var(--yellow);border-radius:6px;">
        <div style="font-size:0.75rem;color:var(--dark);text-transform:uppercase;margin-bottom:4px;">Potential Savings</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--dark);">$${potentialSavings.toLocaleString()}</div>
        <div style="font-size:0.75rem;color:var(--dark);">If shrink reduced to ${targetShrinkRate}%</div>
      </div>
      ` : '<div style="padding:12px;background:var(--green-lt);border-radius:6px;text-align:center;color:var(--green);font-weight:600;">✓ Meeting target shrink rate!</div>'}
    </div>
  `;
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
  document.querySelectorAll('#panel-shrink .filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

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
  const filteredDeliveries = DATA.deliveries.filter(d => {
    const dDate = new Date(d.date);
    return dDate >= startDate;
  });

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
    const dateStr = (d.date || '').slice(0, 10);
    if (!shrinkByDate[dateStr]) {
      shrinkByDate[dateStr] = { loaded: 0, shrink: 0 };
    }
    shrinkByDate[dateStr].loaded += parseInt(d.qtyAdded) || 0;
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
}

function renderShrinkTable(deliveries) {
  // Prepare table data
  shrinkTableData = deliveries
    .filter(d => parseInt(d.added) > 0 || parseInt(d.removed) > 0)
    .map(d => ({
      date: (d.date || '').slice(0, 10),
      store: d.store || 'Unknown',
      item: d.dish || 'Unknown',
      loaded: parseInt(d.added) || 0,
      shrink: parseInt(d.removed) || 0,
      rate: (parseInt(d.added) > 0 ? ((parseInt(d.removed) / parseInt(d.added)) * 100).toFixed(2) : 0),
      reason: d.reason || 'N/A'
    }))
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
    const start = new Date(startDate);
    filtered = filtered.filter(d => new Date(d.date) >= start);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include full end date
    filtered = filtered.filter(d => new Date(d.date) <= end);
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
  const timestamp = new Date().toISOString().slice(0, 10);
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
const SETTINGS = {
  theme: 'light',
  tempThreshold: 41,
  shrinkThreshold: 15,
  targetShrink: 5,
  avgUnitCost: 5,
  currencyFormat: 'USD',
  showBugButton: true,
  bugEmail: 'YOUR_EMAIL@example.com'
};

function loadSettings() {
  const saved = localStorage.getItem('dashboard-settings');
  if (saved) {
    Object.assign(SETTINGS, JSON.parse(saved));
  }

  // Apply settings to UI
  document.getElementById('temp-threshold').value = SETTINGS.tempThreshold;
  document.getElementById('shrink-threshold').value = SETTINGS.shrinkThreshold;
  document.getElementById('target-shrink').value = SETTINGS.targetShrink;
  document.getElementById('avg-unit-cost').value = SETTINGS.avgUnitCost;
  document.getElementById('currency-format').value = SETTINGS.currencyFormat;
  document.getElementById('show-bug-button').checked = SETTINGS.showBugButton;
  document.getElementById('bug-email').value = SETTINGS.bugEmail;

  // Apply theme button states
  updateThemeButtonStates(SETTINGS.theme);

  // Apply bug button visibility
  const bugBtn = document.getElementById('bug-report-btn');
  if (bugBtn) {
    bugBtn.style.display = SETTINGS.showBugButton ? 'block' : 'none';
  }
}

function saveSettings() {
  // Read values from inputs
  SETTINGS.tempThreshold = parseFloat(document.getElementById('temp-threshold').value);
  SETTINGS.shrinkThreshold = parseFloat(document.getElementById('shrink-threshold').value);
  SETTINGS.targetShrink = parseFloat(document.getElementById('target-shrink').value);
  SETTINGS.avgUnitCost = parseFloat(document.getElementById('avg-unit-cost').value);
  SETTINGS.currencyFormat = document.getElementById('currency-format').value;
  SETTINGS.showBugButton = document.getElementById('show-bug-button').checked;
  SETTINGS.bugEmail = document.getElementById('bug-email').value;

  // Save to localStorage
  localStorage.setItem('dashboard-settings', JSON.stringify(SETTINGS));

  // Apply bug button visibility
  const bugBtn = document.getElementById('bug-report-btn');
  if (bugBtn) {
    bugBtn.style.display = SETTINGS.showBugButton ? 'block' : 'none';
  }

  // Show confirmation
  alert('Settings saved successfully! Refresh the dashboard to see updated calculations.');
}

function setThemeFromSettings(theme) {
  SETTINGS.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dashboard-theme', theme);
  updateThemeButtonStates(theme);
  updateThemeIcon(theme);
}

function updateThemeButtonStates(theme) {
  const lightBtn = document.getElementById('theme-light-btn');
  const darkBtn = document.getElementById('theme-dark-btn');

  if (lightBtn && darkBtn) {
    if (theme === 'dark') {
      lightBtn.style.borderColor = 'var(--border)';
      lightBtn.style.background = 'var(--surface)';
      lightBtn.style.color = 'var(--dark)';
      darkBtn.style.borderColor = 'var(--red)';
      darkBtn.style.background = 'var(--red)';
      darkBtn.style.color = '#fff';
    } else {
      lightBtn.style.borderColor = 'var(--red)';
      lightBtn.style.background = 'var(--red)';
      lightBtn.style.color = '#fff';
      darkBtn.style.borderColor = 'var(--border)';
      darkBtn.style.background = 'var(--surface)';
      darkBtn.style.color = 'var(--dark)';
    }
  }
}

function resetDashboardTour() {
  localStorage.removeItem('dashboard-tour-seen');
  localStorage.removeItem('dashboard-tour-version');
  alert('Dashboard tour has been reset! It will show again when you refresh the page.');
}

function exportAllDataToJSON() {
  if (!DATA.deliveries || !DATA.production) {
    alert('No data available to export');
    return;
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    version: '2.0',
    deliveries: DATA.deliveries,
    production: DATA.production,
    stores: DATA.stores
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  link.setAttribute('href', url);
  link.setAttribute('download', `taipei-kitchen-data-${timestamp}.json`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function clearLocalSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
    localStorage.removeItem('dashboard-settings');
    localStorage.removeItem('dashboard-theme');
    localStorage.removeItem('dashboard-tour-seen');
    localStorage.removeItem('dashboard-tour-version');
    alert('All settings have been cleared! The page will now reload with default settings.');
    location.reload();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Collapsible Sidebar
// ═══════════════════════════════════════════════════════════════════════════════

function toggleSidebar() {
  const sidebar = document.getElementById('side-nav');
  sidebar.classList.toggle('collapsed');

  // Save state to localStorage
  const isCollapsed = sidebar.classList.contains('collapsed');
  localStorage.setItem('sidebar-collapsed', isCollapsed);
}

// Restore sidebar state on load
window.addEventListener('DOMContentLoaded', function() {
  const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (isCollapsed) {
    document.getElementById('side-nav').classList.add('collapsed');
  }
});
