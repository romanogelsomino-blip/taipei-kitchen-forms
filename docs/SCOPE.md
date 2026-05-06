# SCOPE — Taipei Kitchen Bento Operations System

Source of truth: Universole App Studios proposal UAS-2026-001, dated April 29, 2026, valid through May 13, 2026.

This file is the contract scope copied verbatim from the proposal so both agents can reconcile the task board against it. Do not edit the items below without owner approval. If something is missing or has been changed in writing with the client, append a `## SCOPE CHANGE` block at the bottom citing date and source.

---

## Overview

Universole App Studios will design, build, and deploy a complete operations system for Taipei Kitchen Bento, covering production logging, delivery logistics, food-safety compliance, and consolidated reporting. This work consolidates everything discussed in the original three-option proposal dated April 27, 2026, into one end-to-end build at a single flat rate, paid in full upfront with a 10% discount.

The goal is a system that runs cleanly day-to-day, captures the data required for USDA/FSIS regulatory compliance as Taipei Kitchen scales past ten Giant Food Stores locations, and gives Romano a single place to monitor production, delivery, waste, and reconciliation across all locations.

---

## Scope of Work (verbatim)

### 1. Production Logging System
- HACCP-aware production form with batch cook and cool tracking, dish-by-dish QA, automated load and leftover totals to eliminate manual calculations, and submission to the central spreadsheet.
- - Cleanup of the existing production log and elimination of duplicate or orphaned data.
 
  - ### 2. Delivery Logging System
  - - Per-location, QR-code-driven delivery form covering all seven Giant Food Stores locations (6006, 6061, 6253, 6331, 6443, 6542, 6564) with transit temperature logging, automated violation detection, corrective-action workflow, and dish-level inventory reconciliation.
    - - Before-and-after delivery photo capture with upload to the existing Google Drive photo repository, organized by store and date for easy sharing with Giant corporate.
     
      - ### 3. Reliability and Offline Behavior
      - - Offline-first form behavior so production and delivery data (including photos) can be captured at locations with poor or no Wi-Fi and synced automatically once connectivity returns, without data loss.
        - - Submission timestamps locked at the moment of entry to address regulatory and inspector concerns about time-of-record accuracy.
         
          - ### 4. Role-Based Security
          - - Lightweight login and role-based access control for the delivery and production forms so that only authorized Taipei Kitchen employees can submit data, preventing unauthorized entries via QR codes accessible inside Giant stores.
           
            - ### 5. Spreadsheet Cleanup and Dev Environment
            - - Repair of broken spreadsheet tabs (Store Lookup, Production Timeline, Delivery Summary, Production Summary, Weekly Snapshot, Waste Tracker) so each populates correctly when filtered.
              - - Waste tracking split out by store so per-location patterns can be analyzed.
                - - A duplicate development copy of the live spreadsheet so future changes can be tested safely without affecting production data.
                 
                  - ### 6. Consolidated Dashboard
                  - - A single dashboard pulling sales (where available), production, waste, and delivery data across all locations, refreshed automatically and viewable in one place each morning.
                    - - Daily reconciliation view of produced versus delivered versus sold to surface inventory loss.
                      - - Weekly food-safety summary per store, ready for regulatory or corporate review.
                       
                        - ### 7. Documentation and Handoff
                        - - Cleanup of the GitHub repository (romanogelsomino-blip/taipei-kitchen-forms) with an updated README documenting the QR code system, deployment workflow, and how to make safe edits going forward.
                          - - Written handoff document covering daily operating procedures and how the photo repository link can be shared with Giant corporate (Microsoft Teams users) without changing storage providers.
                           
                            - ---

                            ## Exclusions (verbatim)

                            The following are explicitly NOT included and may be addressed separately:
                            - Review of Popmenu fees and recommendation of an alternative POS or online ordering platform.
                            - - Migration away from Square POS for the standalone restaurants.
                              - - Hardware purchases (tablets, scanners, label printers, etc.).
                                - - Third-party subscription costs (Google Workspace, hosting, domain renewals, etc.) which remain Client's responsibility.
                                 
                                  - ---

                                  ## Timeline (verbatim)

                                  - Working prototype delivered within **72 hours of payment receipt**.
                                  - - Full system live and in production within **10 business days of payment receipt**.
                                    - - Revisions and bug fixes during the acceptance window: 1 to 2 business days each.
                                      - - Acceptance window: **14 calendar days following go-live**.
                                       
                                        - ---

                                        ## Pricing (verbatim)

                                        - Project total (flat rate): **$3,500.00**
                                        - - Upfront-payment discount (10%): −$350.00
                                          - - TOTAL DUE: **$3,150.00** (paid in full upfront via Stripe; this is the basis for project commencement)
                                           
                                            - ---

                                            ## Ongoing Support (optional, future phase — NOT in this engagement)

                                            Month-to-month retainer at $300/month covering hosting oversight, routine maintenance, monitoring, and unlimited reasonable change requests with 24–48 hour turnaround. Not part of this agreement; activatable any time after go-live.

                                            ---

                                            ## Reconciliation Note

                                            Both @browser and @code must, at the start of every working session, read this file and confirm that every item in Sections 1–7 above is represented by at least one TODO/CLAIMED/IN-PROGRESS task in COORDINATION.md. If anything is missing, the active agent adds the missing task(s) to the board before proceeding with other work.

                                            ## Scope Change Log
                                            *(empty — append `### YYYY-MM-DD — change description — source` blocks here only on owner-approved changes)*
                                            
