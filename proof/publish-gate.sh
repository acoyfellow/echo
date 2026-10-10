#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash proof/prepublish-gate.sh
bun run verify:production
bun run verify:reviews
if ! git diff --quiet || ! git diff --cached --quiet || test -n "$(git ls-files --others --exclude-standard)"; then
  echo "PUBLISH_GATE:working-tree-not-clean" >&2
  exit 1
fi
sha="$(git rev-parse HEAD)"
remote_sha="$(git ls-remote origin refs/heads/main | awk '{print $1}')"
test "$sha" = "$remote_sha" || { echo "PUBLISH_GATE:remote-sha-mismatch" >&2; exit 1; }
test "$(gh repo view acoyfellow/echo --json visibility --jq .visibility)" = "PUBLIC" || { echo "PUBLISH_GATE:repo-not-public" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 https://github.com/acoyfellow/echo.git "$tmp/echo" >/dev/null
cd "$tmp/echo"
test "$(git rev-parse HEAD)" = "$sha"
bun install --frozen-lockfile >/dev/null
bun run build:demo
bun run typecheck
bun test
bun run verify:extension-free
printf 'ECHO_PUBLISH_OK:%s\n' "$sha"
