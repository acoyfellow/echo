# Echo proof

Echo keeps three kinds of evidence:

- `receipts/extension-free/` records named browser behavior.
- `receipts/production/` records the production site and live demo.
- `receipts/reviews/` records two independent adversarial reviews of one exact commit.

A bridge response is not browser proof. Browser receipts must include visible state observed by the test referee and a screenshot. Receipts must not contain session credentials, signing secrets, employee data, or private app content.

## Before commit

```sh
bash proof/prepublish-gate.sh
```

This installs from the lockfile, builds the demo, checks TypeScript, runs tests, checks browser receipts, checks the diff, and runs local secret and repository guardrails when those tools are installed.

## After production and GitHub main

```sh
bash proof/publish-gate.sh
```

This adds production and review checks, requires a clean tree, compares local and public `main`, checks public visibility, and repeats the build and tests from a clean clone.

Production Cloudflare commands must explicitly select the personal account. Never use the employee account.
