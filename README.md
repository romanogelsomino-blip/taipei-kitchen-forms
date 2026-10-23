# Taipei Kitchen Forms

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant supermarkets across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA / FSIS food safety compliance as the program grows.

---

## What's Here

| Path | What it does |
|---|---|
| `frontend/taipei_production_form3.html` | Kitchen form. Logs each batch — cook times, per-dish counts produced and discarded. |
| `frontend/taipei_packaging_form.html` | Driver form, at pickup. Logs each cooler loaded at the kitchen — the store it is for, its temperature, per-dish counts loaded and discarded. |
| `frontend/taipei_delivery_form3.html` | Driver form, at the store. Logs each store delivery — product temperature on arrival, store cooler temperature, photos, what was loaded, what was left, case fill levels. |
| `frontend/forms/` | The scripts and stylesheet behind the forms: `common.js` and `styles.css` are shared, then one script per form. |
| `frontend/dashboard/` | Live web dashboard. Opens on a home page that explains the system and launches the forms; then production, packaging, deliveries, waste analysis, HACCP compliance. |
| `frontend/assets/` | Branding used by the forms. |
| `backend/` | Google Apps Script handling form submissions and serving the dashboard API. One script, several files split by domain; `Api.gs` holds the two entry points. |
| `data/` | The reference lists as the forms read them, one JSON file per list. Published by the site build from the backend; the git copies are seeds for local runs. |
| `deployment/` | Deployment guide — start here for how either half reaches production. |
| `scripts/` | Admin-endpoint helpers, driven by the single root `.env`. |

All forms are simple web pages, hosted on GitHub Pages, opened by phone via QR codes posted at each location.

**`frontend/` and `data/` publish to the site root**, so the served URLs contain no
`frontend/` segment. The QR codes depend on that.

**Live dashboard:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

**Staging dashboard:** https://romanogelsomino-blip.github.io/taipei-kitchen-forms/staging/dashboard/

---

## How It Works

### Forms
1. An employee scans the QR code at their location: the kitchen for a batch or a cooler being
   loaded, the store for a delivery.
2. The form opens on their phone.
3. They fill it out with dropdowns for drivers, supervisors, stores, and standard options.
4. Photos are compressed client-side before upload.
5. If offline, submissions queue in localStorage and retry when connection returns.
6. The rows land in the month's operations spreadsheet (see [Data store](#data-store)).
7. Delivery photos land in the Drive photo folder under year, month and day, and every
   row of the delivery links to them.

None of the forms is linked here on purpose. Each needs a location to be any use, and opens
from its location's QR code or from the dashboard's home page: the production and packaging
forms as `?kitchen=<System ID>`, the delivery form as `?store=<System ID>`. The home page also
generates the codes. A code for a location no longer on the list is refused, and the
production form opened bare has no kitchen chosen, which is how a batch gets logged against
the wrong kitchen.

