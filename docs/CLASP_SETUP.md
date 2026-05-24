# Clasp Setup Guide

This guide explains how to set up automated Apps Script deployment via `clasp`.

---

## First-Time Setup

### 1. Install Dependencies

```bash
npm install
```

This installs `@google/clasp` locally.

### 2. Login to Google Account

```bash
npx clasp login
```

This will:
- Open a browser to authorize clasp
- Save credentials to `~/.clasprc.json`
- Allow you to push code to Apps Script projects

**Important**: Login as the account that OWNS the Google Sheet (likely `leandertoney@gmail.com`).

### 3. Get Script ID from Existing Apps Script

**Option A: From Google Sheet**
1. Open the production Google Sheet
2. Go to Extensions → Apps Script
3. In Apps Script editor, click Project Settings (gear icon)
4. Copy the "Script ID"

**Option B: From Apps Script URL**
- URL format: `https://script.google.com/home/projects/{SCRIPT_ID}/edit`
- Extract the `{SCRIPT_ID}` part

**Option C: List All Your Scripts**
```bash
npx clasp list
```

### 4. Update .clasp.json

Replace `REPLACE_WITH_SCRIPT_ID` in `.clasp.json` with your actual Script ID:

```json
{
  "scriptId": "1abc123XYZ...",
  "rootDir": "./apps_script"
}
```

### 5. Test Push

```bash
npm run deploy
```

This should push `apps_script/Code.gs` to your Apps Script project.

Verify in Apps Script editor that Code.gs updated.

---

## Daily Workflow

### After Making Changes to Code.gs

```bash
# 1. Edit apps_script/Code.gs locally
# 2. Push to Apps Script
npm run deploy

# 3. Commit and push to git
git add apps_script/Code.gs
git commit -m "Feature: Add new function to Code.gs"
git push origin main

# 4. Deploy dashboard changes (if any)
git checkout gh-pages && git merge main --no-edit && git push origin gh-pages
git checkout main
```

### Watch Mode (Auto-Deploy on Save)

```bash
npm run watch
```

This automatically pushes to Apps Script every time you save `Code.gs`.

**Warning**: Use with caution on production scripts. Test on staging first.

---

## Multiple Environments

### Staging vs Production

If you have separate staging and production Apps Script projects:

1. **Create `.clasp.staging.json`**:
   ```json
   {
     "scriptId": "STAGING_SCRIPT_ID_HERE",
     "rootDir": "./apps_script"
   }
   ```

2. **Create `.clasp.production.json`**:
   ```json
   {
     "scriptId": "PRODUCTION_SCRIPT_ID_HERE",
     "rootDir": "./apps_script"
   }
   ```

3. **Deploy to Staging**:
   ```bash
   STAGING_SCRIPT_ID="..." npm run deploy:staging
   ```

4. **Deploy to Production**:
   ```bash
   PRODUCTION_SCRIPT_ID="..." npm run deploy:production
   ```

**OR** set environment variables in your shell:
```bash
export STAGING_SCRIPT_ID="1abc..."
export PRODUCTION_SCRIPT_ID="1xyz..."
```

---

## Troubleshooting

### "User has not enabled the Apps Script API"

1. Go to https://script.google.com/home/usersettings
2. Turn ON "Google Apps Script API"
3. Try `clasp push` again

### "Error: Could not read API credentials"

Run `npx clasp login` again to re-authenticate.

### "Error: Permission denied"

Make sure you're logged in as the Google account that OWNS the Sheet.

```bash
npx clasp login --creds ~/.clasprc.json
```

### "Push failed: Invalid value at 'files[0].source'"

Check that `apps_script/Code.gs` exists and has valid JavaScript syntax.

### Code.gs Not Updating in Apps Script Editor

1. Verify `.clasp.json` has correct `scriptId`
2. Refresh Apps Script editor in browser (hard refresh: Cmd+Shift+R / Ctrl+Shift+R)
3. Check clasp logs: `npm run logs`

---

## File Structure

After setup, your repo should look like:

```
/
├── apps_script/
│   └── Code.gs              # Source file (pushed via clasp)
├── node_modules/            # (gitignored)
├── .clasp.json              # Clasp config (scriptId)
├── .clasprc.json            # Auth credentials (gitignored, in ~/ not repo)
├── .gitignore               # Ignores node_modules, .clasprc.json
├── package.json             # npm scripts for clasp
└── docs/
    └── CLASP_SETUP.md       # This file
```

---

## Security Notes

- ✅ `.clasprc.json` is in `~/.clasprc.json` (NOT in repo) - contains OAuth tokens
- ✅ `.clasp.json` is IN repo but only contains scriptId (not sensitive)
- ✅ `dashboard/config.local.json` is gitignored (contains webAppUrl)
- ❌ NEVER commit OAuth tokens or API keys to git

---

## Links

- Clasp Docs: https://github.com/google/clasp
- Apps Script API: https://developers.google.com/apps-script/api/quickstart/nodejs
- Sheet Settings: Extensions → Apps Script → Project Settings
