# Echo

**Let an agent use capabilities exposed by one user-approved live app tab.**

Echo is a TypeScript client, a Chrome companion, and a Cloudflare Worker. It has two authority modes. An integrated app can expose a short list of named actions. Codemode can instead give an agent temporary full JavaScript access to one approved Chrome tab.

The app-defined mode does not need a browser extension. Full-page Codemode uses the Chrome companion and Chrome debugger API so generated JavaScript can run in the authenticated page’s main world.

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

## Try full-page Codemode

Build the unpacked Chrome companion:

```sh
bun run build:extension
```

Open `chrome://extensions`, enable Developer mode, and load `extension/`. Start the local Worker, open the page you want to use, and choose Echo Codemode from the Chrome toolbar.

Codemode’s approval is intentionally broad. The agent can read and change anything that page JavaScript can access, including DOM state, browser storage, hidden app state, and authenticated actions. Approval is limited to one tab, one origin, and ten minutes. Cross-origin navigation, expiry, closing the tab, or pressing **Stop and detach** revokes future access.

Stopping cannot undo changes or listeners that already ran. A page or debugger error after dispatch is reported as `outcome_unknown`. A companion service worker restart fails closed and detaches the stored session. Reload the page when you need a clean page state. Chrome shows its debugging disclosure while Codemode is attached.

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

App-defined mode does not expose:

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

Codemode deliberately grants the first approved page full access to its own JavaScript, DOM, storage, selectors, and authenticated fetch. It still does not grant browser chrome, another tab or origin, native prompts, trusted input, or control of its external Stop button.

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

App-defined browser evidence lives under `receipts/extension-free/`. Full-page Chrome evidence lives under `receipts/codemode/`. Production browser evidence lives under `receipts/production/`.

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
extension/    trusted Chrome Codemode companion
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
