# Deployment

Start here. This directory holds no configuration — everything is generated or lives in
`.env`. It exists so the deployment story has an obvious front door.

- **[../CLAUDE.md](../CLAUDE.md)** — full procedure, environment identifiers, and the two
  failure modes that have each caused a multi-day outage
- **[../.github/workflows/deploy.yml](../.github/workflows/deploy.yml)** — the pipeline
- **[../README.md](../README.md#configuration)** — how configuration flows from `.env`

---

## Two halves, two mechanisms

**Frontend** — forms, dashboard, `data/*.json`. Static files published to GitHub Pages by
the workflow. `frontend/` is flattened to the site root, so served URLs contain no
`/frontend/` segment. **Every printed QR code depends on that.**

**Backend** — `backend/Code.gs`. Git and Apps Script are unconnected; `git push` does not
deploy it. Only clasp does.

## Branches

```
dev   → staging backend  + site published under /staging/
prod  → production backend + site published at the root
```

Backend deploys before the frontend, so a still-cached old frontend talks to a backend that
already understands the new contract. The two platforms cannot be made atomic, so contract
changes must stay backward-compatible for one release cycle.

## The two-step backend deploy

Uploading source is not publishing. The deployment is pinned to a version and keeps serving
that version until a new one is cut:

```bash
npm run env:production     # generates .clasp.json from PROD_SCRIPT_ID in .env
npx clasp push -f          # uploads — NOT yet live
npx clasp deploy -i "$DEPLOYMENT_ID" --description "what changed"
```

**Always pass `-i`.** Without it clasp mints a new deployment with a new URL, which then has
to be chased into four frontend files. With it, the URL is a constant.

Verify with a write, not a read — reads can succeed while writes fail. That exact
combination took production down for three hours in August 2026.

## Configuration

There are no config files here. `.clasp.json` is generated at the repo root — by
`npm run env:*` locally, by the workflow from a secret in CI — and is gitignored.

The single source of truth is `.env` at the repo root, mirroring the GitHub Actions secrets
one-for-one. See [Configuration](../README.md#configuration).

## Required GitHub secrets

```
CLASPRC_JSON
PROD_SCRIPT_ID          STAGING_SCRIPT_ID
PROD_DEPLOYMENT_ID      STAGING_DEPLOYMENT_ID
PROD_WEB_APP_URL        STAGING_WEB_APP_URL
PROD_ADMIN_TOKEN        STAGING_ADMIN_TOKEN
```

Plus **Settings → Pages → Source → GitHub Actions**. Until that is set,
`actions/deploy-pages` fails regardless of the secrets.
