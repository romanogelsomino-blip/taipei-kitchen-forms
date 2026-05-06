# COORDINATION — Taipei Kitchen Bento Ops System

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
| T-010 | Move store list out of HTML into a JSON file fetched at form load | @code | IN-PROGRESS | Addresses README Known Issue #4. New file: data/stores.json. |
| T-011 | Add new-store onboarding doc | @code | TODO | docs/ADD_A_STORE.md. Depends on T-010. |
| T-012 | Verify HACCP cooling-rule logic against current FSIS / FDA Food Code 2022 guidance | @browser | TODO | Output: comment block under T-012 below. |
| T-013 | Inventory App Store Connect / Play Console for any Taipei Kitchen app entry | @browser | NEEDS-OWNER | Open ASC tab currently shows PokerPro app; confirm with owner whether a Taipei Kitchen mobile app is in scope at all. |
| T-014 | Draft kickoff email to Romano confirming payment received and timeline | @browser | TODO | Save as Gmail draft only. Do not send. Owner sends. |
| T-015 | Define v1 milestone scope and acceptance criteria | @code | TODO | Output: docs/MILESTONE_V1.md mirroring proposal Scope of Work. |
| T-016 | Mirror this board into GitHub Issues (one issue per task, labels owner:browser / owner:code) | @code | TODO | After this file is merged. |
| T-017 | Set up staging: duplicate GitHub Pages branch (gh-pages-staging) + duplicate sandbox sheet TaipeiKitchen_BentoOps_v2_STAGING | @code | TODO | Forms must respect a STAGING flag that points at the sandbox sheet's webhook. Owner approval required to create the duplicate sheet (@browser will copy the live sheet on owner OK). |
| T-018 | Write docs/TEST_PLAN.md — acceptance checklist per feature (offline queue, image compression, store JSON, driver auth, HACCP flag) | @code | TODO | One section per feature with explicit pass/fail criteria. Source of truth for T-019/T-020/T-021. |
| T-019 | End-to-end smoke test on staging after each merge: scan QR → fill form on phone-sized viewport → verify row in sandbox sheet → verify photo in Drive | @browser | TODO | Run after every PR merge before promotion to live. |
| T-020 | Regression pass before promoting staging to main: HACCP flag still trips, all 7 stores load, weak-network simulation (DevTools Slow 3G), photo upload under 500KB | @browser | TODO | Blocks the final merge to main. |
| T-021 | UAT with Romano on one pilot location before rolling to all 7 stores | @browser | NEEDS-OWNER | Owner picks the pilot store and schedules with Romano. |

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
