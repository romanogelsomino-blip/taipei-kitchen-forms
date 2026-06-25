# Daily Operations Handoff Guide

This guide covers the day-to-day operations of the Taipei Kitchen bento delivery system after initial setup is complete.

---

## Daily Operations Checklist

### Morning Routine (Before Deliveries)

1. **Check Dashboard Status**
   - Open http://localhost:8080 (or your deployed dashboard URL)
   - Verify status indicator is **green** (connected to Google Sheets)
   - If red, see Troubleshooting section below

2. **Review Yesterday's Data**
   - Go to **Daily Reconciliation** panel
   - Look for red cells (inventory loss: produced > delivered)
   - Flag any discrepancies to Romano for follow-up

3. **Check Food Safety Summary**
   - Go to **Weekly Food-Safety Summary** panel
   - Review any HACCP violations from previous day
   - If violations exist:
     - Verify corrective actions were logged
     - Check recovery temps meet FDA standards (≤41°F)
     - Print summary for records (browser Print → Save as PDF)

### During Operations (Live Monitoring)

4. **Monitor Incoming Submissions**
   - Dashboard auto-refreshes every 10 seconds
   - Watch the **Recent Submissions** feed in Overview panel
   - Toast notifications appear when new data arrives

5. **Watch for Violations**
   - **HACCP Violations Today** tile shows count
   - Click tile to drill down to specific incidents
   - If count increases:
     - Verify driver completed recovery protocol
     - Check that supervisor was notified
     - Confirm product was either recovered or discarded

6. **Production Tracking**
   - **Production Today** tile shows batches logged
   - Cross-reference with delivery schedule
   - If production is behind, notify kitchen supervisor

### Evening Routine (After Deliveries)

7. **Run Daily Reconciliation**
   - Go to **Daily Reconciliation** panel
   - Export to CSV (copy table, paste in Excel/Sheets)
   - Email summary to Romano if requested

8. **Review Top Stores**
   - Check **Top 5 Stores by Volume** (Overview panel)
   - Note any store with zero deliveries (possible missed route)
   - Follow up with driver if needed

9. **Check for Offline Queue**
   - If drivers had network issues during the day:
     - Forms auto-retry queued submissions every 30 seconds
     - Check Recent Submissions feed for late arrivals
     - Submissions will appear with original timestamps (locked at entry time)

---

## Sharing Photos with Giant Corporate

Giant Food Stores corporate requires periodic access to delivery photos (quality audits, compliance checks). Here's how to share via Microsoft Teams-compatible links.

### One-Time Setup (If Not Already Done)

1. **Organize Photos by Store**
   - Photos are stored in Google Drive: `[Taipei Kitchen Photos]` folder
   - Structure: `/Store-6006/2026/05/08/delivery-timestamp.jpg`
   - Example: `/Store-6006/2026/05/08/2026-05-08T14-32-19.jpg`

2. **Set Folder Permissions**
   - Right-click on `Taipei Kitchen Photos` folder in Drive
   - Click **Share**
   - Add Giant corporate contact: `[insert email here]`
   - Permission: **Viewer** (not Editor)
   - Uncheck "Notify people" if this is a standing permission
   - Click **Done**

### Sharing a Specific Store's Photos

**Scenario:** Giant corporate requests photos from Store 6112 for week of May 1–7, 2026.

1. **Navigate in Google Drive**
   - Open Google Drive
   - Go to: `Taipei Kitchen Photos` → `Store-6112` → `2026` → `05`
   - You'll see folders `01`, `02`, `03`, ..., `07`

2. **Select the Date Range**
   - Hold **Shift** and click folders `01` through `07` to select the week
   - Or select individual days: Ctrl/Cmd+click on `01`, `03`, `05`

3. **Get Shareable Link**
   - Right-click on selected folder(s) → **Get link**
   - Ensure link is set to: **Anyone with the link can view**
   - Click **Copy link**

4. **Share via Microsoft Teams**
   - Open Microsoft Teams
   - Go to the Giant corporate channel
   - Paste the link in a message:
     ```
     Here are the delivery photos for Store 6112, May 1-7, 2026:
     https://drive.google.com/drive/folders/FOLDER_ID_HERE

     Photos are organized by date (MM/DD). Each photo is timestamped with the actual delivery time.
     ```
   - Send

