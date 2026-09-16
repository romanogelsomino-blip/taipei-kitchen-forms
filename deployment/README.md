# Deployment

The authoritative deployment procedure. The [top-level README](../README.md#deployment) has
the overview; configuration is covered in
[README § Environments & Configuration](../README.md#environments--configuration).

There are no manual deployments. A push to `dev` or `prod`
runs one workflow, `.github/workflows/deploy.yml`, which deploys that branch's backend and
republishes the entire site from both branches. Both environments always match their
branches; nothing can drift.

## Two halves

**Frontend** — forms, dashboard, `data/*.json`. Static files published to GitHub Pages.
`frontend/` and `data/` are flattened to the site root, so served URLs contain no
`/frontend/` segment. **Every printed QR code depends on that.**

**Backend** — `backend/*.gs` and `appsscript.json`. A standalone Apps Script project,
uploaded with clasp and served through a single pinned Web App deployment per environment.

## Branches

```
dev   → staging backend    + site published under /staging/
prod  → production backend + site published at the root
```

There is no `main`. `dev` is the working branch, `prod` is the release branch, and `prod`
only ever receives merges from `dev`.

## What the workflow does

One run per push. Pages allows one publish at a time, so runs queue behind each other. Never
cancel a run in flight, or the site can be left serving a half-assembled artifact.

**Backend job**

1. Restores clasp credentials from `CLASPRC_JSON` and generates `.clasp.json` from the
   branch's `SCRIPT_ID` secret. Nothing in git names a script id.
2. `clasp push -f` uploads `backend/` to the Apps Script project.
3. `clasp deploy -i <DEPLOYMENT_ID>` redeploys the existing deployment in place, so the Web
   App URL never changes. Without `-i` clasp would mint a new deployment and a new URL.
4. Waits until the web app answers with JSON. An in-place redeploy can serve Google's
   "unable to open the file" page for several minutes before the new version is live.
5. Sets the `SPREADSHEET_FOLDER_ID`, `PHOTO_FOLDER_ID`, `SPREADSHEET_ID`, `WRITE_TARGETS`,
   `ALERT_RECIPIENTS`, `SUPPORT_RECIPIENTS` and `ALERT_FROM` Script Properties through
   the `setScriptProperty` admin action, so the secrets are authoritative. `ALERT_FROM` is
   the one that may be empty, which means alerts send as the deploying account.
6. Pings the deployment and asserts the operations folder id, the current month's file
   name, a valid `WRITE_TARGETS`, and, while `legacy` is a target, the legacy spreadsheet
   id. The month file itself is created by the first record written in the month, never
   by the workflow.
7. On `dev` only, submits a real production row and then a real delivery row, both dated
   today and marked `ZZ-CI-SMOKE` (store `0000`), requires the current month file's Production
   and Deliveries tabs to each grow by one row, and reads the delivery row back by its
   submission id. Reads can succeed while writes fail, and a write is the only thing that
   proves the deployment can reach its stores. Production gets no synthetic row.

Every call to the web app after the redeploy retries while Google's error page comes back
instead of JSON. The smoke write is the exception: it is sent once, and the row count
decides whether it landed.

**Site job** (after the backend job)

1. Checks out both `prod` and `dev`. A Pages deploy replaces the whole site, so both trees
   are rebuilt on every run regardless of which branch was pushed.
2. Copies `prod`'s `frontend/` and `data/` to the artifact root and `dev`'s under `/staging/`.
3. Writes `config.js` into each tree from `PROD_WEB_APP_URL` / `STAGING_WEB_APP_URL`.
4. Fails the build if `script.google.com/macros` appears anywhere else in the artifact.
5. Replaces every `__BUILD_ID__` with the commit SHA. Fails if no token is found or any
   survives.
6. Publishes the artifact to GitHub Pages.

The backend deploys first so that a still-cached old frontend talks to a backend that already
understands the new contract. The two platforms cannot be made atomic, so contract changes
must stay backward-compatible for one release cycle.

## Releasing to production

Every production release is tagged.

```bash
git checkout prod
git merge dev                       # or merge the dev → prod pull request
git tag v2.2.0
git push origin prod --tags         # the push to prod triggers the production deploy
```

Check the run under Actions, then confirm the live forms and dashboard load.

## Rolling back

Reset `prod` to the previous release tag and push. The workflow redeploys the backend and
republishes the site from that tree.

```bash
git checkout prod
git reset --hard v2.1.0
git push --force-with-lease origin prod
```

Reset rather than revert: a revert commit on `prod` would make the next merge from `dev` skip
the reverted changes. Fix forward on `dev`, then release normally.

Spreadsheet schema changes do not roll back. A column or sheet tab added by the newer code
stays; only the code goes back. Monthly operations files and Script Properties stay too. A
backend from before the monthly store reads and writes the legacy sheet only; rows written
after `WRITE_TARGETS` is `monthly` are invisible to it.

## Required GitHub secrets

```
CLASPRC_JSON
PROD_SCRIPT_ID              STAGING_SCRIPT_ID
PROD_DEPLOYMENT_ID          STAGING_DEPLOYMENT_ID
PROD_WEB_APP_URL            STAGING_WEB_APP_URL
PROD_ADMIN_TOKEN            STAGING_ADMIN_TOKEN
PROD_SPREADSHEET_ID         STAGING_SPREADSHEET_ID
PROD_PHOTO_FOLDER_ID        STAGING_PHOTO_FOLDER_ID
PROD_SPREADSHEET_FOLDER_ID  STAGING_SPREADSHEET_FOLDER_ID
PROD_WRITE_TARGETS          STAGING_WRITE_TARGETS
PROD_ALERT_RECIPIENTS       STAGING_ALERT_RECIPIENTS
PROD_SUPPORT_RECIPIENTS     STAGING_SUPPORT_RECIPIENTS
PROD_ALERT_FROM             STAGING_ALERT_FROM
```

The names match `.env` one-for-one; copy the values from there. Plus **Settings → Pages →
Source → GitHub Actions**, or `actions/deploy-pages` fails regardless of the secrets.

`CLASPRC_JSON` is a refresh token for the deploying Google account. That account's
Workspace organizational unit must exempt the clasp OAuth client from Google Cloud session
control, or the token expires within a day of each `clasp login` and the backend job fails
at `clasp push` with `invalid_grant`.

### OAuth scopes

`backend/appsscript.json` lists the scopes explicitly, so the project gets exactly those and
nothing more. A change to that list takes effect on the next push, but the deploying account
must then approve the new set before the web app serves again. Until it does, every request
returns an authorisation error, so make scope changes when someone can finish the approval.

Re-authorising, once per environment:

1. Push first, so the project holds the new scope list. Merge to `dev` or `prod`, or run the
   workflow by hand; the backend job pushes before anything else.
2. Open the project as the deploying account: `npm run open:staging` or
   `npm run open:production`. Sign in as that account if the browser opens as someone else,
   or the approval will be recorded against the wrong one.
3. Revoke the project's existing access first, at
   https://myaccount.google.com/permissions, as that account. Apps Script will not re-prompt
   while an older grant is still valid: the function runs and then fails at the first call
   needing a scope that grant lacks. Revoking is what forces the new list to be offered. The
   web app stops serving until step 5 completes, so expect a short outage.
4. Pick `authorize` from the function dropdown, press Run, and approve the prompt. It lists the whole declared scope set, not just what changed. The
   unverified-app warning is expected: choose Advanced, then go to the project.
5. Read the execution log. `authorize` names each folder, spreadsheet, mail quota, sending
   account and verified alias it reached, and marks anything it could not as FAILED.
6. Confirm from outside with `npm run ping:<env>` and `npm run mail:<env>`.

If requests still fail after that, re-run the deploy workflow. The redeploy picks up the
refreshed grant.

### Alert email

`ALERT_RECIPIENTS` is who HACCP violation alerts go to, comma separated. `SUPPORT_RECIPIENTS`
is who failed submissions and dashboard bug reports go to. The two lists exist because the
audiences differ: one runs the kitchen, the other maintains the system. A failed submission
emails support at once; the same error repeating is suppressed for 15 minutes so a bad
deploy reports itself once rather than once per driver.
`ALERT_FROM` is the From address and may be left empty, in which case alerts come from the
account the deployment runs as. A non-empty value works only if that address is a verified
"Send mail as" alias on that account; otherwise the deploy logs a warning, alerts still go
out from the account address, and the fallback is recorded on the execution row. Check with
`npm run mail:<env>` before relying on a new address.

### Write targets

The `WRITE_TARGETS` secret selects where records are written: `legacy,monthly` writes the
legacy sheet alongside the monthly files, `monthly` writes the monthly files alone. CI
pushes it to the Script Property on every deploy and rejects any other value before pushing
anything. Changing it is a secret change followed by a deploy; no code changes.
