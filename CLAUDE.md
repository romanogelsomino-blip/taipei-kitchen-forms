# Active Retainer Client

**Client:** Universo Le App Studios
**Contact:** leandertoney@gmail.com
**Status:** Active monthly retainer (started June 2026)

This project is under active retainer contract. All work on this codebase is **billable consulting time**. When working on this project:

1. **Document Everything** - Create comprehensive documentation for all architectural decisions and implementation details
2. **Maintainability First** - Prioritize code that future developers (or future Claude Code sessions) can understand and modify
3. **Handoff Ready** - Assume this project will be handed off; avoid shortcuts that create technical debt
4. **Tech Stack Alignment** - Follow the client's preferred stack and conventions (Apps Script, Supabase, GitHub Pages)
5. **Communication** - Be transparent about scope, timeline, risks, and blockers

**Current retainer scope:**
- Full backend migration from Google Sheets to Supabase (phased over 3-6 months)
- New forms development (temperature check form, UX improvements)
- Dashboard enhancements
- Proactive monitoring and alerting
- Ongoing support for production issues

**Work philosophy:** Underpromise, overdeliver. Set conservative estimates. Flag risks early. Build maintainable systems that outlive the retainer contract.

---

# Claude Code Project Conventions

This file documents standards for all Claude Code sessions working on this project. Read this FIRST before making changes.

---

## Automation-First Principle

When verifying or operating a feature, every step that CAN be automated via clasp, curl, or npm scripts MUST be automated. Manual user steps are only acceptable when they require genuine human-in-browser interaction (UI rendering verification, OAuth consent screens, form submissions with hardware like camera/photo capture). "Just do it manually this one time" is the failure mode that creates permanent toil. Build the automation, then verify with it.

### Examples of What MUST Be Automated
- ✅ Triggering Apps Script functions → `npm run email:summary:staging`
- ✅ Reading execution logs → `npm run test:log:staging`
- ✅ Listing triggers → `npm run test:triggers:staging`
- ✅ Creating triggers → `npm run trigger:create:staging`
- ✅ Testing error handling → `npm run test:malformed:staging`
- ✅ Health checks → `npm run ping:staging`

### Examples of What Requires Manual User Action
- ❌ Triggering JavaScript errors in browser console (requires DevTools)
- ❌ Submitting forms with photo capture (requires camera hardware)
- ❌ Verifying UI rendering (requires visual inspection)
- ❌ OAuth consent flows (requires user interaction)

### When Building New Features
1. Write the feature
2. Write npm scripts to verify the feature
3. Document the verification commands in README or /docs
4. Never ask user to "just run this function manually in Apps Script editor"

---

## Observability Principle (READ THIS FIRST)

**Observability is not optional.** Every production feature must have logging that proves it executed correctly AFTER the user closes their browser.

### Standards
- ✅ **Dashboard**: JavaScript errors tracked in Sentry (not just console.log)
- ✅ **Apps Script**: Every doPost() execution logged to "Execution Log" sheet with timestamp, formType, rowCount, photoSize, status, error, duration
- ✅ **Testing**: "Curl returned 200" is NOT observability. Logs are observability.
- ✅ **Verification**: New features ship with a log entry that proves they ran
- ✅ **Alerting**: Daily summary email with error counts (not just success metrics)
- ✅ **Error Tracking**: Sentry captures JavaScript errors in production dashboard
- ✅ **Execution Audit**: Apps Script logs survive browser closure and provide forensic trail

