// Sales.gs — the Sales tab: what the retailer's registers rang up, one row per store, UPC
// and day.
//
// Rows arrive already reduced to that grain from the retailer's export, keyed by its own
// identifiers: the store number and the item's UPC. The backend resolves both against the
// Reference sheet — the store's name and System ID, the dish's name and System ID — and
// writes each row in place: a row with the same Date, Store ID and UPC is replaced, not
// duplicated, so a week can be imported twice or corrected. A store number the sheet does
// not have is added to it unverified; a UPC no dish has is filed under the reserved
// NON-TAIPEI DISH. The rows carry no submission id: the Executions row records the import.

const SALES_ROWS_PER_REQUEST = 5000;   // a month of daily rows is about four thousand
const SALES_UPC_PATTERN = /^\d{14}$/;

/** A refusal the caller caused: recorded as REJECTED, not ERROR, so it does not page support. */
function salesRejection(message) {
  const error = new Error(message);
  error.rejection = true;
  return error;
}

/** One incoming row, checked and normalised, or a rejection naming the row. */
function checkSalesRow(raw, index) {
  const where = 'row ' + (index + 1);
  if (!raw || typeof raw !== 'object') throw salesRejection(where + ' is not an object.');
  const date = String(raw.date || '').trim();
  if (!isIsoDate(date)) throw salesRejection(where + ': date must be YYYY-MM-DD; got ' + JSON.stringify(raw.date) + '.');
  const storeId = String(raw.storeId || '').trim();
  if (!REFERENCE_ORG_ID_PATTERN.test(storeId)) throw salesRejection(where + ': storeId ' + JSON.stringify(raw.storeId) + ' is not a store number.');
  const upc = String(raw.upc || '').trim();
  if (!SALES_UPC_PATTERN.test(upc)) throw salesRejection(where + ': upc must be 14 digits; got ' + JSON.stringify(raw.upc) + '.');
  const present = key => {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') throw salesRejection(where + ': ' + key + ' is missing.');
    return Number(raw[key]);
  };
  const integer = (key, min) => {
    const n = present(key);
    if (!Number.isInteger(n) || (min !== undefined && n < min)) throw salesRejection(where + ': ' + key + ' must be a whole number' + (min !== undefined ? ' of at least ' + min : '') + '; got ' + JSON.stringify(raw[key]) + '.');
    return n;
  };
  const money = key => {
    const n = present(key);
    if (!isFinite(n)) throw salesRejection(where + ': ' + key + ' must be a number; got ' + JSON.stringify(raw[key]) + '.');
    return Math.round(n * 100) / 100;
  };
  return {
    date: date,
    storeId: storeId,
    upc: upc,
    city: String(raw.city || '').replace(/\s+/g, ' ').trim(),   // the retailer's city for the store, used only to name a store it creates
    units: integer('units'),                 // net of returns, as the retailer's own totals are
    transactions: integer('transactions', 0),
    netSales: money('netSales'),
    grossSales: money('grossSales'),
    returnedUnits: integer('returnedUnits', 0)
  };
}

/** 'NEW CUMBERLAND' as 'New Cumberland'. */
function salesTitleCase(text) {
  return String(text || '').toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());
}

/**
 * Every store number the rows name, resolved to its Reference entry. A number the sheet does
 * not have gets an entry created for it — named by its number, located by the retailer's
 * city, unverified until a person confirms it on the Config tab — so the rows can carry a
 * System ID from the first import. The site is not republished: an unverified store is
 * offered on no form. Returns { byNumber, created }.
 */
function salesStores(rows, ctx) {
  const byNumber = () => {
    const map = {};
    referencePayload().stores.forEach(store => { map[String(store.storeId)] = store; });
    return map;
  };
  let stores = byNumber();
  const missing = {};
  rows.forEach(row => { if (!stores[row.storeId] && missing[row.storeId] === undefined) missing[row.storeId] = row.city; });
  const created = Object.keys(missing).sort();
  if (created.length) {
    const list = referenceListFor('stores');
    const ops = created.map(number => ({
      op: 'add',
      entry: { name: 'Store ' + number, storeType: 'Giant', storeId: number, location: salesTitleCase(missing[number]) || 'Unknown', verified: false }
    }));
    withScriptLock(() => {
      const opened = openReference(true);
      invalidateReferencePayload();                       // plan against the sheet, not a cached copy
      const sheet = opened.ss.getSheetByName(list.tab);
      const planned = planReferenceOps(list, ops, readReferenceRows(sheet, list.tab), formatInstant(ctx.startTime));
      applyReferenceMutations(sheet, list.tab, planned.mutations);
      invalidateReferencePayload();
    });
    note(ctx, 'stores_created=' + created.join(','));
    stores = byNumber();
  }
  return { byNumber: stores, created: created };
}

/** Dishes by UPC, and the reserved dish a UPC no dish has is filed under. */
function salesDishes() {
  const dishes = referencePayload().dishes;
  const byUpc = {};
  dishes.forEach(dish => { if (dish.upc) byUpc[dish.upc] = dish; });
  const catchAll = dishes.find(dish => dish.id === REFERENCE_CATCHALL_DISH_UUID) || { id: REFERENCE_CATCHALL_DISH_UUID, name: 'NON-TAIPEI DISH' };
  return { byUpc: byUpc, catchAll: catchAll };
}

