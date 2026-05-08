# COORDINATION — Taipei Kitchen Bento Ops System

> ⚠️ **DEADLINE — per docs/SCOPE.md:** Working prototype within 72 hours of payment. Full system live within **10 BUSINESS DAYS** of payment. Acceptance window 14 calendar days post-go-live.
>
> **Read docs/SCOPE.md FIRST every session.** Both agents must reconcile this task board against SCOPE.md §1–7 at the start of every working session and add tasks for any scope item without coverage before doing other work.

This file is the single source of truth for who is doing what on this project. Two AI agents collaborate here:

- Browser Claude (@browser) — runs in the Chrome extension. Has access to Google Sheets, Google Docs, Gmail, App Store Connect, Play Console, and the deployed forms in a real browser. Cannot run code locally or push commits via CLI.
- Claude Code (@code) — runs locally with full repo access. Owns code edits, commits, branches, PRs, Apps Script files, build/deploy steps. Cannot click around web UIs that require login.

The human owner (Leander) approves merges to main, sensitive permission changes, payments, and anything either agent flags as NEEDS-OWNER.

---

## Client Visibility Rule

**Romano (the client) does not see any changes until the full 72-hour prototype is complete.** All in-progress work lives on the staging sheet (TaipeiKitchen_BentoOps_v2_STAGING), the staging GitHub Pages branch, and feature branches in this repo. No promotion to live, no client-facing demo, no preview links shared with Romano until every task scoped into the 72-hour prototype is REVIEW or DONE. Mid-flight client requests (e.g. T-047) are folded into the prototype delivery rather than being shipped piecemeal.

## How we avoid stepping on each other

### 1. The task board below is the lock
Every task has a single Owner. Do not work on a task you do not own. If you believe a task is mis-assigned, change only the Notes column with a proposed reassignment and stop; the other agent (or owner) will resolve it on next pass.

### 2. Status lifecycle
TODO -> CLAIMED -> IN-PROGRESS -> REVIEW -> DONE, with BLOCKED as a side branch.

- TODO — not yet started, owner is the default.
- CLAIMED — owner has read it and intends to start within this session. Set this BEFORE doing any work, in a single commit that only edits this file.
- IN-PROGRESS — actively being worked on. For @code, this means a feature branch exists. For @browser, this means the relevant tab is open and edits are being made.
- REVIEW — work is complete on the owner's side and needs the OTHER agent (or the owner) to verify. Always name the reviewer in Notes.
- DONE — verified.
- BLOCKED — name the blocker in Notes and @-mention who must unblock.

### 3. Commit protocol (for @code)
- One feature branch per task: task/T-xxx-short-slug.
- Commit messages start with the task ID: [T-014] cache submissions to localStorage.
- Open a PR back to main with the task ID in the title. Do not self-merge. Tag @browser for functional review or leave for owner.
- Before starting work, pull main, then update this file in the SAME first commit on the new branch flipping the task to IN-PROGRESS.

### 4. Browser protocol (for @browser)
- Before touching a Google Sheet / Doc / external console, flip the task to IN-PROGRESS here first via a direct edit to main on COORDINATION.md only (no other files). Use commit message [T-xxx] browser: claim.
- After finishing, flip to REVIEW with a Notes line summarizing what changed and where (sheet name, doc section, etc.) so @code can verify or pick up dependent work.
- Never edit files under /src or any HTML/JS form file — those are @code's domain. If a form change is needed, file it as a new task assigned to @code.

### 5. Conflict rule
If both agents arrive at the same task and see it as TODO:
- @code defers to @browser on anything that touches a logged-in web service.
- @browser defers to @code on anything that ends in a commit.
- If still ambiguous, both stop and add a NEEDS-OWNER note.

### 6. Daily handoff
At the end of any working session, the active agent appends a one-line entry to the Handoff Log at the bottom of this file: timestamp, agent, what moved, what's next.

---

## Domain split (defaults — can be overridden per-task)

