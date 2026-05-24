# Apps Script Credential Investigation Report

**Date**: 2026-05-24
**Investigator**: Claude Code (automated)
**Objective**: Trace production vs staging Apps Script credentials and set up split deployment

---

## Executive Summary

✅ **Staging deployment**: COMPLETE - Code.gs deployed and ready for testing
⚠️ **Production script ID**: NOT FOUND - Cannot complete split deployment without it
✅ **Credentials traced**: All deployment URLs and sheet IDs identified
✅ **CLAUDE.md updated**: Self-sufficiency principles added

---

## Investigation Methodology

Per user's instructions, I:
1. ✅ Grepped dashboard JS for Apps Script web app URLs
2. ✅ Extracted deployment IDs from URLs
3. ✅ Cross-referenced with `npx clasp list`
4. ✅ Grepped for spreadsheet IDs in COORDINATION.md and README.md
5. ✅ Checked git history for when production was first wired up

---

## Findings

### Staging Environment

| Resource | ID | Status |
|----------|-----|--------|
| **Sheet** | `1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E` | ✅ Confirmed |
| **Apps Script** | `1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP` | ✅ Accessible via clasp |
| **Deployment URLs** | `AKfycbxbjEj...` (HEAD), `AKfycbwyn_...` (@11), `AKfycbyn2...` (@9) | ✅ Listed via `clasp deployments` |
| **.clasp.json** | Configured with staging script ID | ✅ Ready |

**Evidence**:
- `npx clasp list` output: "Taipei Kitchen Staging - 1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP"
- COORDINATION.md line 116: Staging sheet created 2026-05-07
- Current .clasp.json points to staging script

### Production Environment

| Resource | ID | Status |
|----------|-----|--------|
| **Sheet** | `1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI` | ✅ Confirmed |
| **Apps Script** | ❌ **UNKNOWN** | ⚠️ NOT ACCESSIBLE |
| **Deployment URLs** | `AKfycbxXVDl_...` (forms), `AKfycbzt-...` (dashboard) | ✅ Found in code |

**Evidence**:
- dashboard/config.json: `AKfycbzt-b5ZVYoqeYt-1XnOnLFCdGcB1trlNiLbL8wcFagWO6ul5wqS-cJj3wInEdsI5uamyg`
- taipei_production_form3.html:498: `AKfycbxXVDl_JyH1H2_KdM8CHyVn5H4qfoUsFepgV1p_4RhrCKKPSj2WzdkqEsGqHgL7V-b6PA`
- taipei_delivery_form3.html:498: Same URL as production form
- Git commit 9764f39 (May 11, 2026): "Revert forms to post to production Apps Script - Restored production URL (AKfycbxXVDl_...)"
- Curl test: `AKfycbzt-...` returns live production data (April 2026 deliveries)

**Why Production Script ID Not Found**:
1. Not listed in `npx clasp list` (only shows "Taipei Kitchen Staging")
2. Not in any repo files (.clasp.json, package.json, COORDINATION.md, README.md)
3. Likely owned by different Google account or not shared with current clasp login
4. Deployment IDs are not script IDs - they're generated when you deploy a Web App

---

## How to Determine Production Script ID

**The production script ID can be obtained by**:

### Option 1: From Google Sheet (Recommended)
1. Open production sheet: https://docs.google.com/spreadsheets/d/1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI/edit
2. Go to **Extensions → Apps Script**
3. Click **Project Settings** (gear icon) in left sidebar
4. Copy "Script ID" (format: `1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

### Option 2: From Apps Script Dashboard
1. Go to https://script.google.com/home
2. Find project attached to production sheet (look for "TaipeiKitchen_BentoOps_v2")
3. Click project → Settings → Copy Script ID

### Option 3: From Deployment URL (Advanced)
1. Use Apps Script API to query deployment ID `AKfycbxXVDl_...`
2. Response includes parent script ID
3. Requires API credentials and additional setup

---

## Deployment Status

### ✅ Completed

1. **Staging configured**: Code.gs has staging sheet ID `1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E` in all 8 locations
2. **Deployed to staging**: `npm run deploy` successful (2 files pushed)
3. **CLAUDE.md updated**: Added "Decision-Making & Self-Sufficiency" principles
4. **Test plan created**: `docs/P2_4_EMAIL_ALERT_TEST_PLAN.md` with step-by-step procedure

### ⚠️ Blocked

1. **Split deployment setup**: Cannot create `.clasp.production.json` without production script ID
2. **Production deployment**: Cannot run `npm run deploy:production` without script ID
3. **End-to-end testing**: Cannot execute test from CLI (requires browser access to run `initializeConfigSheet()`, `initializeAlertLogSheet()`, submit forms, and check email)

---

## Next Steps

### For @browser (Human Verification)

**PRIORITY 1: Get Production Script ID**
1. Open https://docs.google.com/spreadsheets/d/1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI/edit
2. Extensions → Apps Script → Project Settings
3. Copy Script ID
4. Provide to @code for split deployment setup

**PRIORITY 2: Test Email Alerts on Staging**
1. Follow `docs/P2_4_EMAIL_ALERT_TEST_PLAN.md` step-by-step
2. Run `initializeConfigSheet()` and `initializeAlertLogSheet()` in Apps Script editor
3. Configure email recipient via dashboard Settings panel
4. Submit test delivery with cooler temp = 45°F
5. Verify email received and Alert Log shows SUCCESS
6. Report results (PASS/FAIL)

### For @code (Automated)

**Once Production Script ID Provided**:
1. Create `.clasp.staging.json`:
   ```json
   {
     "scriptId": "1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP",
     "rootDir": "./apps_script"
   }
   ```
2. Create `.clasp.production.json`:
   ```json
   {
     "scriptId": "[PRODUCTION_SCRIPT_ID_HERE]",
     "rootDir": "./apps_script"
   }
   ```
3. Update `package.json` scripts to use config files:
   ```json
   "deploy:staging": "clasp push --config .clasp.staging.json",
   "deploy:production": "clasp push --config .clasp.production.json"
   ```
4. Update Code.gs for production (replace staging sheet ID with production sheet ID)
5. Deploy to production: `npm run deploy:production`
6. Test email alerts on production (same procedure as staging)

---

## Files Modified

| File | Change | Commit |
|------|--------|--------|
| `.clasp.json` | Added staging script ID | eae49c8 |
| `apps_script/appsscript.json` | Created manifest file | eae49c8 |
| `apps_script/Code.gs` | Replaced YOUR_SPREADSHEET_ID with staging ID | 10f6de4 |
| `CLAUDE.md` | Added self-sufficiency principles | fe75adc |
| `docs/P2_4_EMAIL_ALERT_TEST_PLAN.md` | Created test procedure | ad4bdce |

---

## Conclusion

**What I Determined**:
- ✅ **Staging script ID**: `1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP`
- ✅ **Production deployment URLs**: `AKfycbxXVDl_...` (forms), `AKfycbzt-...` (dashboard)
- ❌ **Production script ID**: Not found in repo or accessible via clasp

**How I Determined It**:
1. Cross-referenced `npx clasp list` with git history
2. Grepped all repo files for script IDs (only found staging)
3. Tested production dashboard URL - confirmed live data
4. Checked clasp deployments - only shows staging deployments
5. Reviewed commit history - production URLs added but no script IDs

**Test Results**:
- ⏳ Pending manual execution via browser (test plan provided)

**Safer Default Taken**:
- Deployed to **staging first** (not production)
- Documented comprehensive test procedure
- Flagged missing production script ID as blocker
- Prepared all artifacts for split deployment once ID is obtained

---

**Report End**
