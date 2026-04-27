# Taipei Kitchen Forms

The production and delivery logging system for Taipei Kitchen Bento — the ready-to-eat bento program operating inside Giant supermarkets across central Pennsylvania.

This system tracks every bento box from the moment it's cooked, through cooling, into the cold-chain delivery, and onto the shelf at each Giant location. The goal: a clean, traceable record that supports USDA / FSIS food safety compliance as the program grows.

---

## What's Here

| File                            | What it does                                                 |
|---------------------------------|--------------------------------------------------------------|
| `taipei_production_form3.html`  | Kitchen form. Logs each batch — cook times, cooling, dish counts, quality notes. |
| `taipei_delivery_form3.html`    | Driver form. Logs each store delivery — temps, photos, what was loaded, what was left. |

Both are simple web pages, hosted on GitHub Pages, opened by phone via QR codes posted at each location.

---

## How It Works

1. An employee scans the QR code at their location.
2. The form opens on their phone.
3. They fill it out and hit submit.
4. The information lands in the master Google Sheet (`TaipeiKitchen_BentoOps_v2`).
5. Delivery photos land in a Google Drive folder.

---

## Stores Currently Served

| Store ID | Location                       |
|----------|--------------------------------|
| 6006     | Kline Village, Harrisburg, PA  |
| 6061     | Shippensburg, PA               |
| 6253     | New Cumberland, PA             |
| 6331     | Mechanicsburg, PA              |
| 6443     | Chambersburg, PA               |
| 6542     | Carlisle, PA                   |
| 6564     | Harrisburg (Gayson Rd), PA     |

---

## Food Safety Rules Built In

The forms automatically flag anything outside HACCP cooling rules:

- Hot food must cool from 135°F to 70°F within 2 hours
- Then from 70°F to 41°F within 4 more hours
- Final batch temperature must be 41°F or below before packaging
- Any delivery temperature above 41°F gets flagged on submission

---

## Known Issues to Address

- **Submissions fail when Wi-Fi is weak** at Giant locations, especially for photos. When that happens, the data is lost.
- **Anyone with the QR code can submit** — there's no driver login yet.
- **Photos upload at full size**, which is slow on weak connections.
- **Adding a new store** currently requires editing the form code.

---

## For the Owner

- Master spreadsheet: `TaipeiKitchen_BentoOps_v2` in Google Sheets
- Photo repository: Google Drive (shareable via link)
- All changes to the live forms should be tested on a duplicate copy first

---

## Contact

Owner: **Romano Gelsomino** — Taipei Kitchen
