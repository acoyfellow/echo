# Security

Echo is an experimental `0.0.1` project.

Do not report security problems in a public GitHub issue. Use GitHub's private vulnerability reporting for `acoyfellow/echo`.

## Boundary

Echo has two intentionally different authority modes.

App-defined mode gives an agent only the capabilities an integrated app registers for one page session. The app must protect its origin and choose what each capability may read or change.

Full-page Codemode gives generated JavaScript the approved page’s main-world authority. It can read and modify the DOM, browser storage available to that origin, hidden application state, and authenticated actions available to page JavaScript. This is one broad permission; Echo does not claim to isolate those powers from one another.

Codemode approval is bound to one Chrome tab, one origin, and a short expiry. Cross-origin navigation, tab close, expiry, or trusted extension Stop detaches the debugger and revokes the session. A service worker restart also fails closed and detaches any stored session before accepting another command. Stop prevents future execution but cannot undo page changes, requests, or listeners that already ran.

Codemode does not grant another tab, another origin, browser chrome, local files, native prompts, or trusted user input. The Chrome debugger permission displays Chrome’s own debugging disclosure while attached.

Every mutation requires an operation ID. A repeated completed operation returns its stored result. A page exception or debugger failure after dispatch is recorded as `outcome_unknown`, because effects may already have happened, and is not retried automatically. Codemode receipts store a hash and status, not generated source, session credentials, or result values.

## Deployment

Use a long random signing secret. Limit session lifetime. Put private deployments behind Cloudflare Access. Never store session credentials in receipts or logs.
