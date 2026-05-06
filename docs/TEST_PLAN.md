# Test Plan — Taipei Kitchen Bento Ops System

**Version:** 1.0 (for Milestone V1)
**Last Updated:** 2026-05-06
**Test Owner:** @browser (execution), @code (maintenance)
**Test Environment:** Staging (`gh-pages-staging` branch)

---

## Overview

This document defines the acceptance test suite for Milestone V1 of the Taipei Kitchen Bento Ops System. All tests must pass on the staging environment before promotion to production. Tests are organized by feature area, with explicit pass/fail criteria for each test case.

**Test Execution Schedule:**
- **T-019 (Smoke Test):** After every PR merge to staging
- **T-020 (Regression):** Before promoting staging → production
- **T-021 (UAT):** Final validation with Romano at pilot location before rollout to all 7 stores

---

## Test Environment Setup

### Staging Environment
- **URL:** `https://{user}.github.io/taipei-kitchen-forms/staging/`
- **Google Sheet:** `TaipeiKitchen_BentoOps_v2_STAGING` (sandbox, isolated from production)
- **Photo Upload:** Sandbox Google Drive folder (separate from production)
- **Branch:** `gh-pages-staging`

### Test Devices
- **iOS:** iPhone 12 or newer, iOS 15+ (Safari)
- **Android:** Mid-range device (e.g., Samsung Galaxy A52), Android 11+ (Chrome)
- **Desktop:** Chrome 100+, Firefox 100+, Safari 15+ (for admin/debugging tasks only)

### Test Data
- **Production Kitchen:** "Legacy Park" (default)
- **Delivery Route:** Stores 6542 → 6443 → 6331 (3-store route for testing)
- **Dishes:** Use all 13 dishes at least once across tests
- **Test Photos:** Prepare 3 test images:
  - Small: < 500KB (already compressed)
  - Medium: 1–2MB (typical phone photo)
  - Large: 5–8MB (high-res photo)

---

## 1. Core Feature Tests (New in V1)

### 1.1 Offline-Resilient Submission Queue (T-007)

#### Test Case 1.1.1: Queue Submission on Network Failure (Production Form)
**Preconditions:**
- Open production form on staging
- Fill out complete batch (all fields, 3 dishes with production data)
- Before submitting, enable DevTools → Network → Offline mode

**Steps:**
1. Click "Submit Production Log"
2. Observe status overlay

**Expected Result:**
- Status overlay shows: "❌ Connection Error — Could not reach Google Sheets. Data saved locally — retry when connected."
- Form data saved to `localStorage` with key matching pattern `tk_prod_backup_*`
- Visual indicator appears showing "1 pending submission" or similar

**Pass Criteria:**
- [ ] Error message appears within 5 seconds
- [ ] Payload found in localStorage (verify via DevTools → Application → Local Storage)
- [ ] Queue indicator visible in form UI

---

#### Test Case 1.1.2: Auto-Retry on Reconnect (Production Form)
**Preconditions:**
- Queued submission from Test Case 1.1.1 exists

**Steps:**
1. Disable DevTools Offline mode (restore network)
2. Trigger `online` event (can refresh page or wait for browser to detect reconnect)
3. Observe form behavior

**Expected Result:**
- Form auto-detects reconnect and attempts to submit queued payload
- Status overlay shows: "✅ Submitted! {N} dish rows saved to Google Sheets."
- Queued item removed from localStorage
- Queue indicator disappears or shows "0 pending submissions"

**Pass Criteria:**
- [ ] Auto-retry triggered within 10 seconds of reconnect
- [ ] Submission succeeds and appears in sandbox Google Sheet
- [ ] localStorage queue cleared
- [ ] Queue indicator updated

---

#### Test Case 1.1.3: Manual Retry (Production Form)
**Preconditions:**
- Queued submission exists (create via Test Case 1.1.1)
- Network is online

**Steps:**
1. Click "Retry All" button (or equivalent UI element)
2. Observe form behavior

**Expected Result:**
- Form attempts to submit all queued items
- Success overlay appears for each successful submission
- Queue indicator updates after each retry

**Pass Criteria:**
- [ ] Manual retry button visible when queue > 0
- [ ] All queued items submitted successfully
- [ ] Queue cleared after all retries succeed

---

#### Test Case 1.1.4: Queue Persistence Across Sessions (Production Form)
**Preconditions:**
- Queued submission exists

**Steps:**
1. Close browser tab
2. Reopen form URL in new tab
3. Observe queue indicator

**Expected Result:**
- Queue indicator shows same count as before closing tab
- Queued items persist in localStorage

**Pass Criteria:**
- [ ] Queue indicator shows correct count on page load
- [ ] "Retry All" button available
- [ ] Queued items successfully submit when retried

---

#### Test Case 1.1.5: Deduplication on Retry (Production Form)
**Preconditions:**
- Fill out production form (Batch ID: 2026/05/06 · B1)

**Steps:**
1. Submit while offline → queued
2. Restore network
3. Click "Retry All" → successful submission
4. Immediately click "Retry All" again (before queue is cleared)

**Expected Result:**
- Second retry either:
  - Skips already-submitted items (via timestamp check), OR
  - Shows warning: "This batch has already been submitted. Continue anyway?"

**Pass Criteria:**
- [ ] No duplicate rows appear in sandbox Google Sheet for same batch ID + timestamp
- [ ] User warned or duplicate submission prevented

---

#### Test Case 1.1.6: Queue Size Limit (Production Form)
**Preconditions:**
- None

**Steps:**
1. Submit 50 forms while offline (simulated or scripted)
2. Attempt to submit 51st form while still offline

**Expected Result:**
- Form shows warning: "Queue is full (50 items). Please connect to network and retry before submitting more."
- 51st form not added to queue

**Pass Criteria:**
- [ ] Queue capped at 50 items (or configured limit)
- [ ] User warned when limit reached
- [ ] Oldest item can be manually removed to make room (optional feature)

---

#### Test Case 1.1.7–1.1.12: Repeat Tests 1.1.1–1.1.6 for Delivery Form
**Notes:**
- Same test cases, adapted for delivery form
- Include photos in queued payload
- Verify photos upload correctly on retry

---

### 1.2 Client-Side Image Compression (T-008)

#### Test Case 1.2.1: Large Photo Compression (Delivery Form)
**Preconditions:**
- Open delivery form on staging
- Prepare 5–8MB test photo (high-res image)

**Steps:**
1. Click "Before Stocking Photo" upload zone
2. Select/capture 5–8MB photo
3. Observe compression status

**Expected Result:**
- Compression status displayed: "Original: 5.2MB → Compressed: 480KB" (or similar)
- Compressed photo ≤ 500KB
- Preview thumbnail shows compressed image

**Pass Criteria:**
- [ ] Compression status displayed within 3 seconds
- [ ] Compressed photo ≤ 500KB (verify via payload inspection or network tab)
- [ ] Compression time < 5 seconds on mid-range Android

---

#### Test Case 1.2.2: Small Photo Bypass (Delivery Form)
**Preconditions:**
- Prepare < 500KB test photo (already compressed)

**Steps:**
1. Upload < 500KB photo to "After Stocking Photo"
2. Observe compression status

**Expected Result:**
- Compression skipped (photo already below threshold)
- Status: "Photo ready to upload (450KB)" (no compression applied)

**Pass Criteria:**
- [ ] Small photos not unnecessarily re-compressed
- [ ] Upload proceeds without delay

---

#### Test Case 1.2.3: Visual Quality Check (Delivery Form)
**Preconditions:**
- Upload 5–8MB photo (from Test Case 1.2.1)
- Submit form successfully

**Steps:**
1. Open sandbox Google Drive folder
2. View uploaded "before" photo
3. Compare to original photo

**Expected Result:**
- Compressed photo maintains acceptable visual quality for audit purposes
- Labels on cooler shelves readable (if present)
- No severe artifacts or blurring

**Pass Criteria:**
- [ ] Text on labels readable
- [ ] Colors not distorted
- [ ] No severe JPEG artifacts
- [ ] Photo usable for food safety audit

---

#### Test Case 1.2.4: Compression Failure Fallback (Delivery Form)
**Preconditions:**
- Prepare corrupted/unsupported image file (e.g., TIFF, HEIC on older browsers)

**Steps:**
1. Attempt to upload unsupported file
2. Observe form behavior

**Expected Result:**
- Compression fails gracefully
- Warning shown: "Could not compress photo. Original will be uploaded (5.2MB). This may take longer on slow connections."
- Form proceeds with original file

**Pass Criteria:**
- [ ] No JavaScript errors in console
- [ ] User warned about upload size
- [ ] Form does not crash or block submission

---

