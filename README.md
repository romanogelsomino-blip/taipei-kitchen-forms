# Taipei Kitchen Bento Operations System

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant Food Stores across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA/FSIS food safety compliance as the program scales.

**Project Scope:** See [`docs/SCOPE.md`](docs/SCOPE.md) for the full contract scope and deliverables.
**Task Coordination:** See [`COORDINATION.md`](COORDINATION.md) for active task board and agent workflow.

---

## Quick Start

### For Kitchen Staff (Production Logging)
1. Scan the **Production QR code** posted in the kitchen
2. Fill out the batch information (cook temps, cooling times, dish counts)
3. Submit → data goes to the master Google Sheet

### For Drivers (Delivery Logging)
1. Scan the **Delivery QR code** for your store (one per Giant location)
2. Take before-photo, fill inventory, take after-photo
3. Submit → data + photos go to Google Sheet + Drive folder

---

## System Components

| File                            | Purpose                                                      |
|---------------------------------|--------------------------------------------------------------|
| `taipei_production_form3.html`  | Kitchen form — logs batch cook/cool times, dish counts, QA  |
| `taipei_delivery_form3.html`    | Driver form — logs per-store deliveries, temps, photos, inventory |
| `data/stores.json`              | Store and dish lists (add new stores here, not in HTML)     |
| `docs/SCOPE.md`                 | Contract scope and deliverables                              |
| `COORDINATION.md`               | Active task board for @browser and @code agents             |
| `docs/HANDOFF.md`               | Daily operations guide (how to run the system)               |

---

## Stores Currently Served

| Store ID | Location                       | QR Code |
|----------|--------------------------------|---------|
| 6006     | Kline Village, Harrisburg, PA  | `?store=6006` |
| 6061     | Shippensburg, PA               | `?store=6061` |
| 6253     | New Cumberland, PA             | `?store=6253` |
| 6331     | Mechanicsburg, PA              | `?store=6331` |
| 6443     | Chambersburg, PA               | `?store=6443` |
| 6542     | Carlisle, PA                   | `?store=6542` |
| 6564     | Harrisburg (Gayson Rd), PA     | `?store=6564` |

**To add a new store:** Edit `data/stores.json` (no code changes required). See [`docs/ADD_A_STORE.md`](docs/ADD_A_STORE.md) for step-by-step instructions.

---

## QR Code System

### How It Works
- Each **Giant location** has its own QR code that routes to the delivery form with the store pre-selected
- The **production kitchen** has a single QR code for the production form
- QR codes are printed, laminated, and posted in break rooms / production areas

### QR Code URLs
All QR codes point to GitHub Pages:

**Production Form:**
```
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_production_form3.html
```

**Delivery Form (per store):**
```
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/taipei_delivery_form3.html?store=XXXX
```
Replace `XXXX` with the 4-digit store ID (e.g., `?store=6542` for Carlisle).

