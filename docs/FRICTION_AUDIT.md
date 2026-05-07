# Friction & UX Audit — Taipei Kitchen Bento Ops

**Audit Date:** 2026-05-07  
**Audited By:** @browser  
**Scope:** Both forms + live data (Delivery Log 499 rows, Production Log 403 rows, last 7 days)

## Purpose

The original form audits (PR #1, #2) catalogued *what the forms do*. This audit catalogues *where real humans fumble them* and proposes the changes needed to make the system as low-friction as possible for drivers, supervisors, and store staff.

The goal: minimize typing, eliminate free-text where a list will do, auto-fill anything we already know, and prevent typos from corrupting reporting.

## Real-World Data Quality Findings

All findings drawn from the actual live sheet, not the form spec.

### Delivery Log — Live (499 rows)

| # | Field | Issue | Evidence |
|---|---|---|---|
| D1 | Driver | Free-text input creates split identities | `Owen` (most rows) and `Owen ` (trailing space) stored as different drivers. Also `Sam Blumenthal`, `Andy`. |
| D2 | Expire Reason | Free-text creates duplicate categories | `OOD` (4 rows) and `Out of date` (16 rows) mean the same thing. |
| D3 | Received By | Free-text, no validation | 9 names. Includes `Melissa Reefer` (likely meant `Melissa, Reefer Section` or similar). No store-to-recipient link. |
| D4 | Arrival Time | Free-text HH:MM | 37 distinct values, format-fragile. |
| D5 | Photo Links | Empty on every sampled row | Either upload silently failing or Apps Script not writing back the Drive link. |
| D6 | Visit Structure | 13 rows per stop, no single visit-level confirmation | Driver has no "trip complete" moment; metadata duplicated across rows. |

### Production Log — Live (403 rows)

| # | Field | Issue | Evidence |
|---|---|---|---|
| P1 | Supervisor | Free-text, case-sensitive splits | `anna` (26) vs `Anna` (39); `lucia` (26) vs `Lucia` (182). Same person, four entries. |
| P2 | Initials | Field exists but empty on every row | Dead weight today. |
| P3 | Discard Reason | Empty across all 403 rows | Field unused in practice. |
| P4 | QA Result | Empty across all 403 rows | Field unused in practice. |
| P5 | Kitchen | `Store 6112` listed as production kitchen | `6112` is not in the 7-store delivery list. Confirm with owner what this is. |

## Fix List — F-01 through F-15

Ranked by impact ÷ effort. Effort scale: XS (under 30 min) · S (under 2 hr) · M (half day) · L (1+ day).

### P0 — Ship This Week (data quality, low effort)

| ID | Surface | Change | Effort | Why |
|---|---|---|---|---|
| F-01 | Delivery form | Driver text field → dropdown of known drivers (Owen, Sam Blumenthal, Andy) + "Add new driver" option | S | Eliminates D1. Backed by data/drivers.json. |
| F-02 | Delivery form | Expire Reason text → dropdown (Out of date, Damaged, Quality Issue, Other → text) | S | Eliminates D2. |
| F-05 | Production form | Supervisor text → dropdown (Anna, Lucia, Jiang, Guy + Add new) | S | Eliminates P1. Backed by data/supervisors.json. |
| F-09 | Production form | QA Result default to ✓ Pass instead of empty | XS | Forces conscious Fail action; addresses P4. |
| F-11 | Sheets | Add Data Validation rules to Driver, Supervisor, Received By columns referencing the same source lists | S | Prevents future free-text contamination. |

### P1 — Ship Within v1 Window (high impact, more work)

| ID | Surface | Change | Effort | Why |
|---|---|---|---|---|
| F-03 | Delivery form | Received By → store-specific dropdown that auto-loads when QR scanned | M | Fixes D3. Each store has 1–2 regular receivers. |
| F-08 | Production form | Make Discard Reason required only when Qty Discarded > 0 | S | Addresses P3 without nagging on zero-discard rows. |
| F-10 | Both forms | One-tap "Same as last submission" for repeat fields (driver, supervisor, kitchen) | M | Drivers run the same route daily; supervisors stay constant per shift. |
| F-12 | Sheets | Backfill cleanup: trim trailing spaces, normalize case in Driver/Supervisor/Reason columns | S | Fixes existing mess so reporting is accurate from day one. |
| F-13 | Delivery form | Photo upload status feedback + retry queue + verify Drive link writes back to sheet | M | Fixes D5. |
| F-15 | Both forms | Disabled Submit button until all required fields filled (no end-of-form alerts) | XS | Drivers should never get blocked at the last step. |

### P2 — Polish (nice-to-have)

| ID | Surface | Change | Effort | Why |
|---|---|---|---|---|
| F-04 | Delivery form | Arrival time auto-fills from device clock; tap-to-edit only | XS | Already auto-set; just lock format and prevent free-text. |
| F-06 | Production form | Remove or constrain `Other` kitchen option; force note if `Other` chosen | XS | Cleaner data, addresses P5 ambiguity. |
| F-07 | Production form | Initials field auto-derived from Supervisor selection | XS | Addresses P2 — currently dead weight. |
| F-14 | Delivery form | Trip Summary final screen: list all stops + single confirm tap | M | Replaces 13-row confusion (D6) with one visit confirmation. |

## Reclassification of T-009 (Driver Auth)

**T-009 is DEFERRED to v2.** F-01 (driver dropdown) handles 90% of the real-world need without new hardware, QR cards, or scope-creep conversations with the client. Drivers picking their name from a list of 3–5 names is functionally indistinguishable from auth for a small operation. Revisit only if Romano explicitly requests it later.

## Implementation Order (Recommended)

1. **F-01, F-02, F-05, F-09, F-11** in parallel (P0 batch, all small) — staging branch, single PR per fix
2. **F-12** sheet backfill once F-11 validation is live (so cleanup doesn't get re-corrupted)
3. **F-15** disabled-submit refactor (touches both forms, do once)
4. **F-03, F-08, F-10, F-13** in parallel (P1 batch)
5. **F-14** trip summary (largest UX change, last)
6. **F-04, F-06, F-07** polish at end

## Acceptance Criteria (per fix)

Each F-xx ships only when:
- Live form on staging accepts the new input pattern
- Sheet receives the cleaned value with no duplicates/typos possible
- A driver/supervisor on a phone-sized viewport can complete the form in fewer taps than today
- Existing data is not broken

## Source Data

Findings backed by direct queries against the live sheet on 2026-05-07. Sample sizes: Delivery Log 499 rows / 7 days, Production Log 403 rows. Re-run the queries in `scripts/audit_query.gs` (to be created in T-046) for ongoing monitoring.

## Change Log

| Date | Change | Author |
|---|---|---|
| 2026-05-07 | Initial friction audit | @browser |
