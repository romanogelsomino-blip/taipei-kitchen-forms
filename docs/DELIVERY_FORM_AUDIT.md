# Delivery Form Audit — taipei_delivery_form3.html

**Audit Date:** 2026-05-06
**Audited By:** @code
**Form Version:** v3
**Form File:** `taipei_delivery_form3.html`

---

## Overview

The Delivery Form (`taipei_delivery_form3.html`) is a single-page HTML application that captures delivery data for Taipei Kitchen's bento program across 7 Giant Food Stores locations. It logs driver information, transit temperatures, inventory changes per store, and photo documentation of cooler conditions before and after stocking. The form supports store-specific routing via URL parameters, encodes photos as base64 for Google Drive upload, and implements a comprehensive corrective action workflow for temperature violations.

---

## Submission Endpoint

**Variable:** `GOOGLE_SCRIPT_URL`
**Line:** 443
**Current Value:** `https://script.google.com/macros/s/AKfycbxXVDl_JyH1H2_KdM8CHyVn5H4qfoUsFepgV1p_4RhrCKKPSj2WzdkqEsGqHgL7V-b6PA/exec`
**Method:** `POST`
**Mode:** `no-cors`
**Content-Type:** `application/json`

### Two-Step Submission Process

The form submits data in **two separate requests**:

#### Step 1: Delivery Data (lines 780–793)
```json
{
  "rows": [ /* array of 13 dish rows */ ],
  "formType": "delivery",
  "photos": {
    "storeId": "6006",
    "storeName": "Store 6006 – Kline Village, Harrisburg, PA",
    "date": "YYYY-MM-DD",
    "driver": "string"
  }
}
```
**Note:** Photo metadata is sent, but not photo data (base64 images).

#### Step 2: Photos Only (lines 795–819, only if photos exist)
```json
{
  "formType": "photos_only",
  "photos": {
    "before": {
      "data": "base64-encoded-string (no data URI prefix)",
      "mimeType": "image/jpeg",
      "name": "filename.jpg"
    },
    "after": {
      "data": "base64-encoded-string",
      "mimeType": "image/png",
      "name": "filename.png"
    },
    "storeId": "6006",
    "storeName": "Store 6006 – Kline Village, Harrisburg, PA",
    "date": "YYYY-MM-DD",
    "driver": "string"
  }
}
```

**Rationale for Two-Step Process:**
- Large photo payloads can timeout if sent with dish data
- Allows delivery data to be saved even if photo upload fails
- User is notified if photos fail but data succeeds (line 816–819)

---

## Store Routing & URL Parameters

### Store List (line 446)
```javascript
const STORES = [
  {"id": "6006", "name": "Store 6006", "location": "Kline Village, Harrisburg, PA"},
  {"id": "6061", "name": "Store 6061", "location": "Shippensburg, PA"},
  {"id": "6253", "name": "Store 6253", "location": "New Cumberland, PA"},
  {"id": "6331", "name": "Store 6331", "location": "Mechanicsburg, PA"},
  {"id": "6443", "name": "Store 6443", "location": "Chambersburg, PA"},
  {"id": "6542", "name": "Store 6542", "location": "Carlisle, PA"},
  {"id": "6564", "name": "Store 6564", "location": "Harrisburg (Gayson Rd), PA"}
];
```

### URL Parameter Handling (lines 448–450)
- **Parameter:** `?store={storeId}`
- **Example:** `taipei_delivery_form3.html?store=6006`
- If `store` param is present and matches a store in `STORES`, the form:
  - Displays store name and location in header (lines 458–461)
  - Updates page title to include store name (line 461)
  - Includes store name and ID in submission payload (lines 664–665)

### Header Display (lines 88–91)
- Hidden by default (`display:none`)
- Shows store name, location, and "Giant Food Stores — Bento Program" when `storeData` is found
- **Example:** `Store 6006 · Kline Village, Harrisburg, PA`

---

## Form Fields — Complete Inventory

### Section 1: Delivery Information

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `f-date` | Date | `date` | No | None | Today's date (auto-populated) | None | Auto-set on load (line 465) |
| `f-driver` | Driver | `text` | **Yes** (hard) | Required before submit | Empty | None | Alert blocks submission if empty: `"Please enter the driver name before submitting."` (line 759) |
| `f-arrive` | Arrival Time | `time` | No | None | Current time (auto-populated) | None | Auto-set on load to HH:MM format (lines 466–468) |