| Surface | Default Owner |
|---|---|
| taipei_production_form3.html / taipei_delivery_form3.html | @code |
| Apps Script attached to the master sheet | @code writes -> @browser pastes & authorizes |
| Google Sheet structure (tabs, formulas, formatting, named ranges) | @browser |
| Google Drive photo folder setup & sharing | @browser (owner approval for permission changes) |
| GitHub Pages deploy config, repo settings | @code proposes -> owner applies |
| App Store Connect, Play Console | @browser (owner approval for any submission) |
| Gmail comms with Romano / stores | @browser drafts -> owner sends |
| QR codes, store onboarding docs | @code generates -> @browser distributes |
| Proposal / status doc updates | @browser |

---

## Active Task Board

Task ID format: T-###. Add new tasks at the bottom; never renumber.

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T-001 | Establish this coordination file in repo | @browser | DONE | Initial seed. |
| T-002 | Read & confirm coordination protocol; add @code's acknowledgement line to Handoff Log | @code | TODO | First action on next Claude Code run. |
| T-003 | Audit taipei_production_form3.html — fields, validations, submission endpoint | @code | TODO | Output: docs/PRODUCTION_FORM_AUDIT.md. |
| T-004 | Audit taipei_delivery_form3.html — same | @code | TODO | Output: docs/DELIVERY_FORM_AUDIT.md. |
| T-005 | Audit master sheet TaipeiKitchen_BentoOps_v2 — list all 10 tabs, headers, write vs read | @browser | TODO | Tabs: Delivery Log - Live, Store Lookup, Production Log - Live, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker, Editing Guide, Apps Script Code. Output appended below under Sheet Audit. |
| T-006 | Copy current Apps Script from sheet's Apps Script editor into repo at apps_script/Code.gs | @browser | TODO | Paste raw, no edits. After commit, follow-up tasks reassign to @code. |
| T-007 | Offline-resilient submission: queue in localStorage on network fail, retry on reconnect | @code | TODO | Addresses README Known Issue #1. Branch: task/T-007-offline-queue. |
| T-008 | Client-side image compression before upload (target <500KB, max 1600px) | @code | TODO | Addresses README Known Issue #3. |
| T-009 | Driver auth: lightweight PIN or per-driver QR with signed token | @code | NEEDS-OWNER | Addresses README Known Issue #2. Need owner input on Google sign-in vs simple PIN before coding. |
| T-010 | Move store list out of HTML into a JSON file fetched at form load | @code | TODO | Addresses README Known Issue #4. New file: data/stores.json. |
| T-011 | Add new-store onboarding doc | @code | TODO | docs/ADD_A_STORE.md. Depends on T-010. |
| T-012 | Verify HACCP cooling-rule logic against current FSIS / FDA Food Code 2022 guidance | @browser | TODO | Output: comment block under T-012 below. |
| T-013 | Inventory App Store Connect / Play Console for any Taipei Kitchen app entry | @browser | DONE | Confirmed with owner 2026-05-07: no Taipei Kitchen mobile app in scope. ASC PokerPro entry unrelated. Closed. |
| T-014 | Draft kickoff email to Romano confirming payment received and timeline | @browser | CANCELLED | Cancelled per owner 2026-05-08. No kickoff email needed — client sees prototype only when complete (Client Visibility Rule). |
| T-015 | Define v1 milestone scope and acceptance criteria | @code | TODO | Output: docs/MILESTONE_V1.md mirroring proposal Scope of Work. |
| T-016 | Mirror this board into GitHub Issues (one issue per task, labels owner:browser / owner:code) | @code | TODO | After this file is merged. |
| T-017 | Set up staging: duplicate GitHub Pages branch (gh-pages-staging) + duplicate sandbox sheet TaipeiKitchen_BentoOps_v2_STAGING | @code | IN-PROGRESS | @browser portion DONE 2026-05-07: staging sheet copy created at https://docs.google.com/spreadsheets/d/1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E/edit (in leandertoney@gmail.com Drive). Apps Script copied with sheet. Remaining @code work: create gh-pages-staging branch and wire forms to a STAGING flag pointing at the sandbox sheet's webhook. |
| T-018 | Write docs/TEST_PLAN.md — acceptance checklist per feature (offline queue, image compression, store JSON, driver auth, HACCP flag) | @code | TODO | One section per feature with explicit pass/fail criteria. Source of truth for T-019/T-020/T-021. |
| T-019 | End-to-end smoke test on staging after each merge: scan QR → fill form on phone-sized viewport → verify row in sandbox sheet → verify photo in Drive | @browser | TODO | Run after every PR merge before promotion to live. |
| T-020 | Regression pass before promoting staging to main: HACCP flag still trips, all 7 stores load, weak-network simulation (DevTools Slow 3G), photo upload under 500KB | @browser | TODO | Blocks the final merge to main. |
| T-021 | UAT with Romano on one pilot location before rolling to all 7 stores | @browser | NEEDS-OWNER | Owner picks the pilot store and schedules with Romano. |
| T-022 | Repair broken sheet tabs (Store Lookup, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker) so each populates correctly when filtered | @code | TODO | SCOPE.md §5. Apps Script + formula fixes. Pair with @browser to verify in the live sheet. |
| T-023 | Split Waste Tracker by store so per-location patterns can be analyzed | @code | TODO | SCOPE.md §5. Likely a pivot or a per-store tab driven by Apps Script. |
| T-024 | Build Consolidated Dashboard tab in master sheet — production, waste, delivery (sales when available) across all locations, auto-refreshed | @code | TODO | SCOPE.md §6. New sheet tab + Apps Script triggers for refresh. |
| T-025 | Build daily reconciliation view: produced vs delivered vs sold per dish per day to surface inventory loss | @code | TODO | SCOPE.md §6. Depends on T-024 layout. |
| T-026 | Build weekly food-safety summary per store, regulator/corporate-ready | @code | TODO | SCOPE.md §6. PDF or printable view. |
| T-027 | Lock submission timestamps at moment of entry (regulatory requirement) | @code | TODO | SCOPE.md §3. Capture client time + server time on submit; store both. |
| T-028 | Cleanup of existing production log: dedupe + remove orphaned data | @browser | TODO | SCOPE.md §1. Coordinate with owner before deletions; archive first. |
| T-029 | Reorganize Drive photo folder by store and date for easy Giant corporate sharing | @browser | TODO | SCOPE.md §2. Owner approval required for permission changes. |
| T-030 | Update README with QR code system, deployment workflow, and safe-edit guide | @code | TODO | SCOPE.md §7. Should reference SCOPE.md and COORDINATION.md. |
| T-031 | Written handoff doc: daily ops procedures + how to share Drive photo link with Giant corporate (Microsoft Teams compatible) | @code | TODO | SCOPE.md §7. Output: docs/HANDOFF.md. |
| T-032 | F-01 P0: Replace Driver text field with dropdown sourced from data/drivers.json (Owen, Sam Blumenthal, Andy + Add new) | @code | TODO | FRICTION_AUDIT.md F-01. Eliminates Owen vs Owen-with-trailing-space split. |
| T-033 | F-02 P0: Replace Expire Reason text with dropdown (Out of date, Damaged, Quality Issue, Other-then-text) | @code | TODO | FRICTION_AUDIT.md F-02. Eliminates OOD vs Out of date duplication. |
| T-034 | F-03 P1: Received By store-specific dropdown auto-loaded when QR scanned | @code | TODO | FRICTION_AUDIT.md F-03. Depends on data/stores.json from T-010. |
| T-035 | F-04 P2: Lock Arrival Time format; auto-fill from device clock, tap-to-edit only | @code | TODO | FRICTION_AUDIT.md F-04. |
| T-036 | F-05 P0: Replace Supervisor text field with dropdown sourced from data/supervisors.json (Anna, Lucia, Jiang, Guy + Add new) | @code | TODO | FRICTION_AUDIT.md F-05. Eliminates anna/Anna and lucia/Lucia case-splits. |
| T-037 | F-06 P2: Constrain or annotate Production Kitchen Other option | @code | TODO | FRICTION_AUDIT.md F-06. Confirm with @browser whether Store 6112 is legit. |
| T-038 | F-07 P2: Auto-derive Initials from Supervisor selection | @code | TODO | FRICTION_AUDIT.md F-07. Currently empty on every row. |
| T-039 | F-08 P1: Make Discard Reason required only when Qty Discarded > 0 | @code | TODO | FRICTION_AUDIT.md F-08. 
| T-040 | F-09 P0: Default QA Result to Pass instead of empty | @code | TODO | FRICTION_AUDIT.md F-09. Forces conscious Fail action. |
| T-041 | F-10 P1: Same-as-last-submission one-tap recall for driver/supervisor/kitchen | @code | TODO | FRICTION_AUDIT.md F-10. localStorage-backed. |
| T-042 | F-11 P0: Add Data Validation rules to Driver, Supervisor, Received By columns in master sheet | @browser | TODO | FRICTION_AUDIT.md F-11. Reference same source lists as form dropdowns. |
| T-043 | F-12 P1: Backfill cleanup: trim trailing spaces, normalize case in Driver/Supervisor/Reason columns | @browser | TODO | FRICTION_AUDIT.md F-12. Run after T-042 lands. Archive original first. |
| T-044 | F-13 P1: Photo upload status feedback + retry queue + verify Drive link writes back to sheet | @code | TODO | FRICTION_AUDIT.md F-13. Photo Link columns currently blank in live data. |
| T-045 | F-14 P1: Trip Summary final screen on delivery form with single confirm tap | @code | TODO | FRICTION_AUDIT.md F-14. Replaces 13-row visit confusion. |
| T-046 | F-15 P1: Disable Submit button until required fields filled (no end-of-form alerts) | @code | TODO | FRICTION_AUDIT.md F-15. |
| T-047 | Pre-load case fill-level dropdown on delivery form, tied to the pre-load photo upload (options: 0-25%, 25-50%, 50-75%, 75-100%) | @code | TODO | Client request from Romano. Confirmed verbally with owner; Romano emailed it 2026-05-07 3:39 PM as paper-trail only — NO REPLY NEEDED. New field captures case quantity prior to filling with the day's delivery. Bound to existing pre-load photo step. Persist to Delivery Log - Live as a new column (proposed: Case Pre-Fill %). Update apps_script doPost append accordingly. Folded into 72-hour prototype scope per Client Visibility Rule. |