#### Test Case 1.2.5: Photo Compression on Slow Device (Delivery Form)
**Preconditions:**
- Use older Android device (e.g., 2–3 years old, mid-range chipset)
- Upload 8MB photo

**Steps:**
1. Upload photo
2. Measure compression time

**Expected Result:**
- Compression completes within 10 seconds
- User sees progress indicator (e.g., "Compressing… 3 of 5 seconds")

**Pass Criteria:**
- [ ] Compression < 10 seconds on 2-year-old mid-range Android
- [ ] Progress indicator shown if compression > 2 seconds

---

### 1.3 JSON-Based Store Data (T-010)

#### Test Case 1.3.1: Store List Loads from JSON (Delivery Form)
**Preconditions:**
- `data/stores.json` exists on staging
- Open delivery form without URL param

**Steps:**
1. Open form URL (no `?store=` param)
2. Inspect store dropdown (if present) OR verify form loads without errors
3. Check DevTools → Network tab for `stores.json` request

**Expected Result:**
- `stores.json` fetched successfully (HTTP 200)
- All 7 stores loaded from JSON
- No hardcoded stores shown (if dropdown exists)

**Pass Criteria:**
- [ ] `stores.json` request appears in Network tab
- [ ] All 7 stores present in form (if dropdown added)
- [ ] No console errors

---

#### Test Case 1.3.2: Dish List Loads from JSON (Production Form)
**Preconditions:**
- `data/stores.json` includes "dishes" array
- Open production form on staging

**Steps:**
1. Inspect dish table
2. Verify all 13 dishes present
3. Check Network tab for `stores.json` request

**Expected Result:**
- Dish table populated from JSON (not hardcoded)
- All 13 dishes present in correct order

**Pass Criteria:**
- [ ] `stores.json` fetched successfully
- [ ] Dish table matches JSON content
- [ ] Adding a dish to JSON makes it appear in form (verify in follow-up test)

---

#### Test Case 1.3.3: Fallback to Hardcoded List on Fetch Failure (Delivery Form)
**Preconditions:**
- Enable DevTools → Network → Block request matching `stores.json`

**Steps:**
1. Reload form
2. Observe console

**Expected Result:**
- Fetch fails (blocked by DevTools)
- Console warning: "Could not fetch stores.json. Using fallback hardcoded list."
- Form loads with hardcoded 7 stores (if still present in HTML as fallback)

**Pass Criteria:**
- [ ] Form does not crash
- [ ] Fallback list loads
- [ ] Console warning logged

---

#### Test Case 1.3.4: JSON Cache in localStorage (Delivery Form)
**Preconditions:**
- Clear localStorage
- Open form → `stores.json` fetched

**Steps:**
1. Reload form within 1 hour
2. Check Network tab

**Expected Result:**
- No new request to `stores.json` (served from localStorage cache)
- Console log: "Loaded stores from cache (expires in 45 min)" (or similar)

**Pass Criteria:**
- [ ] Second page load does not fetch `stores.json`
- [ ] Cache TTL respected (expires after 1 hour)

---

#### Test Case 1.3.5: Inactive Store Filtering (Delivery Form)
**Preconditions:**
- Add test store to `data/stores.json` with `"active": false`

**Steps:**
1. Reload form
2. Check store dropdown (if present) or attempt to route to inactive store via `?store=TEST`

**Expected Result:**
- Inactive store not shown in dropdown
- Routing to inactive store shows error: "Store TEST is not active. Contact supervisor."

**Pass Criteria:**
- [ ] Inactive stores filtered out
- [ ] Error message shown if user attempts to access inactive store via URL

---

### 1.4 Store Onboarding (T-011)

#### Test Case 1.4.1: Add Store via JSON (Manual Process Test)
**Preconditions:**
- Read `docs/ADD_A_STORE.md`

**Steps:**
1. Add test store to `data/stores.json`:
   ```json
   {"id": "9999", "name": "Store 9999", "location": "Test City, PA", "active": true}
   ```
2. Commit and push to staging
3. Open delivery form with `?store=9999`

**Expected Result:**
- Form loads with "Store 9999 · Test City, PA" in header
- Submission includes store ID and name in payload

**Pass Criteria:**
- [ ] Store appears in form without code changes
- [ ] Submission succeeds
- [ ] Store data correct in sandbox Google Sheet

---

#### Test Case 1.4.2: QR Code Generation (Manual Process Test)
**Preconditions:**
- Read `docs/ADD_A_STORE.md` QR code section