### Section 2: Arrival Conditions

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `f-arrival-temp` | Arrival Product Temp °F | `number` | No | None | Empty | `flagArrivalTemp()` | Border/background turn red if > 41°F. Triggers corrective action panel if > 41°F (lines 625–640) |
| `f-cooler-temp` | Store Cooler Temp °F | `number` | No | None | Empty | None | Placeholder: "e.g. 38" |
| `f-cooler-cond` | Cooler Condition | `select` | No | None | Empty | None | Options: `— Select —`, `Good`, `Fair`, `Poor – Flag`, `Not Checked` |

### Section 3: Before Stocking Photo

**Photo Upload Zone (lines 137–148)**
- **Input ID:** `photo-before`
- **Input Type:** `file`
- **Accept:** `image/*`
- **Capture:** `environment` (triggers rear camera on mobile)
- **Event Handler:** `previewPhoto(this,'before-previews','zone-before')`

**Photo Processing (lines 505–530):**
1. User selects/captures photo
2. `FileReader` reads file as Data URL
3. Base64 data extracted (strips `data:image/...;base64,` prefix)
4. Stored in `photoData.before` object with `data`, `mimeType`, `name`
5. Preview thumbnail shown in `before-previews` div
6. Upload zone UI updated: `✅` icon, "Photo ready to upload" label

---

### Section 4: Transit Temperature Log

**Purpose:** Record product temperature at departure and mid-route checks to ensure cold chain compliance.

**Temperature Compliance Rule (lines 159–161):**
> Product must stay at or below **41°F** throughout transit. Flag anything above 41°F immediately.

#### Departure Check (3 fields)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `t-depart-temp` | Departure Temp °F | `number` | No | None | Empty | `flagTransitTemp()` | Red border/background if > 41°F. Triggers corrective action panel. |
| `t-depart-time` | Departure Time | `time` | No | None | Empty | None | |
| `t-depart-loc` | Departure Location | `select` | No | None | Empty | None | Options: `— Select —`, `Legacy Park`, `Store 6112`, `Other` |

#### Mid-Route Check 1 (3 fields)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `t-check1-time` | Check 1 Time | `time` | No | None | Empty | None | Optional — only needed if route > 1 hour |
| `t-check1-temp` | Check 1 Temp °F | `number` | No | None | Empty | `flagTransitTemp()` | Red border/background if > 41°F |
| `t-check1-loc` | Check 1 Location | `text` | No | None | Empty | None | Placeholder: "e.g. Between 6542 and 6443" |

#### Mid-Route Check 2 (3 fields)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `t-check2-time` | Check 2 Time | `time` | No | None | Empty | None | Optional |
| `t-check2-temp` | Check 2 Temp °F | `number` | No | None | Empty | `flagTransitTemp()` | Red border/background if > 41°F |
| `t-check2-loc` | Check 2 Location | `text` | No | None | Empty | None | Placeholder: "e.g. After 6331, heading south" |

---

### Section 5: Corrective Action Panel (Temperature Violation)

**Trigger:** Any transit temp field or arrival temp > 41°F (lines 534–564, 625–640)
**Display:** Hidden by default (`display:none`), shown when violation detected
**Panel ID:** `transit-flag`

#### Violation Summary Header (lines 215–221)
- **Red alert banner** with 🚨 icon
- **Title:** "Temperature Violation Detected"
- **Summary Line (auto-generated):** Lists which check(s) exceeded 41°F and the recorded temp
  - Example: `"Violation(s): Departure: 45°F  ·  Check 1: 43°F  — Complete corrective action below"`

---

#### Step 1: Record the Violation (3 fields)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `v-which-check` | Which Check Triggered | `select` | No | None | Empty (auto-set if arrival temp violates) | None | Options: `— Select —`, `Departure Check`, `Mid-Route Check 1`, `Mid-Route Check 2`, `Arrival at Store` |
| `v-exceeded-time` | Time Temp First Exceeded 41°F | `time` | No | None | Empty | `calcTimeAboveTemp()` | Used to calculate time at unsafe temp |
| `v-exceeded-temp` | Temp Recorded °F | `number` | No | None | Empty | None | Red border (hard-coded style) |

---

#### Step 2: Corrective Action Taken