5. **Alternative: Email Link**
   - If Teams is unavailable, send link via email
   - Subject: `Delivery Photos — Store 6112 — May 1-7, 2026`
   - Body: Include link + brief context

### Sharing All Stores for a Date

**Scenario:** Corporate requests all delivery photos from May 8, 2026 (across all stores).

1. **Use Filters Panel in Dashboard**
   - Go to dashboard → **Filters** panel
   - Set Date: `2026-05-08`
   - Deliveries will filter to that day
   - Each row shows a **Photo Link** column

2. **Export Delivery Log for That Day**
   - Open Google Sheet: `TaipeiKitchen_BentoOps_v2`
   - Go to **Delivery Log - Live** tab
   - Filter Column B (Date) = `2026-05-08`
   - Select rows → right-click → **Copy**
   - Paste into new Google Sheet
   - Share that sheet with Giant corporate (Viewer access)
   - Photo links are in columns S (Before Photo URL) and T (After Photo URL)
   - Note: Columns Q and R contain Store Notes and Received By (not photos)

3. **Bulk Download (If Corporate Needs Files)**
   - Go to Google Drive: `Taipei Kitchen Photos`
   - Navigate to each store's `/2026/05/08/` folder
   - Select all photos (Ctrl/Cmd+A)
   - Right-click → **Download**
   - Drive will create a ZIP file
   - Send ZIP via email or upload to shared Teams folder

---

## Weekly Tasks

### Every Monday Morning

1. **Print Weekly Food-Safety Summary**
   - Go to dashboard → **Weekly Food-Safety Summary** panel
   - Filter to previous week (use date range in Filters panel)
   - Click browser **Print** (Cmd/Ctrl+P)
   - Save as PDF: `Food_Safety_Summary_YYYY-MM-DD_to_YYYY-MM-DD.pdf`
   - Store in compliance folder or email to Romano

2. **Archive Old Photos (Optional)**
   - If Drive storage is approaching limit:
   - Download photos older than 90 days
   - Store in local backup or AWS S3
   - Delete from Drive after confirming backup integrity

### First Monday of Each Month

3. **Review Waste Trends**
   - Go to **Daily Reconciliation** panel
   - Filter to previous month (use Month picker in Filters)
   - Export waste data:
     - By Store: Check which stores have highest discard rates
     - By Dish: Check which dishes expire most often
   - Share trends with Romano for recipe/batch-size adjustments

4. **Check Store Coverage**
   - In Filters panel, filter by each store (6006, 6061, 6253, 6331, 6443, 6542, 6564)
   - Verify each store has deliveries in the past 30 days
   - If a store has zero deliveries, confirm with Romano whether they:
     - Paused bento program temporarily
     - Ended partnership (update `data/stores.json` → `active: false`)

---

## Troubleshooting

### Dashboard Not Loading (Red Status Indicator)

**Symptoms:** Dashboard shows "Connecting..." or "Connection failed" in red.

**Causes & Fixes:**

1. **Web App URL Not Configured**
   - Open `dashboard/config.local.json`
   - Verify `webAppUrl` is set to your deployed Apps Script URL:
     ```json
     {
       "webAppUrl": "https://script.google.com/macros/s/AKfycby.../exec"
     }
     ```
   - If set to `"DEMO_MODE"`, follow `/dashboard/DEPLOYMENT_GUIDE.md` to deploy Web App

2. **Web App Not Deployed**
   - Open Google Sheet → **Extensions** → **Apps Script**
   - Check if a deployment exists: **Deploy** → **Manage deployments**
   - If none exist, follow `/dashboard/DEPLOYMENT_GUIDE.md`

3. **CORS or Permission Error**
   - Web App must be deployed with:
     - **Execute as:** Me (your email)
     - **Who has access:** Anyone with the link
   - Re-deploy with correct settings (see DEPLOYMENT_GUIDE.md)

4. **Spreadsheet ID Mismatch**
   - Open `apps_script/Code.gs` in Apps Script editor
   - Verify `SPREADSHEET_ID` on lines 12, 90, 105 matches your sheet's ID
   - Get correct ID from sheet URL: `/d/SPREADSHEET_ID_HERE/edit`
   - If wrong, update all 3 lines, save, re-deploy