**Steps:**
1. Generate QR code for `?store=9999` using documented tool/script
2. Scan QR code with phone
3. Verify form opens with correct store

**Expected Result:**
- QR code encodes correct staging URL
- Form opens on mobile with "Store 9999" header

**Pass Criteria:**
- [ ] QR code generation documented clearly
- [ ] QR code works on iOS and Android
- [ ] URL includes correct `?store=` param

---

## 2. Regression Tests (Existing Features Must Not Break)

### 2.1 HACCP Compliance (Production Form)

#### Test Case 2.1.1: Cooling Time HACCP Flag (Green)
**Steps:**
1. Fill production form
2. Set `b-cool-start` = `14:00`, `b-cool-end` = `17:30` (210 minutes)
3. Observe `b-cool-time` display

**Expected Result:**
- Display shows: "210 min"
- Color: Green (within 4-hour window)

**Pass Criteria:**
- [ ] Time calculated correctly
- [ ] Color green

---

#### Test Case 2.1.2: Cooling Time HACCP Flag (Orange)
**Steps:**
1. Set `b-cool-start` = `14:00`, `b-cool-end` = `18:30` (270 minutes)
2. Observe `b-cool-time` display

**Expected Result:**
- Display shows: "270 min"
- Color: Orange (approaching 6-hour limit)

**Pass Criteria:**
- [ ] Time calculated correctly
- [ ] Color orange

---

#### Test Case 2.1.3: Cooling Time HACCP Flag (Red Violation)
**Steps:**
1. Set `b-cool-start` = `14:00`, `b-cool-end` = `21:00` (420 minutes)
2. Observe `b-cool-time` display

**Expected Result:**
- Display shows: "420 min"
- Color: Red (exceeds 6-hour / 360-minute limit)

**Pass Criteria:**
- [ ] Time calculated correctly
- [ ] Color red
- [ ] HACCP banner still visible at top of form

---

#### Test Case 2.1.4: Final Temp Flag (Production Form)
**Steps:**
1. Enter `b-final-temp` = `45°F`
2. Observe border and background

**Expected Result:**
- Border: Red
- Background: Light red

**Pass Criteria:**
- [ ] Visual flag applied
- [ ] Flag removed when temp ≤ 41°F

---

### 2.2 Transit Temperature Violation (Delivery Form)

#### Test Case 2.2.1: Violation Panel Triggers on Arrival Temp > 41°F
**Steps:**
1. Open delivery form
2. Enter `f-arrival-temp` = `45°F`

**Expected Result:**
- Corrective action panel (`#transit-flag`) becomes visible
- Violation summary shows: "Arrival at store: 45°F"

**Pass Criteria:**
- [ ] Panel visible
- [ ] Summary correct

---

#### Test Case 2.2.2: Time Above 41°F Auto-Calculation (Green)
**Preconditions:**
- Violation panel visible (from Test Case 2.2.1)

**Steps:**
1. Set `v-exceeded-time` = `10:00`
2. Set `v-action-time` = `11:30` (90 minutes)
3. Observe `time-above-display`

**Expected Result:**
- Display shows: "✓ Time above 41°F: 1h 30m — within 2-hour window. Recovery is acceptable if temp confirmed ≤41°F."
- Background: Green

**Pass Criteria:**
- [ ] Time calculated correctly (90 minutes)
- [ ] Color green
- [ ] Message indicates recovery acceptable

---

#### Test Case 2.2.3: Time Above 41°F Auto-Calculation (Red - Auto-Force Discard)
**Steps:**
1. Set `v-exceeded-time` = `10:00`
2. Set `v-action-time` = `13:00` (180 minutes)

**Expected Result:**
- Display shows: "⛔ Time above 41°F: 3h 0m — EXCEEDS 2-hour limit. Product must be discarded per food safety guidelines."
- Background: Red
- `v-action` dropdown auto-set to "Discarded Product"
- Discard section (`#section-discard`) becomes visible

**Pass Criteria:**
- [ ] Time calculated correctly (180 minutes)
- [ ] Color red
- [ ] Action auto-forced to discard
- [ ] Discard section visible

---

### 2.3 Photo Upload (Delivery Form)

#### Test Case 2.3.1: Photo Upload Success (Two-Step Submission)
**Steps:**
1. Fill delivery form completely
2. Upload "before" photo (1MB)
3. Upload "after" photo (2MB)
4. Submit form
5. Observe status overlay