##### Action Selection (2 fields)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `v-action` | Action Taken | `select` | No | None | Empty | `toggleCorrectionType()` | Options: `— Select action —`, `Placed in Cooler / Freezer`, `Discarded Product`, `Continued Route (temp borderline)`, `Held for Supervisor Decision` |
| `v-action-time` | Time Action Taken | `time` | No | None | Empty | `calcTimeAboveTemp()` | Used as end time for time-at-temp calculation |

##### Time Above 41°F Auto-Calculation (lines 572–623)

**Display ID:** `time-above-display`
**Logic:**
- Calculates `(recoveredTime OR actionTime) - exceededTime` in minutes
- Handles overnight rollover (adds 1440 minutes if negative)
- **Color Coding:**
  - **Green (≤ 120 minutes / 2 hours):** `"✓ Time above 41°F: {time} — within 2-hour window. Recovery is acceptable if temp confirmed ≤41°F."`
  - **Red (> 120 minutes):** `"⛔ Time above 41°F: {time} — EXCEEDS 2-hour limit. Product must be discarded per food safety guidelines."`
- **Auto-Force Discard:** If time > 120 minutes, form automatically sets `v-action` to "discard" and shows discard section (lines 604–609)

---

##### Cooler/Freezer Recovery Section (3 fields, conditionally shown)

**Section ID:** `section-cooler`
**Display Condition:** Only shown if `v-action` = `"cooler"` (line 651)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `v-recovery-loc` | Recovery Location | `select` | No | None | Empty | None | Options: `— Select —`, `Store Cooler`, `Store Freezer`, `Vehicle Cooler`, `Other` |
| `v-recovered-time` | Temp Returned to ≤41°F At | `time` | No | None | Empty | `calcTimeAboveTemp()` | Used as end time for time-at-temp calculation (overrides `v-action-time`) |
| `v-recovered-temp` | Confirmed Safe Temp °F | `number` | No | `placeholder="Must be ≤41°F"` | Empty | `flagRecoveredTemp()` | Red border/background if > 41°F, green if ≤ 41°F |

**Recovery Status Display (lines 613–622):**
- **ID:** `recovery-status`
- Shows green success message if recovered within 2 hours and temp ≤ 41°F
- Shows red error message if time limit exceeded

---

##### Discard Section (4 fields, conditionally shown)

**Section ID:** `section-discard`
**Display Condition:** Only shown if `v-action` = `"discard"` (line 652)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `v-discard-time` | Time Discarded | `time` | No | None | Empty | None | |
| `v-discard-qty` | Total Units Discarded | `number` | No | `min="0"` | Empty | None | Placeholder: "0" |
| `v-discard-items` | Which Products Were Discarded | `textarea` | No | None | Empty | None | Placeholder: "List each dish and quantity — e.g. General Tso x4, Sesame Chicken x3…" |
| `v-discard-reason` | Discard Reason | `select` | No | None | Empty | None | Options: `— Select —`, `Temp exceeded 41°F for more than 2 hours`, `Temp exceeded 45°F (accelerated spoilage risk)`, `Unable to verify time at temperature`, `Supervisor directed discard`, `Product quality compromised` |

---

#### Step 3: Supervisor Notification (3 fields + 1 textarea)

| Field ID | Label | Type | Required | Validation | Default | Event Handler | Notes |
|---|---|---|---|---|---|---|---|
| `v-supervisor-notified` | Supervisor Notified? | `select` | No | None | Empty | None | Options: `— Select —`, `Yes — by phone`, `Yes — by text`, `Yes — in person`, `Not yet — will notify on return`, `No — temp borderline, documented only` |
| `v-supervisor-name` | Supervisor Name | `text` | No | None | Empty | None | Placeholder: "Name" |
| `v-notif-time` | Notification Time | `time` | No | None | Empty | None | |
| `v-incident-notes` | Additional Notes on This Incident | `textarea` | No | None | Empty | None | Placeholder: "Any additional context — road conditions, equipment issue, how long route was delayed, etc." |

---

### Section 6: Bento Inventory

**Purpose:** Record inventory changes for each of the 13 dishes at this store stop.

**Table:** `dish-table`
**Dishes (line 445):** Same as production form (13 dishes)

Each row contains:

