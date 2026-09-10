#!/usr/bin/env bash
set -euo pipefail
expected="${1:-}"
test -n "$expected" || { echo "usage: store-pi-session.sh <expected-worker-origin>" >&2; exit 1; }
value="$(pbpaste)"
actual="$(node -e 'const u=new URL(process.argv[1]); if(u.pathname!=="/mcp"||!u.searchParams.get("id")) process.exit(2); process.stdout.write(u.origin)' "$value")"
test "$actual" = "$expected" || { echo "clipboard Echo URL has the wrong Worker origin" >&2; exit 1; }
case "$actual" in
  https://*|http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "Echo Worker origin must use HTTPS or loopback HTTP" >&2; exit 1 ;;
esac
security add-generic-password -U -a "$USER" -s echo-webmcp-mcp-url -w "$value" >/dev/null
security add-generic-password -U -a "$USER" -s echo-webmcp-worker-origin -w "$actual" >/dev/null
printf 'Echo session stored in Keychain.\n'
