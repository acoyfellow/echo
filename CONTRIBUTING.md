# Contributing

Echo is an early experiment. Open an issue before proposing a large change.

## Set up

```sh
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

Use a random local `ECHO_SIGNING_SECRET`. Do not commit `.dev.vars`.

## Check a change

```sh
bun run build:demo
bun run typecheck
bun test
bun run verify:extension-free
```

Browser receipts must name the exact browser version, record visible page state, and exclude credentials and private data. Echo's own response is not enough evidence.

Keep the public API small. Do not add arbitrary JavaScript, selectors, cookie access, storage access, browser fetch, cross-origin navigation, browser chrome control, or automation for Connect and Stop.
