# Taipei Kitchen Forms

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant supermarkets across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA / FSIS food safety compliance as the program grows.

---

## What's Here

| Path | What it does |
|---|---|
| `frontend/taipei_production_form3.html` | Kitchen form. Logs each batch — cook times, cooling, dish counts, quality notes. |
| `frontend/taipei_delivery_form3.html` | Driver form. Logs each store delivery — temps, photos, what was loaded, what was left, case fill levels. |
| `frontend/forms/` | The scripts and stylesheet behind both forms: `common.js` and `styles.css` are shared, then one script per form. |
| `frontend/dashboard/` | Live web dashboard. Opens on a home page that explains the system and launches either form; then metrics, production, deliveries, waste analysis, HACCP compliance. |
| `frontend/assets/` | Branding used by the forms. |
| `backend/` | Google Apps Script handling form submissions and serving the dashboard API. One script, several files split by domain; `Api.gs` holds the two entry points. |
| `data/` | JSON for drivers, supervisors, stores, kitchens, and dishes — fetched at page load. |
| `deployment/` | Deployment guide — start here for how either half reaches production. |
| `scripts/` | Admin-endpoint helpers, driven by the single root `.env`. |

All forms are simple web pages, hosted on GitHub Pages, opened by phone via QR codes posted at each location.

**`frontend/` and `data/` publish to the site root**, so the served URLs contain no
`frontend/` segment. The QR codes depend on that.

**Live Dashboard:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

---

## How It Works

### Forms
1. An employee scans the QR code at their location.
2. The form opens on their phone.
3. They fill it out with dropdowns for drivers, supervisors, stores, and standard options.
4. Photos are compressed client-side before upload.
5. If offline, submissions queue in localStorage and retry when connection returns.
6. The information lands in the master Google Sheet (`TaipeiKitchen_BentoOps_v2`).
7. Delivery photos land in a Google Drive folder.

- **Production form:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_production_form3.html
- **Delivery form:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_delivery_form3.html

