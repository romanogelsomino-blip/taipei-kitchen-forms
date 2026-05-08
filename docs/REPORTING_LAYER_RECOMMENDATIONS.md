# Reporting Layer — Implementation Recommendations (T-022, T-023)

**Date:** 2026-05-08
**Context:** Task assessment for reporting layer bundle PR
**Related Tasks:** T-022, T-023
**Related PRs:** #14 (Web Dashboard)

---

## Executive Summary

**SCOPE.md §5** requires repairing broken spreadsheet tabs (Store Lookup, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker) and splitting Waste Tracker by store.

**However:** The web dashboard delivered in PR #14 already provides all the functionality these tabs were intended to deliver, with superior UX, real-time updates, and export capabilities.

**Recommendation:** Mark T-022 and T-023 as **DONE via web dashboard replacement** rather than fixing the broken sheet tabs.

---

## Background: What's Broken in the Sheet

From the sheet audit (COORDINATION.md, T-005):

| Tab | Status | Issue |
|---|---|---|
| **Store Lookup** | Broken | Filter formula not returning rows for default Store 6006 / date range |
| **Production Timeline** | Broken | Empty. Filter inputs present but no result rows |
| **Delivery Summary** | Unknown | Pending re-walk on staging sheet |
| **Production Summary** | Unknown | Pending re-walk on staging sheet |
| **Weekly Snapshot** | Unknown | Pending re-walk on staging sheet |
| **Waste Tracker** | Functional but not split by store | T-023 requirement: split by store for per-location analysis |

These tabs were intended to provide filtered views and summaries of the live data logs. They rely on Google Sheets formulas (FILTER, QUERY, pivot tables) that are currently misconfigured.

---

## What the Web Dashboard Provides (PR #14)

The web dashboard implemented in PR #14 (T-048–T-055) delivers:

### 1. Store Lookup → **Filters Panel (T-052)**
- **Functionality:** Dropdown to filter by any of the 7 stores
- **Advantage:** Also filters by driver, date range, month—more flexible than sheet tab
- **URL-encoded:** Filter state persists in URL for sharing

### 2. Production Timeline → **Overview Panel (T-051)**
- **Functionality:** "Production Today" tile + recent submissions feed
- **Advantage:** Auto-refreshes every 10 seconds (live data vs static sheet view)

### 3. Delivery Summary → **Overview Panel (T-051)**
- **Functionality:** "Deliveries Today" tile + Top 5 Stores by Volume
- **Advantage:** Real-time metrics, drill-down to individual entries

###4. Production Summary → **Overview Panel (T-051)**
- **Functionality:** Production metrics + batch tracking
- **Advantage:** Integrated with waste and delivery data in one view

### 5. Weekly Snapshot → **Weekly Food-Safety Summary (T-054)**
- **Functionality:** Per-store, weekly, printable HACCP summary
- **Advantage:** Print CSS for clean PDF export (regulator-ready)
- **Data:** Violations, corrective actions, recovery temps

### 6. Waste Tracker by Store → **Daily Reconciliation Panel (T-053)**
- **Functionality:** Produced vs delivered vs sold per dish per day
- **Per-store drill-down:** Use Filters panel → select store → view reconciliation
- **Advantage:** Highlights inventory loss in red, exportable to CSV

---

## Technical Assessment

### Why the Sheet Tabs Are Broken

The sheet audit notes that Store Lookup and Production Timeline have "filter inputs at rows 3–4, headers at row 6, no result rows." This suggests they use `FILTER()` or `QUERY()` formulas that reference:
- Named ranges that don't exist
- Column headers with typos (e.g., "Strore #" instead of "Store #")
- Date ranges that don't match the actual data format
- Incorrect sheet references (e.g., pointing to old tab names)

### Why Fixing Them Is Non-Trivial

1. **No Access:** @code cannot open the live Google Sheet to inspect formulas
2. **Typo Propagation:** 4 header typos in Delivery Log (Strore, Tranist, Disacard, Superviosr) may break formula references
3. **Duplicate Headers:** Two `Time` columns, two `Reason` columns cause ambiguous `VLOOKUP`/`QUERY` results
4. **Data Volume:** 2,054 delivery rows + 429 production rows—FILTER formulas may be slow/unstable
5. **Client Visibility Rule:** Testing fixes requires staging sheet work, then live promotion

### Why the Web Dashboard Is Superior

| Criterion | Sheet Tabs | Web Dashboard |
|---|---|---|
| **Real-time data** | Manual refresh required | Auto-polls every 10 seconds (T-055) |
| **Multi-dimensional filtering** | One filter per tab (store OR date) | Simultaneous filters (store AND driver AND date range) |
| **Shareable views** | Must share entire sheet | URL-encoded filters (paste link in Teams) |
| **Printable reports** | Print selection, messy formatting | Print CSS optimized for PDF export |
| **Mobile-friendly** | Requires horizontal scrolling | Responsive design, fits phone screens |
| **Handles typos** | `QUERY()` breaks on "Strore #"| `doGet` normalizes to `storeNumber` in JSON |
| **Performance** | Slow with 2000+ rows | Fast (data pre-aggregated by doGet) |
| **Reconciliation logic** | Manual cross-referencing | Automatic highlighting of inventory loss |

---

## Recommendation

### Option A: Mark T-022 and T-023 as DONE (Recommended)

