# One-Time Web App URL Setup

**Required once per environment**. After this, all automation works via curl forever.

---

## Staging Setup (2 minutes)

1. **Open staging Apps Script**:
   ```bash
   npm run open:staging
   ```
   Opens: https://script.google.com/d/1vsF4FgAF3-1Xr9PA_-AfmH4f-CkSCoSMnqCU-kbz4lvTVgzw0gpCVhpP/edit

2. **Create Web App deployment**:
   - Click **Deploy** → **New deployment**
   - Click gear icon → Select **Web app**
   - Description: "Admin automation endpoints"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**

3. **Copy Web App URL**:
   - Format: `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`
   - Save this URL - you'll need it for .env.staging

---

## Production Setup (2 minutes)

1. **Open production Apps Script**:
   ```bash
   npm run open:production
   ```
   Opens: https://script.google.com/d/1WoLDGj8t2u23SXBT2XaZFCUg60hdvy4G2REXxqEPaqHuUudmFoyqJjbU/edit

2. **Create Web App deployment**:
   - Click **Deploy** → **New deployment**
   - Click gear icon → Select **Web app**
   - Description: "Admin automation endpoints"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**

3. **Copy Web App URL**:
   - Format: `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`
   - Save this URL - you'll need it for .env.production

---

## Why This Can't Be Fully Automated

- `clasp deploy` creates deployments but can't set deployment **type** (Web App vs API Executable)
- Web App access level ("Anyone") must be set via GUI or Apps Script API
- Apps Script API requires additional OAuth client setup (adds complexity)
- **Trade-off**: 4 minutes of GUI clicking once → infinite automation forever

---

## After URLs Are Obtained

Run:
```bash
node scripts/generate-env-files.js
```

This will:
1. Call setupAdminToken on both environments
2. Generate .env.staging and .env.production
3. Test connectivity with ping action
4. Output tokens and confirm setup

---

**Next**: Once you have the Web App URLs, provide them and I'll complete the automation.