### When a Bug is Reported
Before fixing, check:
1. **Sentry dashboard** for related JavaScript errors (https://sentry.io)
2. **Execution Log sheet** for related doPost() failures
3. **Apps Script execution logs** for quota/timeout issues (View → Executions in Apps Script editor)
4. **Daily summary emails** for patterns over time
5. If logs show no issues = user error or environmental issue, not code bug

### Observability Tools in This Project
- **Sentry**: Error tracking for dashboard (DSN in dashboard/app.js)
- **Execution Log**: Sheet tab with every doPost() call (auto-created on first submission)
- **Daily Summary Email**: Sent at 9am to support@universoleappstudios.com
- **Apps Script Logger**: Console logs in Apps Script editor (View → Logs)

### Case Study: The Observability Gap (June 1-26, 2026)

**Context**: Photo upload pipeline stopped working on June 1, 2026 due to deployment drift. Debugging was difficult because execution logging wasn't deployed to production until June 26.

**The Gap**:
- June 1: `clasp push` introduced to production (first programmatic deployment)
- June 1-17: Execution logging existed in git but not deployed to production
- June 18: Execution logging deployed to production Apps Script
- June 18-26: Logging active but not visible (deployment didn't update Web App URL)
- June 26: Execution logging finally visible in production

**Impact**:
- 25 days of silent failures with no server-side visibility
- Debugging relied on:
  - Manual form submissions with browser console inspection
  - Spreadsheet inspection for ORPHAN photos (Drive uploads without sheet URLs)
  - Git history analysis to find when code diverged
- Could not answer: "Did submissions reach the server?" for June 1-26

**Lesson**: Observability infrastructure must be deployed BEFORE features that depend on it. The photo pipeline should not have been re-implemented (June 18) without first confirming that execution logging was active and visible in production.

**Prevention**:
1. ✅ Verify observability tools are working in production before building new features
2. ✅ Test that logs are accessible via npm scripts (not just present in code)
3. ✅ If re-implementing a feature that previously worked, prioritize logging over functionality
4. ✅ Execution logging should be among the FIRST features deployed, not an afterthought

---

## Photo Storage Infrastructure

**CANONICAL DRIVE FOLDER** (READ THIS FIRST):

```
Name:  Taipei Kitchen Photos
ID:    1gCVZ767RjlSDqgzWkPQKntjmyHbfBO_g
Owner: Romano Gelsomino (romanogelsomino@gmail.com)
URL:   https://drive.google.com/drive/folders/1gCVZ767RjlSDqgzWkPQKntjmyHbfBO_g
```

**Critical Rules**:
1. ✅ **NEVER hardcode folder IDs** - Always use `DriveApp.getFoldersByName('Taipei Kitchen Photos')`
2. ✅ **Single source of truth** - All photo operations (upload, search, backfill) use the SAME folder lookup
3. ✅ **Folder created automatically** - Code creates folder if it doesn't exist (first photo upload)
4. ✅ **Owned by Romano** - The Apps Script runs under Romano's Google account, so he owns the folder

**Folder References in Code.gs**:
- Line ~17: `authorizeDriveAccess()` - Drive authorization helper
- Line ~173: Photo upload handler (doPost)
- Line ~606: Daily summary email (photo count)
- Line ~2264: `findPhotos` endpoint (diagnostic)
- Line ~2400: `backfillPhotoLinks` endpoint (recovery)

**Common Mistake to Avoid**:
- ❌ Do NOT create separate folders for "staging" vs "production" photos
- ❌ Do NOT use hardcoded folder IDs like `getFolderById('...')`
- ❌ Do NOT reference any folder other than "Taipei Kitchen Photos"

**Photo Naming Convention**:
```
{storeId}_{date}_before.jpg
{storeId}_{date}_after.jpg

Examples:
6253_2026-06-30_before.jpg
6253_2026-06-30_after.jpg
```

**Historical Context** (June 2026 Photo Recovery):
- **Issue**: Photos from 6/30/26 were uploaded but URLs not written to sheet
- **Root Cause #1**: Store ID format mismatch ("Store 6253 - ..." vs "6253")
- **Root Cause #2**: Backfill endpoint initially searched wrong folder (hardcoded "Bento Photos" ID)
- **Resolution**: Fixed both bugs, unified all code to use `getFoldersByName('Taipei Kitchen Photos')`
- **Lesson**: Hardcoded folder IDs are dangerous - always use name-based lookup

**Verification Commands**:
```bash
# Search for photos on a specific date
source .env.production
curl -sL "${WEB_APP_URL}?action=findPhotos&token=${ADMIN_TOKEN}&date=2026-06-30"

# Backfill photo links for orphaned photos
curl -sL "${WEB_APP_URL}?action=backfillPhotoLinks&token=${ADMIN_TOKEN}&date=2026-06-30"
```

---

## Decision-Making & Self-Sufficiency

- **Investigate before asking**. Make reasonable defaults and report what you did. Only ask when there's genuinely no way to determine the answer from the repo, available tools, git history, or conversation context.
- **If the dashboard is live and pulling real data, the credentials, IDs, URLs, and config are ALREADY in this repo**. Trace them, don't ask.
- **Cross-reference sources**: grep the codebase, check git log, inspect deployed URLs, run `npx clasp list`, read docs in /docs. Deduce, don't interrogate.
- **When in doubt between two reasonable options**, pick the safer default (staging over production, hide over disable, etc.), proceed, and flag the choice in your status report.
- **Asking the user for info the system already has access to = a failure mode**. Do the work.

---

## Deployment & Infrastructure

### Apps Script

#### Deployment Flow (ALWAYS Staging → Production)
- ✅ **STAGING FIRST**: `npm run deploy` or `npm run deploy:staging` - deploys to staging script
- ✅ **TEST**: Execute end-to-end tests on staging (email alerts, forms, dashboard)
- ✅ **PRODUCTION**: Only after staging tests pass: `npm run deploy:production`
- ✅ **NEVER** skip staging - production issues are catastrophic for live operations

#### Deployment Drift Prevention (CRITICAL)

**Principle**: Live Apps Script code that's not in git is a bug to be fixed, not a feature to preserve.

**Lesson Learned (Issue G - Photo Pipeline Regression)**:
- May 7, 2026: Code.gs manually copied to git from live Apps Script editor
- May 7 - June 1: Photo handler existed in live production but was never committed to git
- June 1: First `clasp push` to production overwrote working photo handler (deployment drift)
- Result: Photos stopped working for 17 days until handler was re-implemented in git

**Prevention Rules**:
1. ✅ **ALL code in git**: Never edit code directly in Apps Script editor
2. ✅ **Before clasp push**: If uncertain about drift, manually verify live code matches git
   - Open Apps Script editor → Compare key functions (doPost, doGet)
   - Check for functions that exist in production but not in git
   - Document any differences before deploying
3. ✅ **After deployment**: Update ALL form URLs immediately in the same commit
   - Forms must point to the CURRENT Web App deployment
   - Check: delivery form, production form, dashboard
   - Verify URLs in .env.staging and .env.production match deployed Web App
4. ✅ **URL tracking**: Web App URLs change with each deployment
   - Old URLs become stale and point to old code
   - Forms pointing to old URLs will use outdated handlers
   - Always update .env files + form HTML after creating new deployment
5. ✅ **Monitoring**: Check Apps Script execution logs regularly for handler mismatches
   - Missing handlers log errors like "Unknown formType" or silent failures
   - Orphaned photos (Drive upload without sheet URL) indicate URL mismatch

**When Drift is Detected**:
- DO NOT just deploy git to fix it
- First: Capture the live code that's not in git (may have unreleased fixes)
- Then: Reconcile differences and add missing features to git
- Finally: Deploy from git as source of truth

#### Configuration
- ✅ **Split Deployment**: `.clasp.staging.json` and `.clasp.production.json` in repo root
- ✅ **Dynamic Config**: `.clasp.json` is generated by npm scripts (gitignored)
- ✅ **NO Hardcoded IDs**: Spreadsheet IDs in Code.gs must match environment
- ✅ **Staging Sheet**: `1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E`
- ✅ **Production Sheet**: `1LP7MerVCPIMBj2hIFoAvomkjHR-GuCC6MeH5INEeOAI`

#### Commands
```bash
# Deploy to staging (default - safer)
npm run deploy

# Deploy to staging (explicit)
npm run deploy:staging

# Deploy to production (ONLY after staging tests pass)
npm run deploy:production

# Initialize Config and Alert Log sheets on staging
npm run init:staging

# Initialize Config and Alert Log sheets on production
npm run init:production

# Test email alerts end-to-end on staging
npm run test:violation:staging

# Test email alerts end-to-end on production
npm run test:violation:production

# Open staging script in browser
npm run open:staging

# Open production script in browser
npm run open:production
```

#### Automation Philosophy
- ✅ **NO GUI CLICKING**: All Apps Script functions must be runnable via npm scripts
- ✅ **NO MANUAL STEPS**: Setup, testing, and maintenance fully automated via HTTP endpoints
- ✅ **TESTABLE**: Every Apps Script function has an npm script equivalent
- ✅ **CI-READY**: All commands can run in automated pipelines
- ✅ **PROGRAMMATIC WEB APP DEPLOYMENT**: Use `bash scripts/create-webapp-deployment.sh <staging|production>` to create deployments via Apps Script API

#### Admin Token Authentication Pattern

All admin endpoints are protected by UUID tokens stored in Script Properties. This enables secure automation without manual GUI access.

**Token Management**:
```bash
# Generate initial token (first time only)
curl -sL "${WEB_APP_URL}?action=setupAdminToken"
# Response: {"status":"SUCCESS","token":"uuid-here",...}

# Force regenerate token (invalidates old one)
curl -sL "${WEB_APP_URL}?action=setupAdminToken&force=true"
# Response: {"status":"SUCCESS","token":"new-uuid",...}

# Rotate token (requires current valid token)
source .env.staging && curl -sL "${WEB_APP_URL}?action=rotateAdminToken&token=${ADMIN_TOKEN}"
# Response: {"status":"ok","newToken":"new-uuid",...}
```

**Protected Admin Endpoints**:
- `?action=init&token=xxx` - Initialize Config + Alert Log sheets
- `?action=resetConfig&token=xxx` - Delete and reinitialize Config sheet
- `?action=test&token=xxx` - Simulate HACCP violation and send email
- `?action=ping&token=xxx` - Health check (returns sheet ID and environment)
- `?action=debugConfig&key=xxx&token=xxx` - Inspect raw config value types

**Security**:
- Tokens stored in `.env.staging` and `.env.production` (gitignored)
- All admin actions verify token via `verifyAdminToken()`
- `setupAdminToken` is the only endpoint that doesn't require auth (one-time setup)
- Use `force=true` cautiously - invalidates all existing tokens immediately

**Web App Deployment Automation**:
```bash
# Create new Web App deployment programmatically (no browser required)
bash scripts/create-webapp-deployment.sh staging
bash scripts/create-webapp-deployment.sh production

# Process:
# 1. Creates version via Apps Script API
# 2. Creates deployment with webapp config from appsscript.json
# 3. Returns deployment URL
# 4. Updates .env.staging or .env.production

# IMPORTANT: This creates a NEW deployment URL
# Old URLs will stop working - update .env files immediately
```

**Example**: Adding a new protected endpoint
```javascript
// In Code.gs - inside doGet(e)
if (e.parameter.action === 'myAction') {
  if (!verifyAdminToken(e.parameter.token)) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Your protected logic here
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', result: 'data' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```
```json
// In package.json
"scripts": {
  "myAction:staging": "node scripts/admin-action.js staging myAction",
  "myAction:production": "node scripts/admin-action.js production myAction"
}
```

### GitHub Pages
- ✅ **BRANCHES**: Push to BOTH `main` AND `gh-pages` after every feature
- ✅ **COMMAND**: `git push origin main && git checkout gh-pages && git merge main --no-edit && git push origin gh-pages && git checkout main`
- ✅ **URL**: https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/

---

## Commit Standards

### Format
- **Feature**: `Feature: Add multi-select filters for store and day-of-week`
- **Fix**: `Fix: HACCP banner dismissal not persisting across refresh`
- **Docs**: `Docs: Update README with v2.1 release notes`
- **Refactor**: `Refactor: Extract multi-select component to shared utility`

### Rules
- ✅ **ONE FIX = ONE COMMIT** (no bundling unrelated changes)
- ✅ **DESCRIPTIVE**: Commit message explains WHAT and WHY, not just "updates"
- ✅ **CO-AUTHOR**: Always add Claude co-author footer:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

---

## User-Facing Features

### Completeness Standard
- ❌ **NEVER** ship features with disabled buttons saying "Requires backend integration"
- ✅ **EITHER**: Finish the full stack (frontend + backend + testing)
- ✅ **OR**: Hide the incomplete feature entirely
- ✅ **EXCEPTION**: Clearly document as "Phase 2" with timeline in `docs/` folder

### Guided Tour
- ✅ **UPDATE** `dashboard/index.html` tour steps for EVERY user-facing feature
- ✅ **VERSION BUMP**: Increment `TOUR_VERSION` when adding new steps
- ✅ **TEST**: Verify tour highlights new features correctly

### README Updates
- ✅ **SECTION**: Update "Recent Improvements" in README.md with every release
- ✅ **FORMAT**:
  ```markdown
  - **v2.1** (2026-05-24): Multi-select filters, case fullness analytics, HACCP drill-down, violation email alerts
  ```

---

## Testing Requirements

### Before Every Push
- ✅ **MOBILE**: Test on iPhone Safari + Android Chrome (or provide testing checklist for @browser)
- ✅ **RESPONSIVE**: Verify layout works at 320px, 768px, 1024px, 1920px widths
- ✅ **DARK MODE**: Check all new UI in both light and dark themes
- ✅ **BROKEN STATES**: Test with empty data, missing fields, API errors
- ✅ **FRESH PAGE LOAD**: Always test production with full browser refresh (Cmd+Shift+R / Ctrl+F5)
  - Verify console is clean (no errors, no undefined warnings)
  - Check status indicator shows "Live" not "Fetch failed"
  - Confirm all panels render correctly (Overview, Deliveries, Production, Food Safety, Waste)
  - Passing curl tests is NOT sufficient - dashboard rendering must be verified

### Pre-Deployment Checklist
```bash
# 1. Run local tests (if applicable)
npm test

# 2. Verify dashboard loads in browser
open http://localhost:8000  # or preview in IDE

# 3. Check console for errors
# Look for: CORS issues, 404s, undefined variables

# 4. Test new feature end-to-end
# Example: Add filter → Apply → Clear → Verify data resets

# 4a. Test photo upload pipeline (REQUIRED if touching form handlers)
npm run test:photo:production
# Verify: Photos upload to Drive AND link to sheet rows
# This prevents photo pipeline regressions like Issue G

# 5. Commit & push to BOTH branches
git push origin main
git checkout gh-pages && git merge main --no-edit && git push origin gh-pages
git checkout main

# 6. Verify live URL works
curl -I https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/
```

---

## Code Quality Standards

### JavaScript
- ✅ **NO** jQuery or other legacy libraries (vanilla JS only)
- ✅ **ASYNC**: Use `async/await`, not `.then()` chains
- ✅ **ERRORS**: Always catch and log errors (don't fail silently)
- ✅ **COMMENTS**: Explain WHY, not WHAT (code should be self-documenting)
- ✅ **ERROR ISOLATION**: Each data source must handle its own errors independently
  - fetchData() merges properties instead of replacing DATA object
  - Individual endpoint failures (e.g., fetchViolations) must NOT crash sibling data sources
  - Use defensive coding: check arrays exist before .map(), .filter(), .sort()
  - Status indicator shows "error" only when ALL critical sources fail
  - Log errors with full context: error message, stack trace, request URL, response body

### CSS
- ✅ **VARIABLES**: Use CSS custom properties (`--red`, `--cream`) from `:root`
- ✅ **MOBILE-FIRST**: Write mobile styles first, desktop in `@media (min-width: ...)`
- ✅ **DARK MODE**: All new styles must work in `[data-theme="dark"]`

### Apps Script
- ✅ **LOGGING**: Use `Logger.log()` for debugging, not `console.log()`
- ✅ **ERROR HANDLING**: Wrap MailApp/Sheet calls in try/catch
- ✅ **SHEETS**: Always check if sheet exists before reading/writing

### Payload Verification Principle

When re-implementing existing functionality, **read the sender's actual payload format before writing the receiver**. Do not guess at data structure. The cost of 30 seconds of verification beats 11 days of silent production failure.

**Case Study (Issue G - Photo Pipeline Bug, June 18-29, 2026)**:

Claude Code re-implemented the photo handler on June 18 after it was lost to deployment drift. The implementation made incorrect assumptions about the payload structure:

**Assumptions Made** (WRONG):
- Form sends: `{ data: "data:image/jpeg;base64,ABC123...", type: "image/jpeg" }`
- Code should: `data.split(',')[1]` to extract base64, reference `photo.type`

**Actual Payload** (CORRECT):
- Form sends: `{ data: "ABC123...", mimeType: "image/jpeg" }`
- Data already stripped of prefix, property named `mimeType` not `type`

**Result**:
- Bug: `photo.data.split(',')[1]` returned `undefined` (no comma in already-stripped data)
- Bug: `photo.type` was `undefined` (property doesn't exist)
- Impact: 90% photo upload failure rate (27 of 30 attempts) for 11 days
- Failure was invisible due to `mode: 'no-cors'` in form fetch requests

**Prevention Checklist**:
- [ ] Read sender code (form HTML) to see exact JSON structure sent
- [ ] Add debug logging to show first payload received (log first 50 chars of data)
- [ ] Verify property names match exactly (`mimeType` vs `type`, `data` format)
- [ ] Test with real data before deploying (don't rely on assumptions)
- [ ] If guessing, add a comment explaining the assumption and verify it immediately

**Correct Approach**:
```javascript
// ✅ CORRECT: Read form code first
// Form sends: photoData[which] = { data: compressed.dataUrl.split(',')[1], mimeType: 'image/jpeg' }
// Data is already pure base64 string, no prefix

const blob = Utilities.newBlob(
  Utilities.base64Decode(photos.before.data),  // No split needed
  photos.before.mimeType,                       // Not photos.before.type
  `${photos.storeId}_${photos.date}_before.jpg`
);
```

**Wrong Approach**:
```javascript
// ❌ WRONG: Assumed standard data URL format without checking
const blob = Utilities.newBlob(
  Utilities.base64Decode(photos.before.data.split(',')[1]),  // Splits already-split data
  photos.before.type,                                          // Property doesn't exist
  `${photos.storeId}_${photos.date}_before.jpg`
);
```

---

## Documentation

### Required Docs
- ✅ **README.md**: User-facing feature list + setup instructions
- ✅ **COORDINATION.md**: Task status + handoff notes between @code and @browser
- ✅ **docs/**: Technical specs, testing checklists, API docs

### When to Document
- ✅ **NEW FEATURE**: Add to README "Recent Improvements"
- ✅ **API CHANGE**: Update Apps Script doGet/doPost docs
- ✅ **BREAKING CHANGE**: Add migration guide in docs/
- ✅ **PHASE 2**: Document deferred work with timeline + requirements

---

## Common Mistakes to Avoid

### ❌ DON'T
- Ship disabled buttons with "coming soon" tooltips
- Commit multiple unrelated fixes in one commit
- Push to `main` without also pushing to `gh-pages`
- Hardcode spreadsheet IDs or emails in Code.gs
- Add guided tour steps without bumping version
- Skip mobile testing ("it works on desktop")
- Leave TODOs in production code
- Forget to update README after shipping

### ✅ DO
- Test on actual mobile devices before marking feature complete
- Update guided tour AND README for every user-facing change
- Use `clasp push` for Apps Script deployment
- One commit per logical change
- Check COORDINATION.md for current task ownership
- Ask if unsure whether feature is in scope
- Document deferred work clearly (don't just disable buttons)

---

## File Structure

```
/
├── apps_script/
│   └── Code.gs              # Apps Script source (deployed via clasp)
├── dashboard/
│   ├── index.html           # Main dashboard UI
│   ├── app.js               # Dashboard logic
│   ├── styles.css           # Dashboard styles
│   └── config.local.json    # Local config (gitignored)
├── data/
│   ├── drivers.json         # Driver dropdown options
│   ├── stores.json          # Store data + metadata
│   └── supervisors.json     # Supervisor dropdown options
├── docs/
│   ├── HANDOFF.md           # Daily ops procedures
│   ├── SCOPE.md             # Project scope (source of truth)
│   ├── MOBILE_TESTING_CHECKLIST.md
│   └── *.md                 # Feature specs, testing guides
├── taipei_delivery_form3.html
├── taipei_production_form3.html
├── README.md                # User-facing docs
├── COORDINATION.md          # Task board + agent handoffs
├── CLAUDE.md                # This file (conventions)
├── package.json             # Node dependencies (clasp, etc.)
├── .clasp.json              # Clasp project config
└── .gitignore               # Ignored files
```

---

## Questions?

- **Unsure if feature is complete?** Check `docs/P2_4_STATUS_TRACKING_PHASE2.md` for "done vs deferred" examples
- **Don't know commit format?** Look at `git log --oneline -10` for recent examples
- **Mobile testing unclear?** See `docs/MOBILE_TESTING_CHECKLIST.md`
- **Apps Script deployment?** Check `package.json` scripts: `npm run deploy`

---

**Last Updated**: 2026-05-24 (v2.1 release)