The pages live in `frontend/`, their scripts and stylesheet in `frontend/forms/`. See
[Running locally](#running-locally) to try a change before pushing it.

### Dashboard
1. Google Apps Script `doGet` endpoint serves JSON data from the sheet.
2. Dashboard polls the API every 10 seconds for updates.
3. Real-time metrics display: production batches, deliveries today, HACCP violations, waste.
4. Interactive filters by date range, driver, store, dish.
5. Waste analysis with charts showing patterns by store and reason.
6. Weekly food safety summary suitable for regulator/corporate review.

### Running locally

`npm run serve:demo` assembles the site the way CI publishes it, `frontend/` at the root
with `data/` beside it, into a gitignored `_site/` and serves it at http://localhost:8080/
with no backend. The dashboard shows sample data and the forms render but do not submit.
Open `/dashboard/`, or a form such as `/taipei_production_form3.html?kitchen=legacy-park`.

To run against the staging backend instead, write the staging config once with
`npm run env:staging`, then use `npm run serve`. The dashboard reads live staging data, and
a form submission writes a real row to the staging sheet.

The server serves the copy in `_site/`, so stop it and run the command again after editing.
Push to `dev` to check `/staging/`, then merge to `prod`.

---

## Stores

The store and kitchen lists are in `data/stores.json`. To add one: add it there, mirror the
entry into the fallback in `frontend/forms/common.js`, and release. The store list is
also duplicated in `backend/Reads.gs` (the dashboard store filter) —
those need a backend deploy to pick up a new store. QR codes point at
`taipei_delivery_form3.html?store=<id>`. The dashboard's home page opens the production form the
same way, with `taipei_production_form3.html?kitchen=<id>`.

---

## Food Safety Rules Built In

The HACCP cooling rule is printed on the production form: hot food must cool from 135°F to
70°F within 2 hours, then to 41°F within 4 more hours. The system flags what it can measure:

- The production form colors total cooling time orange past 4 hours and red past 6 hours,
  and flags any recorded temperature above 41°F.
- The backend emails a violation alert when a delivery's cooler temperature exceeds the
  configured threshold (default 41°F) and records it in the Violations Tracker sheet.
- The dashboard lists violations from the tracker with their status and notes.

---

## Environments & Configuration

There are two environments, staging and production. Each has its own Apps Script project,
Web App deployment, spreadsheet, and Drive photo folder, so nothing written to staging can
reach production. `dev` deploys to staging, `prod` to production.

A single gitignored `.env` at the repo root holds every value for both environments,
prefixed `PROD_` / `STAGING_`. The names match the GitHub Actions secrets one-for-one:
secrets share one flat namespace, the workflow needs both environments in a single run, and
secrets cannot be read back once set, so `.env` is the readable copy.

```
CLASPRC_JSON                   clasp OAuth credentials, shared by both environments
PROD_ADMIN_TOKEN               STAGING_ADMIN_TOKEN
PROD_DEPLOYMENT_ID             STAGING_DEPLOYMENT_ID
PROD_PHOTO_FOLDER_ID           STAGING_PHOTO_FOLDER_ID
PROD_SCRIPT_ID                 STAGING_SCRIPT_ID
PROD_SPREADSHEET_FOLDER_ID     STAGING_SPREADSHEET_FOLDER_ID   (reserved, unused)
PROD_SPREADSHEET_ID            STAGING_SPREADSHEET_ID
PROD_WEB_APP_URL               STAGING_WEB_APP_URL
```

Nothing reads `.env` at runtime. It is the reference copy everything else is populated from:

- **GitHub Actions secrets** — the same keys, pasted by hand.
- **Apps Script Script Properties** — `SPREADSHEET_ID` and `PHOTO_FOLDER_ID` are pushed by
  the deploy workflow on every deploy. `ADMIN_TOKEN` is set by hand in Project Settings,
  because the endpoint that sets properties authenticates with it. None have defaults: an
  unset property throws instead of falling back.
- **`frontend/config.js`** — the only place a Web App URL exists. The forms and dashboard
  are static files with no environment to read, so the URL is written into this gitignored
  file at build time: by `npm run env:staging|production` locally, by the workflow per
  tree in CI. A CI guard fails the build if an Apps Script URL appears anywhere else.
- **`.clasp.json`** — the clasp target, generated the same way from `SCRIPT_ID`.

Run `npm run env:staging` before `npm run serve`, or the forms show "Not Configured".
`npm run serve:demo` needs no config.

---

## Releases

Every production release is tagged in GitHub. Merge `dev` into `prod`, then tag the merge
commit (`v2.1.0`, `v2.2.0`, …) and push the tag.

To roll back, revert `prod` to the previous release tag and push. The workflow redeploys the
backend and republishes the site from that tree.

---

## Deployment

There is no `main` branch. `dev` is the working branch, `prod` is the release branch, and
`.github/workflows/deploy.yml` deploys both halves of the stack on every push to either:

```
dev   → staging backend    + site published under /staging/
prod  → production backend + site published at the root
```

Nothing is deployed by hand. The workflow redeploys the Apps Script backend in place, then
assembles and publishes the site with each tree's own `config.js`. The full procedure — what
the workflow does step by step, releasing, rolling back, and required secrets — is in
[deployment/README.md](deployment/README.md), which is authoritative.

### Admin endpoints

Protected by a UUID token in each project's Script Properties, mirrored into `.env` as
`PROD_ADMIN_TOKEN` / `STAGING_ADMIN_TOKEN` and read by the helpers in `scripts/`.

```bash
npm run ping:production              # health check
npm run test:log:production          # recent doPost executions
npm run test:triggers:production     # list installed triggers
npm run email:summary:production     # send the daily summary now
npm run test:violation:production    # simulate a HACCP violation alert
```

Every command has a `:staging` equivalent, e.g. `npm run ping:staging`.

---

## Contact

**Owner:** Romano Gelsomino — Taipei Kitchen
**Developer:** Kalispell Consulting
**Repository:** https://github.com/romanogelsomino-blip/taipei-kitchen-forms