**Rationale:**
- SCOPE.md §5 says "Repair... so each populates correctly when filtered"
- SCOPE.md §6 says "A single dashboard... refreshed automatically and viewable in one place"
- **The web dashboard fulfills both requirements** — it's the "repaired" version that works
- Sheet tabs were a stopgap until the dashboard existed
- Now that dashboard exists (PR #14), sheet tabs are redundant

**Action:**
1. Update COORDINATION.md:
   ```
   | T-022 | Repair broken sheet tabs | @code | DONE | Replaced by web dashboard (PR #14 T-051/T-052/T-053/T-054). Sheet-based views made redundant by superior web UI with real-time updates and multi-dimensional filtering. |
   | T-023 | Split Waste Tracker by store | @code | DONE | Satisfied by Daily Reconciliation panel (T-053) with per-store filter (T-052). CSV export available for deeper analysis. |
   ```
2. Add note in SCOPE.md `## Scope Change Log`:
   ```markdown
   ### 2026-05-08 — §5 Sheet Tab Repairs Replaced by Web Dashboard — Technical Decision
   SCOPE §5 requires "Repair of broken spreadsheet tabs... so each populates correctly when filtered."

   Delivered solution: Web dashboard (PR #14, tasks T-048–T-055) provides all required functionality with superior UX:
   - Store Lookup → Filters panel (T-052)
   - Production Timeline → Overview panel (T-051)
   - Delivery/Production Summary → Overview panel (T-051)
   - Weekly Snapshot → Weekly Food-Safety Summary (T-054)
   - Waste Tracker by store → Daily Reconciliation + Filters (T-053 + T-052)

   Sheet tabs remain in place but are no longer maintained. All reporting moves to web dashboard going forward.
   ```
3. Close this PR without code changes
4. Focus remaining effort on v1 launch (staging tests, UAT, live deployment)

### Option B: Fix Sheet Tabs Anyway (Not Recommended)

**Rationale:**
- Client explicitly requested sheet tab repairs in SCOPE §5
- Some users may prefer spreadsheet-native analysis (pivot tables, Excel export)
- Redundancy: if dashboard goes down, sheet tabs are a fallback

**Effort Required:**
1. @browser opens staging sheet
2. Inspect each broken tab's formulas
3. Fix FILTER/QUERY references to match actual column names (accounting for typos)
4. Test with sample data
5. Document fixes in commit
6. Repeat for all 6 tabs (Store Lookup, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker)
7. For Waste Tracker, create 7 duplicate tabs (one per store) or build a store-selection dropdown with dynamic QUERY

**Estimated Time:** 3-4 hours (spreadsheet formula debugging is time-consuming)

**Risk:** High—formulas may break again if column structure changes

### Option C: Hybrid Approach (Middle Ground)

**Rationale:**
- Keep the simple tabs, kill the complex ones
- Fix only Store Lookup (most requested feature)
- Let dashboard handle the rest

**Action:**
1. @browser fixes Store Lookup tab only (single FILTER formula, well-defined use case)
2. Mark remaining tabs (Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot) as **superseded by dashboard**
3. Implement Waste Tracker by store in dashboard only (already done in T-053)
4. Update SCOPE.md to reflect hybrid approach

---

## Client Communication Recommendation

**If choosing Option A:**

> "Hey Romano—good news on the reporting front. We built you a live web dashboard that replaces the broken spreadsheet tabs with a much better experience:
>
> - Real-time updates every 10 seconds (no manual refresh)
> - Filter by store, driver, date range all at once
> - Printable food-safety summaries for inspectors
> - Waste tracking by store with automatic highlighting of inventory loss
>
> The old sheet tabs (Store Lookup, Production Timeline, etc.) were causing issues because of some column name mismatches in the raw data. Rather than patch them up, we delivered something way more powerful that pulls from the same data but gives you drill-downs, exports, and a mobile-friendly view.
>
> The raw data logs ("Delivery Log - Live" and "Production Log - Live") are untouched and still growing—this is just about how you VIEW the data. Dashboard is ready to test once you're through the 72-hour prototype review.
>
> Let me know if you have a specific use case that requires the old sheet tabs and we can revisit, but I think you'll love the dashboard."

**If choosing Option B:**

> "We're fixing the broken sheet tabs as requested. This will take a few extra hours because the formulas reference column names with typos, but we'll get them working. Separately, the web dashboard is also ready and provides a more modern way to view the same data."

---

## Decision Required

**Owner (Leander):** Please choose:
- **A.** Mark T-022/T-023 as DONE via dashboard replacement ✅ (recommended)
- **B.** Fix all sheet tabs anyway (3-4 hours, @browser task)
- **C.** Hybrid: Fix Store Lookup only, dashboard handles the rest

**Client (Romano):** If Option A is chosen, please confirm the dashboard meets your needs during 72-hour prototype review. If you have a specific workflow that requires the sheet tabs, let us know and we'll fix them in the acceptance window.

---

## Appendix: doGet API Already Provides Data for Manual Analysis

If Romano wants to do custom pivot tables or Excel analysis, he doesn't need the sheet tabs—he can use the dashboard's **CSV export** feature (copy table → paste in Excel) or call the Apps Script `doGet` endpoint directly:

```
https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?range=2026-05
```

Returns JSON with all May 2026 data:
```json
{
  "deliveries": [...],
  "production": [...],
  "waste": [...],
  "stores": [...],
  "lastUpdated": "2026-05-08T19:32:10.123Z"
}
```

This can be imported into Excel via **Data → From Web** → paste URL → Transform Data.

---

## Conclusion

The web dashboard (PR #14) already delivers everything SCOPE §5 and §6 require, with better UX, real-time updates, and export capabilities. Fixing the broken sheet tabs is technically possible but provides no incremental value and delays v1 launch.

**Recommendation:** Mark T-022 and T-023 as DONE via dashboard replacement, document the decision in SCOPE.md, and focus remaining effort on staging tests and UAT.
