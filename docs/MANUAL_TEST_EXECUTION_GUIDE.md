# Manual Test Execution Guide - P2.4 Email Alerts

**CRITICAL**: This guide must be executed by a human with browser and email access.

---

## ✅ Completed (Automated)

1. ✅ Split deployment configured (.clasp.staging.json + .clasp.production.json)
2. ✅ package.json updated with staging/production scripts
3. ✅ CLAUDE.md and README updated with deployment flow
4. ✅ Code.gs deployed to PRODUCTION (2 files pushed)
5. ✅ Production spreadsheet ID configured: `1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI`

---

## ⚠️ Manual Steps Required (Browser Access Needed)

### Step 1: Initialize Production Sheets

1. **Open production Apps Script editor**:
   ```
   https://script.google.com/home/projects/1WoLDGj8t2u23SXBT2XaZFCUg60hdvy4G2REXxqEPaqHuUudmFoyqJjbU/edit
   ```

2. **Run initializeConfigSheet()**:
   - In Apps Script editor, click **Run** dropdown at top
   - Select `initializeConfigSheet`
   - Click **Run** button
   - If prompted for authorization, click **Review permissions** → Select account → **Allow**
   - Wait for "Execution completed" message

3. **Verify Config sheet created**:
   - Open production sheet: https://docs.google.com/spreadsheets/d/1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI/edit
   - Check for new tab called "Config"
   - Should have 4 rows:
     - Row 1: Headers (Setting | Value | Description)
     - Row 2: violation_alert_emails | (empty) | Comma-separated email addresses
     - Row 3: enable_violation_alerts | true | Enable/disable email alerts
     - Row 4: temp_threshold | 41 | Temperature threshold in °F

4. **Run initializeAlertLogSheet()**:
   - Back in Apps Script editor
   - Click **Run** dropdown → Select `initializeAlertLogSheet`
   - Click **Run** button
   - Wait for "Execution completed"

5. **Verify Alert Log sheet created**:
   - Check production sheet for new tab called "Alert Log"
   - Should have header row with columns:
     - Timestamp | Violation Type | Store ID | Store Name | Temperature | Threshold | Date | Arrival Time | Driver | Received By | Recipients | Status | Error

---

### Step 2: Configure Email Recipient (Production)

**Option A: Via Dashboard** (Recommended)
1. Open https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/
2. Ensure it's pointing to PRODUCTION (check data is live)
3. Click Settings icon (⚙️)
4. Scroll to "HACCP Violation Alerts" section
5. Enter email: `leandertoney@gmail.com`
6. Ensure "Enable violation email alerts" is **checked**
7. Click **💾 Save Alert Settings**
8. Verify success message appears

**Option B: Direct Sheet Edit**
1. Open "Config" tab in production sheet
2. Cell B2: Enter `leandertoney@gmail.com`
3. Cell B3: Ensure value is `true`

---

### Step 3: Execute Test - Cooler Temperature Violation

1. **Open delivery form**:
   - Go to QR code or direct URL for taipei_delivery_form3.html
   - Ensure form is pointing to PRODUCTION Apps Script

2. **Fill out test delivery**:
   - Store: "1 - Turkey Hill - Easton PA" (or any store)
   - Date: Today's date (2026-05-24)
   - Arrival time: Current time
   - Driver: Any driver from dropdown
   - Received by: Any supervisor
   - **Cooler temp: 45** ⬅️ KEY: This is above 41°F threshold
   - Delivery temp: 38 (normal)
   - Fill remaining required fields with test data

3. **Submit form**:
   - Click **Submit** button
   - Wait for "✓ Submitted" confirmation
   - Note the exact submission time

---

### Step 4: Verify Email Delivery (PROOF REQUIRED)

**Check 1: Email Inbox**
1. Open Gmail inbox for `leandertoney@gmail.com`
2. Look for email subject: **⚠️ HACCP Violation Alert: Cooler Temperature - Turkey Hill**
3. **TAKE SCREENSHOT** showing:
   - Email subject line
   - Sender address (FROM field) ⬅️ IMPORTANT
   - Email timestamp
   - Email body with violation details

**Check 2: Alert Log Sheet**
1. Open production sheet "Alert Log" tab
2. Find row with your test submission (match timestamp)
3. **TAKE SCREENSHOT** showing:
   - Full row with all columns visible
   - Status column must show: **SUCCESS**
   - Recipients column: leandertoney@gmail.com
   - Error column: (empty)

**Check 3: Dashboard Violations Queue**
1. Open dashboard Food Safety panel
2. Scroll to "Violations Queue"
3. Verify new violation appears with RED background
4. **TAKE SCREENSHOT** showing violation in queue

---

### Step 5: Report Results

**Required Information**:
1. ✅ Email screenshot showing:
   - Subject line
   - **FROM address** (the Google account that sent the email)
   - Timestamp
   - Body content

2. ✅ Alert Log screenshot showing:
   - Status = SUCCESS
   - Full row with all violation details

3. ✅ Dashboard screenshot showing violation in queue

4. ✅ Answer: What Google account sent the email? (FROM address)

---

## Test Scenarios to Execute

### Scenario A: Cooler Temperature Violation ✅
- Cooler temp > 41°F
- Expected: 1 email for cooler violation

### Scenario B: Delivery Temperature Violation
- Arrival temp > 41°F (e.g., 43°F)
- Expected: 1 email for delivery violation

### Scenario C: BOTH Violations
- Cooler temp > 41°F AND Arrival temp > 41°F
- Expected: 2 emails (one per violation type)

### Scenario D: No Violations
- Both temps ≤ 41°F
- Expected: NO emails sent

---

## Success Criteria

✅ Config sheet exists with 4 rows
✅ Alert Log sheet exists with proper columns
✅ Email received in inbox
✅ Alert Log row shows Status = SUCCESS
✅ Dashboard displays violation
✅ FROM address identified

---

## Troubleshooting

**No email received?**
- Check Config sheet: enable_violation_alerts = true?
- Check spam/junk folder
- Check Alert Log: Status = FAILED? (read Error column)
- Verify MailApp quota not exceeded (100 emails/day limit)

**Alert Log shows FAILED?**
- Check Error column for exception message
- Common: Invalid email format, quota exceeded, authorization issues

**Multiple emails received?**
- Expected if BOTH cooler AND delivery temps > 41°F
- Check Alert Log to see which violations triggered

---

**Execution Date**: _____________
**Tester**: _____________
**Result**: ⬜ PASS ⬜ FAIL
**FROM Address**: _____________
**Notes**:
