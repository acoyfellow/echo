import { $ } from "bun";

const personalAccountId = "bfcb6ac5b3ceaf42a09607f6f7925823";

if (process.env.CLOUDFLARE_ACCOUNT_ID !== personalAccountId) {
  console.error("Refusing deploy: set CLOUDFLARE_ACCOUNT_ID to the personal Coeyman account.");
  process.exit(1);
}

const status = (await $`git status --short`.text()).trim();

if (status) {
  console.error("Refusing deploy: commit the exact production source first.");
  process.exit(1);
}

const commit = (await $`git rev-parse HEAD`.text()).trim();

const build = Bun.spawnSync(["bun", "run", "build:demo"], { stdout: "inherit", stderr: "inherit" });

if (build.exitCode !== 0) process.exit(build.exitCode);

const deploy = Bun.spawnSync(
  [
    "bunx",
    "wrangler",
    "deploy",
    "--config",
    "wrangler.production.jsonc",
    "--var",
    `ECHO_COMMIT_SHA:${commit}`,
    "--message",
    `git:${commit}`,
    "--tag",
    `echo-${commit.slice(0, 12)}`,
  ],
  {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  },
);

process.exit(deploy.exitCode);