| Column | Field Type | Class | Validation | Event Handler | Notes |
|---|---|---|---|---|---|
| Dish | Static text cell | `dish-name` | N/A | None | Dish name from `DISHES` array |
| Added to Shelf | `number` | `d-added` | `min="0"` | `recalc(this)` | Quantity delivered and stocked |
| On Shelf (Before) | `number` | `d-before` | `min="0"` | `recalc(this)` | Quantity already on shelf before stocking |
| Removed (Expired) | `number` | `d-removed` | `min="0"` | `recalc(this)` | Quantity removed due to expiration/damage |
| Expire Reason | `text` | (none) | None | None | Freeform text; placeholder: "e.g. Expired" |
| After Total | Display cell | `d-after`, `calc-cell` | Auto-calculated | Updated by `recalc()` | Formula: `before + added - removed`. Shows "⚠ Check" in red if result is negative. |

**Auto-Calculation Logic (lines 488–502):**
- `after = before + added - removed`
- If `after < 0`: display `"⚠ Check"` in red (indicates data entry error)
- If `after ≥ 0`: display number in green
- Auto-totals for "Added" and "Removed" columns updated in footer

**Footer Totals (lines 380–388):**
- `total-added`: Sum of all `d-added` inputs
- `total-removed`: Sum of all `d-removed` inputs

---

### Section 7: After Stocking Photo

**Photo Upload Zone (lines 401–409)**
- **Input ID:** `photo-after`
- **Input Type:** `file`
- **Accept:** `image/*`
- **Capture:** `environment`
- **Event Handler:** `previewPhoto(this,'after-previews','zone-after')`

Same processing logic as "Before" photo (base64 encoding, preview, stored in `photoData.after`).

---

### Section 8: Notes

| Field ID | Label | Type | Required | Validation | Default | Notes |
|---|---|---|---|---|---|---|
| `f-notes` | Store Notes / Issues / Feedback | `textarea` | No | None | Empty | Placeholder: "Equipment issues, store requests, expired product details, anything unusual…" |
| `f-received-by` | Received By (Store Staff — print name) | `text` | No | None | Empty | Placeholder: "Store employee name" |

---

## Validation Rules

### Pre-Submit Validation (lines 758–765)

1. **Driver Name:** Must be non-empty. Alert: `"Please enter the driver name before submitting."`
2. **URL Configuration:** If `GOOGLE_SCRIPT_URL` is still `'YOUR_GOOGLE_SCRIPT_URL'`, show error overlay and abort.

No other fields are hard-required. The form will submit with partial data.

### Real-Time Validation

1. **Temperature Flags:**
   - Any temp > 41°F triggers:
     - Red border (`border-color: var(--red)`)
     - Light red background (`background: var(--red-lt)`)
   - Applies to: `f-arrival-temp`, `t-depart-temp`, `t-check1-temp`, `t-check2-temp`, `v-recovered-temp`
   - Green border for temps ≤ 41°F

2. **Transit Violation Panel:**
   - Automatically shown when any transit or arrival temp > 41°F (lines 550–563)
   - Violation summary line auto-generated with all violating checks

3. **Negative Inventory:**
   - If `after total < 0`, cell displays `"⚠ Check"` in red (lines 495–496)

4. **HACCP 2-Hour Rule:**
   - Time above 41°F calculated in real-time
   - > 120 minutes triggers red warning and auto-forces discard action

---

## Client-Side Logic & Features

### Store Routing
- **URL Parameter Detection:** `?store={id}` (lines 448–450)
- **Store Lookup:** Matches `id` against `STORES` array (line 450)
- **Header Update:** Shows store name and location if found (lines 458–461)
- **Payload Inclusion:** Store name and ID included in submission (lines 664–665)

### Photo Handling
- **Base64 Encoding:** Photos converted to base64 (lines 512–529)
  - Data URI prefix (`data:image/...;base64,`) is stripped before storage (line 520)
  - Stored as `{data, mimeType, name}` object
- **Preview Thumbnails:** 64×64px preview images shown (lines 515–517)
- **Upload Zone UI:** Changes to green border with ✅ icon when photo ready (lines 525–527)

### Auto-Calculation
- **After Total:** `before + added - removed` per dish (lines 488–502)
- **Time Above 41°F:** `(recoveredTime OR actionTime) - exceededTime` in minutes (lines 572–623)
  - Handles overnight rollover (adds 1440 minutes if negative)
  - Auto-formats as "{hours}h {minutes}m" or "{minutes} min"