### Form Submission Failed

**Symptoms:** Driver submits form, sees error "Submission failed. Your data has been saved and will retry automatically."

**Causes & Fixes:**

1. **Offline / Weak Network**
   - **This is normal behavior.** Form queues submission to localStorage
   - Auto-retry runs every 30 seconds
   - When driver reconnects, submission will go through
   - Check dashboard Recent Submissions feed after 1-2 minutes

2. **Apps Script Down**
   - Test Web App URL directly in browser:
     ```
     https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
     ```
   - Should return JSON: `{"deliveries": [...], "production": [...], ...}`
   - If error page, re-deploy Web App (see DEPLOYMENT_GUIDE.md)

3. **Google Sheets Quota Exceeded**
   - Apps Script has daily quota: 20,000 URL fetches/day
   - If exceeded, submissions will fail until quota resets (midnight Pacific Time)
   - **Workaround:** Increase polling interval in `dashboard/app.js`:
     - Change `const POLL_INTERVAL_MS = 10000;` to `30000` (30 seconds)
   - **Long-term fix:** Migrate to Google Apps Script v8 runtime (caching layer)

### QR Code Scans But Wrong Store Appears

**Symptoms:** Driver scans QR code for Store 6112, but form shows "Store 6006" in dropdown.

**Causes & Fixes:**

1. **QR Code URL Is Wrong**
   - QR code must encode: `https://YOUR_DOMAIN/taipei_delivery_form3.html?store=6112`
   - Note the `?store=6112` parameter
   - Regenerate QR code with correct URL (see `/docs/ADD_A_STORE.md`)

2. **Store Not in stores.json**
   - Open `data/stores.json`
   - Verify store exists with `"id": "6112"` and `"active": true`
   - If missing, add store (see ADD_A_STORE.md), commit, deploy

3. **Browser Cache**
   - Clear browser cache: Cmd/Ctrl+Shift+R (hard refresh)
   - Or wait 1 hour (forms cache `stores.json` for 60 minutes)
   - Or manually clear: Browser DevTools → Application → Local Storage → delete `tk_stores_cache`

### Photos Not Appearing in Google Drive

**Symptoms:** Delivery form submitted successfully, but Photo Link columns (S and T) in sheet are blank.

**Current Status (RESOLVED as of June 25, 2026):** Photo upload pipeline is now fully implemented with automatic URL write-back to columns S (Before Photo URL) and T (After Photo URL).

**Verification Steps:**
1. Check columns S and T in Delivery Log - Live (NOT columns Q/R which contain Notes and Received By)
2. Check Apps Script execution logs for `[PHOTO UPLOAD] SUCCESS` or `[PHOTO UPLOAD] ORPHAN` entries
3. Verify Drive folder "Taipei Kitchen Photos" contains photos with correct naming: `{storeId}_{date}_before.jpg`
4. If URLs missing: photos may be orphaned (no matching delivery row) - check execution logs for details

**Workaround (If Needed):**
1. Ask driver to text/email photos separately
2. Upload manually to Drive folder
3. Paste Drive link into columns S (Before Photo) and T (After Photo)
   - Note: Columns Q and R are reserved for Store Notes and Received By

### Duplicate Rows in Production Log

**Symptoms:** Same batch appears twice with identical timestamps.

**Causes & Fixes:**

1. **Double-Submit by User**
   - Supervisor tapped Submit twice (slow network delay)
   - **Fix:** T-046 (disable Submit button after first tap) prevents this
   - **Cleanup:** Run T-028 production-log dedupe on staging sheet, then promote to live

2. **Offline Queue Retry**
   - Submission succeeded on first try, but supervisor's phone didn't receive confirmation
   - Form retried from offline queue, creating duplicate
   - **Fix:** T-007 offline queue includes idempotency check (coming in v1)

### HACCP Violation Showing in Dashboard, But Recovery Temp Looks OK

**Symptoms:** Violation tile shows count = 1, but logged recovery temp is 38°F (safe).

**Causes & Fixes:**

