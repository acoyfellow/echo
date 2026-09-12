# Echo

**Give an MCP agent temporary JavaScript access to one live Chrome tab.**

Echo is experimental AX infrastructure. A trusted browser companion lets a person approve one tab, copy a temporary MCP URL, and stop the session outside the page.

The agent receives one tool: `page_evaluate`. It can inspect and change anything JavaScript in the approved page can reach, including DOM state, origin storage, hidden application state, and authenticated requests.

> Status: `0.0.1` at [echo.coey.dev](https://echo.coey.dev).

## Install

Prerequisites: Chrome and Bun.

```sh
git clone https://github.com/acoyfellow/echo.git
cd echo
bun install --frozen-lockfile
bun run build:extension
```

In Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this repository's `extension/` directory.

The built companion uses the hosted broker at `https://echo.coey.dev`. It works with HTTPS pages and loopback HTTP pages on `localhost` or `127.0.0.1`; the page does not install an SDK or add Echo-specific code.

## Use it

1. Open the app tab the agent should operate.
2. Open **Echo Codemode** from Chrome's extension menu.
3. Read the full-page warning and choose the exact tab.
4. Select **Allow selected tab for 10 minutes**.
5. Copy the agent connection and add that URL as an MCP server in your agent.
6. Press **Stop and detach** when finished.

Try the single local target:

```sh
cp .dev.vars.example .dev.vars
bun run dev
```

Open `http://127.0.0.1:8870/demo/`.

## Agent interface

The MCP server exposes one tool:

```json
{
  "name": "page_evaluate",
  "arguments": {
    "code": "document.title",
    "operationId": "read-title-1"
  }
}
```

`code` runs in the approved page's main JavaScript world. An operation ID is required. Completed operations deduplicate. If an exception or debugger failure occurs after dispatch, Echo reports `outcome_unknown` because effects may already have happened.

## Authority boundary

Approval binds one random session to:

- one Chrome extension identity
- one exact tab
- one exact page origin
- one short expiry

Cross-origin navigation, tab closure, expiry, companion restart, and trusted Stop revoke future execution. Stop does not undo requests, listeners, storage writes, or other effects already completed.

Codemode does not grant access to another tab, another origin, browser chrome, local files, native permission prompts, or trusted keyboard and pointer input. Chrome displays its own debugging disclosure while Echo is attached.

Echo does not sandbox powers within the approved page. Same-origin JavaScript and XSS already share that page authority.

Read [SECURITY.md](SECURITY.md) before using Echo with sensitive data.

## Self-host the broker

Set a signing secret and deploy the Worker on your own Cloudflare account:

```sh
export CLOUDFLARE_ACCOUNT_ID=your-account-id
bun run setup:secret
bunx wrangler deploy
ECHO_WORKER_BASE=https://your-worker.example bun run build:extension
```

Reload the unpacked extension after rebuilding it.

## Verify it

```sh
bun run typecheck
bun test
bun run e2e:site
bun run e2e:codemode:check
bun run test:codemode-tamper
```

The Codemode referee launches real Chrome with the companion installed and proves exact-tab isolation, execution, trusted Stop, cross-origin navigation revocation, expiry, companion-restart revocation, uncertain outcomes, and redacted receipts.

## Repository layout

```text
extension/   trusted Chrome approval and execution boundary
src/         Hono Worker, MCP transport, session credentials, and site
e2e/         independent Chrome referees
receipts/    redacted, hash-bound browser evidence
```

## License

MIT
