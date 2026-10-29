# Notes

- **Never deploy by hand.** Do not run `clasp push` or `clasp deploy` locally, and do not
  edit code in the Apps Script editor. Git is the source of truth, and CI deploys on a push
  to `dev` or `prod`. See `deployment/README.md`.
- **Releases are made on GitHub, not from a terminal.** A production release is a pull
  request from `dev` to `prod`, merged with a merge commit, then published as a GitHub
  Release. Never propose pushing `prod` or a tag directly.
- **Production, then packaging, then delivery, then sales.** Food is cooked, loaded into
  coolers, delivered, then sold, so wherever these appear together — navigation, lists,
  data files, documentation, code — they come in that order.
- **Records live in monthly spreadsheets.** One file per month inside a folder per year,
  six tabs, headers generated from `backend/Schemas.gs`. A record is filed under its own
  date read in New York, so one submission can span two files.
- **Header text is the read contract; column order is not.** Appends, reads and updates all
  locate columns by matching header text, so a tab can be reordered by hand without breaking
  a write. Never address a monthly tab by column position.
- **One submission id per submission.** Every row of a submission carries it, and it is how
  a delivery's photos find their rows.
- **Three time formats, no others.** Calendar dates `YYYY-MM-DD`, wall-clock times `HH:mm`,
  and instants as ISO 8601 in New York with a numeric offset. Everything the backend writes
  goes through `backend/Dates.gs`.
- **Configuration comes from GitHub secrets.** CI pushes every Script Property from the
  matching secret on each deploy. `ADMIN_TOKEN` is the sole exception, copied by hand because
  the endpoint that sets properties authenticates with it. Do not introduce a setting that is
  configured by hand in the Apps Script project.
- **The monthly files are the only store for records.** The single-spreadsheet system they
  replaced is retired: nothing reads or writes it. Do not reintroduce a second write target
  for submissions.
- **Reference lists live in the `Reference` sheet.** Kitchens, stores, dishes, cooks,
  drivers and supervisors, in that order wherever the six appear (the one place
  production-first does not apply), are one tab each in a spreadsheet at the root of
  `SPREADSHEET_FOLDER_ID`, edited from the dashboard's Config tab and published to
  `data/<list>.json` by the site build; a form only ever reads those static files.
  Supervisors are who may resolve a violation: the dashboard offers them on a violation's
  card, and no form reads them. Every entry is keyed by a UUID the
  backend assigns and never changes; kitchens and stores also carry a Type (Taipei or Giant)
  and that organisation's own id, and a store's Store ID is the number its delivery rows
  carry. QR codes carry the location's UUID: a kitchen has one for the production form and
  one for the packaging form, a store one for the delivery form, which also accepts the store
  number that codes printed earlier carry. A row is never removed from the sheet: an entry is deleted to retire it
  (hidden from the Config tab, restorable), and a dish may also be deactivated to pause it;
  history resolves its name either way. A dish carries `upc`, Giant's 14-digit code for it,
  required and unique; the reserved `NON-TAIPEI DISH` (UPC `00000000000000`, deleted and
  inactive) takes sales of items no dish claims, and the reserved store `0000` the CI smoke. Kitchens, stores and dishes carry `verified`: true
  for a person's entry, false for one an import created until a person confirms it; the forms
  offer only verified entries. The git copies of `data/*.json` are seeds for local
  runs, not a source.
- **Sales rows are keyed by the retailer's identifiers and replaced in place.** A Sales row
  is one store, UPC and day; the backend resolves names and System IDs from the Reference
  sheet, creates an unverified store for a number it lacks, files an unknown UPC under the
  reserved dish, and overwrites a row with the same Date, Store ID and UPC on re-import.
- **The lists are a picker source, not a constraint.** Nothing validates a submitted
  kitchen, dish, driver or cook against them, and nothing may: the pickers allow free
  text, and a delivery is never refused over a dropdown.
