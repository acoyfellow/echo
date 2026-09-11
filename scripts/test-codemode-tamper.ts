import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = new URL("../receipts/codemode/chrome-local", import.meta.url).pathname;
const root = await mkdtemp(join(tmpdir(), "echo-codemode-tamper-"));
const evidence = join(root, "evidence");

function verify(): number {
  return Bun.spawnSync(["bun", "scripts/verify-codemode.ts"], {
    env: { ...process.env, ECHO_CODEMODE_OUTPUT: evidence },
    stdout: "ignore",
    stderr: "ignore",
  }).exitCode;
}

async function reset(): Promise<void> {
  await rm(evidence, { recursive: true, force: true });
  await cp(source, evidence, { recursive: true });
}

try {
  await reset();
  if (verify() !== 0) throw new Error("baseline_codemode_evidence_failed");
  const screenshotPath = join(evidence, "executed.png");
  const screenshot = await readFile(screenshotPath);
  screenshot[screenshot.length - 1] ^= 1;
  await writeFile(screenshotPath, screenshot);
  if (verify() === 0) throw new Error("screenshot_substitution_passed");

  await reset();
  const receiptPath = join(evidence, "receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as { observations: { approvedTab: { draft: string } } };
  receipt.observations.approvedTab.draft = "Substituted evidence";
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  if (verify() === 0) throw new Error("receipt_substitution_passed");
  console.log("PASS: planted Codemode screenshot and receipt substitutions fail closed");
} finally {
  await rm(root, { recursive: true, force: true });
}
