# Notes

- **Never deploy by hand.** Do not run `clasp push` or `clasp deploy` locally, and do not
  edit code in the Apps Script editor. Git is the source of truth, and every deployment runs
  through CI on a push to `dev` or `prod`. See `deployment/README.md`.
