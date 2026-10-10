# Security

Echo is an experimental `0.0.1` project.

Do not report security problems in a public GitHub issue. Use GitHub's private vulnerability reporting for `acoyfellow/echo`.

## Boundary

Echo gives an agent only the capabilities an integrated app registers for one page session. The app must protect its origin and choose what each capability may read or change.

`echo_run` code runs in a Cloudflare Dynamic Worker with `globalOutbound: null`. Its only binding forwards calls to the registered capabilities of its own session, through the same signed Worker credential, grant check, and operation receipts as `echo_call_capability`. It cannot reach the page, the network, other sessions, or the signing secret. A run is capped at 100 capability calls. Each call inside a run gets the operation ID `run:<runId>:<n>`, so a reused `runId` returns the recorded calls instead of running again.

Every direct mutation requires an operation ID. A repeated completed operation returns its stored result. A disconnect after dispatch is recorded as `outcome_unknown`, because effects may already have happened, and is not retried automatically.

Echo 0.0.1 previously shipped an optional Chrome companion with full-page Codemode. It is deprecated and removed. The Worker rejects session requests from extension origins.

## Deployment

Use a long random signing secret. Limit session lifetime. Put private deployments behind Cloudflare Access. Never store session credentials in receipts or logs.
