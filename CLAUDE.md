# Claude Code Project Conventions

This file documents standards for all Claude Code sessions working on this project. Read this FIRST before making changes.

---

## Deployment & Infrastructure

### Apps Script
- ✅ **USE**: Automated deployment via `clasp push` (NOT manual copy-paste)
- ✅ **SETUP**: `package.json` + `.clasp.json` configured in repo root
- ✅ **IDs**: NO hardcoded spreadsheet IDs or emails in Code.gs - use `clasp` project settings or config
- ✅ **DEPLOY**: `npm run deploy` pushes Code.gs to both staging and production scripts

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

### CSS
- ✅ **VARIABLES**: Use CSS custom properties (`--red`, `--cream`) from `:root`
- ✅ **MOBILE-FIRST**: Write mobile styles first, desktop in `@media (min-width: ...)`
- ✅ **DARK MODE**: All new styles must work in `[data-theme="dark"]`

### Apps Script
- ✅ **LOGGING**: Use `Logger.log()` for debugging, not `console.log()`
- ✅ **ERROR HANDLING**: Wrap MailApp/Sheet calls in try/catch
- ✅ **SHEETS**: Always check if sheet exists before reading/writing

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
