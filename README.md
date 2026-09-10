# Echo

**Let an agent use capabilities exposed by one user-approved live app tab.**

Echo is a small TypeScript client and a Cloudflare Worker. An app registers a short list of actions. A person connects the current tab. The agent can call only those actions until the person presses Stop.

Echo does not need a browser extension, Chrome DevTools, WebDriver, or native WebMCP. Those tools may inspect an end-to-end test, but they are not part of Echo's product connection.

> Status: `0.0.1`, public experiment at [echo.coey.dev](https://echo.coey.dev).

## Try the local demo

```sh
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

Open `http://127.0.0.1:8870/demo/`.

The demo exposes three capabilities:

- `readState` reads the demo title and draft.
- `setDraft` changes the draft.
- `uncertainMutation` tests a disconnect after an effect and before its result.

The page does not expose Connect or Stop as capabilities. A person must press those buttons.

## Add Echo to an app

```ts
import { createEcho } from './client';

const echo = createEcho({
  workerBase: 'https://your-echo-worker.example',
  appId: 'notes',
});

echo.register({
  readState: {
    description: 'Read the current document',
    effect: 'read',
    inputSchema: { type: 'object' },
    run: () => readCurrentDocument(),
  },
  setDraft: {
    description: 'Replace the current draft',
    effect: 'mutation',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    run: ({ text }, { operationId }) => saveDraft(text, operationId),
  },
});

const session = await echo.connect();
```

Call `echo.connect()` only from a clear user action. Show the requested capabilities before that action. Keep `echo.stop()` in a visible human-controlled button.

## Agent tools

Echo exposes two MCP tools:

- `echo_list_capabilities`
- `echo_call_capability`

A mutation requires an `operationId`. Echo stores its result. A repeated operation ID returns the stored result instead of running the mutation again. If the tab disconnects after dispatch and before a result, Echo returns `outcome_unknown`. It does not retry the mutation.

## Security boundary

Separate signed credentials connect the page and MCP client. Each credential binds one random session, app ID, origin, credential kind, and expiry. The Worker derives identity from the signed credential, not message text.

Echo does not expose:

- cookies or session tokens
- local or session storage
- arbitrary page JavaScript
- arbitrary selectors
- browser fetch
- browser chrome
- navigation to another origin
- native permission prompts
- trusted keyboard or pointer input
- Connect, approval, or Stop controls

Echo does not protect an app from its own same-origin JavaScript or XSS. The app remains responsible for each capability and its data-sharing policy.

## Verify it

Start the local Worker first:

```sh
bun run dev
```

Then run:

```sh
bun run typecheck
bun test
bun run e2e:safari
bun run verify:extension-free
```

The checked receipts name the exact browser versions. Browser state and screenshots are captured by an independent test referee. Echo's own response is not enough to pass.

Local browser evidence lives under `receipts/extension-free/`. Production browser evidence lives under `receipts/production/`.

## Current limits

- Only apps that add the Echo client can use it.
- A normal page cannot control browser chrome or other origins.
- Programmatic page actions are not trusted user input.
- The current demo uses one active page connection per session.
- Cross-browser protocol receipts use a local loopback Worker; the production receipt verifies the deployed demo separately.
- Codemode through Worker Loader is not implemented yet.

## Repository layout

```text
client/       in-page Echo client
demo/         disposable demo app
src/          Worker, MCP, credentials, and Durable Object
e2e/          independent browser referees
receipts/     redacted browser evidence
```

## Check the current code

```sh
bun run typecheck
bun test
bun run build:demo
```

## License

MIT