**Expected Result:**
- Step 1: "Saving delivery data to Google Sheets…"
- Step 2: "Uploading photos to Google Drive…"
- Final: "✅ All Done! 13 dish rows saved to Google Sheets for Store 6542. Photos uploaded to Google Drive."

**Pass Criteria:**
- [ ] Two-step process visible in status overlay
- [ ] Both photos appear in sandbox Google Drive folder
- [ ] Photo filenames include store ID, date, and timestamp

---

#### Test Case 2.3.2: Photo Upload Failure (Delivery Form)
**Preconditions:**
- Enable DevTools → Network → Block requests to `script.google.com` after first submission

**Steps:**
1. Fill form + upload photos
2. Submit
3. Step 1 succeeds (data saved)
4. Step 2 fails (photos blocked)

**Expected Result:**
- Status overlay: "⚠️ Mostly Done — Delivery data saved to Google Sheets ✓. Photos could not upload — check your internet connection and contact your supervisor to upload manually."

**Pass Criteria:**
- [ ] Data submission succeeds
- [ ] Photo failure detected and reported
- [ ] User instructed to contact supervisor

---

### 2.4 Store Routing (Delivery Form)

#### Test Case 2.4.1: URL Param Routing (All 7 Stores)
**Steps:**
1. Open form with `?store=6006`
2. Verify header shows "Store 6006 · Kline Village, Harrisburg, PA"
3. Repeat for stores 6061, 6253, 6331, 6443, 6542, 6564

**Expected Result:**
- Correct store name and location displayed for each store
- Submission payload includes correct `storeId` and `storeName`

**Pass Criteria:**
- [ ] All 7 stores route correctly
- [ ] Payload verified in sandbox Google Sheet

---

### 2.5 Batch Management (Production Form)

#### Test Case 2.5.1: Batch ID Auto-Generation
**Steps:**
1. Open production form
2. Set `f-date` = `2026-05-15`
3. Observe `batch-id-display`

**Expected Result:**
- Display shows: "2026/05/15  ·  B1"

**Pass Criteria:**
- [ ] Batch ID format correct
- [ ] Counter starts at 1

---

#### Test Case 2.5.2: Batch Counter Increment
**Steps:**
1. Click "+" button next to Batch ID
2. Observe `batch-id-display`

**Expected Result:**
- Display shows: "2026/05/15  ·  B2"

**Pass Criteria:**
- [ ] Counter increments
- [ ] Submission includes correct batch ID

---

## 3. Weak-Network Simulation (T-020)

### Test Case 3.1: Slow 3G Submission (Production Form)
**Preconditions:**
- Enable DevTools → Network → Throttling → Slow 3G

**Steps:**
1. Fill out complete production form (13 dishes)
2. Submit
3. Observe submission time

**Expected Result:**
- Submission completes within 30 seconds
- Status overlay shows progress (if implemented)
- No timeout errors

**Pass Criteria:**
- [ ] Submission succeeds on Slow 3G
- [ ] No timeout (< 30 seconds)

---

### Test Case 3.2: Slow 3G Photo Upload (Delivery Form)
**Preconditions:**
- Enable Slow 3G throttling
- Upload 2 photos (compressed to < 500KB each)

**Steps:**
1. Submit form
2. Observe upload time

**Expected Result:**
- Photos upload successfully
- Total upload time < 60 seconds for 2 photos

**Pass Criteria:**
- [ ] Photos upload successfully on Slow 3G
- [ ] Upload time acceptable (< 60 seconds total)

---

## 4. Mobile Device Testing

### Test Case 4.1: iOS Safari (Production Form)
**Devices:** iPhone 12+, iOS 15+

**Steps:**
1. Scan QR code or open staging URL
2. Fill form in portrait orientation
3. Rotate to landscape
4. Fill form in landscape
5. Submit

**Expected Result:**
- Form fully functional in both orientations
- No layout issues
- Time pickers work correctly
- Number inputs accept values

**Pass Criteria:**
- [ ] No layout overflow
- [ ] All inputs functional
- [ ] Submission succeeds

---

### Test Case 4.2: Android Chrome (Delivery Form)
**Devices:** Samsung Galaxy A52 or equivalent, Android 11+

**Steps:**
1. Scan QR code
2. Fill form
3. Upload 2 photos using camera (not gallery)
4. Submit

**Expected Result:**
- Camera capture works
- Photo compression works on Android
- Submission succeeds

**Pass Criteria:**
- [ ] Camera capture functional
- [ ] Photos compressed
- [ ] Submission succeeds

