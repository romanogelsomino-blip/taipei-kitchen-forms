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

**Backend** — `backend/Code.gs` and `appsscript.json`. A standalone Apps Script project,
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
4. Sets the `SPREADSHEET_ID` and `PHOTO_FOLDER_ID` Script Properties from the matching
   secrets through the `setScriptProperty` admin action, so the secrets are authoritative.
5. Pings the deployment and asserts it reports the expected spreadsheet id.
6. On `dev` only, submits a real delivery row (driver `ZZ-CI-SMOKE`, store `0000`) and
   requires `{"status":"ok"}`. Reads can succeed while writes fail, and a write is the only
   thing that proves the deployment can reach its sheet. Production gets no synthetic row.

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
stays; only the code goes back.

## Required GitHub secrets

```
CLASPRC_JSON
PROD_SCRIPT_ID          STAGING_SCRIPT_ID
PROD_DEPLOYMENT_ID      STAGING_DEPLOYMENT_ID
PROD_WEB_APP_URL        STAGING_WEB_APP_URL
PROD_ADMIN_TOKEN        STAGING_ADMIN_TOKEN
PROD_SPREADSHEET_ID     STAGING_SPREADSHEET_ID
PROD_PHOTO_FOLDER_ID    STAGING_PHOTO_FOLDER_ID
```

The names match `.env` one-for-one; copy the values from there. Plus **Settings → Pages →
Source → GitHub Actions**, or `actions/deploy-pages` fails regardless of the secrets.

`CLASPRC_JSON` is a refresh token for the deploying Google account. That account's
Workspace organizational unit must exempt the clasp OAuth client from Google Cloud session
control, or the token expires within a day of each `clasp login` and the backend job fails
at `clasp push` with `invalid_grant`.