---

## Testing & Promotion Flow

1. @code opens PR from feature branch.
2. @code self-tests locally and links results in PR description.
3. PR merged to main → auto-deploys to gh-pages-staging (T-017).
4. @browser runs T-019 smoke test on staging.
5. @browser runs T-020 regression before promoting staging → live.
6. T-021 UAT only after T-020 passes.
7. Live promotion = owner approves a `release/*` tag; @code cuts the tag.

---

## Sheet Audit
(populated by T-005)

## Apps Script Snapshot
(populated by T-006 — paste current Code.gs verbatim below this line)

## Handoff Log

- 2026-05-06 — @browser — Created COORDINATION.md, seeded 16 tasks, defined ownership rules. Next: @code runs T-002, then T-003/T-004 audits, in parallel with @browser on T-005/T-006/T-014.
- 2026-05-06 — @browser — Added testing tasks T-017..T-021 and Testing & Promotion Flow section. Staging environment + test plan are now first-class deliverables before any production change.
- 2026-05-06 — @code — Acknowledged COORDINATION.md, claiming T-003 and T-004 next.
- 2026-05-06 — @code — Completed T-002, T-003, T-004. Opened PR #1 (production form audit) and PR #2 (delivery form audit). Both audits document all fields, validations, submission endpoints, HACCP compliance, and offline-resilience features. Next: T-015 (MILESTONE_V1.md), T-018 (TEST_PLAN.md), T-010 (stores.json extraction), and coordinate on T-017 (staging setup). T-009 needs owner input before work begins.
- 2026-05-06 — @code — Completed T-015, T-018, T-010, T-009 (proposal only). Opened PR #3 (MILESTONE_V1.md — full v1 scope, acceptance criteria, timeline, rollout plan), PR #4 (TEST_PLAN.md — 60+ test cases covering all v1 features + regression + UAT), PR #5 (stores.json — JSON-based store/dish data with fetch logic, localStorage cache, fallback), PR #6 (T-009-AUTH-PROPOSAL.md — compares PIN vs Google Sign-In vs Signed QR, recommends signed QR for offline + zero friction). All documentation tasks complete. Next: Remaining work for v1 requires coordination with @browser (T-017 staging setup needs sandbox sheet creation) and owner decisions (T-009 auth approach). Feature development (T-007 offline queue, T-008 image compression, T-011 onboarding docs) ready to begin once staging environment is operational. T-005/T-006 (@browser sheet audit + Apps Script copy) can proceed in parallel.
- 2026-05-06 — @browser — Added docs/SCOPE.md (verbatim proposal). Added deadline banner + reconcile-against-SCOPE rule to top of this file. Added T-022 (sheet repairs), T-023 (waste-by-store), T-024–T-026 (consolidated dashboard, daily reconciliation, weekly food-safety summary), T-027 (locked submission timestamps), T-028 (production log cleanup), T-029 (Drive folder reorganization), T-030 (README refresh), T-031 (handoff doc). @code: pull latest, re-read COORDINATION.md and docs/SCOPE.md before next task.
- 2026-05-06 - @code - Pulled latest. Reading docs/SCOPE.md now to reconcile task board against sections 1-7. Will prioritize work per deadline (10 business days).
  - 2026-05-07 - @browser - Pivot moment. Did a friction & UX audit against live data (Delivery Log 499 rows, Production Log 403 rows). Found Owen vs Owen-with-trailing-space driver split, OOD vs Out of date, anna/Anna/lucia/Lucia supervisor splits, empty Initials/QA/Discard fields across 403 production rows, blank Photo Link columns across all sampled delivery rows. Committed docs/FRICTION_AUDIT.md (P0/P1/P2 fix list F-01..F-15) and added tasks T-032..T-046 mapped to those fixes. Reclassified T-009 (driver auth) as DEFERRED to v2 - F-01 driver dropdown handles the real-world need without QR cards. @code: pull latest, read FRICTION_AUDIT.md, start P0 batch (T-032, T-033, T-036, T-040, T-042) in parallel feature branches.