### Conditional UI
- **Corrective Action Panel:** Hidden by default, shown when temp > 41°F (lines 550–563)
- **Recovery vs Discard Sections:** Only one shown based on `v-action` dropdown (lines 649–653)
- **Time Above Display:** Hidden until both exceeded time and action time are entered (lines 581–584)
- **Auto-Force Discard:** If time > 120 minutes, form automatically selects "Discarded Product" and shows discard section (lines 604–609)

### Offline Resilience
- **Local Storage Backup (lines 788–792):**
  - On network failure (`catch` block in Step 1), payload saved to `localStorage` with key `tk_del_backup_{timestamp}`
  - Status overlay shows: `"❌ Connection Error — Could not reach Google Sheets. Data saved to this device. Check internet and try again."`
  - **Photo Failure Handling (lines 814–819):**
    - If data succeeds but photos fail, shows: `"⚠️ Mostly Done — Delivery data saved to Google Sheets ✓. Photos could not upload — check your internet connection and contact your supervisor to upload manually."`

### Two-Step Submission
1. **Step 1 (lines 780–793):** Send delivery data + photo metadata (no base64 images)
   - Status: `"Step 1 of 2 — Saving delivery data to Google Sheets…"`
2. **Step 2 (lines 795–819, conditional):** Send photos only if present
   - Status: `"Step 2 of 2 — Uploading photos to Google Drive…"`
   - **Success:** `"✅ All Done! {N} dish rows saved to Google Sheets for {store}. Photos uploaded to Google Drive."`
   - **No Photos:** `"✅ Submitted! {N} dish rows saved to Google Sheets for {store}. No photos attached."`

### Clear Form
- **Clear All button (lines 836–862):**
  - Prompts confirmation: `"Clear all entries?"`
  - Resets all inputs, selects, textareas
  - Clears photo previews and `photoData` object
  - Hides corrective action panel
  - Resets all visual flags (border colors, backgrounds)
  - Resets date to today

---

## Payload Structure

### Delivery Data Row (one row per dish, 13 total)

```json
{
  "date": "YYYY-MM-DD",
  "driver": "string",
  "store": "Store 6006 – Kline Village, Harrisburg, PA",
  "storeId": "6006",
  "arrive": "HH:MM",
  "arrivalProductTemp": "number | empty",
  "coolerTemp": "number | empty",
  "coolerCond": "Good | Fair | Poor – Flag | Not Checked | empty",
  "dish": "string (one of 13 DISHES)",
  "added": "number (default '0')",
  "before": "number (default '0')",
  "removed": "number (default '0')",
  "reason": "string (expire reason)",
  "after": "number | '⚠ Check'",
  "notes": "string",
  "receivedBy": "string",
  "transitDepartTemp": "number | empty",
  "transitDepartTime": "HH:MM | empty",
  "transitDepartLoc": "Legacy Park | Store 6112 | Other | empty",
  "transitCheck1Time": "HH:MM | empty",
  "transitCheck1Temp": "number | empty",
  "transitCheck1Loc": "string | empty",
  "transitCheck2Time": "HH:MM | empty",
  "transitCheck2Temp": "number | empty",
  "transitCheck2Loc": "string | empty",
  "violationWhichCheck": "Departure Check | Mid-Route Check 1 | Mid-Route Check 2 | Arrival at Store | empty",
  "violationExceededTime": "HH:MM | empty",
  "violationExceededTemp": "number | empty",
  "correctionAction": "cooler | discard | continued | supervisor | empty",
  "correctionActionTime": "HH:MM | empty",
  "correctionRecoveryLoc": "Store Cooler | Store Freezer | Vehicle Cooler | Other | empty",
  "correctionRecoveredTime": "HH:MM | empty",
  "correctionRecoveredTemp": "number | empty",
  "discardTime": "HH:MM | empty",
  "discardQty": "number | empty",
  "discardItems": "string | empty",
  "discardReason": "string (selected option) | empty",
  "supervisorNotified": "string (selected option) | empty",
  "supervisorName": "string | empty",
  "supervisorNotifTime": "HH:MM | empty",
  "incidentNotes": "string | empty",
  "timeAboveSafeTemp": "string (auto-calculated display text) | empty",
  "formType": "delivery",
  "submittedAt": "ISO 8601 timestamp"
}
```

**Note:** All transit and corrective action fields are duplicated across all 13 dish rows. This allows downstream processing in Google Sheets to pivot/aggregate by delivery session.

