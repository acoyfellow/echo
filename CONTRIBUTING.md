# Contributing

Echo is an early Codemode experiment. Open an issue before proposing a large change.

## Set up

```sh
bun install --frozen-lockfile
cp .dev.vars.example .dev.vars
bun run dev
ECHO_WORKER_BASE=http://127.0.0.1:8870 bun run build:extension
```

Use a random local `ECHO_SIGNING_SECRET`. Do not commit `.dev.vars`.

## Check a change

```sh
bun run typecheck
bun test
bun run e2e:site
bun run e2e:codemode:check
bun run test:codemode-tamper
```

Browser receipts must name the exact browser version, record independently observed page state, and exclude credentials, generated code, and result values.

Keep the authority model explicit: one broad page permission, one selected tab, one origin, one expiry, and trusted Stop. Do not imply that Stop undoes completed effects or that Echo isolates DOM, storage, hidden state, and authenticated requests within the approved page.