- 2026-05-06 — @code — Pulled latest. Reading docs/SCOPE.md now to reconcile task board against §1–7. Will prioritize work per deadline (10 business days).
- 2026-05-07 — @browser — Resumed session after browser crash. Created staging sheet copy TaipeiKitchen_BentoOps_v2_STAGING (https://docs.google.com/spreadsheets/d/1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E/edit) per T-017; flipped T-017 to IN-PROGRESS pending @code's gh-pages-staging branch + STAGING-flag wiring. Logged Romano's 2026-05-07 email request as new task T-047 (case pre-fill % dropdown on delivery form). @code: when T-017 wiring is done, point form STAGING flag at this sheet ID. T-006 and T-042 will resume on the staging sheet next.
- 2026-05-07 — @browser — Added Client Visibility Rule (no client-facing changes until full 72-hour prototype is complete). Updated T-047 notes: Romano's email is paper-trail only, no reply needed; folded into prototype scope. Next: @code resumes T-017 wiring (gh-pages-staging branch + STAGING flag), then prototype-scope tasks proceed on staging sheet.

- 2026-05-07 — @browser — Owner sync. Confirmed no Taipei Kitchen mobile app in scope; closed T-013 (DONE). Owner flagged that 47 individual PR approvals is not workable. Going forward, @code MUST batch related work into thematic PRs (suggested groupings below). Active backlog of 12 open PRs will be reviewed/merged in tiered order: foundations (#4 TEST_PLAN, #5 stores.json) → docs (#1, #2, #3, #6, #7) → P0 friction batch (#8, #9, #10, #11) → client request (#12). All future work to be bundled per the new PR Bundling Strategy section above.

## PR Bundling Strategy

To keep owner review load manageable, @code groups remaining backlog into thematic PRs instead of one PR per task. Existing in-flight PRs (#1–#12) are honored as-is; this rule applies to all new work.

Proposed bundles for remaining @code TODOs:

- **P1/P2 friction-fix batch** — single PR covering T-034, T-037, T-038, T-039, T-041, T-044, T-045, T-046. Branch: `task/friction-p1p2-batch`.
- **Reporting layer** — single PR covering T-022 (sheet repairs), T-023 (waste-by-store), T-024 (consolidated dashboard), T-025 (daily reconciliation), T-026 (weekly food-safety summary). Branch: `task/reporting-layer`.
- **Quality-of-life / resilience** — single PR covering T-007 (offline queue), T-008 (image compression), T-027 (locked timestamps). Branch: `task/qol-resilience`.
- **Onboarding & docs** — single PR covering T-011 (new-store onboarding), T-016 (mirror board to Issues), T-031 (HANDOFF.md). Branch: `task/onboarding-docs`.
       
  Each bundle PR description must list the task IDs it closes, the acceptance criteria from docs/TEST_PLAN.md it satisfies, and a section-by-section diff summary. Owner reviews the cumulative diff once per bundle.

  

- 2026-05-08 — @browser — Owner directive: run straight through without permission stops. T-014 cancelled (no kickoff email). Added explicit Run-Straight-Through Task Lists section below with end-to-end queues for @code and @browser, plus end-of-day collaboration checklist. @code: pull and execute its queue. @browser: executing T-005 → T-006 → T-042 → T-043 → T-028 → T-029 → T-019/T-020. PRs handled in tiered order (foundations → docs → P0 friction → client request) per existing PR Bundling Strategy.


## Run-Straight-Through Task Lists — 2026-05-08

> **Purpose.** Owner directive 2026-05-08: "Work straight through without needing to keep asking for permissions and stopping." Both agents now have explicit end-to-end queues below. Run them in order, do not wait for owner check-ins between items, and only stop at the hard rules listed in *End-of-Day Collaboration*. We are continuing from existing progress — all task IDs, statuses, PRs, and the Handoff Log above remain authoritative.

### @code — run straight through (in this order)

1. **Pull main**, re-read `docs/SCOPE.md` and this file. Reconcile board against SCOPE §1–7 (already covered, no new tasks needed).
2. **T-017 finish** — create `gh-pages-staging` branch from `main`. Add a `STAGING` flag to `taipei_production_form3.html` and `taipei_delivery_form3.html` that points the webhook to the staging sheet (sheet id: `1TXM_iAxOVBDZdD80MME4KQyljj7SiljUxP6GieKG36E`). Flag value flips by branch (main = live sheet, gh-pages-staging = staging sheet). Flip T-017 to REVIEW with @browser as reviewer.
3. **PR consolidation pass** — keep all 12 open PRs alive but rebase / re-describe in tier order so owner can review as cumulative diffs:
   - Tier 1 (Foundations): #4 TEST_PLAN.md, #5 stores.json.
   - Tier 2 (Docs): #1 production form audit, #2 delivery form audit, #3 MILESTONE_V1.md, #6 T-009 driver-auth proposal (merges as doc only — T-009 stays DEFERRED to v2), #7 README overhaul.
   - Tier 3 (P0 friction): #8 T-032 Driver dropdown, #9 T-033 Expire Reason dropdown, #10 T-036 Supervisor dropdown, #11 T-040 QA Result default Pass.
   - Tier 4 (Client request): #12 T-047 case pre-fill % dropdown.
   For each PR, edit the description to: list task IDs closed, link relevant TEST_PLAN.md sections, and indicate which tier it belongs to. No self-merges.
4. **Bundle PR `task/friction-p1p2-batch`** — single PR closing T-034, T-035, T-037, T-038, T-039, T-041, T-044, T-045, T-046. Description lists task IDs + TEST_PLAN.md acceptance criteria + section-by-section diff summary.
5. **Bundle PR `task/reporting-layer`** — single PR closing T-022 (sheet repairs), T-023 (waste-by-store), T-024 (consolidated dashboard), T-025 (daily reconciliation), T-026 (weekly food-safety summary). Apps Script triggers + new tabs.
6. **Bundle PR `task/qol-resilience`** — single PR closing T-007 (offline queue), T-008 (image compression), T-027 (locked submission timestamps).
7. **Bundle PR `task/onboarding-docs`** — single PR closing T-011 (docs/ADD_A_STORE.md), T-016 (mirror board to GitHub Issues), T-031 (docs/HANDOFF.md). Note: T-030 README overhaul already in PR #7; do not duplicate.
8. **Tag @browser** on each bundle PR for staging verification (T-019/T-020). Do not self-merge — owner approves merges to main per COORDINATION rules.
9. **Append Handoff Log entry** when queue is complete: timestamp, what shipped, what's queued for @browser verification.

**@code stop conditions:** none on this queue. If something genuinely blocks, set BLOCKED in the task notes and continue down the list.

### @browser — run straight through (in this order)

1. **T-005 Sheet Audit** — open master sheet `TaipeiKitchen_BentoOps_v2`, read all 10 tabs (Delivery Log – Live, Store Lookup, Production Log – Live, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker, Editing Guide, Apps Script Code). Document: tab name, header row, row count, write source (form vs formula vs manual), read consumers. Append findings under the `## Sheet Audit` section above.
2. **T-006 Apps Script copy** — open the master sheet's Apps Script editor, copy current `Code.gs` verbatim into `apps_script/Code.gs` in repo via web edit on main. No edits, just paste. Append under `## Apps Script Snapshot`. Flip to REVIEW.
3. **T-042 Data Validation rules on staging** — on the staging sheet, add Data Validation dropdowns to Driver, Supervisor, Received By columns, sourced from the same lists `data/drivers.json`, `data/supervisors.json`, `data/stores.json` will use. Mirrors form-side dropdowns from T-032/T-036.
4. **T-043 Backfill cleanup on staging** — duplicate raw Driver/Supervisor/Reason columns to a snapshot tab `_archive_raw_2026-05-08` first, then trim trailing whitespace and normalize case in place on the staging sheet. Owen-with-trailing-space, anna→Anna, lucia→Lucia, OOD→Out of date.
5. **T-028 Production-log dedupe on staging** — first copy entire Production Log to `_archive_ProductionLog_2026-05-08`, then dedupe in place by (Submitted At + Date + Dish + Batch ID) composite key. No permanent deletes.
6. **T-029 Drive photo folder reorg prep** — build `/Store-{ID}/{YYYY}/{MM}/{DD}` subfolder tree under the existing delivery-photo root, move existing photos into matching subfolders by submission date and store. **Stop at the share button** — owner clicks share to expose to Giant corporate.
7. **T-019 Staging smoke test** — once @code's Tier 1–3 PRs are merged to gh-pages-staging: open the deployed delivery form on a phone-sized viewport (DevTools 390×844), submit one full delivery, verify row lands in staging sheet, verify photo lands in Drive subfolder.
8. **T-020 Regression pass** — DevTools Slow 3G simulation + run full TEST_PLAN.md regression checklist: HACCP flag still trips on >41°F, all 7 stores load from `data/stores.json`, photo upload stays under 500KB, offline queue retries on reconnect.
9. **Append Handoff Log entry** when queue is complete: timestamp, what shipped, what's queued for owner approval (Drive sharing, staging→live promotion, T-021 pilot store pick).

**@browser stop conditions (hard rules, not project rules):**
- Drive/Sheet sharing changes — prep done, owner clicks share.
- OAuth re-authorization prompt during T-006 if Apps Script asks for fresh scopes — owner clicks Allow once.
- Staging→live promotion (release tag, flipping URLs) — owner-gated.

### End-of-Day Collaboration

When both queues are drained, we reconcile here. Owner pass needed on:

- **T-021 UAT pilot store** — owner picks one of: 6006, 6061, 6253, 6331, 6443, 6542, 6564.
- **T-029 Drive sharing** — owner clicks share on the reorganized photo folder once Giant corporate distribution is desired.
- **Staging → live promotion** — owner approves a `release/*` tag; @code cuts the tag once T-019 + T-020 pass.
- **Anything @code flagged as NEEDS-OWNER** in a bundle PR description.

After this is merged, neither agent waits between items in their own queue. Cross-queue dependencies (e.g. T-042 reads from JSON files @code is publishing) are pulled live when ready, not blocked on synchronous handoff.

