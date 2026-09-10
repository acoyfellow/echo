# Security

Echo is an experimental `0.0.1` project.

Do not report security problems in a public GitHub issue. Use GitHub's private vulnerability reporting for `acoyfellow/echo`.

## Boundary

Echo gives an agent access only to capabilities that an integrated app registers for one connected page session.

Echo does not provide protection from malicious same-origin JavaScript or XSS. App code can access values that the Echo client receives, including the MCP session URL. The app must protect its origin and choose what each capability may read or change.

Echo does not expose cookies, browser storage, arbitrary JavaScript, arbitrary selectors, cross-origin navigation, browser chrome, native prompts, or trusted user input.

A mutation requires an operation ID. A repeated completed operation returns its stored result. An uncertain mutation is not retried automatically. The app must also enforce operation identity at its external-effect boundary.

## Deployment

Use a long random signing secret. Limit session lifetime. Put private deployments behind Cloudflare Access. Never store session credentials in receipts or logs.
