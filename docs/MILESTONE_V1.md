# Milestone V1 — Taipei Kitchen Bento Ops System

**Version:** 1.0
**Target Completion:** TBD (pending owner approval of timeline)
**Status:** In Progress
**Document Owner:** @code
**Last Updated:** 2026-05-06

---

## Executive Summary

Milestone V1 establishes a production-ready foundation for the Taipei Kitchen Bento Ops system, addressing all critical Known Issues documented in the README while maintaining 100% backward compatibility with the existing Google Sheets integration. This milestone focuses on operational reliability, food safety compliance, and maintainability — essential qualities for a system that supports USDA/FSIS compliance and serves 7 retail locations.

**Core Objectives:**
1. Eliminate data loss from weak network conditions (offline queue + retry)
2. Reduce photo upload failures by 80%+ (client-side compression)
3. Enable self-service store onboarding (JSON-based store data)
4. Establish staging environment for zero-downtime deployments
5. Verify HACCP compliance against current FDA Food Code 2022

**Non-Goals for V1:**
- Driver authentication (deferred to V2 pending owner decision on approach)
- Mobile app development (existing web forms remain primary interface)
- Multi-language support
- Real-time analytics dashboard

---

## Scope of Work

### 1. Core Features (Addresses Known Issues)

#### 1.1 Offline-Resilient Submission Queue (T-007)
**Problem:** Submissions fail when Wi-Fi is weak at Giant locations, especially for photos. Data is lost.

**Solution:**
- Implement localStorage-based submission queue
- Auto-detect network failures and queue failed submissions
- Auto-retry queued submissions on reconnect (using `online` event listener)
- Display queue status in form UI (e.g., "3 pending submissions")
- Manual "Retry All" button for user-initiated retry
- Persist queue across browser sessions
- Deduplication to prevent double-submit on retry

**Acceptance Criteria:**
- [ ] Form detects network failure and saves payload to localStorage
- [ ] Form detects network reconnect and auto-retries queued submissions
- [ ] User sees visual indicator of queued submissions (count badge)
- [ ] User can manually trigger retry via "Retry All" button
- [ ] Successful retry removes item from queue and shows confirmation
- [ ] Queue persists across page refresh and browser close/reopen
- [ ] No duplicate submissions if user retries manually before auto-retry

**Affected Files:**
- `taipei_production_form3.html` (lines ~544–559, existing backup logic)
- `taipei_delivery_form3.html` (lines ~780–793, existing backup logic)

---

#### 1.2 Client-Side Image Compression (T-008)
**Problem:** Photos upload at full size, which is slow on weak connections and may timeout.

**Solution:**
- Compress photos client-side before base64 encoding
- Target: < 500KB per photo, max resolution 1600px (longest edge)
- Use HTML5 Canvas API for resizing and compression
- Preserve EXIF orientation data where possible
- Show compression status to user (e.g., "Original: 3.2MB → Compressed: 450KB")
- Fallback: if compression fails, upload original (with warning)

**Acceptance Criteria:**
- [ ] Photos > 500KB are automatically compressed before submission
- [ ] Compressed photos are ≤ 500KB in 95% of test cases
- [ ] Compressed photos maintain acceptable visual quality for audit purposes
- [ ] User sees compression status before upload (original size → compressed size)
- [ ] Compression does not introduce >2 second delay on mid-range Android phones
- [ ] If compression fails, form shows warning and uploads original

**Affected Files:**
- `taipei_delivery_form3.html` (lines ~505–530, photo handling logic)

---

#### 1.3 JSON-Based Store Data (T-010)
**Problem:** Adding a new store requires editing the form code. Hardcoded store list.

**Solution:**
- Extract `STORES` array from HTML into `data/stores.json`
- Fetch JSON at form load (with caching)
- Maintain backward compatibility: if fetch fails, fall back to hardcoded list in HTML
- Store JSON structure:
  ```json
  {
    "stores": [
      {"id": "6006", "name": "Store 6006", "location": "Kline Village, Harrisburg, PA", "active": true},
      ...
    ],
    "dishes": [
      {"id": "gen-tso", "name": "General Tso Chicken Bento", "active": true},
      ...
    ]
  }
  ```
- Cache JSON in localStorage (1-hour TTL) to reduce network requests

