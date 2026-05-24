# Taipei Kitchen Forms

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant supermarkets across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA / FSIS food safety compliance as the program grows.

---

## What's Here

| Component                          | What it does                                                 |
|------------------------------------|--------------------------------------------------------------|
| `taipei_production_form3.html`     | Kitchen form. Logs each batch — cook times, cooling, dish counts, quality notes. |
| `taipei_delivery_form3.html`       | Driver form. Logs each store delivery — temps, photos, what was loaded, what was left, case fill levels. |
| `dashboard/`                       | Live web dashboard showing real-time metrics, deliveries, production, waste analysis, and HACCP compliance. |
| `Code.gs`                          | Google Apps Script that handles form submissions and serves dashboard API. |
| `data/`                            | JSON files for drivers, supervisors, stores, and dishes — loaded dynamically by forms. |

All forms are simple web pages, hosted on GitHub Pages, opened by phone via QR codes posted at each location.

**Live Dashboard:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

---

## How It Works

### Forms
1. An employee scans the QR code at their location.
2. The form opens on their phone.
3. They fill it out with dropdowns for drivers, supervisors, stores, and standard options.
4. Photos are compressed client-side before upload (target: <500KB).
5. If offline, submissions queue in localStorage and retry when connection returns.
6. The information lands in the master Google Sheet (`TaipeiKitchen_BentoOps_v2`).
7. Delivery photos land in a Google Drive folder.

### Dashboard
1. Google Apps Script `doGet` endpoint serves JSON data from the sheet.
2. Dashboard polls the API every 10 seconds for updates.
3. Real-time metrics display: deliveries today, production batches, HACCP violations, waste.
4. Interactive filters by date range, driver, store, dish.
5. Waste analysis with charts showing patterns by store and reason.
6. Weekly food safety summary suitable for regulator/corporate review.

---

## Stores Currently Served

| Store ID | Location                       |
|----------|--------------------------------|
| 6006     | Kline Village, Harrisburg, PA  |
| 6061     | Shippensburg, PA               |
| 6253     | New Cumberland, PA             |
| 6331     | Mechanicsburg, PA              |
| 6443     | Chambersburg, PA               |
| 6542     | Carlisle, PA                   |
| 6564     | Harrisburg (Grayson Rd), PA    |

To add a new store, see [`docs/ADD_A_STORE.md`](docs/ADD_A_STORE.md).

---

## Food Safety Rules Built In

The forms automatically flag anything outside HACCP cooling rules:

- Hot food must cool from 135°F to 70°F within 2 hours
- Then from 70°F to 41°F within 4 more hours
- Final batch temperature must be 41°F or below before packaging
- Any delivery temperature above 41°F gets flagged on submission
- Cooler temperature above 41°F triggers a violation alert

Dashboard highlights all violations in red with corrective action notes.

---

## Recent Improvements

**✅ v2.1 (2026-05-24):**
- **Programmatic Web App Deployment** — Fully automated deployment via Apps Script API (no browser GUI required)
- **Admin Token Authentication** — UUID-based token auth for protected automation endpoints
- **Violation Email Alerts** — Automatic HACCP cooler temp violation notifications with Alert Log tracking
- **Bulletproof Boolean Handling** — Normalized config value handling (true/TRUE/1/yes all work)
- **Token Rotation** — Secure token regeneration and rotation endpoints (force and authenticated modes)
- **Config Reset Automation** — `npm run config:reset:staging/production` to wipe and reinitialize Config sheet
- Multi-select filters for stores and days-of-week on dashboard
- Case fullness analytics with trend visualizations
- HACCP drill-down with detailed violation history

**✅ Earlier (v2.0):**
- Offline-first form behavior with localStorage queue
- Client-side image compression (<500KB target)
- Locked submission timestamps (regulatory requirement)
- Driver, supervisor, and store dropdowns (eliminates data quality issues)
- Expire reason dropdown with standardized options
- Case fill-level tracking on delivery form (0-25%, 25-50%, 50-75%, 75-100%)
- QA Result defaults to "Pass" (forces conscious Fail action)
- Live web dashboard with 10-second auto-refresh
- Real-time metrics, charts, and HACCP compliance monitoring
- Waste analysis by store and reason with trend visualizations

---

## Project Documentation

- **[SCOPE.md](docs/SCOPE.md)** — Original proposal scope (verbatim from UAS-2026-001)
- **[HANDOFF.md](docs/HANDOFF.md)** — Daily operations guide and deployment procedures
- **[ADD_A_STORE.md](docs/ADD_A_STORE.md)** — How to onboard a new Giant location
- **[FRICTION_AUDIT.md](docs/FRICTION_AUDIT.md)** — Data quality issues and UX improvements
- **[COORDINATION.md](COORDINATION.md)** — Task board and agent collaboration protocol

