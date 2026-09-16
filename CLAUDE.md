# Notes

- **Never deploy by hand.** Do not run `clasp push` or `clasp deploy` locally, and do not
  edit code in the Apps Script editor. Git is the source of truth, and every deployment runs
  through CI on a push to `dev` or `prod`. See `deployment/README.md`.
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
