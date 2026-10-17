# Notes

- **Never deploy by hand.** Do not run `clasp push` or `clasp deploy` locally, and do not
  edit code in the Apps Script editor. Git is the source of truth, and CI deploys on a push
  to `dev` or `prod`. See `deployment/README.md`.
- **Releases are made on GitHub, not from a terminal.** A production release is a pull
  request from `dev` to `prod`, merged with a merge commit, then published as a GitHub
  Release. Never propose pushing `prod` or a tag directly.
- **Production precedes delivery.** Food is cooked before it is delivered, so wherever the
  two appear together — navigation, lists, data files, documentation, code — production
  comes first.
- **Records live in monthly spreadsheets.** One file per month inside a folder per year,
  four tabs, headers generated from `backend/Schemas.gs`. A record is filed under its own
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
- **Reference lists live in the `Reference` sheet.** Kitchens, stores, dishes, supervisors
  and drivers, in that order wherever the five appear (the one place production-first does
  not apply), are one tab each in a spreadsheet at the root of `SPREADSHEET_FOLDER_ID`,
  edited from the dashboard's Config tab and published to `data/<list>.json` by the site
  build; a form only ever reads those static files. Every entry is keyed by a UUID the
  backend assigns and never changes; kitchens and stores also carry a Type (Taipei or Giant)
  and that organisation's own id, and a store's Store ID is the number its delivery rows
  carry. A store's QR code carries its UUID; the delivery form also accepts the number, which
  codes printed earlier carry. A row is never removed from the sheet: an entry is deleted to retire it
  (hidden from the Config tab, restorable), and a dish may also be deactivated to pause it;
  history resolves its name either way. The git copies of `data/*.json` are seeds for local
  runs, not a source.
- **The lists are a picker source, not a constraint.** Nothing validates a submitted
  kitchen, dish, driver or supervisor against them, and nothing may: the pickers allow free
  text, and a delivery is never refused over a dropdown.
