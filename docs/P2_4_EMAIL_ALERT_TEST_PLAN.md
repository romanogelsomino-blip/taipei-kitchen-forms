# P2.4 Email Alert System - End-to-End Test Plan

**Staging Sheet**: `TaipeiKitchen_BentoOps_v2_STAGING`
**Sheet ID**: `1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E`
**Apps Script ID**: `1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP`

---

## Prerequisites

✅ Code.gs deployed to staging (as of 2026-05-24)
✅ All spreadsheet IDs configured for staging
✅ Clasp push successful (2 files deployed)

---

## Test Steps

### Step 1: Initialize Config Sheet

1. Open staging sheet: https://docs.google.com/spreadsheets/d/1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E/edit
2. Go to Extensions → Apps Script
3. In Apps Script editor, click **Run** dropdown → Select `initializeConfigSheet`
4. **Authorize** the script when prompted (first-time only)
5. Verify "Config" tab appears with:
   - Header row: Setting | Value | Description
   - Row 2: `violation_alert_emails` | (empty) | Comma-separated email addresses
   - Row 3: `enable_violation_alerts` | `true` | Enable/disable email alerts
   - Row 4: `temp_threshold` | `41` | Temperature threshold in °F

### Step 2: Initialize Alert Log Sheet

1. In Apps Script editor, click **Run** dropdown → Select `initializeAlertLogSheet`
2. Verify "Alert Log" tab appears with columns:
   - Timestamp | Violation Type | Store ID | Store Name | Temperature | Threshold | Date | Arrival Time | Driver | Received By | Recipients | Status | Error

### Step 3: Configure Email Recipients

**Option A: Via Dashboard Settings Panel**
1. Open dashboard (localhost or gh-pages)
2. Click Settings icon (⚙️)
3. Scroll to "HACCP Violation Alerts"
4. Enter test email addresses (one per line):
   ```
   leandertoney@gmail.com
   ```
5. Ensure "Enable violation email alerts" is **checked**
6. Click "💾 Save Alert Settings"
7. Verify success message appears
8. Check staging sheet "Config" tab:
   - Row 2 Value column should contain: `leandertoney@gmail.com`
   - Row 3 Value column should be: `true`

**Option B: Manual Entry in Sheet**
1. Open "Config" tab in staging sheet
2. Cell B2: Enter `leandertoney@gmail.com`
3. Cell B3: Ensure value is `true`

### Step 4: Submit Test Violation

**Scenario: Delivery with HIGH cooler temperature**

1. Open delivery form (staging URL or production form pointed at staging)
2. Fill out form:
   - Store: Any store (e.g., "1 - Turkey Hill - Easton PA")
   - Date: Today's date
   - Arrival time: Current time
   - Driver: Any driver
   - Received by: Any supervisor
   - Cooler temp: **45** (above 41°F threshold)
   - Delivery temp: 38 (normal)
   - Other fields: Fill as needed
3. Click **Submit**
4. Wait for "✓ Submitted" confirmation

### Step 5: Verify Email Was Sent

**Check 1: Email Inbox**
1. Open email inbox for `leandertoney@gmail.com`
2. Look for email with subject: `⚠️ HACCP Violation Alert: Cooler Temperature - [Store Name]`
3. Verify email body contains:
   - Store name, ID, date, arrival time
   - Cooler temp: 45°F (threshold: 41°F)
   - Driver and received by names
   - Timestamp of submission

**Check 2: Alert Log Sheet**
1. Open "Alert Log" tab in staging sheet
2. Verify new row with:
   - Timestamp: Current datetime
   - Violation Type: "Cooler Temperature"
   - Temperature: 45
   - Threshold: 41
   - Recipients: `leandertoney@gmail.com`
   - Status: `SUCCESS`
   - Error: (empty)

**Check 3: Dashboard Violations Queue**
1. Open dashboard
2. Click "Food Safety" nav item
3. Scroll to "Violations Queue"
4. Verify new violation appears with RED background
5. Click "View Details" to see full drill-down

---

## Test Scenarios

### Scenario A: Cooler Temperature Violation ✅
- Cooler temp > 41°F
- Expected: 1 email sent for cooler violation

### Scenario B: Delivery Temperature Violation
- Arrival temp > 41°F
- Expected: 1 email sent for delivery violation

### Scenario C: BOTH Violations
- Cooler temp > 41°F AND Arrival temp > 41°F
- Expected: 2 emails sent (one per violation type)

### Scenario D: No Violations
- Both temps ≤ 41°F
- Expected: NO emails sent

### Scenario E: Alerts Disabled
- Config sheet row 3: `false`
- Submit violation
- Expected: NO emails sent, but violation still logged to Alert Log with Status = "SKIPPED (alerts disabled)"

---

## Success Criteria

✅ **Config sheet** created with correct structure
✅ **Alert Log sheet** created with correct columns
✅ **Email received** for cooler temp violation
✅ **Alert Log** shows SUCCESS status
✅ **Dashboard** displays violation in queue
✅ **Status flow** works (email → log → dashboard)

---

## Troubleshooting

### No Email Received
1. Check Config sheet: `enable_violation_alerts` = `true`?
2. Check Config sheet: Email address valid?
3. Check Alert Log: Status = SUCCESS or FAILED?
4. If FAILED: Check Error column for details
5. Check spam/junk folder
6. Verify MailApp.sendEmail() is allowed for your Google account

### Email Sent Multiple Times
- This is expected if both cooler AND delivery temps exceed threshold
- Check Alert Log to see which violation types triggered

### Alert Log Shows FAILED
- Check Error column for exception message
- Common issues:
  - Invalid email address format
  - MailApp quota exceeded (100 emails/day for free accounts)
  - Script authorization revoked

---

## Next Steps After Testing

1. If staging test passes → Deploy to production
2. Update `.clasp.json` to production script ID
3. Re-run `npm run deploy` for production
4. Repeat test on production sheet
5. Notify Romano that P2.4 is complete

---

**Test Date**: [TO BE FILLED]
**Tester**: [TO BE FILLED]
**Result**: ⬜ PASS ⬜ FAIL
**Notes**:
