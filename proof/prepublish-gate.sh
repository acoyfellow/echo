#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun install --frozen-lockfile
bun run build:demo
bun run typecheck
bun test
bun run verify:extension-free
git diff --check
if command -v gitleaks >/dev/null 2>&1; then gitleaks git --no-banner --redact; fi
if command -v guardrail >/dev/null 2>&1; then guardrail lockfile .; guardrail lint .; fi
printf 'ECHO_PREPUBLISH_OK:%s\n' "$(git rev-parse HEAD)"