1. **Transit Temp Triggered Violation**
   - Violation flag trips if ANY check-in temp > 41°F during transit
   - Recovery temp (38°F) is what driver measured AFTER corrective action
   - **This is correct behavior** — violation stays flagged even if recovered
   - **Action Required:** Print Food Safety Summary for records, file with compliance docs

2. **Cooler Temp at Store Was High**
   - Even if transit was safe, arrival cooler temp at store > 41°F triggers violation
   - Check column G (Cooler Temp °F) in Delivery Log
   - **Action Required:** Notify store manager to service cooler

3. **Time Above Safe Temp Exceeds 2 Hours**
   - FDA Food Code allows 2-hour window for temp recovery
   - If column AR (Time Above Safe Temp) > 120 minutes, product must be discarded
   - Verify column AK (Discard QTY) reflects this

---

## Contact Information

**For technical issues with forms or dashboard:**
- Check this guide first
- Check `/dashboard/DEPLOYMENT_GUIDE.md` for Web App setup
- Check `/docs/ADD_A_STORE.md` for store onboarding

**For operational/compliance questions:**
- Contact Romano (client) for bento program policies
- Contact Giant Food Stores store managers for store-specific issues

**For data access or sharing permissions:**
- Google Sheet: `TaipeiKitchen_BentoOps_v2` (owner: leandertoney@gmail.com)
- Google Drive: `Taipei Kitchen Photos` (owner: leandertoney@gmail.com)

---

## Quick Reference: Dashboard Panels

| Panel | Purpose | What to Monitor |
|---|---|---|
| **Overview** | At-a-glance metrics | Deliveries today, HACCP violations, top stores |
| **Reconciliation** | Inventory tracking | Red cells = produced > delivered (loss) |
| **Food Safety** | Compliance reporting | Violations, corrective actions, recovery temps |
| **Filters** | Drill-down views | By driver, store, date range, month |

---

## Appendix: Forms URLs

**Production Form:**
```
https://YOUR_GITHUB_USERNAME.github.io/taipei-kitchen-forms/taipei_production_form3.html
```

**Delivery Form (with store pre-selected):**
```
https://YOUR_GITHUB_USERNAME.github.io/taipei-kitchen-forms/taipei_delivery_form3.html?store=STORE_ID
```
Replace `STORE_ID` with: 6006, 6061, 6253, 6331, 6443, 6542, or 6564.

**Dashboard (local):**
```
http://localhost:8080
```

**Dashboard (deployed):**
*(Update this section after deploying dashboard to GitHub Pages or other hosting)*
```
https://YOUR_GITHUB_USERNAME.github.io/taipei-kitchen-forms/dashboard/
```

---

## Appendix: Store List

| Store ID | Location | QR Code File |
|---|---|---|
| 6006 | Lancaster, PA | `qr-codes/store-6006.png` |
| 6061 | York, PA | `qr-codes/store-6061.png` |
| 6253 | Harrisburg, PA | `qr-codes/store-6253.png` |
| 6331 | Camp Hill, PA | `qr-codes/store-6331.png` |
| 6443 | Mechanicsburg, PA | `qr-codes/store-6443.png` |
| 6542 | Carlisle, PA | `qr-codes/store-6542.png` |
| 6564 | Hershey, PA | `qr-codes/store-6564.png` |

*(Update locations from actual `data/stores.json` if different)*

---

## Appendix: Offline Queue Behavior

**How it works:**
1. Driver submits form on delivery route
2. If network is unavailable, form saves submission to browser localStorage
3. Key format: `tk_queue_1683820392845` (timestamp)
4. Auto-retry runs every 30 seconds
5. On success, submission is removed from queue
6. On continued failure, stays in queue until network restored

**Driver Instructions:**
- "If you see 'Submission saved, will retry automatically', no action needed"
- "Keep your browser tab open until you have network"
- "Check back in 5 minutes — submission should go through"

**Data Integrity:**
- Timestamp is locked at moment driver tapped Submit (not when retry succeeds)
- Regulatory compliance maintained even with delayed submission
- No data loss as long as browser tab stays open and localStorage is not cleared

---

## Document History

| Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-05-08 | Initial handoff guide for v1 launch |
