// Reads.gs — read-only endpoints: the dashboard payload and the admin queries.

function action_getExecutionLog(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const logSheet = ss.getSheetByName('Execution Log');

    if (!logSheet) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          logs: [],
          message: 'Execution Log sheet does not exist yet'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const limit = parseInt(e.parameter.limit) || 10;
    const data = logSheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1); // Skip header

    // Get last N entries
    const recentRows = rows.slice(-limit);
    const logs = recentRows.map(row => ({
      timestamp: row[0],
      formType: row[1],
      rowCount: row[2],
      photoSizeKB: row[3],
      status: row[4],
      errorMessage: row[5],
      durationMs: row[6]
    }));

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        logs: logs,
        totalEntries: rows.length
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function action_debug(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const deliverySheet = ss.getSheetByName('Delivery Log - Live');
    const deliveryData = deliverySheet ? deliverySheet.getDataRange().getValues() : [];

    const debugRows = deliveryData.slice(0, 30).map((row, index) => {
      const col0Str = row[0] ? row[0].toString() : '';
      const col1Str = row[1] ? row[1].toString() : '';
      const col2Str = row[2] ? row[2].toString() : '';
      const col3Str = row[3] ? row[3].toString() : '';
      const hasServerTimestamp = /\d{4}-\d{2}-\d{2}T\d{2}:/.test(col1Str);
      const offset = hasServerTimestamp ? 0 : -1;

      return {
        index,
        col0: col0Str.substring(0, 50),
        col1: col1Str.substring(0, 50),
        col2: col2Str.substring(0, 50),
        col3: col3Str.substring(0, 50),
        hasServerTimestamp,
        offset,
        detectedDate: row[2 + offset] ? row[2 + offset].toString().substring(0, 50) : '',
        detectedDriver: row[3 + offset] ? row[3 + offset].toString().substring(0, 50) : ''
      };
    });

    return ContentService
      .createTextOutput(JSON.stringify({ debugRows }, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function action_dashboard(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // Read delivery data - mapping based on doPost structure (lines 42-61)
    const deliverySheet = ss.getSheetByName('Delivery Log - Live');
    const deliveryData = deliverySheet ? deliverySheet.getDataRange().getValues() : [];

    // Detect spreadsheet format by checking headers (not data)
    // This is more reliable than checking each row's data format
    let headerRow = null;
    let dataStartIndex = 0;

    // Find header row (skip title rows)
    for (let i = 0; i < Math.min(3, deliveryData.length); i++) {
      const row = deliveryData[i];
      if (row[0] && row[0].toString().toUpperCase().includes('SUBMITTED')) {
        headerRow = row;
        dataStartIndex = i + 1;
        break;
      }
    }

    // Determine offset based on header structure
    // Current spreadsheet: ["Submitted At", "Date", "Driver", ...] (NO serverTimestamp column)
    // Legacy spreadsheet: ["Submitted At", "Server Timestamp", "Date", "Driver", ...] (HAS serverTimestamp column)
    //
    // Code template uses: row[16 + offset] to read photo links
    // - If NO serverTimestamp: photo links at col 16/17, so offset = 0
    // - If HAS serverTimestamp: photo links shifted right, so offset would need adjustment
    //
    // Detection: If column B (index 1) is "Date", then NO serverTimestamp column
    const hasServerTimestampColumn = headerRow && headerRow[1] && !headerRow[1].toString().toUpperCase().includes('DATE');
    const OFFSET = hasServerTimestampColumn ? 1 : 0;  // FIX: was backwards (0 : -1)

    Logger.log(`[Dashboard] Spreadsheet format detection: hasServerTimestampColumn=${hasServerTimestampColumn}, offset=${OFFSET}`);

    // Filter out title and header rows
    const deliveries = deliveryData
      .slice(dataStartIndex) // Start after header row
      .filter(row => {
        // FIX: Check Column B (date) instead of Column A since some rows have blank clientTimestamp
        // This handles rows 3071-4656 which have data but no Column A timestamp
        if (!row[1] && !row[0]) return false; // Skip if both date AND timestamp are empty
        return true; // Include row if it has date or timestamp data
      })
      .map(row => {
        // Use consistent offset for ALL rows based on header detection
        const offset = OFFSET;

        return {
          submittedAt: row[0],                      // Col A  – Client Timestamp
          serverTimestamp: row[1 + offset] || '',   // Col B  – Server Timestamp (new format only)
          date: row[2 + offset],                    // Col C/B – Date
          driver: row[3 + offset],                  // Col D/C – Driver
          store: row[4 + offset],                   // Col E/D – Store (reading from correct column)
          arrive: row[5 + offset],                  // Col F/E – Arrival Time (FIXED: was row[6+offset])
          coolerTemp: row[6 + offset],              // Col G/F – Cooler Temp °F (FIXED: was row[7+offset])
          coolerCond: row[7 + offset],              // Col H/G – Cooler Condition (FIXED: was row[8+offset])
          dish: row[8 + offset],                    // Col I/H – Dish (FIXED: was row[10+offset])
          casePrefillPercent: row[9 + offset],      // Col J/I – Case Pre-Fill % (FIXED: was row[9+offset] - already correct)
          added: row[10 + offset],                  // Col K/J – Qty Added (FIXED: was row[11+offset])
          before: row[11 + offset],                 // Col L/K – On Shelf Before (FIXED: was row[12+offset])
          removed: row[12 + offset],                // Col M/L – Qty Removed (Expired) (FIXED: was row[13+offset])
          reason: row[13 + offset],                 // Col N/M – Expire Reason (FIXED: was row[14+offset])
          after: row[14 + offset],                  // Col O/N – Shelf Total After (FIXED: was row[15+offset])
          notes: row[15 + offset],                  // Col P/O – Store Notes (FIXED: was row[16+offset])
          receivedBy: row[15 + offset],             // Col P/O – Received By (FIXED: was row[16+offset])
          beforePhotoLink: row[16 + offset],        // Col Q/P – Before Photo Link (FIXED: was row[17+offset])
          afterPhotoLink: row[17 + offset]          // Col R/Q – After Photo Link (FIXED: was row[18+offset])
        };
      });

    // Read production data - mapping based on doPost structure (lines 88-113)
    const productionSheet = ss.getSheetByName('Production Log - Live');
    const productionData = productionSheet ? productionSheet.getDataRange().getValues() : [];

    // Filter out title and header rows
    const production = productionData
      .filter(row => {
        if (!row[0]) return false;
        const firstCol = row[0].toString().toUpperCase();
        // Skip title rows, header rows, and empty rows
        return !firstCol.includes('TAIPEI') &&
               !firstCol.includes('PRODUCTION') &&
               !firstCol.includes('TIMESTAMP') &&
               !firstCol.includes('SUBMITTED') &&
               !firstCol.includes('CLIENT') &&
               firstCol.length > 0;
      })
      .map(row => ({
        submittedAt: row[0],        // Col A  – Client Timestamp
        date: row[2],               // Col C  – Date (skip serverTimestamp at Col B)
        shift: row[3],              // Col D  – Shift
        kitchen: row[4],            // Col E  – Kitchen
        supervisor: row[5],         // Col F  – Supervisor
        dish: row[6],               // Col G  – Dish
        batch: row[7],              // Col H  – Batch #
        cookTemp: row[8],           // Col I  – Cook Temp °F
        cookStart: row[9],          // Col J  – Cook Start
        cookEnd: row[10],           // Col K  – Cook End
        cookTime: row[11],          // Col L  – Cook Time (min)
        qtyProduced: row[12],       // Col M  – Qty Produced
        qtyDiscarded: row[13],      // Col N  – Qty Discarded
        discardReason: row[14],     // Col O  – Discard Reason
        coolStart: row[15],         // Col P  – Cool Start
        coolEnd: row[16],           // Col Q  – Cool End
        coolTime: row[17],          // Col R  – Cool Time (min)
        finalTemp: row[18],         // Col S  – Final Temp °F
        qa: row[19],                // Col T  – QA Result
        qaNotes: row[20],           // Col U  – QA Notes
        initials: row[21],          // Col V  – Initials
        generalNotes: row[22],      // Col W  – General Notes
        batchQANotes: row[23]       // Col X  – Batch QA Notes
      }));

    // Calculate waste from deliveries (items with qtyRemoved > 0)
    const waste = deliveries.filter(d => (parseInt(d.removed) || 0) > 0);

    // Mirror of data/stores.json, which is the source of truth — the forms read that file
    // directly. Kept in sync by hand, so a new store needs a backend deploy to reach the
    // dashboard's store filter. The names this replaced were invented: Maryland Giant
    // stores paired with these Pennsylvania locations. 6112 was missing entirely.
    const stores = [
      { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA' },
      { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA' },
      { id: '6112', name: 'Store 6112', location: '255 S Spring Garden St, Carlisle, PA' },
      { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA' },
      { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA' },
      { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA' },
      { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
      { id: '6564', name: 'Store 6564', location: 'Harrisburg (Gayson Rd), PA' }
    ];

    return ContentService
      .createTextOutput(JSON.stringify({
        deliveries: deliveries,
        production: production,
        waste: waste,
        stores: stores,
        lastUpdated: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function action_queryDeliveries(e) {
  const SPREADSHEET_ID = getSpreadsheetId();

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Delivery Log - Live');

    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Delivery Log - Live sheet not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();

    // Handle sheets with title row: skip first row if it doesn't have "Date" column
    let headerRowIndex = 0;
    if (data[0].indexOf('Date') === -1 && data.length > 1 && data[1].indexOf('Date') >= 0) {
      headerRowIndex = 1; // Second row is the actual header
    }

    const headers = data[headerRowIndex];
    const rows = data.slice(headerRowIndex + 1);

    // Get filter parameters
    const dateFilter = e.parameter.date; // Format: YYYY-MM-DD or YYYY-MM-DD:YYYY-MM-DD for range
    const storeFilter = e.parameter.store;
    const driverFilter = e.parameter.driver;
    const limit = parseInt(e.parameter.limit) || 100;
    const debug = e.parameter.debug === 'true';

    // Find column indices
    const dateCol = headers.indexOf('Date');
    const storeCol = headers.findIndex(h => h === 'Store #' || h === 'Strore #');
    const driverCol = headers.indexOf('Driver');
    const submittedAtCol = headers.indexOf('Submitted At');
    const dishCol = headers.indexOf('Dish');
    const beforePhotoCol = headers.indexOf('Before Photo Link');
    const afterPhotoCol = headers.indexOf('After Photo Link');

    // Debug mode: return diagnostic info
    if (debug) {
      return ContentService
        .createTextOutput(JSON.stringify({
          status: 'ok',
          debug: true,
          sheetInfo: {
            totalRows: rows.length,
            totalColumns: headers.length,
            headers: headers,
            columnIndices: {
              date: dateCol,
              store: storeCol,
              driver: driverCol,
              submittedAt: submittedAtCol,
              dish: dishCol,
              beforePhoto: beforePhotoCol,
              afterPhoto: afterPhotoCol
            },
            sampleRow: rows.length > 0 ? rows[0] : null,
            lastRow: rows.length > 0 ? rows[rows.length - 1] : null
          }
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Filter rows
    let filtered = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Skip completely empty rows
      if (!row[dateCol] && !row[storeCol] && !row[driverCol]) continue;

      // Apply date filter
      if (dateFilter && row[dateCol]) {
        let rowDate;
        if (row[dateCol] instanceof Date) {
          rowDate = row[dateCol].toISOString().split('T')[0];
        } else if (typeof row[dateCol] === 'string') {
          // Try to parse various date formats
          const dateStr = row[dateCol];
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
            // ISO timestamp format: 2026-04-15T07:00:00.000Z
            rowDate = dateStr.split('T')[0];
          } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            rowDate = dateStr; // Already YYYY-MM-DD
          } else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
            // M/D/YY or MM/DD/YYYY format
            const parts = dateStr.split('/');
            let year = parts[2];
            if (year.length === 2) year = '20' + year;
            rowDate = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          } else {
            continue; // Skip rows with unparseable dates
          }
        } else {
          continue; // Skip if date is neither Date object nor string
        }

        if (dateFilter.includes(':')) {
          const [startDate, endDate] = dateFilter.split(':');
          if (rowDate < startDate || rowDate > endDate) continue;
        } else {
          if (rowDate !== dateFilter) continue;
        }
      }

      // Apply store filter
      if (storeFilter && String(row[storeCol]) !== String(storeFilter)) continue;

      // Apply driver filter
      if (driverFilter && String(row[driverCol]).toLowerCase().indexOf(driverFilter.toLowerCase()) === -1) continue;

      // Row passed all filters
      filtered.push({
        rowNumber: i + 2, // +2 for header row and 1-based indexing
        date: row[dateCol],
        store: row[storeCol],
        driver: row[driverCol],
        submittedAt: row[submittedAtCol],
        dish: row[dishCol],
        beforePhotoLink: row[beforePhotoCol],
        afterPhotoLink: row[afterPhotoCol]
      });

      if (filtered.length >= limit) break;
    }

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'ok',
        count: filtered.length,
        totalRows: rows.length,
        deliveries: filtered
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString(), stack: error.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