/**
 * Write one month's rows into its Sales tab: a row whose Date, Store ID and UPC are already
 * there is replaced where it stands, the rest are appended. The tab is read once and the
 * replaced rows written back in one range, so a month re-imported whole costs one read, one
 * write and one append. Returns { added, updated }.
 */
function upsertSalesRows(monthKey, rows, ctx) {
  const schema = schemaFor('Sales');
  const keyOf = r => [r.date, r.storeId, r.upc].join('|');
  return withScriptLock(() => {
    const opened = openMonthly(monthKey, true);
    const sheet = opened.ss.getSheetByName('Sales');
    const columns = sheetColumns(sheet, 'Sales');   // 1-based column per schema entry; adds any the file lacks
    const values = sheet.getLastRow() >= 1 ? sheet.getDataRange().getValues() : [];
    const width = Math.max(values.length ? values[0].length : 0, ...columns);
    const at = {};
    if (values.length > 1) readRows(values, schema).records.forEach(record => { at[keyOf(record)] = record._row; });

    const toAppend = [];
    let updated = 0;
    rows.forEach(row => {
      const built = buildRows(schema, [row], ctx)[0];
      const sheetRow = at[keyOf(row)];
      if (!sheetRow) { toAppend.push(built); return; }
      const current = values[sheetRow - 1];
      while (current.length < width) current.push('');
      built.forEach((v, i) => { current[columns[i] - 1] = v; });
      updated += 1;
    });
    if (updated) {
      values.forEach(line => { while (line.length < width) line.push(''); });
      sheet.getRange(1, 1, values.length, width).setValues(values);
    }
    if (toAppend.length) appendMonthlyRows(monthKey, 'Sales', toAppend);   // takes the same lock again; it is re-entrant
    return { added: toAppend.length, updated: updated };
  });
}

/**
 * Import sales rows, from a POST of { type: 'sales', rows: [{ date, storeId, upc, units,
 * transactions, netSales, grossSales, returnedUnits, city? }] }, one row per store, UPC and
 * day. Everything is checked before anything is written; a batch is rejected whole or
 * applied whole, month by month.
 */
function handleSalesImport(payload, ctx) {
  ctx.logEntry.formType = 'sales';
  ctx.submissionId = 'sales-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);   // names the import on its Executions row; the rows carry no id
  try {
    const raw = Array.isArray(payload.rows) ? payload.rows : null;
    if (!raw || !raw.length) throw salesRejection('rows must be a non-empty array.');
    if (raw.length > SALES_ROWS_PER_REQUEST) throw salesRejection('At most ' + SALES_ROWS_PER_REQUEST + ' rows per request; got ' + raw.length + '. Send a month at a time.');
    const rows = raw.map(checkSalesRow);
    const seen = {};
    rows.forEach((row, i) => {
      const key = [row.date, row.storeId, row.upc].join(' / ');
      if (seen[key]) throw salesRejection('row ' + (i + 1) + ' repeats ' + key + '. Reduce the export to one row per store, UPC and day before sending.');
      seen[key] = true;
    });

    const stores = salesStores(rows, ctx);
    const dishes = salesDishes();
    let nonTaipei = 0;
    const records = rows.map(row => {
      const store = stores.byNumber[row.storeId];
      let dish = dishes.byUpc[row.upc];
      if (!dish) { dish = dishes.catchAll; nonTaipei += 1; }
      return {
        date: row.date, store: store.name, dish: dish.name,
        units: row.units, transactions: row.transactions, netSales: row.netSales, grossSales: row.grossSales, returnedUnits: row.returnedUnits,
        upc: row.upc, storeSystemId: store.id, storeId: row.storeId, dishSystemId: dish.id
      };
    });

    const groups = {};
    records.forEach(record => { const month = monthKeyOfDate(record.date); (groups[month] = groups[month] || []).push(record); });
    const months = {};
    let added = 0;
    let updated = 0;
    Object.keys(groups).sort().forEach(month => {
      months[month] = upsertSalesRows(month, groups[month], ctx);
      added += months[month].added;
      updated += months[month].updated;
    });

    ctx.logEntry.rowCount = records.length;
    note(ctx, 'sales=' + Object.keys(months).map(month => month + ':+' + months[month].added + '/~' + months[month].updated).join(','));
    if (nonTaipei) note(ctx, 'sales_non_taipei_rows=' + nonTaipei);
    ctx.logEntry.status = 'SUCCESS';
    return jsonResponse({ status: 'ok', rows: records.length, added: added, updated: updated, months: months, storesCreated: stores.created, nonTaipeiRows: nonTaipei });
  } catch (err) {
    if (!err.rejection) throw err;
    ctx.logEntry.status = 'REJECTED';
    ctx.logEntry.errorMessage = err.message;
    note(ctx, 'sales_rejected');
    return jsonResponse({ status: 'error', message: err.message });
  }
}
