# Production Form Audit — taipei_production_form3.html

**Audit Date:** 2026-05-06
**Audited By:** @code
**Form Version:** v3
**Form File:** `taipei_production_form3.html`

---

## Overview

The Production Form (`taipei_production_form3.html`) is a single-page HTML application that captures production batch data for Taipei Kitchen's bento operations. It logs cooking and cooling times, dish-by-dish production quantities, quality checks, and HACCP compliance data. The form submits structured JSON data to a Google Apps Script endpoint and supports offline-resilient local storage backup on network failure.

---

## Submission Endpoint

**Variable:** `GOOGLE_SCRIPT_URL`
**Line:** 352
**Current Value:** `https://script.google.com/macros/s/AKfycbxXVDl_JyH1H2_KdM8CHyVn5H4qfoUsFepgV1p_4RhrCKKPSj2WzdkqEsGqHgL7V-b6PA/exec`
**Method:** `POST`
**Mode:** `no-cors`
**Content-Type:** `application/json`

### Payload Structure

```json
{
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "shift": "AM (Opening) | MID (Day) | PM (Evening)",
      "kitchen": "Legacy Park | Store 6112 | Other",
      "supervisor": "string",
      "dish": "string (one of 13 DISHES)",
      "batch": "YYYY/MM/DD  ·  B#",
      "cookTemp": "number (°F)",
      "cookStart": "HH:MM",
      "cookEnd": "HH:MM",
      "cookTime": "number (minutes) | empty string",
      "qtyProduced": "number (default '0')",
      "qtyDiscarded": "number (default '0')",
      "discardReason": "string",
      "coolStart": "HH:MM",
      "coolEnd": "HH:MM | 'Next Morning'",
      "coolTime": "number (minutes) | 'Overnight' | empty string",
      "finalTemp": "number (°F) | empty string",
      "qa": "pass | fail | na | empty string",
      "qaNotes": "string",
      "initials": "string",
      "generalNotes": "string",
      "batchQANotes": "string",
      "formType": "production",
      "submittedAt": "ISO 8601 timestamp"
    }
  ],
  "formType": "production"
}
```

**Note:** The form sends **one row per dish** (13 rows total), even if a dish has zero production. All batch-level metadata (cook/cool times, supervisor, etc.) are duplicated across all 13 rows for downstream processing in Google Sheets.

---

## Form Fields — Complete Inventory

### Section 1: Production Run Information

#### Metadata Fields (4 fields)

| Field ID | Label | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|---|
| `f-date` | Date | `date` | Yes (soft) | None | Today's date (auto-populated) | Auto-set on load; triggers `updateBatchId()` on change |
| `f-shift` | Shift | `select` | No | None | Empty | Options: `— Select —`, `AM (Opening)`, `MID (Day)`, `PM (Evening)` |
| `f-kitchen` | Production Kitchen | `select` | **Yes** (hard) | Required before submit | Empty | Options: `— Select —`, `Legacy Park`, `Store 6112`, `Other`. Alert blocks submission if empty. |
| `f-supervisor` | Head Chef / Supervisor | `text` | **Yes** (hard) | Required before submit | Empty | Alert blocks submission if empty. |

#### Batch ID Display (read-only display + controls)

| Element ID | Type | Editable | Notes |
|---|---|---|---|
| `batch-id-display` | Display div | No | Format: `YYYY/MM/DD  ·  B{counter}`. Auto-generated from `f-date` and `batchCounter` (default 1). |
| Decrement button (`−`) | Button | Yes | Calls `changeBatch(-1)`. Minimum batch counter is 1. |
| Increment button (`+`) | Button | Yes | Calls `changeBatch(1)`. Used to log multiple batches on the same day. |

**Batch ID Logic:**
- Format: `2026/05/06  ·  B1` (date in YYYY/MM/DD format, space, bullet, space, B + counter)
- Counter starts at 1, can be incremented for same-day multiple batches
- Resets to 1 on form clear

---

