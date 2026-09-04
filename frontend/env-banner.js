// Standing warning on any non-production deployment.
//
// The environment comes from config.js, which is generated per tree at build time. This
// replaced a build-time rewrite that injected the banner by string-matching `<body>`: it
// worked, but adding an attribute to a <body> tag or nesting a page one level deeper made
// the banner vanish silently, leaving staging indistinguishable from production.
//
// Reading the environment instead means the banner is normal committed code, and a missing
// config.js shows "UNKNOWN" rather than nothing — it fails loud, not open.
(function () {
  var env = (window.APP_CONFIG && window.APP_CONFIG.environment) || 'unknown';
  if (env === 'production') return;

  function render() {
    if (!document.body || document.getElementById('env-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'env-banner';
    bar.textContent = '⚠ ' + env.toUpperCase() + ' — not production data';
    bar.setAttribute(
      'style',
      'position:sticky;top:0;z-index:99999;background:#b45309;color:#fff;' +
      'font:700 13px monospace;text-align:center;padding:8px'
    );
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