---

## Known Issues & Limitations

*(As documented in the main README — referenced here for audit completeness)*

1. **No Offline Queue:** Form saves to localStorage on failure but does not auto-retry on reconnect.
2. **No Driver Auth:** Anyone with the URL can submit data. See T-009 (NEEDS-OWNER).
3. **No Client-Side Image Compression:** Photos sent as full-size base64. Large photos (> 2MB) may timeout. See T-008.
4. **Hardcoded Dish List:** DISHES array is embedded in HTML (line 445). See T-010.
5. **Hardcoded Store List:** STORES array is embedded in HTML (line 446). See T-010.
6. **No Validation for Transit Temps Sequence:** Form does not enforce that check 1 time > departure time, or check 2 time > check 1 time.
7. **No Server-Side Validation:** All validation is client-side only.
8. **Photo Failure Silent:** If photo upload fails but data succeeds, user is notified but photos are not queued for retry.

---

## Security & Data Integrity

### Authentication
- **None.** The form is publicly accessible.

### Input Sanitization
- **None.** All user input is submitted as-is to the Google Apps Script endpoint.

### Photo Data
- **Base64 Encoding:** Photos are converted to base64 and sent in the payload. No direct file upload.
- **Size Limits:** None enforced client-side. Large photos may cause payload to exceed Google Apps Script POST size limits (10MB for Apps Script).

### CORS Mode
- **`no-cors` mode (line 784, 806):** Same as production form.

---

## HACCP & Food Safety Compliance

### Temperature Monitoring
- **41°F Threshold:** All transit and arrival temps flagged if > 41°F
- **2-Hour Rule:** Time above 41°F calculated in real-time. > 120 minutes triggers mandatory discard.
- **Visual Alerts:** Red borders, red backgrounds, red text for violations

### Corrective Action Workflow
- **Structured Data Collection:** Violation time, action taken, recovery time/temp, discard details, supervisor notification
- **Auto-Enforcement:** Form prevents recovery if time > 2 hours (auto-selects discard)
- **Audit Trail:** All corrective action data included in payload

### Photo Documentation
- **Before Stocking Photo:** Documents cooler condition before driver touches it
- **After Stocking Photo:** Documents final state after stocking
- **Timestamps:** Photos uploaded with date, driver, and store metadata for traceability

---

## Data Flow Summary

1. **User navigates to form** → URL parameter parsed for store routing
2. **User fills form** → Real-time validation flags temp violations
3. **Temp violation detected** → Corrective action panel shown
4. **User takes photos** → Base64 encoding + preview
5. **Submit button clicked** → Pre-submit validation (driver required)
6. **Step 1: Data submission** → 13-row payload sent (photos metadata only)
7. **Step 1 success** → Proceed to Step 2
8. **Step 2: Photo submission** → Base64 photo data sent separately
9. **Success** → Status overlay shows final confirmation
10. **Failure** → Data saved to localStorage, user notified

---

## Files & Dependencies

### External Dependencies
- **Google Fonts:**
  - DM Mono (400, 500)
  - Syne (700, 800)
  - Inter (300, 400, 500, 600)
- **Google Apps Script Endpoint:** Must be configured at line 443

### No External JS Libraries
- Pure vanilla JavaScript
- No frameworks (React, Vue, etc.)
- No build step required

---

## Recommendations for Future Improvements

1. **Offline Queue with Auto-Retry:** See T-007 (already in backlog)
2. **Driver Auth:** See T-009 (NEEDS-OWNER)
3. **Client-Side Image Compression:** See T-008 (already in backlog) — target < 500KB, max 1600px
4. **Move STORES and DISHES to JSON:** See T-010 (already in backlog)
5. **Photo Upload Retry:** If photos fail, queue them for retry on next submit or on reconnect
6. **Logical Time Validation:** Warn user if transit check times are out of sequence
7. **Server-Side Validation:** Add input sanitization and business rule checks in Apps Script
8. **Base64 Size Warning:** Alert user if photo > 2MB before encoding (to prevent timeout)
9. **Store Selection Dropdown:** If no URL param, show a dropdown to select store (instead of requiring QR code scan)
10. **Duplicate Submission Prevention:** Check localStorage or query Google Sheets to prevent accidental double-submit

---

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-06 | Initial audit document created | @code |

---

**End of Delivery Form Audit**
