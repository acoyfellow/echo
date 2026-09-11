import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const before = (await $`git status --porcelain --untracked-files=all`.text()).trim();
if (before) {
  console.error("Codemode check requires a clean working tree");
  process.exit(1);
}
const output = await mkdtemp(join(tmpdir(), "echo-codemode-check-"));
try {
  const environment = { ...process.env, ECHO_CODEMODE_OUTPUT: output, ECHO_CODEMODE_EPHEMERAL: "1" };
  const e2e = Bun.spawnSync(["bun", "e2e/codemode.ts"], { env: environment, stdout: "inherit", stderr: "inherit" });
  if (e2e.exitCode !== 0) process.exit(e2e.exitCode);
  const verify = Bun.spawnSync(["bun", "scripts/verify-codemode.ts"], { env: environment, stdout: "inherit", stderr: "inherit" });
  if (verify.exitCode !== 0) process.exit(verify.exitCode);
  const after = (await $`git status --porcelain --untracked-files=all`.text()).trim();
  if (after !== before) {
    console.error("Codemode check changed the working tree");
    process.exit(1);
  }
  console.log("PASS: Codemode Chrome proof regenerated in temporary output without changing the repository");
} finally {
  await rm(output, { recursive: true, force: true });
}
