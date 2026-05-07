# COORDINATION — Taipei Kitchen Bento Ops System

> ⚠️ **DEADLINE — per docs/SCOPE.md:** Working prototype within 72 hours of payment. Full system live within **10 BUSINESS DAYS** of payment. Acceptance window 14 calendar days post-go-live.
>
> **Read docs/SCOPE.md FIRST every session.** Both agents must reconcile this task board against SCOPE.md §1–7 at the start of every working session and add tasks for any scope item without coverage before doing other work.

This file is the single source of truth for who is doing what on this project. Two AI agents collaborate here:

- Browser Claude (@browser) — runs in the Chrome extension. Has access to Google Sheets, Google Docs, Gmail, App Store Connect, Play Console, and the deployed forms in a real browser. Cannot run code locally or push commits via CLI.
- Claude Code (@code) — runs locally with full repo access. Owns code edits, commits, branches, PRs, Apps Script files, build/deploy steps. Cannot click around web UIs that require login.

The human owner (Leander) approves merges to main, sensitive permission changes, payments, and anything either agent flags as NEEDS-OWNER.

---

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
| T-013 | Inventory App Store Connect / Play Console for any Taipei Kitchen app entry | @browser | NEEDS-OWNER | Open ASC tab currently shows PokerPro app; confirm with owner whether a Taipei Kitchen mobile app is in scope at all. |
| T-014 | Draft kickoff email to Romano confirming payment received and timeline | @browser | TODO | Save as Gmail draft only. Do not send. Owner sends. |
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
| T-047 | Pre-load case fill-level dropdown on delivery form, tied to the pre-load photo upload (options: 0-25%, 25-50%, 50-75%, 75-100%) | @code | TODO | Client request from Romano via email 2026-05-07 3:39 PM. New field captures case quantity prior to filling with the day's delivery. Bound to existing pre-load photo step. Persist to Delivery Log - Live as a new column (proposed: Case Pre-Fill %). Update apps_script doPost append accordingly. |

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