**Acceptance Criteria:**
- [ ] `data/stores.json` file created with all 7 stores
- [ ] Form fetches JSON on load and populates store/dish lists
- [ ] If fetch fails, form falls back to hardcoded list (with console warning)
- [ ] JSON cached in localStorage for 1 hour
- [ ] Adding a new store to JSON makes it appear in form without code changes
- [ ] Inactive stores (active: false) are not shown in form

**Affected Files:**
- **New:** `data/stores.json`
- `taipei_production_form3.html` (line 354, DISHES array)
- `taipei_delivery_form3.html` (lines 445–446, DISHES and STORES arrays)

---

#### 1.4 Store Onboarding Documentation (T-011)
**Problem:** No documented process for adding a new store to the system.

**Solution:**
- Create `docs/ADD_A_STORE.md` with step-by-step guide
- Cover: updating `data/stores.json`, generating QR codes, testing flow, notifying drivers
- Include QR code generation script (Node.js or Python)
- Checklist format for operational handoff

**Acceptance Criteria:**
- [ ] `docs/ADD_A_STORE.md` created
- [ ] Document includes JSON update instructions
- [ ] Document includes QR code generation steps
- [ ] Document includes testing checklist (staging → production)
- [ ] QR code generation script included (or link to online tool with exact params)

**Affected Files:**
- **New:** `docs/ADD_A_STORE.md`

**Depends On:** T-010 (JSON-based store data)

---

### 2. Infrastructure & Testing

#### 2.1 Staging Environment (T-017)
**Problem:** No safe environment for testing changes before production deployment.

**Solution:**
- Create `gh-pages-staging` branch in GitHub (parallel to `gh-pages` for production)
- Add `STAGING` flag to forms (URL param or build-time flag)
- Staging forms point to sandbox Google Sheet (`TaipeiKitchen_BentoOps_v2_STAGING`)
- Staging URL: `https://{user}.github.io/taipei-kitchen-forms/staging/`
- Production URL: `https://{user}.github.io/taipei-kitchen-forms/` (unchanged)

**Coordination Required:**
- @browser creates duplicate sandbox sheet with same structure as live sheet
- Owner approves creation of sandbox sheet (permission change required)

**Acceptance Criteria:**
- [ ] `gh-pages-staging` branch exists and auto-deploys via GitHub Actions
- [ ] Staging forms have `STAGING=true` flag that routes submissions to sandbox sheet
- [ ] Sandbox sheet (`TaipeiKitchen_BentoOps_v2_STAGING`) created by @browser
- [ ] Staging URL is accessible and isolated from production
- [ ] All form features work identically in staging and production
- [ ] README documents staging vs production URLs

**Affected Files:**
- **New:** `.github/workflows/deploy-staging.yml` (if using GitHub Actions)
- `taipei_production_form3.html` (add STAGING flag check)
- `taipei_delivery_form3.html` (add STAGING flag check)
- `README.md` (document staging URL)

**Depends On:** @browser creates sandbox sheet (requires owner approval)

---

#### 2.2 Test Plan Documentation (T-018)
**Problem:** No formal acceptance criteria for new features. Ad-hoc testing is error-prone.

**Solution:**
- Create `docs/TEST_PLAN.md` with explicit pass/fail criteria for each feature
- One section per feature (offline queue, image compression, store JSON, HACCP, etc.)
- Include regression tests (existing features must not break)
- Include weak-network simulation steps (DevTools Slow 3G)
- Document expected behavior for edge cases (e.g., overnight cooling, negative inventory)

**Acceptance Criteria:**
- [ ] `docs/TEST_PLAN.md` created
- [ ] Plan includes test cases for all v1 features (T-007, T-008, T-010)
- [ ] Plan includes regression tests for HACCP compliance
- [ ] Plan includes weak-network simulation steps
- [ ] Plan includes mobile device testing checklist (iOS Safari, Android Chrome)
- [ ] Each test case has explicit pass/fail criteria

**Affected Files:**
- **New:** `docs/TEST_PLAN.md`

---

### 3. Documentation & Compliance

