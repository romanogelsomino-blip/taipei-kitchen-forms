// Dates.gs — calendar dates, wall-clock times and instants, all in America/New_York.
//
// The store allows exactly three representations: a calendar date `YYYY-MM-DD`, a
// wall-clock time `HH:mm` as typed on a form, and an instant as ISO 8601 in New York local
// time with its numeric offset (`2026-09-15T10:32:07-04:00`). Every instant the backend
// writes comes from formatInstant(); nothing else formats time.

const NY_TZ = 'America/New_York';

/** Today's calendar date in New York, `YYYY-MM-DD`. */
function todayNY() {
  return Utilities.formatDate(new Date(), NY_TZ, 'yyyy-MM-dd');
}

/** The one instant format the store uses: ISO 8601, New York local time, numeric offset. */
function formatInstant(date) {
  return Utilities.formatDate(date, NY_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Anything Date can parse (a phone's UTC ISO string, a Date cell) → the store's instant format. '' stays ''. */
function normaliseInstant(value) {
  if (value === null || value === undefined || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? String(value) : formatInstant(d);
}

/** Strict `YYYY-MM-DD` that also round-trips, so 2026-02-31 is rejected. */
function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z');
  return !isNaN(d.getTime()) && Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd') === s;
}

/** `YYYY-MM-DD` → `YYYY-MM`. */
function monthKeyOfDate(isoDate) {
  return isoDate.slice(0, 7);
}

/** A Date instant → the New York month it falls in, `YYYY-MM`. */
function monthKeyOfInstant(date) {
  return Utilities.formatDate(date, NY_TZ, 'yyyy-MM');
}

function yearOfMonthKey(monthKey) {
  return monthKey.slice(0, 4);
}

/** Every `YYYY-MM` from the month of `fromDate` to the month of `toDate`, inclusive, oldest first. */
function monthKeysBetween(fromDate, toDate) {
  let [y, m] = fromDate.slice(0, 7).split('-').map(Number);
  const [ty, tm] = toDate.slice(0, 7).split('-').map(Number);
  const keys = [];
  while (y < ty || (y === ty && m <= tm)) {
    keys.push(y + '-' + String(m).padStart(2, '0'));
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys;
}

function previousMonthKey(monthKey) {
  let [y, m] = monthKey.split('-').map(Number);
  m -= 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}

/** First day of the month before the current New York month, `YYYY-MM-DD`. */
function firstOfPreviousMonthNY() {
  return previousMonthKey(monthKeyOfInstant(new Date())) + '-01';
}

/** `YYYY-MM-DD` shifted by `days`. Calendar arithmetic; no time zone involved. */
function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

// A record is filed under its own date. Dates far outside this window are almost always
// typos (a 1970 default, a 2062 finger slip) and would mint stray year folders.
const PARTITION_WINDOW_DAYS = { past: 400, future: 2 };

/**
 * The date a record is filed under. A valid date inside the window is used as is; anything
 * else falls back to today in New York and says why, so the caller can note it.
 * Returns { date, fallback } with fallback null, 'missing', 'invalid' or 'out_of_range'.
 */
function partitionDateFor(rawDate) {
  const today = todayNY();
  if (rawDate === undefined || rawDate === null || rawDate === '') return { date: today, fallback: 'missing' };
  const s = String(rawDate).slice(0, 10);
  if (!isIsoDate(s)) return { date: today, fallback: 'invalid' };
  if (s < addDays(today, -PARTITION_WINDOW_DAYS.past) || s > addDays(today, PARTITION_WINDOW_DAYS.future)) {
    return { date: today, fallback: 'out_of_range' };
  }
  return { date: s, fallback: null };
}
