# echo

**Your logged-in browser tab, as an MCP target.**

An agent can drive any browser tab you're already signed into, without ever holding your password. echo is a Chrome extension + a Cloudflare Worker. The agent submits a plan over MCP; Cloudflare runs it inside a sandbox whose only outbound is a WebSocket back to your tab.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/acoyfellow/echo) · [live demo](https://echo.coey.dev/demo)

```ts
// what an agent calls — one MCP tool, run(plan)
const { planId } = await mcp.tools.call("run", {
  plan: `
    async ({ tab, log }) => {
      // runs in your tab's realm, with your session cookies
      const r = await tab.execute({
        code: \`
          const resp = await fetch("/api/issues?assignee=me", {
            credentials: "include"
          });
          return await resp.json();
        \`
      });
      log("got " + r.result.length + " issues");
      return r.result;
    }
  `
});
```

## How it works

1. You install the extension (load unpacked today — not in the Web Store yet).
2. You open a tab you're already signed into.
3. You click the echo icon. The extension mints an HMAC-signed session pinned to that tab's origin and opens a WebSocket to the Worker.
4. You paste the MCP URL into your client (Claude Desktop, Cursor, etc.).
5. The agent calls `run(plan)`. The Worker boots a Workflow, runs the plan in a Worker Loader sandbox with `globalOutbound: null`, and the plan's only way to do anything is `tab.execute({ code })` — which RPCs back through the WebSocket to your tab.
6. The agent calls `status(planId)`. It gets the full step log: every snippet, every result, every log line. Durable.

## What this replaces

| Today | With echo |
|---|---|
| Generate a Jira/GitHub PAT, store it in 1Password, paste it into the agent's config | Click "open echo on this tab", agent reads your tickets via your already-signed-in session |
| Run headless Chrome with stored cookies in a server somewhere | Use the browser you already have open |
| Give the agent access to a service account that can see everything | Agent sees what *you* can see in that tab — no more |
| "What did the agent do?" → guess from API logs | `echo.status(planId)` returns every code snippet and result |

## Trust model

| Capability | Status | Enforced by |
|---|---|---|
| Read DOM and run authenticated `fetch()` on the tab's origin | ✅ | content script / `chrome.scripting.executeScript({world: "MAIN"})` |
| Make cross-origin requests subject to CORS | ✅ | the browser |
| Reach the Worker's signing secret or other tabs | ❌ | `globalOutbound: null` in `src/agent.ts` |
| Talk to a different tab than the one you opened the session on | ❌ | `state.tabId` is pinned in `extension/background.ts` |
| Survive after you close the tab | ❌ | `chrome.tabs.onRemoved` revokes the session |
| Be replayed by a stale or stolen session id | ❌ | HMAC + expiry in `src/auth.ts` |
| Be invoked from a different origin than the one the session was minted on | ❌ | origin pin verified server-side in `src/auth.ts` |

**You still have to trust the agent you give a session to.** Inside the tab's origin, plan code can do anything the page's own JS could do. echo bounds the *blast radius*; it does not replace good judgment about who you let drive.

## Try it without installing anything

The live demo at <https://echo.coey.dev/demo> hits the production Worker directly. You can write a plan, submit it, and see the workflow step history. With no extension attached, the plan call returns `session_unbound` — the supervisor refusing to deliver code to a tab that isn't there. That's the kill switch working; it's not a useful run.

For a useful run, you need the extension and a tab.

## Run it locally

```bash
git clone https://github.com/acoyfellow/echo && cd echo
bun install
bun run dev
```

Open <http://127.0.0.1:8870>.

## Deploy your own

```bash
git clone https://github.com/acoyfellow/echo && cd echo
bun install
bun run setup:secret     # mints an HMAC signing secret
bun run deploy           # deploys to your Cloudflare account
```

Or click the button at the top of this README.

You get one Worker with the docs site, the MCP endpoint, the WebSocket relay, per-session Durable Objects, and per-plan Workflows. Your account, your audit, your rate limits.

## Install the extension

```bash
bun run build:ext
# Chrome → chrome://extensions → Developer mode → Load unpacked → echo/extension/dist
```

In the popup, set the Worker URL to your deployment (or `https://echo.coey.dev` for the hosted instance). Then click the echo icon on any tab you're signed into.

Chrome Web Store submission is not done yet. If you'd rather wait, watch the repo.

## What's under the hood

- **Cloudflare Worker** — the MCP endpoint (`tools/list`, `tools/call`) plus the WebSocket relay
- **Durable Object** — one per session; holds the WebSocket to your extension and routes sandbox → tab calls
- **Worker Loader** — per-plan V8 sandbox with `globalOutbound: null`; the only thing the plan can talk to is the `TAB` binding handed to it
- **Dynamic Workflows** — every plan is a workflow; step history is queryable for hours
- **`agents` SDK** — wires the WebSocket transport and the workflow integration
- **MV3 Chrome extension** — service worker holds the WS via PartySocket; content script + `chrome.scripting.executeScript({world: "MAIN"})` runs plan-supplied code in the page realm

## Repo layout

```
src/
  index.ts        worker entry, all routes
  agent.ts        EchoAgent — the supervisor (Agent DO)
  plan.ts         EchoPlan — the Workflow that runs each plan
  tab-binding.ts  WorkerEntrypoint the sandbox calls back through
  mcp.ts          one MCP tool: run(plan) + status(planId)
  auth.ts         HMAC-signed origin-pinned session ids
  site.ts         the docs site + /demo, served from the same Worker
extension/
  manifest.json   MV3
  background.ts   AgentClient (PartySocket) WS + message routing
  content.ts      content script bridge (execute → MAIN world)
  popup.ts        toolbar UI: open / close / copy MCP URL
```

## License

MIT.