#### 3.1 Form Audits (T-003, T-004)
**Status:** ✅ Complete (PR #1, PR #2 opened)

**Deliverables:**
- `docs/PRODUCTION_FORM_AUDIT.md` — complete field inventory, validation rules, endpoint documentation
- `docs/DELIVERY_FORM_AUDIT.md` — same, plus photo handling and corrective action workflow

**No further work required for v1.**

---

#### 3.2 HACCP Compliance Verification (T-012)
**Problem:** Cooling rule logic was implemented based on general HACCP guidelines. Needs verification against current FDA Food Code 2022 / FSIS guidance.

**Solution:**
- @browser reviews FDA Food Code 2022 Section 3-501.14 (cooling requirements)
- @browser reviews FSIS Appendix A (time/temperature guidelines for RTE foods)
- @browser documents findings in COORDINATION.md under T-012
- If discrepancies found, create follow-up task to adjust cooling rule thresholds

**Acceptance Criteria:**
- [ ] @browser completes review of FDA Food Code 2022 Section 3-501.14
- [ ] @browser completes review of FSIS guidance for ready-to-eat foods
- [ ] Findings documented in COORDINATION.md (comment block under T-012)
- [ ] If changes needed, new task created with specific threshold adjustments

**Affected Files:**
- `COORDINATION.md` (T-012 section)

**Owner:** @browser

---

### 4. Deferred to V2 (Not in Scope for V1)

#### 4.1 Driver Authentication (T-009)
**Status:** NEEDS-OWNER

**Reason for Deferral:**
- Requires owner decision on approach (PIN vs Google sign-in vs signed-token QR)
- Security implications need careful evaluation
- Low immediate risk: forms are accessed via QR codes posted in restricted areas (Giant employee break rooms, production kitchen)
- Can be added in V2 without breaking changes

**Action for V1:**
- @code drafts proposal (`docs/T-009-AUTH-PROPOSAL.md`) comparing 3 approaches
- Owner reviews and selects approach for V2
- Implementation happens in V2 milestone

---

#### 4.2 Mobile App (T-013)
**Status:** NEEDS-OWNER

**Reason for Deferral:**
- Unclear if mobile app is in scope at all
- Existing web forms work well on mobile browsers
- App development would be a major undertaking (iOS + Android)
- No blocking issues with current web-based approach

**Action for V1:**
- @browser inventories App Store Connect / Play Console for any existing Taipei Kitchen app entry
- Owner confirms whether mobile app is desired for future
- If yes, deferred to V2 or later milestone

---

## Success Metrics

V1 is considered **successfully delivered** when all of the following are true:

### Functional Completeness
- [ ] All "Acceptance Criteria" checkboxes in sections 1.1–1.4 and 2.1–2.2 are checked
- [ ] All v1 feature PRs are merged to `main`
- [ ] Staging environment is fully operational and isolated from production

### Testing & Quality
- [ ] @browser completes T-019 smoke test on staging (end-to-end form submission + verification)
- [ ] @browser completes T-020 regression test (HACCP flags, all stores load, weak-network sim, photo < 500KB)
- [ ] All tests in `docs/TEST_PLAN.md` pass on staging

### Compliance & Documentation
- [ ] HACCP compliance verified (T-012 complete)
- [ ] All documentation deliverables present (audits, test plan, store onboarding guide, this milestone doc)

### Production Readiness
- [ ] UAT completed with Romano at one pilot location (T-021)
- [ ] Owner approves promotion to production
- [ ] Production deployment completes without errors
- [ ] All 7 stores verified working on production after deployment

### Operational Handoff
- [ ] README updated with staging URL, new features, store onboarding instructions
- [ ] Handoff session with Romano (or designated point of contact) to review new features
- [ ] Incident response plan documented (what to do if form breaks, queue fills up, etc.)

---

## Out of Scope for V1

The following are explicitly **not** included in V1:

- Driver authentication (T-009) — deferred to V2
- Mobile app development (T-013) — pending owner decision
- Real-time analytics dashboard
- Multi-language support (Spanish, Mandarin, etc.)
- Integration with POS systems or existing Giant inventory systems
- SMS/email notifications for temperature violations
- Automated report generation (weekly summaries, waste analysis, etc.)
- Advanced caching strategies (service workers, offline-first PWA)
- Photo deletion/editing after submission
- Form versioning / migration strategy (will be needed for V2+)

---

## Dependencies & Risks

### Critical Dependencies

| Dependency | Owner | Status | Risk Level | Mitigation |
|---|---|---|---|---|
| Sandbox sheet creation | @browser + owner approval | Pending | Medium | @browser requests approval early; fallback: use live sheet with test flag |
| Apps Script code snapshot | @browser (T-006) | Pending | Low | Not blocking for form changes; can proceed in parallel |
| HACCP verification | @browser (T-012) | Pending | Medium | If changes needed, may extend timeline; verification can happen after feature work |
| Owner decision on auth approach | Owner | Pending | Low | Not blocking for V1; deferred to V2 |

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| localStorage quota exceeded on older phones | Low | High | Implement queue size limit (max 50 items); warn user if approaching limit |
| Image compression breaks on iOS Safari | Medium | High | Extensive testing on iOS 14+; fallback to original if compression fails |
| JSON fetch blocked by CORS on GitHub Pages | Low | Medium | Host JSON in same origin; fallback to hardcoded list if fetch fails |
| Staging env accidentally used in production QR codes | Low | High | Clear visual distinction (staging banner); different URL structure |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Romano unavailable for UAT | Medium | Low | Schedule UAT early; designate backup tester (kitchen supervisor) |
| Giant locations have restrictive content filtering | Low | High | Test from Giant Wi-Fi during T-019; have fallback plan (mobile hotspot instructions) |
| Breaking change in Google Sheets API | Low | High | Monitor Google Apps Script deprecation notices; maintain Apps Script code in repo (T-006) |

---

## Timeline Estimate

**Note:** Timeline pending owner approval. Estimated below assumes @code and @browser work in parallel.

| Phase | Tasks | Estimated Duration | Dependencies |
|---|---|---|---|
| **Phase 1: Foundation** | T-015 (this doc), T-018 (test plan), T-010 (stores.json), T-011 (onboarding doc) | 3–5 days | None |
| **Phase 2: Feature Development** | T-007 (offline queue), T-008 (image compression) | 5–7 days | T-018 (test plan) |
| **Phase 3: Infrastructure** | T-017 (staging env), T-012 (HACCP verification) | 3–5 days | Owner approval for sandbox sheet |
| **Phase 4: Testing** | T-019 (smoke test), T-020 (regression) | 2–3 days | Phase 2 & 3 complete |
| **Phase 5: UAT & Deploy** | T-021 (UAT), production deployment | 2–3 days | Phase 4 complete |
| **Total** | | **15–23 days** | Assumes no blockers |

**Critical Path:** T-017 (staging env) → T-019/T-020 (testing) → T-021 (UAT) → Production deploy

---

## Rollout Strategy

### Pre-Rollout Checklist
- [ ] All v1 feature PRs merged to `main`
- [ ] Staging environment fully tested
- [ ] UAT passed at pilot location
- [ ] Owner approval obtained
- [ ] Rollback plan documented (revert to previous `gh-pages` commit)
- [ ] Incident contact list confirmed (who to call if system breaks)

### Deployment Steps
1. **Staging Deploy:** Merge feature branches → `main` → auto-deploy to `gh-pages-staging`
2. **Staging Verification:** @browser runs T-019 + T-020 test suites
3. **UAT:** Romano (or designee) tests at pilot location using staging URL
4. **Production Deploy:** Tag release (e.g., `v1.0.0`) → merge `main` → `gh-pages` → auto-deploy to production
5. **Production Verification:** @browser verifies all 7 store QR codes still work
6. **Monitor:** Watch for queued submissions, photo upload success rate, error logs (if logging added)

### Rollback Plan
If critical issues arise post-deployment:
1. Revert `gh-pages` branch to previous commit (pre-v1)
2. Notify Romano and drivers immediately
3. Post-mortem: identify root cause
4. Fix issue in `main` + re-test on staging
5. Re-deploy when ready

---

## Post-V1 Roadmap (V2 Preview)

Once V1 is stable in production, the following features are candidates for V2:

- **Driver Authentication (T-009):** Implement selected approach (PIN, Google sign-in, or signed-token QR)
- **Advanced Offline Mode:** Full PWA with service workers, offline-first architecture
- **Photo Gallery View:** Review past delivery photos from within the form
- **Real-Time Validation:** Check for duplicate batch IDs before submit (requires read-enabled Apps Script endpoint)
- **Automated Reports:** Weekly email summaries, waste trend analysis
- **Multi-Location QR Codes:** Single QR code that auto-detects location (via geolocation or Wi-Fi SSID)
- **Dish Suggestions:** Auto-populate "Qty Produced" based on historical averages
- **Integration with Giant POS:** Automatic reporting of shelf sales (if Giant provides API access)

---

## Approval & Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| **Project Owner** | Romano Gelsomino | _Pending_ | _Pending_ |
| **Technical Lead (@code)** | Claude Code | 2026-05-06 | ✓ |
| **Functional Lead (@browser)** | Claude Browser | _Pending_ | _Pending_ |

---

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-06 | Initial milestone document created | @code |

---

**End of Milestone V1 Definition**