### Section 2: Batch Cook Times (applies to all dishes)

These fields are **batch-level** and apply uniformly to all 13 dishes.

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `b-cook-temp` | Cook Temp °F | `number` | No | `min="100" max="500"` | Empty | None | Target cooking temperature for the batch |
| `b-cook-start` | Cook Start | `time` | No | None | Empty | `calcBatchCook()` | Cooking start time (HH:MM) |
| `b-cook-end` | Cook End | `time` | No | None | Empty | `calcBatchCook()` | Cooking end time (HH:MM) |
| `b-cook-time` | Cook Time | Display div | No (read-only) | Auto-calculated | `—` | Updated by `calcBatchCook()` | Displays calculated minutes; color changes to orange if positive, red if negative/zero |

**Auto-Calculation Logic (lines 377–387):**
- `calcBatchCook()` computes `cookEnd - cookStart` in minutes
- If negative (end < start), adds 1440 minutes (assumes next-day)
- Displays result as `{minutes} min`
- Color: orange if > 0, red otherwise

---

### Section 3: Batch Cooling Times (applies to all dishes)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `b-cool-start` | Cool Start | `time` | No | None | Empty | `calcBatchCool()` | Cooling start time |
| `b-cool-end` | Cool End | `time` | No | None | Empty | `calcBatchCool()` | Cooling end time. Disabled if `b-cool-next-am` is checked. |
| `b-cool-next-am` | Next Morning | `checkbox` | No | None | Unchecked | `toggleBatchNextAM()` | If checked, disables `b-cool-end`, sets `b-cool-time` to "Overnight" (green) |
| `b-cool-time` | Cool Time | Display div | No (read-only) | Auto-calculated | `—` | Updated by `calcBatchCool()` | Displays calculated minutes or "Overnight". Color-coded by HACCP rule. |
| `b-final-temp` | Final Batch Temp °F | `number` | No | `min="30" max="212"` | Empty | `flagBatchTemp()` | Final batch temperature. Border/background turn red if > 41°F. |

**Auto-Calculation Logic (lines 389–403):**
- If `b-cool-next-am` is checked: display "Overnight" (green)
- Otherwise: `coolEnd - coolStart` in minutes (handles next-day rollover)
- **HACCP Color Coding:**
  - **Green:** ≤ 240 minutes (4 hours or less)
  - **Orange:** 241–360 minutes (approaching 6-hour limit)
  - **Red:** > 360 minutes (HACCP violation)

**HACCP Cooling Rule (displayed in banner, lines 169–176):**
> Hot foods must cool from **135°F → 70°F within 2 hours**, then **70°F → 41°F within 4 more hours** (total 6 hours max). Cooling time cells turn red if they exceed these windows. Final temp must be ≤ 41°F before packaging.

---

### Section 4: Dish-by-Dish Production Log (13 rows)

The form dynamically generates a table with one row per dish. The dish list is hardcoded (line 354):

```javascript
const DISHES = [
  'General Tso Chicken Bento', 'Sesame Chicken Bento', 'Bento Chicken Lo Mein',
  'Bento Shrimp Lo Mein', 'Bento Smoked Pork Lo Mein', 'Bento Sweet & Sour Chicken',
  'Bourbon Chicken Bento', 'Broccoli Chicken Bento', 'Hot Spicy Chicken Bento',
  'Bento Steamed Dumplings', 'Chicken Egg Roll', 'Pork Egg Roll', 'Shrimp Egg Roll'
];
```

Each row contains the following fields (table built dynamically, lines 425–448):