---

## Deployment

### Forms
Forms are served via GitHub Pages from the `main` branch:
- **Production form:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_production_form3.html
- **Delivery form:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_delivery_form3.html

To deploy changes:
1. Edit the HTML files locally
2. Test on a local server: `python3 -m http.server 8080`
3. Commit and push to `main` branch
4. GitHub Pages auto-deploys within 1-2 minutes

### Dashboard
Dashboard files live in `/dashboard/` and deploy automatically with forms.

To update the dashboard:
1. Edit files in `dashboard/` directory
2. Test locally: `cd dashboard && python3 -m http.server 8080`
3. Commit and push to `main` branch
4. Dashboard updates at https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

### Apps Script
The backend (`Code.gs`) runs as a Google Apps Script attached to both staging and production sheets.

**Deployment is fully automated** — no browser GUI required. Web App deployments are created programmatically via Apps Script API.

#### Programmatic Web App Deployment (NO MANUAL STEPS)
```bash
# Create Web App deployment via Apps Script API (automatic)
bash scripts/create-webapp-deployment.sh staging
bash scripts/create-webapp-deployment.sh production

# What happens:
# 1. Creates a new version via Apps Script API
# 2. Creates deployment with webapp config from appsscript.json
# 3. Returns deployment URL
# 4. Script output shows: Update .env.staging with WEB_APP_URL=...

# IMPORTANT: This creates a NEW deployment URL
# Update .env.staging or .env.production immediately
```

#### Admin Token Authentication
All automation endpoints are protected by UUID tokens stored in Script Properties.

```bash
# Generate initial token (first time only)
curl -sL "${WEB_APP_URL}?action=setupAdminToken"
# Save the returned token to .env.staging or .env.production

# Force regenerate token (invalidates old one)
curl -sL "${WEB_APP_URL}?action=setupAdminToken&force=true"

# Rotate token (requires current valid token)
source .env.staging && curl -sL "${WEB_APP_URL}?action=rotateAdminToken&token=${ADMIN_TOKEN}"
```

Tokens are stored in `.env.staging` and `.env.production` (gitignored) and used by all npm scripts for authentication.

#### Automated Workflow (Staging → Production)
```bash
# 1. Deploy code to staging
npm run deploy

# 2. Create Web App deployment (if needed)
bash scripts/create-webapp-deployment.sh staging

# 3. Initialize staging sheets (first time only)
npm run init:staging

# 4. Test email alerts on staging
npm run test:violation:staging

# 5. Verify email received at leandertoney@gmail.com
# Check email inbox + Alert Log sheet for SUCCESS status

# 6. Deploy to production (only after staging tests pass)
npm run deploy:production

# 7. Create Web App deployment for production
bash scripts/create-webapp-deployment.sh production

# 8. Initialize production sheets (first time only)
npm run init:production

# 9. Test email alerts on production
npm run test:violation:production
```

#### Available Commands
```bash
# Deployment
npm run deploy                      # Deploy to staging (default)
npm run deploy:staging              # Deploy to staging (explicit)
npm run deploy:production           # Deploy to production

# Initialization (first time setup)
npm run init:staging                # Create Config & Alert Log sheets
npm run init:production             # Create Config & Alert Log sheets

# Testing
npm run test:violation:staging      # Simulate HACCP violation alert
npm run test:violation:production   # Simulate HACCP violation alert

# Utilities
npm run open:staging                # Open staging script in browser
npm run open:production             # Open production script in browser
```

**Note**: All Apps Script functions are automated via `clasp run` — no GUI clicking required. Always test on staging before production.

---

## QR Code System

Each location has a QR code that opens the appropriate form:

**Production Form QR:**
```
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_production_form3.html
```

**Delivery Form QR (per store):**
```
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_delivery_form3.html?store=6542
```

The `?store=` parameter pre-fills the store selection.

Generate new QR codes at: https://www.qr-code-generator.com/

---

## For the Owner

- **Master spreadsheet:** `TaipeiKitchen_BentoOps_v2` in Google Sheets (ID: 1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI)
- **Photo repository:** Google Drive (shareable via link)
- **Live dashboard:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/
- **Staging sheet:** `TaipeiKitchen_BentoOps_v2_STAGING` (ID: 1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E)

All changes to the live forms should be tested on the staging sheet first.

---

## Contact

**Owner:** Romano Gelsomino — Taipei Kitchen
**Developer:** Universole App Studios
**Repository:** https://github.com/romanogelsomino-blip/taipei-kitchen-forms
