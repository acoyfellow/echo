# Security

Echo is experimental `0.0.1` software. Do not use it for sensitive production work without reviewing the implementation and operating your own broker.

Report vulnerabilities through GitHub's private vulnerability reporting for `acoyfellow/echo`, not a public issue.

## Authority

Echo Codemode gives generated JavaScript the approved page's main-world authority. It can read and modify the DOM, browser storage available to that origin, hidden application state, and authenticated actions available to page JavaScript.

This is one broad permission. Echo does not isolate those powers from one another and does not protect an app from its own same-origin JavaScript or XSS.

## Approval and revocation

The trusted Chrome companion binds approval to one tab, one origin, and a short expiry. Cross-origin navigation, tab closure, expiry, companion Stop, and companion service-worker restart revoke future execution and detach Chrome's debugger.

Stop cannot undo page changes, requests, listeners, storage writes, or other effects that already completed. Same-origin navigation retains authority until Stop or expiry. Chrome shows its own debugger disclosure while attached.

Codemode does not grant another tab, another origin, browser chrome, local files, native permission prompts, or trusted keyboard or pointer input.

## Operations and receipts

Every execution requires an operation ID. A repeated completed operation returns its stored result. A page exception or debugger failure after dispatch becomes `outcome_unknown`; Echo does not retry it automatically because effects may already have happened.

Receipts store the approved origin, code hash, timing, and outcome. They do not store generated source, session credentials, or result values.

## Deployment

Use a long random signing secret, limit session lifetime, rotate compromised secrets, and put private deployments behind access controls. Session URLs are bearer credentials: anyone who obtains an active URL can use its authority until revocation or expiry.