| Column | Field Type | Class / Name | Validation | Event Handler | Notes |
|---|---|---|---|---|---|
| Dish | Static text cell | `dish-label` | N/A | None | Dish name from `DISHES` array |
| Qty Produced | `number` | `qty-produced` | `min="0"` | `updateTotals()` | Default placeholder "0" |
| Qty Discarded | `number` | `qty-discarded` | `min="0"` | `updateTotals()` | Default placeholder "0" |
| Discard Reason | `text` | (none) | None | None | Freeform text; placeholder: "Reason if any…" |
| Final Temp °F | `number` | `final-temp` | `min="30" max="212"` | `flagTemp()` | Border/background turn red if > 41°F, green if ≤ 41°F |
| QA | `select` | `qa-select` | None | None | Options: `—`, `✓ Pass`, `✗ Fail`, `N/A` |
| QA / Quality Notes | `textarea` | (none) | None | None | Freeform notes; placeholder: "Notes…" |
| Initials | `text` | (none) | None | None | Placeholder: "Init" |

**Auto-Totals (tfoot, lines 298–305):**
- `total-produced`: Sum of all `qty-produced` inputs
- `total-discarded`: Sum of all `qty-discarded` inputs
- Updated in real-time via `updateTotals()` (lines 463–469)

---

### Section 5: Batch-Level Notes

| Field ID | Label | Type | Required | Notes |
|---|---|---|---|---|
| `f-general-notes` | General Production Notes | `textarea` | No | Placeholder: "Equipment issues, ingredient substitutions, timing delays, supplier problems…" |
| `f-quality-notes` | Quality Issues / Hold Items | `textarea` | No | Placeholder: "Any items held, rejected, or escalated to supervisor — include dish name and batch number…" |

Both fields are duplicated across all 13 dish rows in the payload under `generalNotes` and `batchQANotes`.

---

## Validation Rules

### Pre-Submit Validation (lines 523–528)

1. **Supervisor Name:** Must be non-empty. Alert: `"Please enter the supervisor name before submitting."`
2. **Production Kitchen:** Must be selected (non-empty). Alert: `"Please select the production kitchen before submitting."`

No other fields are hard-required. The form will submit with partial data.

### Real-Time Validation

1. **Temperature Flags:**
   - Any `Final Temp °F` field (dish-level or batch-level) > 41°F triggers:
     - Red border (`border-color: var(--red)`)
     - Light red background (`background: var(--red-lt)`)
   - Implemented via `flagTemp()` (lines 457–461) and `flagBatchTemp()` (lines 419–423)

2. **HACCP Cooling Time:**
   - Auto-calculated `b-cool-time` changes color based on duration:
     - **Green:** ≤ 240 min (safe)
     - **Orange:** 241–360 min (warning)
     - **Red:** > 360 min (violation)

3. **Negative Inventory:**
   - Not applicable to production form (only relevant for delivery form)

---

## Client-Side Logic & Features

### Auto-Population
- **Date field (`f-date`):** Auto-set to today's date on page load (line 358)
- **Batch ID:** Auto-generated from date + batch counter (line 360)

### Auto-Calculation
- **Cook Time:** Difference between `b-cook-end` and `b-cook-start` in minutes (lines 377–387)
- **Cool Time:** Difference between `b-cool-end` and `b-cool-start` in minutes, with "Overnight" override (lines 389–403)
- **Totals:** Sum of `qty-produced` and `qty-discarded` across all dishes (lines 463–469)

### Batch Management
- **Batch Counter:** Increment/decrement buttons allow logging multiple batches on the same day (lines 372–375)
- **Batch ID Format:** `YYYY/MM/DD  ·  B#` (line 369)

### Color-Coded Warnings
- **Temperature violations:** Red border + red background for any temp > 41°F
- **HACCP cooling violations:** Red text for cooling time > 360 minutes
- **Cook time display:** Orange text for positive cook time, red for negative (edge case)

### Offline Resilience
- **Local Storage Backup (lines 554–558):**
  - On network failure (`catch` block in `submitForm`), payload is saved to `localStorage` with key `tk_prod_backup_{timestamp}`
  - Status overlay shows: `"❌ Connection Error — Could not reach Google Sheets. Data saved locally — retry when connected."`
  - User can retry submission manually

### Demo Mode
- If `GOOGLE_SCRIPT_URL` is still set to `'YOUR_GOOGLE_SCRIPT_URL'`, form enters demo mode:
  - Logs payload to browser console instead of submitting
  - Shows warning overlay (lines 534–541)