### Generating QR Codes
1. Use a free QR code generator: [qr-code-generator.com](https://www.qr-code-generator.com/) or [qrcode-monkey.com](https://www.qrcode-monkey.com/)
2. Paste the full URL (production or delivery with `?store=` parameter)
3. Download as PNG, print at **3×3 inches minimum** for easy scanning
4. Laminate for durability

**Pro tip:** Generate all QR codes at once and label them clearly (e.g., "Store 6542 – Carlisle Delivery").

---

## Food Safety & HACCP Compliance

The forms automatically enforce HACCP cooling rules and flag violations:

### Production Form
- **Cooling Rule:** Hot food must cool from **135°F → 70°F within 2 hours**, then **70°F → 41°F within 4 more hours** (total 6 hours max)
- **Visual Flags:** Cooling time cells turn **green** (safe), **orange** (approaching limit), or **red** (HACCP violation)
- **Final Temp:** Batch must be ≤ 41°F before packaging

### Delivery Form
- **Transit Rule:** Product must stay ≤ **41°F** throughout delivery
- **Auto-Detection:** If any transit temp > 41°F, corrective action panel appears
- **2-Hour Rule:** If temp > 41°F for > 2 hours, product must be discarded (auto-enforced)
- **Audit Trail:** All violations logged with timestamps, recovery actions, and supervisor notifications

---

## Data Flow

```
┌─────────────┐
│ QR Code     │
│ Scan        │
└──────┬──────┘
       │
       v
┌─────────────────────────────┐
│ Form Opens on Phone         │
│ (GitHub Pages)              │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────┐
│ User Fills Out Form         │
│ • Production: Batch info    │
│ • Delivery: Temps + photos  │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────┐
│ Submit Button               │
│ • Network check             │
│ • Photo compression         │
│ • Offline queue (if needed) │
└──────┬──────────────────────┘
       │
       v
┌─────────────────────────────────────┐
│ Google Apps Script Endpoint         │
│ POST to script.google.com           │
└──────┬──────────────────────────────┘
       │
       ├─────────────────────────┬──────────────────────────┐
       v                         v                          v
┌──────────────┐    ┌────────────────────┐    ┌───────────────────┐
│ Google Sheet │    │ Production Log     │    │ Delivery Log      │
│ (Master)     │    │ • Batch details    │    │ • Store inventory │
│              │    │ • HACCP data       │    │ • Transit temps   │
│              │    │ • QA notes         │    │ • Violations      │
└──────────────┘    └────────────────────┘    └───────────────────┘
                                                        │
                                                        v
                                              ┌─────────────────────┐
                                              │ Google Drive Folder │
                                              │ • Before photos     │
                                              │ • After photos      │
                                              │ • By store & date   │
                                              └─────────────────────┘
```

---

## Deployment Workflow

### Environments

| Environment | Branch | URL | Purpose |
|---|---|---|---|
| **Production** | `gh-pages` | `romanogelsomino-blip.github.io/taipei-kitchen-forms/` | Live forms used by drivers and kitchen staff |
| **Staging** | `gh-pages-staging` | `romanogelsomino-blip.github.io/taipei-kitchen-forms/staging/` | Test environment before production |
| **Development** | `main` | N/A | Source code, not deployed directly |

### Safe Edit Workflow

**⚠️ NEVER edit files directly in the `gh-pages` branch. Always follow this workflow:**

1. **Make changes in `main` branch:**
   ```bash
   git checkout main
   git pull
   git checkout -b task/T-XXX-feature-name
   # Make changes to taipei_production_form3.html or taipei_delivery_form3.html
   git add .
   git commit -m "[T-XXX] Description of change"
   git push -u origin task/T-XXX-feature-name
   ```

2. **Open a Pull Request:**
   - Go to GitHub → Pull Requests → New PR
   - Base: `main` ← Compare: `task/T-XXX-feature-name`
   - Add description, link to task in COORDINATION.md
   - **Do not self-merge** — wait for review

3. **Merge to `main`:**
   - After review approval, merge PR
   - GitHub Actions auto-deploys to **staging** (`gh-pages-staging`)

4. **Test on staging:**
   - Open staging URL in phone browser
   - Fill out form with test data
   - Verify data appears in **sandbox Google Sheet** (not live sheet)
   - Check photo upload to Drive

5. **Promote to production:**
   - After testing passes, owner approves production deploy
   - Merge `gh-pages-staging` → `gh-pages`
   - Live forms update within 1–2 minutes

### Emergency Rollback

If a bug reaches production:
```bash
git checkout gh-pages
git reset --hard <previous-commit-hash>
git push --force
```
**Note:** Only the owner should perform force pushes to `gh-pages`.

---

## How to Make Safe Edits

### Adding a New Store
See [`docs/ADD_A_STORE.md`](docs/ADD_A_STORE.md) for full instructions. Summary:
1. Edit `data/stores.json` → add new store object
2. Generate QR code with `?store=XXXX` parameter
3. Test on staging before deploying to production
4. Print + laminate QR code for the new location

### Adding a New Dish
Edit `data/stores.json` → add new dish to `"dishes"` array with unique ID and `sortOrder`. Forms will auto-update on next page load (cached for 1 hour).

### Changing HACCP Cooling Thresholds
Edit `taipei_production_form3.html` → search for `360` (6-hour limit in minutes) → adjust thresholds → test on staging → deploy.

### Changing Apps Script Endpoint
Edit both form files → update `GOOGLE_SCRIPT_URL` constant (line ~350 production, line ~443 delivery) → deploy.

---

## Offline Behavior

### What Happens When Wi-Fi Fails?
- Form detects network failure on submit
- Data saved to browser's `localStorage`
- User sees: **"Connection Error — Data saved locally. Retry when connected."**
- Queue indicator shows: **"1 pending submission"**

### Auto-Retry on Reconnect
- Form detects when network returns (`online` event)
- Automatically submits queued data
- Queue cleared after successful submission

### Manual Retry
- User can click **"Retry All"** button to force retry
- Works even if auto-retry hasn't triggered yet

### Queue Limits
- Maximum **50 queued submissions** per browser
- Prevents localStorage quota issues on older phones
- User warned when approaching limit

---

## Photo Handling

### Compression
- Photos automatically compressed before upload (target < 500KB, max 1600px)
- Reduces upload time on slow Giant Wi-Fi
- Compression status shown: **"Original: 3.2MB → Compressed: 450KB"**
- Fallback: If compression fails, original uploaded (with warning)

### Storage
- All photos uploaded to **Google Drive folder**
- Organized by **store** and **date** for easy corporate sharing
- Filenames include store ID, date, and timestamp
- Example: `6542_2026-05-06_14-30-15_before.jpg`

### Sharing with Giant Corporate
See [`docs/HANDOFF.md`](docs/HANDOFF.md) for step-by-step instructions on sharing the Drive folder link with Giant's Microsoft Teams users.

---

## Troubleshooting

### "Form won't submit"
1. Check phone's internet connection
2. Look for queue indicator — data may be saved locally
3. Try **"Retry All"** button
4. If still stuck, screenshot the form and contact supervisor

### "QR code doesn't work"
1. Make sure you're scanning the correct QR (Production vs Delivery)
2. Check that the URL starts with `https://romanogelsomino-blip.github.io/`
3. Try manually typing the URL into browser
4. If QR is damaged, print a new one (see QR Code System above)

### "Photo won't upload"
1. Check file size — very large photos (> 10MB) may timeout
2. Compression should handle this, but older phones may struggle
3. Try smaller photo (reduce camera quality in phone settings)
4. Submit form without photo, upload manually to Drive later

### "Wrong store showing in delivery form"
1. Check QR code URL — should have `?store=XXXX` parameter
2. If wrong, print new QR code with correct store ID
3. If right, clear browser cache and rescan QR

---

## Repository Structure

```
taipei-kitchen-forms/
├── README.md                          ← You are here
├── COORDINATION.md                    ← Task board and agent workflow
├── taipei_production_form3.html       ← Production form (kitchen)
├── taipei_delivery_form3.html         ← Delivery form (drivers)
├── data/
│   └── stores.json                    ← Store and dish lists
├── docs/
│   ├── SCOPE.md                       ← Contract scope
│   ├── HANDOFF.md                     ← Daily operations guide
│   ├── ADD_A_STORE.md                 ← How to add a new store
│   ├── PRODUCTION_FORM_AUDIT.md       ← Complete field audit (production)
│   ├── DELIVERY_FORM_AUDIT.md         ← Complete field audit (delivery)
│   ├── MILESTONE_V1.md                ← V1 scope and acceptance criteria
│   ├── TEST_PLAN.md                   ← 60+ test cases for v1 features
│   └── T-009-AUTH-PROPOSAL.md         ← Driver auth proposal (future)
└── .github/
    └── workflows/
        └── deploy-staging.yml         ← Auto-deploy to staging (future)
```

---

## Project Status

**Current Phase:** V1 Development
**Deadline:** 10 business days from payment (see `docs/SCOPE.md`)

### Completed
- ✅ Production form with HACCP compliance
- ✅ Delivery form with transit temp logging
- ✅ Photo upload to Google Drive
- ✅ 7-store routing via QR codes
- ✅ Form audits and documentation
- ✅ JSON-based store data (PR #5)
- ✅ Test plan (60+ test cases)
- ✅ Driver auth proposal (awaiting owner decision)

### In Progress
- 🚧 Offline queue implementation (T-007)
- 🚧 Client-side image compression (T-008)
- 🚧 Staging environment setup (T-017)
- 🚧 README and handoff docs (T-030, T-031)

### Upcoming
- 📋 Timestamp locking (T-027)
- 📋 Sheet repairs (T-022)
- 📋 Consolidated dashboard (T-024–T-026)
- 📋 Store onboarding docs (T-011)

See [`COORDINATION.md`](COORDINATION.md) for the full task board.

---

## Getting Help

### For Daily Operations
See [`docs/HANDOFF.md`](docs/HANDOFF.md) for:
- How to run the system day-to-day
- What to do if submissions fail
- How to share photos with Giant corporate

### For Technical Issues
1. Check [GitHub Issues](https://github.com/romanogelsomino-blip/taipei-kitchen-forms/issues)
2. File a new issue with:
   - Form affected (production or delivery)
   - Steps to reproduce
   - Screenshots if possible
3. Tag issue with `bug` or `question` label

### For Owner (Romano)
- **Project Scope:** `docs/SCOPE.md`
- **Active Tasks:** `COORDINATION.md`
- **Daily Ops:** `docs/HANDOFF.md`
- **Contact:** Leander (Universole App Studios) — see proposal for contact info

---

## License & Credits

Built by **Universole App Studios** for **Taipei Kitchen** (Romano Gelsomino).
Project scope defined in [`docs/SCOPE.md`](docs/SCOPE.md), UAS-2026-001.

© 2026 Taipei Kitchen. All rights reserved.
