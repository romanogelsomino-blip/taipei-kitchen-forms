# Manual Steps to Complete Clasp Setup

Clasp infrastructure is ready but requires manual authorization and script ID configuration.

---

## Steps for @browser or Owner

### 1. Login to Clasp

```bash
cd /Users/leandertoney/taipei-kitchen-forms
npx clasp login
```

This will:
- Open browser to Google OAuth consent screen
- Ask you to authorize clasp to access Apps Script projects
- Save credentials to `~/.clasprc.json`

**Login as**: `leandertoney@gmail.com` (or whoever owns the Sheet)

### 2. Enable Apps Script API

1. Go to https://script.google.com/home/usersettings
2. Turn ON "Google Apps Script API"

### 3. Get Script ID

**Option A: From Sheet**
1. Open production Google Sheet
2. Extensions → Apps Script
3. Click Project Settings (gear icon)
4. Copy "Script ID"

**Option B: List All Scripts**
```bash
npx clasp list
```

Look for the script attached to your Sheet.

### 4. Update .clasp.json

Replace `REPLACE_WITH_SCRIPT_ID` with actual Script ID:

```json
{
  "scriptId": "1abc123XYZ...",
  "rootDir": "./apps_script"
}
```

Commit this change:
```bash
git add .clasp.json
git commit -m "Fix: Update .clasp.json with production script ID"
git push origin main
```

### 5. Test Deploy

```bash
npm run deploy
```

Should output:
```
└─ apps_script/Code.gs
Pushed 1 file.
```

Verify in Apps Script editor that Code.gs was updated.

### 6. Deploy to gh-pages

```bash
git checkout gh-pages && git merge main --no-edit && git push origin gh-pages
git checkout main
```

---

## Verification

After setup is complete:

✅ `.clasp.json` contains real script ID (not placeholder)
✅ `~/.clasprc.json` exists with OAuth tokens
✅ `npm run deploy` pushes Code.gs to Apps Script
✅ Apps Script editor shows latest Code.gs version
✅ No more manual copy-paste workflow

---

## Staging Setup (Optional)

If staging sheet needs clasp too:

1. Get staging script ID from staging sheet
2. Create `.clasp.staging.json`:
   ```json
   {
     "scriptId": "STAGING_SCRIPT_ID_HERE",
     "rootDir": "./apps_script"
   }
   ```
3. Add to `.gitignore` if using environment-specific configs

---

## Next: Update COORDINATION.md

Once clasp is working, update COORDINATION.md line 83:

**Before**:
```
| Apps Script attached to the master sheet | @code writes -> @browser pastes & authorizes |
```

**After**:
```
| Apps Script attached to the master sheet | @code writes & deploys via clasp |
```