---

### Test Case 4.3: Touch Target Size (Both Forms)
**Steps:**
1. Open form on mobile
2. Attempt to tap small inputs (time pickers, number inputs, checkboxes)

**Expected Result:**
- All touch targets ≥ 44×44px (iOS guideline)
- No accidental misclicks

**Pass Criteria:**
- [ ] All inputs easily tappable
- [ ] No UI frustration

---

## 5. End-to-End Smoke Test (T-019)

**Run after every PR merge to staging.**

### Production Form E2E
1. [ ] Scan staging QR code on phone
2. [ ] Form loads within 5 seconds
3. [ ] Fill out complete batch (all fields, 5 dishes with data)
4. [ ] Set cooling time to trigger orange warning (270 min)
5. [ ] Submit form
6. [ ] Verify 5 rows appear in sandbox Google Sheet within 30 seconds
7. [ ] Verify all field data matches submitted data

### Delivery Form E2E
1. [ ] Scan staging QR code with `?store=6542`
2. [ ] Form loads with "Store 6542" header
3. [ ] Fill out delivery info
4. [ ] Upload before + after photos (use 2MB photos)
5. [ ] Fill inventory for 3 dishes
6. [ ] Submit form
7. [ ] Verify 13 rows appear in sandbox Google Sheet (all dishes)
8. [ ] Verify 2 photos appear in sandbox Google Drive folder
9. [ ] Verify photo filenames include store ID and date

---

## 6. User Acceptance Testing (T-021)

**Run with Romano at pilot location before production rollout.**

### Pilot Location Setup
- **Store:** TBD (owner selects)
- **Participants:** Romano, 1 kitchen staff, 1 driver
- **Duration:** 1 full day (production run + 1 delivery)

### UAT Checklist

#### Morning (Production Run)
- [ ] Kitchen staff scans QR code (no assistance)
- [ ] Kitchen staff fills out production form for full batch
- [ ] Kitchen staff understands HACCP color coding
- [ ] Kitchen staff successfully submits form
- [ ] Romano verifies data in Google Sheet

#### Afternoon (Delivery)
- [ ] Driver scans QR code at store
- [ ] Driver fills out delivery form
- [ ] Driver uploads before/after photos
- [ ] Driver fills inventory
- [ ] Driver successfully submits form
- [ ] Romano verifies delivery data + photos

#### Feedback Session
- [ ] Collect feedback from kitchen staff
- [ ] Collect feedback from driver
- [ ] Romano approves for production rollout OR requests changes

---

## Test Execution Log

| Test ID | Test Name | Date | Tester | Result | Notes |
|---|---|---|---|---|---|
| 1.1.1 | Queue on Network Failure | _Pending_ | @browser | _Pending_ | |
| 1.1.2 | Auto-Retry on Reconnect | _Pending_ | @browser | _Pending_ | |
| ... | ... | ... | ... | ... | ... |

---

## Test Results Summary

**Total Test Cases:** 60+ (including all sub-tests)
**Passed:** _Pending_
**Failed:** _Pending_
**Blocked:** _Pending_

**Blockers:**
- _None at this time_

**Known Issues:**
- _To be documented during test execution_

---

## Appendix A: Test Data

### Sample Batch (Production Form)
```
Date: 2026-05-15
Shift: AM (Opening)
Kitchen: Legacy Park
Supervisor: Test Chef
Batch ID: 2026/05/15 · B1
Cook Temp: 165°F
Cook Start: 08:00
Cook End: 10:30
Cool Start: 10:30
Cool End: 14:30
Final Batch Temp: 40°F

Dishes with production:
- General Tso Chicken Bento: 50 produced, 2 discarded (cosmetic)
- Sesame Chicken Bento: 45 produced, 0 discarded
- Bento Chicken Lo Mein: 30 produced, 1 discarded (cooling violation)
```

### Sample Delivery (Delivery Form)
```
Date: 2026-05-15
Driver: Test Driver
Store: 6542 (Carlisle, PA)
Arrival Time: 15:30
Arrival Temp: 39°F
Cooler Temp: 38°F
Cooler Condition: Good

Dishes with inventory:
- General Tso: 10 added, 2 on shelf, 1 removed (expired)
- Sesame Chicken: 8 added, 3 on shelf, 0 removed
- Chicken Lo Mein: 5 added, 1 on shelf, 1 removed (damaged)
```

---

**End of Test Plan**
