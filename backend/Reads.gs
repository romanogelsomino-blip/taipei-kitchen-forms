// Reads.gs — read-only endpoints over the monthly store.
//
// Every read takes a date window (`from`/`to`, `YYYY-MM-DD`) and opens only the month files
// that window covers, capped at MAX_MONTHS_PER_REQUEST. A month with no file contributes
// nothing and is reported in `missingMonths`; it is not an error, because the first day of a
// month has no file until the first record of that month is written.

/**
 * Store list for the dashboard's filters. Mirror of data/stores.json, which is the source of
 * truth: the forms read that file directly. Kept in sync by hand, so a new store needs a
 * backend deploy to reach the dashboard.
 */
function storeList() {
  return [
    { id: '6006', name: 'Store 6006', location: 'Kline Village, Harrisburg, PA' },
    { id: '6061', name: 'Store 6061', location: 'Shippensburg, PA' },
    { id: '6112', name: 'Store 6112', location: '255 S Spring Garden St, Carlisle, PA' },
    { id: '6253', name: 'Store 6253', location: 'New Cumberland, PA' },
    { id: '6331', name: 'Store 6331', location: 'Mechanicsburg, PA' },
    { id: '6443', name: 'Store 6443', location: 'Chambersburg, PA' },
    { id: '6542', name: 'Store 6542', location: 'Carlisle, PA' },
    { id: '6564', name: 'Store 6564', location: 'Harrisburg (Gayson Rd), PA' }
  ];
}

/**
 * The window a request asks for. Defaults to the first of last month through today in New
 * York. `date=<YYYY-MM-DD>` alone narrows the window to that single day.
 */
function requestWindow(e) {
  const params = (e && e.parameter) || {};
  let from = isIsoDate(params.from) ? params.from : null;
  let to = isIsoDate(params.to) ? params.to : null;
  if (!from && !to && isIsoDate(params.date)) { from = params.date; to = params.date; }
  if (!to) to = todayNY();
  if (!from) from = firstOfPreviousMonthNY();
  if (from > to) throw new Error('from (' + from + ') is after to (' + to + ')');

  const months = monthKeysBetween(from, to);
  if (months.length > MAX_MONTHS_PER_REQUEST) {
    throw new Error(
      'Range ' + from + '..' + to + ' spans ' + months.length + ' months; the maximum is ' +
      MAX_MONTHS_PER_REQUEST + '. Ask for a narrower window.'
    );
  }
  return { from: from, to: to, months: months };
}

/** Records of one tab whose own Date falls inside the window, oldest month first. */
function recordsInWindow(win, tab) {
  const read = readMonthlyRows(win.months, tab);
  const records = read.records.filter(record => {
    const date = String(record.date).slice(0, 10);
    return date >= win.from && date <= win.to;
  });
  return { records: records, files: read.files, missing: read.missing };
}

/** A stored record as the API returns it: schema keys only, without the reader's bookkeeping. */
function publicRecord(record) {
  const out = {};
  Object.keys(record).forEach(key => { if (key.charAt(0) !== '_') out[key] = record[key]; });
  return out;
}

/**
 * The dashboard payload for one window. `waste` is derived, not stored: it is the delivery
 * rows that had something removed from a shelf. It does not include what a kitchen discarded
 * during production, which lives on the Production tab.
 */
function action_dashboard(e) {
  try {
    const win = requestWindow(e);
    const production = recordsInWindow(win, 'Production').records.map(publicRecord);
    const deliveryRead = recordsInWindow(win, 'Deliveries');
    const deliveries = deliveryRead.records.map(record => {
      const row = publicRecord(record);
      row.store = row.storeId;   // the dashboard filters and groups on `store`
      return row;
    });
    const waste = deliveries
      .filter(row => (parseInt(row.removed, 10) || 0) > 0)
      .map(row => Object.assign({}, row, { qtyRemoved: row.removed }));

    return jsonResponse({
      status: 'ok',
      production: production,
      deliveries: deliveries,
      waste: waste,
      stores: storeList(),
      window: { from: win.from, to: win.to, months: win.months, missingMonths: deliveryRead.missing },
      lastUpdated: formatInstant(new Date())
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/** Per-month view of one tab's header row: what a file actually has against what the schema expects. */
function monthlyTabDiagnostics(months, tab) {
  const expected = headersOf(schemaFor(tab));
  return months.map(monthKey => {
    const opened = openMonthly(monthKey, false);
    if (!opened) return { month: monthKey, file: null };
    const sheet = opened.ss.getSheetByName(tab);
    if (!sheet) return { month: monthKey, file: monthlyFileName(monthKey), id: opened.fileId, tab: null };
    const headers = sheetHeaders(sheet);
    return {
      month: monthKey,
      file: monthlyFileName(monthKey),
      id: opened.fileId,
      url: monthlyFileUrl(opened.fileId),
      rows: Math.max(0, sheet.getLastRow() - 1),
      headers: headers,
      missingColumns: headerIndex(headers, schemaFor(tab)).missing,
      extraColumns: headers.filter(header => header && expected.indexOf(header) < 0)
    };
  });
}

/**
 * Delivery rows for a window, optionally narrowed by store, driver, dish or submission id.
 * `debug=true` reports each month file's headers instead of its rows, which is how a schema
 * mismatch is diagnosed.
 */
function action_queryDeliveries(e) {
  try {
    const params = (e && e.parameter) || {};
    const win = requestWindow(e);

    if (params.debug === 'true') {
      return jsonResponse({
        status: 'ok',
        debug: true,
        window: { from: win.from, to: win.to },
        tabs: { Deliveries: monthlyTabDiagnostics(win.months, 'Deliveries'), Production: monthlyTabDiagnostics(win.months, 'Production') }
      });
    }

    const read = recordsInWindow(win, 'Deliveries');
    const matches = field => value => !value || String(field(value)).toLowerCase() === String(value).toLowerCase();
    let rows = read.records;
    if (params.store) rows = rows.filter(r => String(r.storeId) === String(params.store));
    if (params.driver) rows = rows.filter(r => String(r.driver).toLowerCase() === String(params.driver).toLowerCase());
    if (params.dish) rows = rows.filter(r => String(r.dish).toLowerCase() === String(params.dish).toLowerCase());
    if (params.submissionId) rows = rows.filter(r => String(r.submissionId) === String(params.submissionId));

    const limit = Math.max(1, Math.min(parseInt(params.limit, 10) || 100, 5000));
    const page = rows.slice(-limit);

    return jsonResponse({
      status: 'ok',
      window: { from: win.from, to: win.to, missingMonths: read.missing },
      matched: rows.length,
      count: page.length,
      deliveries: page.map(record => {
        const row = publicRecord(record);
        row.store = row.storeId;
        row.month = record._month;
        row.rowNumber = record._row;
        return row;
      })
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}

/**
 * The most recent Executions rows. Reads the current month and the one before it by default,
 * so a request early on the 1st still shows yesterday; `month=<YYYY-MM>` reads just that one.
 */
function action_getExecutionLog(e) {
  try {
    const params = (e && e.parameter) || {};
    const limit = Math.max(1, Math.min(parseInt(params.limit, 10) || 10, 1000));
    const current = monthKeyOfInstant(new Date());
    const months = params.month ? [params.month] : [previousMonthKey(current), current];

    const read = readMonthlyRows(months, 'Executions');
    const sorted = read.records
      .map(publicRecord)
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

    return jsonResponse({
      status: 'ok',
      months: months,
      missingMonths: read.missing,
      totalEntries: sorted.length,
      logs: sorted.slice(-limit)
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}
