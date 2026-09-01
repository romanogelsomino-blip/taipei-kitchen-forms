# Taipei Kitchen — Deployment

Everything else about this codebase is readable from the code. This file covers only what
isn't: how the two halves reach production, and two traps that have each caused a
multi-day outage.

---

## Environments

| | Production |
|---|---|
| Spreadsheet | `1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI` (`TaipeiKitchen_BentoOps_v2`) |
| Apps Script project | `1_EOw2bBdaD_f4XePeRVJB6Wp7iiVCL6wvGBOjBe6sD93feMvHL9htjyT` |
| Web App deployment | `AKfycbxP7nIBkoOz64YstMKQ5x0gqYk6cRKKzjj9DHv_J8GuBta3cUC8YFfb0IL8nRA2s2MZIw` — **@1, version-pinned** |
| Photo folder | `NEW Bento Box Photos` — `1xUFF_Dfov1uK2kPjryCtw6lx4-3FBo9j` |
| Frontend | GitHub Pages, served from `main` |

Credentials are in `.env.production` (gitignored). Script Properties on the Apps Script
project hold `SPREADSHEET_ID`, `PHOTO_FOLDER_ID`, and `ADMIN_TOKEN`.

**Staging does not work.** `.clasp.staging.json` points at a project owned by a Google
account that is no longer recoverable. Replacing it is open work.

---

## Frontend — forms, dashboard, `data/*.json`

Static files, no build step.

```bash
git push origin main        # live in 1–2 minutes
```

Pages builds from `main` only. There is no second branch to push to.

- The CDN caches hard. `app.js` is cache-busted by `?v=N` in `dashboard/index.html` — bump
  it when you change `app.js`. `config.json` has no cache-buster.
- Forms cache `data/stores.json` in localStorage for 1 hour, so store changes take up to
  60 minutes to reach a phone that already loaded the form.

---

## Backend — `apps_script/Code.gs`

**`git push` does nothing here.** Git and Apps Script are unconnected. Deployment is two
steps, and skipping the second is the common mistake:

```bash
cp .clasp.production.json .clasp.json
npx clasp push -f                          # uploads source to the project
```

The code is now uploaded but **not live**. The deployment is pinned to version 1 and keeps
serving version 1 until you cut a new one:

```bash
npx clasp deploy -i AKfycbxP7nIBkoOz64YstMKQ5x0gqYk6cRKKzjj9DHv_J8GuBta3cUC8YFfb0IL8nRA2s2MZIw \
                 --description "what changed"
```

**Always pass `-i` with the existing deployment ID.** Without it, `clasp deploy` mints a new
deployment with a new URL, which must then be updated in three places or the forms keep
calling the old one:

- `taipei_delivery_form3.html:515`
- `taipei_production_form3.html:537`
- `dashboard/config.json`

Verify by writing, not reading — reads can succeed while writes fail (trap 2):

```bash
source .env.production
curl -sL "$WEB_APP_URL" -H 'Content-Type: text/plain;charset=utf-8' --data-binary @payload.json
# {"status":"ok"} means it worked
```

---

## Trap 1 — `clasp push` overwrites without warning

It replaces the project's files with your local ones. Anything edited in the Apps Script
editor and never committed is destroyed silently.

**Never edit code in the Apps Script editor.** Git is the source of truth.

*June 2026: a `clasp push` overwrote a photo handler that existed only in the live editor.
Uploads were broken for 17 days, invisibly — the forms use `mode: 'no-cors'` and cannot read
error responses.*

---

## Trap 2 — the Web App runs as whoever deployed it

`appsscript.json` sets `executeAs: USER_DEPLOYING`. The deploying account's permissions are
the app's permissions.

1. **Revoking that account's access breaks all writes, silently.** Reads keep working, so
   nothing looks wrong. *August 2026: ~3 hours of submissions lost. Drivers saw success
   screens. The execution log couldn't record it either — logging writes to the same
   spreadsheet it had lost access to.*
2. **`DriveApp.getFoldersByName()` searches the deploying account's Drive.** On a miss,
   `Code.gs` calls `createFolder()` and caches the result in `PHOTO_FOLDER_ID`, permanently
   splitting photos across two folders. `PHOTO_FOLDER_ID` is currently pinned, which makes
   that path unreachable. Keep it pinned.
3. **`MailApp` sends as the deploying account.** Time-based triggers belong to whoever
   created them — `ScriptApp.getProjectTriggers()` returns only your own, so another
   account's trigger is invisible and undeletable.

Before deploying under a new identity: grant it access to the spreadsheet and the photo
folder, run `authorizeDriveAccess` from the editor and confirm it logs *"Found existing
photos folder"*, then deploy. Revoke the old account **last**.
