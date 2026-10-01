// Config.gs — Script Properties and the alert settings.
//
// Deployment identity (SPREADSHEET_ID, PHOTO_FOLDER_ID, ADMIN_TOKEN) lives in Script
// Properties, pushed by CI from GitHub secrets, ADMIN_TOKEN copied by hand; none has a default, an unset property throws. Alert
// settings currently live in the legacy Config sheet.

/** A Script Property that must be set. Throws naming it; nothing here has a default. */
function requireProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) {
    throw new Error(
      `${name} Script Property is not set on this Apps Script project. ` +
      'CI sets it from the matching GitHub secret on every deploy; ADMIN_TOKEN alone is copied by hand under Project Settings > Script Properties.'
    );
  }
  return value;
}

/**
 * Where records are written, from the WRITE_TARGETS property: `legacy,monthly`
 * during the side-by-side period, `monthly` once the legacy sheet is retired. Unset or
 * anything else throws: reads come from the monthly files only, so `legacy` alone would
 * make every new record invisible.
 */
function getWriteTargets() {
  const raw = requireProperty('WRITE_TARGETS');
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const bad = parts.filter(p => p !== 'legacy' && p !== 'monthly');
  if (bad.length || !parts.includes('monthly')) {
    throw new Error('WRITE_TARGETS is "' + raw + '"; expected "legacy,monthly" or "monthly".');
  }
  return { raw: raw, monthly: true, legacy: parts.includes('legacy') };
}
