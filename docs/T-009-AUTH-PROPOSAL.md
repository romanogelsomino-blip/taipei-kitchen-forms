# T-009 — Driver Authentication Proposal

**Task:** T-009 — Driver auth: lightweight PIN or per-driver QR with signed token
**Status:** NEEDS-OWNER (awaiting decision)
**Author:** @code
**Date:** 2026-05-06

---

## Problem Statement

**Current State:** Anyone with the QR code URL can submit production or delivery data. There is no authentication mechanism.

**Risk Level:** Medium
- QR codes are posted in restricted areas (Giant employee break rooms, production kitchen)
- But QR codes can be photographed and shared
- Malicious submissions could contaminate audit trail, trigger false HACCP violations, or corrupt inventory data

**Owner Decision Required:** Which authentication approach to implement in V2?

---

## Proposed Approaches

### Option 1: Simple PIN Authentication

**How it works:**
- User scans QR code → form loads → PIN entry screen appears before form
- User enters 4-digit PIN → validated against stored PINs
- If correct, form unlocks; if incorrect, shows error
- PINs stored in JSON file (e.g., `data/drivers.json`) or hardcoded

**Example UX:**
```
┌─────────────────────────────┐
│  Taipei Kitchen             │
│  Delivery Form              │
├─────────────────────────────┤
│  Enter your 4-digit PIN:    │
│  [ ][ ][ ][ ]               │
│  [1][2][3]                  │
│  [4][5][6]                  │
│  [7][8][9]                  │
│  [Clear][0][Submit]         │
└─────────────────────────────┘
```

**Pros:**
- ✅ Simple to implement (1–2 days)
- ✅ No external dependencies (no Google APIs, no crypto libraries)
- ✅ Works offline (PINs cached in localStorage)
- ✅ Familiar UX (everyone knows how to use a PIN)
- ✅ Easy to manage (owner can change PINs by editing JSON file)

