# Web App Deployment Guide (T-050)

**Time Required:** 5 minutes
**Prerequisites:** Access to Google Sheet with Apps Script editor

## Step-by-Step Instructions

### 1. Open Apps Script Editor

1. Open your Google Sheet: `TaipeiKitchen_BentoOps_v2`
2. Click **Extensions** → **Apps Script**
3. You'll see a code editor with existing `doPost` function

### 2. Replace Code

1. **Select ALL existing code** (Cmd+A / Ctrl+A)
2. **Delete it**
3. Open `/apps_script/Code.gs` from this repo
4. **Copy ALL code** (494 lines including both doPost and doGet functions)
5. **Paste** into Apps Script editor

### 3. Update Spreadsheet ID

Find these 3 lines and replace `YOUR_SPREADSHEET_ID`:

```javascript
Line 12:  const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
Line 90:  const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
Line 105: const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
```

**To get your Spreadsheet ID:**
- Look at your sheet URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`
- Copy the long ID between `/d/` and `/edit`

### 4. Deploy as Web App

1. Click **Deploy** (top-right) → **New deployment**
2. Click the gear icon ⚙️ next to "Select type"
3. Choose **Web app**
4. Configure settings:
   - **Description:** "Taipei Kitchen Forms + Dashboard API"
   - **Execute as:** **Me** (your email)
   - **Who has access:** **Anyone with the link**
5. Click **Deploy**
6. **IMPORTANT:** Click **Authorize access** when prompted
   - Review permissions
   - Click **Allow**

### 5. Copy Web App URL

After deployment, you'll see:
```
Web app URL: https://script.google.com/macros/s/AKfycby.../exec
```

**Copy this entire URL**

### 6. Configure Dashboard

1. Open `/dashboard/config.local.json` (or create it from `config.local.json.example`)
2. Paste your Web App URL:

```json
{
  "webAppUrl": "https://script.google.com/macros/s/AKfycby.../exec"
}
```

3. Save the file

### 7. Test Dashboard

1. Run: `python3 -m http.server 8080 --directory /path/to/taipei-kitchen-forms/dashboard`
2. Open: http://localhost:8080
3. Status indicator should turn **green** within 10 seconds
4. Metrics should populate with live data

## Troubleshooting

**"Authorization required"**
- You must click "Allow" when Apps Script asks for permissions
- It needs access to read/write your spreadsheet

**"Fetch failed" in dashboard**
- Check that Web App URL in config.local.json is correct
- Verify Web App is deployed with "Anyone with the link" access
- Try accessing the URL directly in browser - should return JSON

**"Sheet not found" error**
- Double-check SPREADSHEET_ID is correct
- Verify sheet tabs are named exactly: "Delivery Log - Live" and "Production Log - Live"

**Still stuck?**
- Run the `testConnection()` function in Apps Script editor
- Check Execution log for error messages

## What This Enables

Once deployed, the dashboard will:
- ✅ Fetch data from Google Sheets every 10 seconds
- ✅ Display real-time metrics (deliveries, production, violations)
- ✅ Enable all 4 dashboard panels
- ✅ Support filters and reconciliation views
