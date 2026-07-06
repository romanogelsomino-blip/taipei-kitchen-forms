# GitHub Pages Cache Issue - July 6, 2026

## Problem

GitHub Pages CDN is serving a stale version of `dashboard/config.json` despite correct code being pushed to the gh-pages branch.

**Symptoms:**
- User reports: "Before link → 404 to /dashboard/Emily, After link → shows before photo"
- Dashboard is using old Web App URL with serverTimestamp offset bug
- Git shows correct v66 URL in repo, but live site serves old URL

## Root Cause

**GitHub Pages CDN Caching**: GitHub aggressively caches static files including JSON. Even though `config.json` was updated in commit `77a7a6a` (2026-07-06 15:41:15), the CDN continued serving a cached version.

### Evidence

**Git Repository (Correct):**
```
webAppUrl: https://script.google.com/macros/s/AKfycbwyhQjnulvInEPxai_oqzltG4H18NFsq2odaM0aQPPz86EgTDMCVAYSilsmkkIxEClh0w/exec
```
(v66 - Returns data with correct serverTimestamp)

**Live CDN (Stale):**
```
webAppUrl: https://script.google.com/macros/s/AKfycbwPRkRaf_hYfLzWjdhAKasBa9cFzHN-S-Rfxv0Z9V2F6nzIgyMGvfvLYv2G8KAM_5CJFw/exec
```
(Old version - Returns data with serverTimestamp as empty string, exhibits column shift bug)

## Attempted Fixes

### 1. Cache-Busting Commit (ab6aa9f)
Added `_updated` timestamp field to config.json to force GitHub to recognize file change.

**Status:** Pushed at 2026-07-06 19:45. CDN cache may take 10-60 minutes to clear.

## Immediate Workarounds

### Option A: Wait for CDN Cache to Clear
GitHub Pages CDN typically clears within 10-60 minutes. Monitor live config:
```bash
curl -sL "https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/config.json"
```

When you see `"_updated": "2026-07-06T19:45:00Z"`, cache has cleared.

### Option B: Direct User to Use Cache-Bypass URL
Have user access dashboard with cache-busting query parameter:
```
https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/?v=66
```

Then hard refresh (Cmd+Shift+R / Ctrl+F5).

### Option C: Test v66 Endpoint Directly
Confirm v66 is working correctly:
```bash
curl -sL "https://script.google.com/macros/s/AKfycbwyhQjnulvInEPxai_oqzltG4H18NFsq2odaM0aQPPz86EgTDMCVAYSilsmkkIxEClh0w/exec" | jq '.deliveries[0].serverTimestamp'
```

Should return: `"2026-04-15T14:36:40.608Z"` (not `""`)

## Long-Term Prevention

### Update Deployment Process

**Current Issue:** Standard push workflow doesn't account for CDN caching:
```bash
git push origin gh-pages  # CDN may take up to 60 minutes to reflect changes
```

**Recommended Solutions:**

1. **Add cache headers** (requires custom domain - not available on romanogelsomino-blip.github.io)

2. **Version-based config loading** (implement in dashboard/app.js):
   ```javascript
   // Load config with cache-busting timestamp
   const configUrl = `config.json?t=${Date.now()}`;
   const response = await fetch(configUrl);
   ```

3. **Use GitHub Actions to purge cache** (advanced - requires API access)

4. **Document deployment lag** in CLAUDE.md:
   ```markdown
   ### GitHub Pages Deployment
   - Push updates to gh-pages branch
   - CDN cache may take 10-60 minutes to clear
   - Verify live deployment with: curl https://romanogelsomino-blip.github.io/.../config.json
   - Always wait for CDN to clear before marking deployment complete
   ```

## Verification Checklist

After deploying to gh-pages:

- [ ] Push completes successfully
- [ ] Wait 10 minutes minimum
- [ ] Verify live config.json has correct URL:
  ```bash
  curl -sL "https://romanogelsomino-blip.github.io/taipei-kitchen-forms/dashboard/config.json"
  ```
- [ ] Test live dashboard in incognito/private browsing window
- [ ] Verify serverTimestamp is populated (not empty string)
- [ ] Check photo links render correctly

## Related Issues

- **Issue G (June 18-29, 2026):** Photo pipeline regression due to deployment drift
- **Lesson Learned:** Always verify live deployment serves correct code before marking complete

## Timeline

- **15:41 (July 6):** Pushed v66 config.json to gh-pages (commit 77a7a6a)
- **16:10 (July 6):** User reports bug still occurring
- **16:15 (July 6):** Diagnosed CDN caching issue
- **16:45 (July 6):** Pushed cache-busting fix (commit ab6aa9f)
- **TBD:** Waiting for CDN cache to clear (10-60 min window)