The pages live in `frontend/`, their scripts and stylesheet in `frontend/forms/`. See
[Running locally](#running-locally) to try a change before pushing it.

### Dashboard
1. Google Apps Script `doGet` endpoint serves JSON data from the sheet.
2. The dashboard asks for a date window, refreshes it every 15 minutes while someone is
   looking at the tab, and has a Refresh button for the moment that is not soon enough.
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
`npm run env`, then use `npm run serve`. The dashboard reads live staging data, and a form
submission writes a real row to the staging sheet. There is no local run against production:
its dashboard is a URL, and a local form pointed at it would write real rows.

Both trees are built, production at the root and staging under `/staging/`, so the
environment banner and the environment toggle behave the way they will once published.

The server serves the copy in `_site/`, so stop it and run the command again after editing.

`tmp/` is a gitignored scratch directory. Screenshots and captures go there rather than the
repository root.
Push to `dev` to check `/staging/`, then merge to `prod`.

---

## Reference data

The kitchen, store, dish, supervisor and driver lists live in a `Reference` spreadsheet at
the root of the operations folder, one tab per list, and are edited from the dashboard's
Config tab. A save writes the sheet and asks GitHub to republish the site, which writes each
list to `data/<list>.json` for the forms; a phone has it within about ten minutes. The
Config tab shows whether the forms' copy is current.

Every entry is keyed by a UUID the backend assigns and never changes. An entry is deleted to
retire it (hidden from the forms and the Config tab, restorable from its deleted list), and a
dish can also be switched off to pause it; the row stays in the sheet either way, so past
records keep their names. Kitchens and stores also carry a Type, the organisation they
belong to (Taipei or Giant), and that organisation's own identifier: the Kitchen ID or Store
ID. A store's Store ID is its store number. QR codes carry the UUID: a kitchen has one for the
production form and one for the packaging form (`?kitchen=<System ID>`), a store one for the
delivery form (`?store=<System ID>`); store codes printed before System IDs existed carry the
store number, which the delivery form still accepts. Every delivery and packaging
row carries the number, so a store can be renamed freely but changing its number re-keys its
records, and the Config tab says so.
The other four lists are stored in the records by name, so renaming one leaves past records
under the old name, and the Config tab says that too. The dashboard's home page opens the
production form with the kitchen's UUID, `taipei_production_form3.html?kitchen=<uuid>`.

The copies of `data/*.json` in git are seeds for local runs only; `node scripts/reference-snapshot.js staging` refreshes them from the staging backend.

---

## Food Safety Rules Built In

The HACCP cooling rule is printed on the production form: hot food must cool from 135°F to
70°F within 2 hours, then to 41°F within 4 more hours. The system flags what it can measure:

- A batch cools overnight from its cook end, so the production form records no cooling
  interval or final temperature, and production submissions raise no violations.
- The packaging form records each cooler's temperature as it is loaded for a store — the first
  reading after cooling — and flags it above 41°F.
- The delivery form flags both temperatures it records, the product temperature on arrival
  and the store cooler temperature, above 41°F.
- The backend checks each submission once, not once per dish. Each breach sends one email and
  writes one row on the month's Violations tab: the reading, the kitchen or store it belongs
  to, when it was taken, the driver's notes, and later the corrective action and who resolved
  it. The row is written even when the email fails; a failed alert is noted on that request's
  Executions row.
- 41°F is fixed in the code. It is the regulatory cold-holding limit, not a setting.
- The dashboard lists those violations. One is open until someone resolves it.

---

## Data store

Records live in one spreadsheet per month, in a folder per year, under
`SPREADSHEET_FOLDER_ID`: `<YYYY>/<YYYY-MM> Operations`. Each file has five tabs in this
order: Production, Packaging, Deliveries, Violations, Executions.

- Headers come from the schemas in `backend/Schemas.gs` and are the read contract. Column
  order is not: readers match on header text, so a tab may be reordered by hand.
- A record is filed under its own date, read in New York. A submission spanning midnight at
  a month boundary therefore lands in two files.
- Every row of one submission shares a submission id, which is also how a delivery's photos
  find their rows.
- The monthly files are the only store. Deliveries logged before 1 October 2026 live in the
  previous single-spreadsheet system, which is no longer written or read.

Photos live under `PHOTO_FOLDER_ID` as `<YYYY>/<MM>/<DD>/`, named
`<store>_<date>_<before|after>_<submission>.jpg`. The submission in the name is what ties a
file back to the delivery it documents, and lets a retry reuse a photo already saved
instead of storing it twice.

Reads take a date window, `from` and `to` as `YYYY-MM-DD`, defaulting to the first of last
month through today and capped at six months because that is six files to open. A month with
no file contributes nothing rather than failing, which is what the first day of a month looks
like before anything has been written to it.

Never rename or move a monthly file. The backend finds it by exact name and would create a
second one alongside it.

---

## Email

The backend sends as the Google account the deployment runs as. There is no separate mail
credential; the manifest's mail scope, granted once by that account, is the authorisation.

- `ALERT_RECIPIENTS` is who HACCP violation alerts go to: the people responsible for food
  safety. They get temperatures, not stack traces.
- `SUPPORT_RECIPIENTS` is who system mail goes to: a failed form submission and bug reports
  from the dashboard. Whoever maintains the system, which will not always be whoever owns
  the Google account it sends from.
- `ALERT_FROM` is the From address. It works only when that address is a verified "Send mail
  as" alias on the sending account. An unverified one falls back to the account's own address
  and records that it did, rather than dropping the message.
- `node scripts/admin-action.js staging mailStatus` reports the sending account, its aliases, and whether the configured
  From address is usable. The deploy summary reports the same thing on every deploy.

---

## Environments & Configuration

There are two environments, staging and production. Each has its own Apps Script project,
Web App deployment, spreadsheet, and Drive photo folder, so nothing written to staging can
reach production. `dev` deploys to staging, `prod` to production.

A single gitignored `.env` at the repo root holds every value for both environments,
prefixed `PROD_` / `STAGING_`. The names match the GitHub Actions secrets one-for-one —
secrets share one flat namespace, the workflow needs both environments in a single run, and
secrets cannot be read back once set, so `.env` is the readable copy. The list of secrets is
in [deployment/README.md](deployment/README.md).

Nothing reads `.env` at runtime, and locally the scripts read only `STAGING_WEB_APP_URL`,
`STAGING_ADMIN_TOKEN`, `PROD_WEB_APP_URL` and `PROD_ADMIN_TOKEN`. The rest is the reference
copy everything else is populated from:

- **GitHub Actions secrets** — the same keys, pasted by hand.
- **Apps Script Script Properties** — `SPREADSHEET_FOLDER_ID`, `PHOTO_FOLDER_ID`,
  `ALERT_RECIPIENTS`, `SUPPORT_RECIPIENTS` and `ALERT_FROM` are pushed by the deploy workflow
  on every deploy.
  `ADMIN_TOKEN` is copied by hand in Project Settings, because the endpoint that sets
  properties authenticates with it. None have defaults: an unset property throws instead of
  falling back.
- **`frontend/config.js`** — the only place a Web App URL exists. The forms and dashboard
  are static files with no environment to read, so the URL is written into this gitignored
  file at build time: by `npm run env` locally (staging), by the workflow per tree in CI. A
  CI guard fails the build if an Apps Script URL appears anywhere else.
- **`.clasp.json`** — the clasp target, generated by the deploy workflow from `SCRIPT_ID`.
  Nothing local writes it: nothing local pushes to Apps Script.

Run `npm run env` before `npm run serve`, or the forms show "Not Configured".
`npm run serve:demo` needs no config.

---

## Releases

Releases are made by hand on GitHub. Open a pull request from `dev` to `prod`, merge it with
a merge commit, and publish a GitHub Release against `prod` once the deploy is green. Merging
is what starts the production deploy, and publishing the release creates its tag.

Never push `prod` from a terminal to release. To roll back, reset `prod` to the previous
release tag and force-push; the workflow redeploys the backend and republishes the site from
that tree.

Full steps, including what to check before and after, are in `deployment/README.md`.

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
`PROD_ADMIN_TOKEN` / `STAGING_ADMIN_TOKEN`. `scripts/admin-action.js` calls them:

```bash
node scripts/admin-action.js staging ping               # health check
node scripts/admin-action.js staging getExecutionLog    # recent executions
node scripts/admin-action.js staging storageStatus      # rows per tab, this month and last
node scripts/admin-action.js staging mailStatus         # sending account and aliases
node scripts/admin-action.js staging test               # one simulated violation and alert email
```

Production is read-only from a laptop: `npm run prod:ping`, `npm run prod:log`,
`npm run prod:storage`, or `node scripts/admin-action.js production <read action>`. Its
writes — `init`, `formatStorage`, `setScriptProperty`, `test` — are refused; CI does them on
every deploy. `rotateAdminToken` is the one exception and needs `write=production` on the
command line. Nothing in `scripts/` can push code to either Apps Script project.

`npm run mock` fills staging with realistic records for the past months — each day's batch,
coolers and deliveries, named from the environment's own reference lists — so the dashboard
can be seen with real-looking data. It is manual only: every run adds everything again, and
each warm reading it generates sends a real alert email. `npm run mock:dry` reports the plan
without posting. `npm run test:photo` exercises the photo path on staging, which the CI smoke
does not.

---

## Contact

**Owner:** Romano Gelsomino — Taipei Kitchen
**Developer:** Kalispell Consulting
**Repository:** https://github.com/romanogelsomino-blip/taipei-kitchen-forms
