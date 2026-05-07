
// ═══════════════════════════════════════════════════════════════════════════════
// Taipei Kitchen — Google Apps Script
// 1. In your Google Sheet go to Extensions → Apps Script
// 2. Delete everything there and paste ALL of the code below
// 3. Replace YOUR_SPREADSHEET_ID with your actual Sheet ID
// 4. Click Deploy → New deployment → Web app → Execute as: Me → Anyone → Deploy
// 5. Copy the Web app URL and paste it into both HTML form files
// ═══════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // ← Replace this

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
          row.submittedAt,  // Col A  – Submitted At
          row.date,         // Col B  – Date
          row.driver,       // Col C  – Driver
          row.vehicle,      // Col D  – Vehicle #
          row.store,        // Col E  – Store  ← IMPORTANT: must match store ID e.g. '6542'
          row.arrive,       // Col F  – Arrival Time
          row.coolerTemp,   // Col G  – Cooler Temp °F
          row.coolerCond,   // Col H  – Cooler Condition
          row.dish,         // Col I  – Dish
          row.added,        // Col J  – Qty Added
          row.before,       // Col K  – On Shelf Before
          row.removed,      // Col L  – Qty Removed (Expired)
          row.reason,       // Col M  – Expire Reason
          row.after,        // Col N  – Shelf Total After
          row.notes,        // Col O  – Store Notes
          row.receivedBy    // Col P  – Received By
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
  const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log('Connected to: ' + ss.getName());
  Logger.log('Sheets found: ' + ss.getSheets().map(s => s.getName()).join(', '));
}
