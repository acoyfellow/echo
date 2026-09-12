# Echo proof

Echo keeps three kinds of evidence:

- `receipts/codemode/` records exact-tab JavaScript authority, revocation, uncertain outcomes, and redaction in Chrome.
- `receipts/production/` records the deployed site and Todo target.
- `receipts/reviews/` records two independent adversarial reviews of one exact commit.

A bridge response is not browser proof. The Chrome referee must independently observe both the approved and unapproved tabs. Receipts must not contain session credentials, signing secrets, generated source, result values, employee data, or private app content.

## Before commit

```sh
bash proof/prepublish-gate.sh
```

This installs from the lockfile, builds the site and companion, checks TypeScript, runs tests, regenerates Codemode evidence in a temporary directory, verifies tamper detection, checks the diff, and runs available repository guardrails.

## After production and GitHub main

```sh
bash proof/publish-gate.sh
```

This adds production and exact-SHA review checks, requires a clean tree, compares local and public `main`, checks public visibility, and repeats the build and tests from a clean clone.

Production Cloudflare commands must explicitly select the personal account. Never use the employee account.
