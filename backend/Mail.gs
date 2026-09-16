// Mail.gs — every email the backend sends goes through here.
//
// Apps Script sends as the Google account the deployment runs as (executeAs: USER_DEPLOYING);
// there is no separate credential. A different From address is possible only when it is a
// verified "Send mail as" alias on that account, so an unusable ALERT_FROM falls back to the
// account's own address rather than losing the message.

const ALERT_FROM_NAME = 'Taipei Kitchen Operations';
const DEFAULT_SUPPORT_RECIPIENTS = 'tech-support@kalispellconsulting.com';
const ALIAS_MEMO = {}; // per-execution cache: the account's verified aliases

/** Verified "Send mail as" aliases of the sending account. Empty when Gmail cannot be asked. */
function senderAliases() {
  if (!ALIAS_MEMO.list) {
    try {
      ALIAS_MEMO.list = GmailApp.getAliases() || [];
    } catch (e) {
      ALIAS_MEMO.list = [];
      ALIAS_MEMO.error = e.toString();
    }
  }
  return ALIAS_MEMO.list;
}

/** The address alerts should come from, or '' to send as the account itself. */
function configuredFrom() {
  return (PropertiesService.getScriptProperties().getProperty('ALERT_FROM') || '').trim();
}

/** Addresses from a property, comma, semicolon or newline separated. */
function recipientsFrom(property, fallback) {
  const raw = PropertiesService.getScriptProperties().getProperty(property);
  return String(raw === null || raw === undefined || raw === '' ? fallback : raw)
    .split(/[,\n;]/)
    .map(address => address.trim())
    .filter(address => address.indexOf('@') > 0);
}

/**
 * Who hears about a HACCP violation: the people responsible for food safety at the client.
 * They should not receive stack traces.
 */
function alertRecipients() {
  return recipientsFrom('ALERT_RECIPIENTS', DEFAULT_SUPPORT_RECIPIENTS);
}

/**
 * Who hears when the system itself has a problem: bug reports, the daily operations summary
 * and the photo drift check. Whoever maintains the system, not whoever runs the kitchen.
 */
function supportRecipients() {
  return recipientsFrom('SUPPORT_RECIPIENTS', DEFAULT_SUPPORT_RECIPIENTS);
}

/**
 * Send one message and report what happened instead of throwing: an alert that cannot be
 * delivered must still be recorded. Returns
 * { status: 'SUCCESS' | 'FAILED', recipients, from, error, note }.
 */
function sendMail(to, subject, body) {
  const recipients = Array.isArray(to) ? to : [to];
  const result = { status: 'FAILED', recipients: recipients.join(', '), from: '', error: '', note: '' };
  if (!recipients.length) {
    result.error = 'No recipients configured. Set the ALERT_RECIPIENTS Script Property.';
    return result;
  }

  const message = { to: recipients.join(','), subject: subject, body: body, name: ALERT_FROM_NAME };
  const wanted = configuredFrom();
  if (wanted) {
    if (senderAliases().indexOf(wanted) >= 0) {
      message.from = wanted;
      result.from = wanted;
    } else {
      // Sending from the account's own address beats not sending at all.
      result.note = 'alert_from_unverified=' + wanted;
      Logger.log('[Mail] ALERT_FROM "' + wanted + '" is not a verified alias on the sending account; sending as the account instead.');
    }
  }

  try {
    MailApp.sendEmail(message);
    result.status = 'SUCCESS';
  } catch (error) {
    result.error = error.toString();
    Logger.log('[Mail] send failed: ' + error);
  }
  return result;
}

/** Who this deployment sends as, what it may send as, and whether ALERT_FROM is usable. */
function action_mailStatus(e) {
  try {
    const aliases = senderAliases();
    const wanted = configuredFrom();
    let account = '';
    try { account = Session.getEffectiveUser().getEmail(); } catch (err) { account = '(not available)'; }
    return jsonResponse({
      status: 'ok',
      account: account,
      aliases: aliases,
      alias_error: ALIAS_MEMO.error || null,
      alert_from: wanted || null,
      alert_from_usable: wanted ? aliases.indexOf(wanted) >= 0 : true,
      alert_from_note: wanted && aliases.indexOf(wanted) < 0
        ? 'Add ' + wanted + ' as a verified "Send mail as" alias on ' + account + ', or alerts will come from the account address.'
        : null,
      alert_recipients: alertRecipients(),
      support_recipients: supportRecipients(),
      daily_quota_remaining: MailApp.getRemainingDailyQuota()
    });
  } catch (error) {
    return jsonResponse({ status: 'error', message: error.toString() });
  }
}