### Clear Form
- **Clear All button (lines 571–591):**
  - Prompts confirmation: `"Clear all entries on this form?"`
  - Resets all inputs, selects, textareas (except file inputs)
  - Resets batch counter to 1
  - Clears visual flags (border colors, backgrounds)
  - Resets date to today

---

## HACCP Compliance Features

### HACCP Cooling Rule Banner (lines 169–176)
- Displayed prominently at the top of the form
- States the 2-hour and 4-hour cooling windows
- Explains color-coding for violations

### HACCP-Compliant Calculations
- **Cooling Time Auto-Calc:** Enforces visual flagging for violations (> 360 minutes = red)
- **Final Temp Validation:** Any temp > 41°F is visually flagged in red

### Audit Trail
- **Batch ID:** Unique identifier for each production run
- **Initials Field:** Per-dish accountability
- **Submitted At Timestamp:** ISO 8601 timestamp added to every row (line 516)

---

## Known Issues & Limitations

*(As documented in the main README — referenced here for audit completeness)*

1. **No Offline Queue:** Form saves to localStorage on failure but does not auto-retry on reconnect.
2. **No Driver Auth:** Anyone with the URL can submit data.
3. **No Client-Side Image Compression:** Not applicable to production form (no photo uploads).
4. **Hardcoded Dish List:** DISHES array is embedded in HTML (line 354). Adding/removing dishes requires editing the HTML file.
5. **No Validation for Cooling Time Logic:** Form does not enforce that cool start ≥ cook end. User can enter illogical times.
6. **No Server-Side Validation:** All validation is client-side only. Malicious actor could POST arbitrary JSON directly to the Apps Script endpoint.

---

## Security & Data Integrity

### Authentication
- **None.** The form is publicly accessible.

### Input Sanitization
- **None.** All user input is submitted as-is to the Google Apps Script endpoint. XSS vulnerabilities are mitigated by Google Sheets (data is stored as plain text), but the Apps Script code itself should sanitize inputs if it performs any DOM manipulation or generates HTML reports.

### CORS Mode
- **`no-cors` mode (line 547):** Prevents reading the response body, but allows form submission to external domains. This is a common pattern for Google Apps Script web apps deployed as "Execute as me, Anyone with the link."

---

## Data Flow Summary

1. **User fills form** → Client-side validation on submit (supervisor + kitchen required)
2. **Payload built** → `buildPayload()` (lines 472–520) constructs 13-row JSON payload
3. **Submit attempt** → `fetch()` to `GOOGLE_SCRIPT_URL` (lines 544–551)
4. **Success** → Status overlay shows `"✅ Submitted! {N} dish rows saved to Google Sheets."`
5. **Failure** → Payload saved to `localStorage`, status overlay shows connection error

---

## Files & Dependencies

### External Dependencies
- **Google Fonts:**
  - DM Mono (400, 500)
  - Syne (700, 800)
  - Inter (300, 400, 500, 600)
- **Google Apps Script Endpoint:** Must be configured at line 352

### No External JS Libraries
- Pure vanilla JavaScript
- No frameworks (React, Vue, etc.)
- No build step required

---

## Recommendations for Future Improvements

1. **Offline Queue with Auto-Retry:** See T-007 (already in backlog)
2. **Driver Auth:** See T-009 (NEEDS-OWNER)
3. **Move DISHES to JSON:** See T-010 (already in backlog) — extract to `data/stores.json` or `data/dishes.json`
4. **Server-Side Validation:** Add input sanitization and business rule checks in the Apps Script
5. **Logical Time Validation:** Warn user if cool start < cook end, or if times are illogical
6. **Batch ID Uniqueness Check:** Query Google Sheets to warn if a batch ID already exists (requires read-enabled Apps Script endpoint)

---

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-06 | Initial audit document created | @code |

---

**End of Production Form Audit**
