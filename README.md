# Taipei Kitchen Forms

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant supermarkets across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA / FSIS food safety compliance as the program grows.

---

## What's Here

| Path | What it does |
|---|---|
| `frontend/taipei_production_form3.html` | Kitchen form. Logs each batch — cook times, cooling, dish counts, quality notes. |
| `frontend/taipei_delivery_form3.html` | Driver form. Logs each store delivery — temps, photos, what was loaded, what was left, case fill levels. |
| `frontend/dashboard/` | Live web dashboard — metrics, deliveries, production, waste analysis, HACCP compliance. |
| `frontend/assets/` | Branding used by the forms. |
| `backend/Code.gs` | Google Apps Script handling form submissions and serving the dashboard API. |
| `data/` | JSON for drivers, supervisors, stores, and dishes — fetched at form load. |
| `deployment/` | Deployment guide — start here for how either half reaches production. |
| `scripts/` | Admin-endpoint helpers, driven by `.env.{staging,production}`. |

All forms are simple web pages, hosted on GitHub Pages, opened by phone via QR codes posted at each location.

**`frontend/` and `data/` publish to the site root**, so the served URLs contain no
`frontend/` segment. The QR codes depend on that — see [CLAUDE.md](CLAUDE.md).

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

To add a store: add it to `data/stores.json`, mirror the entry into the hardcoded fallback
in `frontend/taipei_delivery_form3.html`, and release. The store list is also duplicated in
`backend/Code.gs` (violation-alert names and the dashboard store filter) — those need a
backend deploy to pick up a new store. QR codes point at
`taipei_delivery_form3.html?store=<id>`.

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

- **[CLAUDE.md](CLAUDE.md)** — Deployment steps for both halves of the stack, and the two
  failure modes that have each caused a multi-day outage

---

## Configuration

### `.env` is the source of truth

A single gitignored `.env` at the repo root holds **every** configuration value for **both**
environments. Nothing else is authoritative — everywhere else these values appear, they are
copies that have to be kept in step with this file.

```
CLASPRC_JSON                   clasp OAuth credentials, shared by both environments
PROD_ADMIN_TOKEN               STAGING_ADMIN_TOKEN
PROD_DEPLOYMENT_ID             STAGING_DEPLOYMENT_ID
PROD_PHOTO_FOLDER_ID           STAGING_PHOTO_FOLDER_ID
PROD_SCRIPT_ID                 STAGING_SCRIPT_ID
PROD_SPREADSHEET_FOLDER_ID     STAGING_SPREADSHEET_FOLDER_ID
PROD_SPREADSHEET_ID            STAGING_SPREADSHEET_ID
PROD_WEB_APP_URL               STAGING_WEB_APP_URL
```

Trailing `# comments` are stripped by the parsers on whitespace-then-hash, so a literal `#`
inside a value survives. **Do not paste the comment when copying a value into GitHub** — the
value is everything before the ` #`.

### Why the prefixes

The conventional pattern is one file per environment — `.env.staging`, `.env.production` —
with unprefixed keys, where the *filename* selects the environment. This repo used to do
that. Two things forced the change:

**GitHub secrets are flat.** There is one namespace per repository, so the environment has
to be in the key name. And the deploy workflow genuinely needs both environments in scope in
a single run: it publishes `prod` at the site root and `dev` under `/staging/`, rewriting the
staging copy's endpoint as it goes. A per-environment file cannot express that.

**GitHub secrets are write-only.** Once set, no one — not the UI, not the API, not `gh` — can
read a value back. If this file did not mirror them exactly, the only readable copy of the
configuration would be gone, and a successor would have to rediscover every identifier. That
is precisely the situation this project was left in by the previous handover.

So `.env` mirrors the GitHub secret names one-for-one. The cost is that both environments are
in scope at once locally, where the two-file model made that impossible. Worth knowing when
writing an ad-hoc script.

### Where the values go

`.env` is not read at runtime by anything in production. It is the reference copy that four
downstream stores are populated *from*:

| Destination | Which values | How they get there |
|---|---|---|
| **GitHub Actions secrets** | all 15 | pasted by hand, one per key, same names |
| **Apps Script Script Properties** | `SPREADSHEET_ID`, `PHOTO_FOLDER_ID`, `ADMIN_TOKEN` (unprefixed, per project) | set by hand in Project Settings today; the intent is for the deploy workflow to reconcile them via `?action=setScriptProperty` so they cannot drift |
| **The published frontend** | `WEB_APP_URL` | the workflow rewrites the staging copy's hardcoded endpoint during site assembly |
| **`.clasp.json`** (clasp target) | `SCRIPT_ID` | generated, never committed — `npm run env:*` writes it from `.env` locally, the workflow writes it from the secret in CI |

Apps Script is the only *runtime* consumer: `Code.gs` reads its three Script Properties and
nothing else. `SPREADSHEET_ID` and `PHOTO_FOLDER_ID` have no defaults — an unset property
throws rather than falling back, so a misconfigured environment fails loudly instead of
quietly writing into production.

`SPREADSHEET_FOLDER_ID` is recorded but unused. It exists for a planned move to
year/month-split spreadsheets, mirroring how photos are already organised; the flat
`SPREADSHEET_ID` is retired when that lands.

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
Dashboard files live in `frontend/dashboard/` and deploy with the forms.

To update the dashboard:
1. Edit files in `frontend/dashboard/`
2. Test locally: `cd frontend/dashboard && python3 -m http.server 8080`
3. Commit and release
4. Dashboard serves at https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

### Apps Script

The backend (`Code.gs`) is a standalone Apps Script project that reaches the spreadsheet by
ID — it is not attached to the sheet. **`git push` does not deploy it.**

See **[CLAUDE.md](CLAUDE.md)** for the full procedure, environment identifiers, and the two
failure modes that have each caused a multi-day outage. The short version:

```bash
npm run env:production                  # or env:staging — sets the clasp target
npx clasp push -f                       # uploads source — NOT yet live
npx clasp deploy -i <DEPLOYMENT_ID> --description "what changed"
```

The deployment is version-pinned, so `clasp push` alone changes nothing that users see.
Always pass `-i` with the existing deployment ID, or you mint a new URL that then has to be
updated in both forms, `frontend/dashboard/config.json`, and the bug-report handler at
`frontend/dashboard/index.html:1061`.

Verify with a write, not a read — reads can succeed while writes fail:

```bash
source .env.production
curl -sL "$WEB_APP_URL" -H 'Content-Type: text/plain;charset=utf-8' --data-binary @payload.json
# {"status":"ok"}
```

#### Admin endpoints

Protected by a UUID token in Script Properties, mirrored into `.env.production`
(gitignored) and read by every `npm run *:production` script.

```bash
npm run ping:production              # health check
npm run test:log:production          # recent doPost executions
npm run test:triggers:production     # list installed triggers
npm run email:summary:production     # send the daily summary now
npm run test:violation:production    # simulate a HACCP violation alert
```

A parallel staging environment exists with its own script project, deployment, spreadsheet,
and Drive folder — see [CLAUDE.md](CLAUDE.md) for identifiers. Every command above has a
`:staging` equivalent, e.g. `npm run ping:staging`.

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
