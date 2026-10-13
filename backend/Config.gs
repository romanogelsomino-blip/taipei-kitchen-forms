// Config.gs — Script Properties and the alert settings.
//
// Deployment identity lives in Script Properties, pushed by CI from GitHub secrets on every
// deploy; ADMIN_TOKEN alone is copied by hand. None has a default: an unset property throws.

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

