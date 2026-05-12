# Taipei Kitchen Live Dashboard

Real-time web dashboard for monitoring production, delivery, and food safety metrics.

## Quick Start

1. **Copy the config example:**
   ```bash
   cp config.local.json.example config.local.json
   ```

2. **Edit config.local.json** and add your Google Apps Script Web App URL:
   ```json
   {
     "webAppUrl": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
   }
   ```

3. **Run local server:**
   ```bash
   python3 -m http.server 8080
   ```

4. **Open dashboard:**
   Visit `http://localhost:8080` in your browser

## Features

- **Overview Panel** (T-051): Today's deliveries, production batches, HACCP violations, waste metrics
- **Daily Reconciliation** (T-053): Produced vs Delivered vs Sold per dish per day
- **Weekly Food Safety Summary** (T-054): Per-store HACCP violations, printable for regulators
- **Filters & Drilldowns** (T-052): Month, driver, store, date range filters with shareable URLs
- **Auto-Refresh** (T-055): Polls Google Sheets every 10 seconds for live updates

## Apps Script Deployment

The dashboard reads data from a Google Apps Script Web App endpoint (T-049: doGet).

1. Open your Google Sheet → Extensions → Apps Script
2. Copy `/apps_script/Code.gs` (includes both doPost and doGet functions)
3. Replace `YOUR_SPREADSHEET_ID` with your sheet ID
4. Deploy → New deployment → Web app
   - Execute as: Me
   - Who has access: Anyone with the link
5. Copy the deployment URL into `dashboard/config.local.json`

## Print Support

The Weekly Food Safety Summary panel includes print-optimized CSS for clean PDF export via browser print (Cmd/Ctrl+P).

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Chart.js 4.4.0 for visualizations (if charts added later)
- Local HTTP server for development
- CORS-enabled Google Apps Script endpoint

## Security

- `config.local.json` is gitignored to prevent Web App URL leakage
- Use `config.local.json.example` as template
