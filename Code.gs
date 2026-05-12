
// ═══════════════════════════════════════════════════════════════════════════════
// Taipei Kitchen — Google Apps Script
// 1. In your Google Sheet go to Extensions → Apps Script
// 2. Delete everything there and paste ALL of the code below
// 3. Replace 1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E with your actual Sheet ID
// 4. Click Deploy → New deployment → Web app → Execute as: Me → Anyone → Deploy
// 5. Copy the Web app URL and paste it into both HTML form files
// ═══════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  const SPREADSHEET_ID = '1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E'; // ← Replace this

  try {
    const payload  = JSON.parse(e.postData.contents);
    const rows     = payload.rows;
    const formType = payload.formType;
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (formType === 'delivery') {
      const sheet = ss.getSheetByName('Delivery Log - Live');
      if (!sheet) throw new Error('Sheet "Delivery Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.submittedAt,         // Col A  – Submitted At
          row.date,                // Col B  – Date
          row.driver,              // Col C  – Driver
          row.store,               // Col D  – Store # (e.g. "Store 6542 – Carlisle, PA")
          row.arrive,              // Col E  – Arrival time
          row.arrivalProductTemp,  // Col F  – Arrival Temp
          row.coolerTemp,          // Col G  – Cooler Temp °F
          row.coolerCond,          // Col H  – Cooler Condition
          row.caseFillLevel,       // Col I  – Case Pre-Fill % (T-047)
          row.dish,                // Col J  – Dish
          row.added,               // Col K  – Qty Added
          row.before,              // Col L  – On Shelf Before
          row.removed,             // Col M  – Qty Removed (Expired)
          row.reason,              // Col N  – Expire Reason
          row.after,               // Col O  – Shelf Total After
          row.notes,               // Col P  – Store Notes
          row.receivedBy           // Col Q  – Received By
        ]);
      });
    }

    if (formType === 'production') {
      const sheet = ss.getSheetByName('Production Log - Live');
      if (!sheet) throw new Error('Sheet "Production Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.submittedAt,    // Col A  – Submitted At
          row.date,           // Col B  – Date
          row.shift,          // Col C  – Shift
          row.kitchen,        // Col D  – Kitchen
          row.supervisor,     // Col E  – Supervisor
          row.dish,           // Col F  – Dish
          row.batch,          // Col G  – Batch #
          row.cookTemp,       // Col H  – Cook Temp °F
          row.cookStart,      // Col I  – Cook Start
          row.cookEnd,        // Col J  – Cook End
          row.cookTime,       // Col K  – Cook Time (min)
          row.qtyProduced,    // Col L  – Qty Produced
          row.qtyDiscarded,   // Col M  – Qty Discarded
          row.discardReason,  // Col N  – Discard Reason
          row.coolStart,      // Col O  – Cool Start
          row.coolEnd,        // Col P  – Cool End
          row.coolTime,       // Col Q  – Cool Time (min)
          row.finalTemp,      // Col R  – Final Temp °F
          row.qa,             // Col S  – QA Result
          row.qaNotes,        // Col T  – QA Notes
          row.initials,       // Col U  – Initials
          row.generalNotes,   // Col V  – General Notes
          row.batchQANotes    // Col W  – Batch QA Notes
        ]);
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function — run this manually in the editor to verify your Sheet ID is correct
function testConnection() {
  const SPREADSHEET_ID = '1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to: ' + ss.getName());
  Logger.log('Sheets found: ' + ss.getSheets().map(s => s.getName()).join(', '));
}

// ═══════════════════════════════════════════════════════════════════════════
// T-049: doGet JSON Endpoint for Web Dashboard
// ═══════════════════════════════════════════════════════════════════════════
// Returns { deliveries, production, waste, stores, lastUpdated }
// Supports query params: ?since=ISO_TIMESTAMP (incremental) and ?range=YYYY-MM (month filter)
// Deploy as Web App: Execute as Me, Anyone with link
// ═══════════════════════════════════════════════════════════════════════════

function doGet(e) {
  const SPREADSHEET_ID = '1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E'; // ← Replace this

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const params = e.parameter || {};

    // Extract query parameters
    const since = params.since || null;
    const range = params.range || null; // YYYY-MM format

    // Read delivery data
    const deliverySheet = ss.getSheetByName('Delivery Log - Live');
    const deliveries = deliverySheet ? sheetToJSON(deliverySheet, [
      'submittedAt', 'date', 'driver', 'store', 'arrive', 'arrivalTemp', 'coolerTemp',
      'coolerCond', 'caseFillLevel', 'dish', 'added', 'before', 'removed', 'reason',
      'after', 'notes', 'receivedBy'
    ]) : [];

    // Read production data
    const productionSheet = ss.getSheetByName('Production Log - Live');
    const production = productionSheet ? sheetToJSON(productionSheet, [
      'submittedAt', 'date', 'shift', 'kitchen', 'supervisor', 'dish', 'batch',
      'cookTemp', 'cookStart', 'cookEnd', 'cookTime', 'qtyProduced', 'qtyDiscarded',
      'discardReason', 'coolStart', 'coolEnd', 'coolTime', 'finalTemp', 'qa',
      'qaNotes', 'initials', 'generalNotes', 'batchQANotes'
    ]) : [];

    // Extract waste data (from delivery log where removed > 0)
    const waste = deliveries.filter(d => parseInt(d.removed) > 0).map(d => ({
      date: d.date,
      store: d.store,
      dish: d.dish,
      qtyRemoved: d.removed,
      reason: normalizeWasteReason(d.reason)
    }));

    // Helper function to normalize waste reasons
    function normalizeWasteReason(reason) {
      if (!reason || reason.trim() === '') return 'Unknown';
      const r = reason.toLowerCase().trim();
      if (r.includes('ood') || r.includes('out of date') || r.includes('expired')) return 'Out of Date';
      if (r.includes('damage')) return 'Damaged';
      if (r.includes('quality')) return 'Quality Issue';
      if (r.includes('temp')) return 'Temperature Violation';
      return reason; // Keep original if no match
    }

    // Read store list from Store Lookup tab (if it exists)
    const storeSheet = ss.getSheetByName('Store Lookup');
    const stores = storeSheet ? sheetToJSON(storeSheet, ['id', 'name', 'location']).filter(s => s.id) : [
      { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA' },
      { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA' },
      { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA' },
      { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA' },
      { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA' },
      { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
      { id: '6564', name: 'Store 6564', location: 'Harrisburg (Grayson Rd), PA' }
    ];

    // Apply filters
    let filteredDeliveries = deliveries;
    let filteredProduction = production;

    if (since) {
      filteredDeliveries = deliveries.filter(d => new Date(d.submittedAt) > new Date(since));
      filteredProduction = production.filter(p => new Date(p.submittedAt) > new Date(since));
    }

    if (range) {
      filteredDeliveries = deliveries.filter(d => d.date && d.date.startsWith(range));
      filteredProduction = production.filter(p => p.date && p.date.startsWith(range));
    }

    const response = {
      deliveries: filteredDeliveries,
      production: filteredProduction,
      waste: waste,
      stores: stores,
      lastUpdated: new Date().toISOString()
    };

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: err.toString(),
        deliveries: [],
        production: [],
        waste: [],
        stores: [],
        lastUpdated: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper: Convert sheet data to JSON array
function sheetToJSON(sheet, headers) {
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) { // Skip header row
    const row = {};
    for (let j = 0; j < headers.length && j < data[i].length; j++) {
      row[headers[j]] = data[i][j];
    }
    rows.push(row);
  }
  return rows;
}
