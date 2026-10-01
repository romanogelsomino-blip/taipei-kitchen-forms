#!/usr/bin/env node
/**
 * Calls to the Apps Script web app from the scripts. Follows the redirect Apps Script
 * answers with, and retries reads while Google's transient error page comes back instead
 * of JSON. A POST is sent once: it writes rows, and a retry could write them twice.
 */
const https = require('https');
const http = require('http');

function request(urlString, { method = 'GET', body = null, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const lib = u.protocol === 'https:' ? https : http;
    const headers = { 'User-Agent': 'taipei-kitchen-scripts/1.0' };
    if (body !== null) {
      headers['Content-Type'] = 'text/plain;charset=utf-8';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = lib.request(u, { method, headers }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects > 5) return reject(new Error('Too many redirects'));
        // Apps Script answers a POST with a redirect to the result, which is fetched with GET.
        return resolve(request(new URL(res.headers.location, u).toString(), { redirects: redirects + 1 }));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

/** Readable text of an HTML page, for messages. */
function pageText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** GET an action with query params. Retries while the reply is not JSON; resolves to the parsed JSON. */
async function get(webAppUrl, params, { attempts = 8, pauseMs = 15000 } = {}) {
  const u = new URL(webAppUrl);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const text = await request(u.toString());
    const json = parseJson(text);
    if (json) return json;
    console.error(`${params.action || 'GET'}: attempt ${attempt} did not answer JSON — ${pageText(text)}`);
    if (attempt < attempts) await new Promise(r => setTimeout(r, pauseMs));
  }
  throw new Error('the web app never answered with JSON');
}

/** POST a payload once. Resolves to the parsed JSON, or null when the reply was not JSON. */
async function post(webAppUrl, payload) {
  const text = await request(webAppUrl, { method: 'POST', body: JSON.stringify(payload) });
  const json = parseJson(text);
  if (!json) console.error(`POST did not answer JSON — ${pageText(text)}`);
  return json;
}

module.exports = { get, post, pageText };
