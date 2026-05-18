
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
  const BUG_REPORT_EMAIL = 'YOUR_EMAIL@example.com'; // ← Replace with your email for bug reports

  try {
    const payload  = JSON.parse(e.postData.contents);

    // Handle bug reports
    if (payload.type === 'bugReport') {
      MailApp.sendEmail({
        to: BUG_REPORT_EMAIL,
        subject: payload.subject,
        body: payload.body
      });
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok', message: 'Bug report sent' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Handle form submissions
    const rows     = payload.rows;
    const formType = payload.formType;
    const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);

    // T-027: Capture server timestamp when data is received
    const serverTimestamp = new Date().toISOString();

    if (formType === 'delivery') {
      const sheet = ss.getSheetByName('Delivery Log - Live');
      if (!sheet) throw new Error('Sheet "Delivery Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.clientTimestamp,    // Col A  – Client Timestamp (when user submitted)
          serverTimestamp,        // Col B  – Server Timestamp (when server received)
          row.date,               // Col C  – Date
          row.driver,             // Col D  – Driver
          row.vehicle,            // Col E  – Vehicle #
          row.store,              // Col F  – Store  ← IMPORTANT: must match store ID e.g. '6542'
          row.arrive,             // Col G  – Arrival Time
          row.coolerTemp,         // Col H  – Cooler Temp °F
          row.coolerCond,         // Col I  – Cooler Condition
          row.casePrefillPercent, // Col J  – Case Pre-Fill % (NEW: T-047)
          row.dish,               // Col K  – Dish
          row.added,              // Col L  – Qty Added (qtyAdded)
          row.before,             // Col M  – On Shelf Before
          row.removed,            // Col N  – Qty Removed (Expired)
          row.reason,             // Col O  – Expire Reason
          row.after,              // Col P  – Shelf Total After
          row.notes,              // Col Q  – Store Notes
          row.receivedBy          // Col R  – Received By
        ]);
      });
    }

    if (formType === 'production') {
      const sheet = ss.getSheetByName('Production Log - Live');
      if (!sheet) throw new Error('Sheet "Production Log - Live" not found. Upload the provided Google Sheet file first.');
      rows.forEach(row => {
        sheet.appendRow([
          row.clientTimestamp, // Col A  – Client Timestamp (when user submitted)
          serverTimestamp,     // Col B  – Server Timestamp (when server received)
          row.date,            // Col C  – Date
          row.shift,           // Col D  – Shift
          row.kitchen,         // Col E  – Kitchen
          row.supervisor,      // Col F  – Supervisor
          row.dish,            // Col G  – Dish
          row.batch,           // Col H  – Batch #
          row.cookTemp,        // Col I  – Cook Temp °F
          row.cookStart,       // Col J  – Cook Start
          row.cookEnd,         // Col K  – Cook End
          row.cookTime,        // Col L  – Cook Time (min)
          row.qtyProduced,     // Col M  – Qty Produced
          row.qtyDiscarded,    // Col N  – Qty Discarded
          row.discardReason,   // Col O  – Discard Reason
          row.coolStart,       // Col P  – Cool Start
          row.coolEnd,         // Col Q  – Cool End
          row.coolTime,        // Col R  – Cool Time (min)
          row.finalTemp,       // Col S  – Final Temp °F
          row.qa,              // Col T  – QA Result
          row.qaNotes,         // Col U  – QA Notes
          row.initials,        // Col V  – Initials
          row.generalNotes,    // Col W  – General Notes
          row.batchQANotes     // Col X  – Batch QA Notes
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
