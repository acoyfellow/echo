#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bun install --frozen-lockfile
bun run build:site
bun run typecheck
bun test
bun run e2e:codemode:check
bun run test:codemode-tamper
git diff --check
if command -v gitleaks >/dev/null 2>&1; then gitleaks git --no-banner --redact; fi
if command -v guardrail >/dev/null 2>&1; then guardrail lockfile .; guardrail lint .; fi
printf 'ECHO_PREPUBLISH_OK:%s\n' "$(git rev-parse HEAD)"
