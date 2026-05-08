# Adding a New Store — Onboarding Guide

This guide walks through adding a new Giant Food Store location to the Taipei Kitchen bento delivery system.

## Prerequisites

- Store ID from Giant Food Stores
- Store contact name (receiver)
- Store address
- Agreement signed with Romano

## Step 1: Update Store Data File

**File:** `/data/stores.json`

1. Open `data/stores.json` in your editor
2. Add the new store to the `stores` array:

```json
{
  "id": "XXXX",
  "name": "Store XXXX",
  "location": "City, State",
  "active": true
}
```

**Example:**
```json
{
  "id": "6789",
  "name": "Store 6789",
  "location": "York, PA",
  "active": true
}
```

3. Save the file
4. Commit and push:
   ```bash
   git add data/stores.json
   git commit -m "[stores] Add Store 6789 (York, PA)"
   git push origin main
   ```

## Step 2: Deploy Updated Forms

The forms fetch `stores.json` automatically, so once you push to `main` and deploy to GitHub Pages, the new store will appear in the dropdown.

**Deployment:**
```bash
# From main branch:
git push origin main:gh-pages
```

Within 1-2 minutes, both forms will show the new store in the dropdown.

## Step 3: Generate QR Code

1. Go to https://www.qr-code-generator.com/
2. Select "URL" type
3. Enter the form URL with store ID parameter:
   ```
   https://YOUR_GITHUB_USERNAME.github.io/taipei-kitchen-forms/taipei_delivery_form3.html?store=6789
   ```
4. Download as PNG (high resolution)
5. Print at **4×4 inches** minimum

## Step 4: Update Google Sheet (Optional)

If you have a "Store Lookup" tab in your Google Sheet:

1. Open your `TaipeiKitchen_BentoOps_v2` sheet
2. Go to **Store Lookup** tab
3. Add new row:
   - Column A: Store ID (`6789`)
   - Column B: Store Name (`Store 6789`)
   - Column C: Location (`York, PA`)
4. The dashboard will automatically pick up this data

## Step 5: Onsite Setup

### Materials Needed
- Printed QR code (laminated)
- Tape or QR code stand
- Brief instruction card

### At the Store
1. **Meet with store manager** to confirm:
   - Cooler location for bento display
   - Delivery schedule (days/times)
   - Receiver name and contact

2. **Post QR code** in back-of-house area:
   - Near cooler/receiving area
   - Eye-level for drivers
   - Protected from moisture

3. **Test scan** with driver's phone:
   - Scan QR code
   - Verify store name appears correctly
   - Submit test delivery (can be deleted later)

4. **Confirm in dashboard**:
   - Open http://localhost:8080 (or deployed dashboard URL)
   - Go to Filters panel
   - Verify new store appears in Store dropdown

## Step 6: Train Staff

**For Store Staff:**
- How to receive deliveries (check cooler temp, sign off)
- How to rotate stock (first in, first out)
- Who to contact for issues (Romano's contact info)

**For Drivers:**
- New store location on route
- Where to find the cooler
- Receiver name

## Troubleshooting

**New store doesn't appear in form dropdown**
- Clear browser cache (Cmd/Ctrl + Shift + R)
- Verify `stores.json` is pushed to `main` branch
- Check that `active: true` is set
- Wait 1 hour for localStorage cache to expire, or clear it

**QR code scans but wrong store appears**
- Verify URL has correct `?store=XXXX` parameter
- Regenerate QR code with correct URL

**Store appears in form but not in dashboard**
- Dashboard reads from Google Sheet's "Store Lookup" tab
- Add store to that tab (Step 4)
- Or wait for first delivery to auto-populate

## Deactivating a Store

If a store closes or ends the bento program:

1. Edit `data/stores.json`
2. Change `"active": true` to `"active": false`
3. Commit and deploy
4. Store will no longer appear in dropdowns
5. Historical data remains in Google Sheet

## Support

Questions? Check:
- `/docs/HANDOFF.md` for operational procedures
- `/dashboard/README.md` for dashboard help
- `COORDINATION.md` for technical details