**Cons:**
- ⚠️ Weak security (4-digit PIN = 10,000 combinations, brute-forceable)
- ⚠️ PIN sharing (employees may share PINs with unauthorized users)
- ⚠️ No audit trail (can't track who accessed form, only who submitted)
- ⚠️ PIN reset requires manual intervention (owner must update JSON file)

**Security Mitigations:**
- Rate limiting: Lock form for 30 seconds after 3 failed attempts
- PIN rotation: Require PIN change every 90 days (reminder in form UI)
- Session timeout: Re-prompt for PIN after 1 hour of inactivity

**Cost:** $0 (no external services)

**Estimated Implementation:** 1–2 days

---

### Option 2: Google Sign-In (OAuth 2.0)

**How it works:**
- User scans QR code → form loads → "Sign in with Google" button appears
- User clicks button → redirected to Google OAuth consent screen
- User signs in with Google account → redirected back to form
- Form validates Google access token → unlocks if user is in allowlist

**Example UX:**
```
┌─────────────────────────────┐
│  Taipei Kitchen             │
│  Delivery Form              │
├─────────────────────────────┤
│  Please sign in to continue │
│                             │
│  ┌─────────────────────────┐│
││  [G] Sign in with Google  ││
│  └─────────────────────────┘│
│                             │
│  Only authorized Giant      │
│  employees can access.      │
└─────────────────────────────┘
```

**Pros:**
- ✅ Strong security (Google handles auth, MFA support)
- ✅ No PIN management (users use existing Google accounts)
- ✅ Audit trail (Google login = email address, logged in submission)
- ✅ Fine-grained access control (allowlist by email domain: `@giant.com`)
- ✅ Single sign-on (user stays signed in across sessions)

**Cons:**
- ⚠️ Requires internet (OAuth flow needs network, fails offline)
- ⚠️ Complex implementation (OAuth library, token validation, allowlist management)
- ⚠️ External dependency (relies on Google APIs)
- ⚠️ Privacy concerns (Google knows who accessed forms, when)
- ⚠️ User friction (extra click, redirect, consent screen)
- ⚠️ Assumes all users have Google accounts (may not be true for all Giant employees)

**Security Considerations:**
- Must validate access tokens server-side (Apps Script endpoint)
- Allowlist stored in Apps Script or Google Sheet (admin-editable)
- Token refresh required (access tokens expire after 1 hour)

**Cost:** $0 (Google Sign-In is free for non-commercial use; verify with Giant's Google Workspace admin)

**Estimated Implementation:** 5–7 days (OAuth integration + Apps Script token validation + testing)

---

### Option 3: Signed-Token QR Codes (Per-Driver QR)

**How it works:**
- Owner generates unique QR code for each driver (one-time setup)
- QR code encodes a signed token: `?driver=DRIVER_NAME&token=HMAC_SIGNATURE`
- Token is HMAC-SHA256 signature of `DRIVER_NAME + SECRET_KEY + EXPIRY`
- Form validates signature on load → if valid, pre-fills driver name and locks field
- If invalid or expired, shows error

**Example QR Code URL:**
```
https://user.github.io/taipei-kitchen-forms/delivery?store=6542&driver=JohnDoe&token=a3f8c9d2e1b4...&exp=1735689600
```

**Example UX:**
- User scans QR code → form loads → driver field pre-filled and locked: `[John Doe 🔒]`
- User fills rest of form → submits
- No PIN entry, no sign-in screen

**Pros:**
- ✅ Strong security (HMAC signature, unforgeable without secret key)
- ✅ No user friction (zero-click auth — driver name auto-filled)
- ✅ Offline-friendly (signature validated client-side, no network needed)
- ✅ Audit trail (driver name embedded in QR, logged in submission)
- ✅ Revocable (expire token by changing secret key or setting expiry date)
- ✅ No external dependencies (crypto built into browsers via Web Crypto API)

**Cons:**
- ⚠️ QR code management (must print and distribute unique QR code per driver)
- ⚠️ Token expiry (QR codes become invalid after expiry date, must reissue)
- ⚠️ Physical security (if QR code is photographed, anyone can use it until expiry)
- ⚠️ No password (QR code alone grants access — no second factor)
- ⚠️ Requires QR generation tool (owner must run script to generate signed QR codes)

**Security Considerations:**
- Secret key must be strong (256-bit random key, stored securely)
- Expiry date prevents long-term abuse (recommend 90-day expiry, reissue quarterly)
- Signature validated via HMAC-SHA256 (built into browser, no library needed)
- Rate limiting still recommended (prevent rapid-fire submissions)

**Cost:** $0 (no external services)

**Estimated Implementation:** 3–4 days (HMAC validation + QR generation script + testing)

**QR Generation Script:**
```javascript
// Node.js script to generate signed QR codes
const crypto = require('crypto');

const SECRET_KEY = 'YOUR_256_BIT_SECRET_KEY'; // Store securely
const BASE_URL = 'https://user.github.io/taipei-kitchen-forms/delivery';

function generateDriverQR(driverName, storeId, expiryDays = 90) {
  const expiry = Math.floor(Date.now() / 1000) + (expiryDays * 24 * 60 * 60);
  const payload = `${driverName}|${storeId}|${expiry}`;
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');

  const url = `${BASE_URL}?store=${storeId}&driver=${encodeURIComponent(driverName)}&token=${signature}&exp=${expiry}`;
  console.log(`QR Code URL for ${driverName} (expires ${new Date(expiry * 1000).toISOString()}):`);
  console.log(url);
}

generateDriverQR('John Doe', '6542');
```

---

## Comparison Matrix

| Criterion | PIN Auth | Google Sign-In | Signed-Token QR |
|---|---|---|---|
| **Security Strength** | ⭐⭐ Weak | ⭐⭐⭐⭐ Strong | ⭐⭐⭐⭐ Strong |
| **User Friction** | ⭐⭐⭐ Medium (PIN entry) | ⭐⭐ High (redirect, consent) | ⭐⭐⭐⭐⭐ None (zero-click) |
| **Offline Support** | ⭐⭐⭐⭐⭐ Full | ❌ None (OAuth requires network) | ⭐⭐⭐⭐⭐ Full |
| **Implementation Complexity** | ⭐⭐⭐⭐⭐ Simple (1–2 days) | ⭐⭐ Complex (5–7 days) | ⭐⭐⭐ Medium (3–4 days) |
| **Management Overhead** | ⭐⭐⭐ Medium (PIN resets) | ⭐⭐⭐⭐ Low (Google manages users) | ⭐⭐ High (QR reissue every 90 days) |
| **Audit Trail** | ❌ None (only submission data) | ⭐⭐⭐⭐⭐ Full (email + timestamp) | ⭐⭐⭐⭐ Good (driver name + timestamp) |
| **Revocability** | ⭐⭐ Slow (change PIN manually) | ⭐⭐⭐⭐⭐ Instant (remove from allowlist) | ⭐⭐⭐⭐ Fast (expire token / change key) |
| **Cost** | Free | Free (verify with Giant IT) | Free |
| **Scalability** | ⭐⭐⭐ Medium (1 PIN per role) | ⭐⭐⭐⭐⭐ High (unlimited users) | ⭐⭐⭐ Medium (1 QR per driver) |

---

## Recommendation

**For Taipei Kitchen's use case, I recommend Option 3: Signed-Token QR Codes.**

### Rationale:
1. **Offline-Friendly:** Giant locations have weak Wi-Fi. Signed-token QR works offline, while Google Sign-In does not.
2. **Zero User Friction:** Drivers scan QR → form opens → name pre-filled. No PIN to remember, no sign-in redirect.
3. **Strong Security:** HMAC signatures are cryptographically secure and unforgeable without the secret key.
4. **Audit Trail:** Driver name embedded in QR and logged in every submission.
5. **Revocable:** Expire QR codes quarterly (90-day expiry) to limit abuse window.

### Why Not PIN?
- Too weak (4-digit PIN = 10,000 combos, brute-forceable in minutes)
- No audit trail (can't tell *who* accessed form, only who submitted)
- PIN sharing likely (employees share PINs with coworkers)

### Why Not Google Sign-In?
- Requires internet for OAuth flow (fails on weak Giant Wi-Fi)
- High user friction (redirect, consent screen, assumes Google account)
- Overkill for this use case (we need simple driver identification, not full SSO)

---

## Implementation Plan (Option 3)

### Phase 1: Core Auth Logic (2 days)
- [ ] Add HMAC-SHA256 signature validation to form JS (Web Crypto API)
- [ ] Parse `driver`, `token`, `exp` from URL params
- [ ] Validate signature: `HMAC(driver|store|exp, SECRET_KEY) === token`
- [ ] If valid and not expired: pre-fill driver field, lock it, show green checkmark
- [ ] If invalid or expired: show error overlay, block form submission

### Phase 2: QR Generation Tool (1 day)
- [ ] Write Node.js script to generate signed QR code URLs
- [ ] Store secret key in `.env` file (not committed to repo)
- [ ] Output QR codes as PNG images (using `qrcode` npm package)
- [ ] Document usage in `docs/GENERATE_DRIVER_QR.md`

### Phase 3: Testing & Deployment (1 day)
- [ ] Test valid signature → form unlocks
- [ ] Test invalid signature → error shown
- [ ] Test expired token → error shown
- [ ] Test QR generation script for all 7 stores
- [ ] Generate QR codes for pilot drivers (2–3 drivers)
- [ ] Print QR codes and laminate for durability

### Phase 4: Rollout (ongoing)
- [ ] Distribute QR codes to drivers (one per driver)
- [ ] Set 90-day expiry reminder in calendar
- [ ] Regenerate QR codes quarterly

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| QR code photographed and shared | Medium | Medium | Short expiry (90 days), monitor for suspicious submissions |
| Secret key leaked | Low | High | Store in secure location (not in repo), rotate if compromised |
| Driver loses QR code | Medium | Low | Reissue QR code (5-minute process) |
| Expiry causes form outage | High | Medium | Set calendar reminders, reissue 1 week before expiry |

---

## Alternative: Hybrid Approach (PIN + Signed QR)

If owner wants **both** convenience (QR) and fallback (PIN):
- Default: Signed-token QR codes for drivers (zero-click)
- Fallback: PIN for supervisors/admin (if QR lost or expired)
- Implementation: Add both validation paths in form (QR check first, then PIN prompt if no QR)

**Cost:** +1 day (add PIN logic on top of QR logic)

---

## Owner Decision Required

**Please select one approach:**
- [ ] Option 1: Simple PIN Authentication
- [ ] Option 2: Google Sign-In (OAuth 2.0)
- [ ] Option 3: Signed-Token QR Codes *(recommended)*
- [ ] Option 4: Hybrid (Signed QR + PIN fallback)
- [ ] Option 5: Defer to V3 or later (no auth in V2)

**Next Steps After Decision:**
1. Owner selects approach via comment in COORDINATION.md (T-009 Notes column)
2. @code implements selected approach in V2 feature branch
3. @browser tests on staging with pilot drivers
4. UAT with Romano before production rollout

---

**End of Proposal**
