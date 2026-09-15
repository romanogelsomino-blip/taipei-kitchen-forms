#!/usr/bin/env bash
# Calls to the Apps Script web app from the deploy workflow. Sourced by the backend job's
# steps; needs URL and TOKEN in the environment.
#
# Apps Script intermittently answers with Google's "unable to open the file" HTML page
# instead of the script's JSON, including on requests the script did execute. Reads and
# idempotent admin actions are retried until they answer JSON. A form POST is never
# retried: it writes rows, and a retry after such a page could write them twice.

WEBAPP_ATTEMPTS=${WEBAPP_ATTEMPTS:-8}
WEBAPP_PAUSE=${WEBAPP_PAUSE:-15}

webapp_is_json() { jq -e . >/dev/null 2>&1 <<<"$1"; }

# Readable text of an HTML page, for the log.
webapp_page_text() {
  python3 -c '
import sys, html.parser
class T(html.parser.HTMLParser):
    def __init__(s): super().__init__(); s.skip = 0; s.out = []
    def handle_starttag(s, tag, attrs):
        if tag in ("script", "style"): s.skip += 1
    def handle_endtag(s, tag):
        if tag in ("script", "style") and s.skip: s.skip -= 1
    def handle_data(s, data):
        if not s.skip and data.strip(): s.out.append(data.strip())
t = T(); t.feed(sys.stdin.read())
print((" ".join(t.out) or "(no readable text)")[:300])
' <<<"$1"
}

# webapp_get <action> [key=value ...]: prints the JSON body; fails after WEBAPP_ATTEMPTS non-JSON replies.
webapp_get() {
  local action=$1; shift
  local args=(--data-urlencode "action=$action" --data-urlencode "token=$TOKEN")
  local kv attempt out
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  for attempt in $(seq 1 "$WEBAPP_ATTEMPTS"); do
    out=$(curl -sL --max-time 120 --get "$URL" "${args[@]}" || true)
    if webapp_is_json "$out"; then printf '%s\n' "$out"; return 0; fi
    echo "$action: attempt $attempt did not answer JSON — $(webapp_page_text "$out")" >&2
    if [ "$attempt" -lt "$WEBAPP_ATTEMPTS" ]; then sleep "$WEBAPP_PAUSE"; fi
  done
  return 1
}

# webapp_post <file>: one attempt. Prints the JSON body, or fails when the reply was not JSON.
webapp_post() {
  local out
  out=$(curl -sL --max-time 150 "$URL" -H 'Content-Type: text/plain;charset=utf-8' --data-binary @"$1" || true)
  if webapp_is_json "$out"; then printf '%s\n' "$out"; return 0; fi
  echo "POST did not answer JSON — $(webapp_page_text "$out")" >&2
  return 1
}

# webapp_field <json> <jq path>: one field as text, empty when absent or null.
webapp_field() { jq -r "$2 // empty" <<<"$1"; }
