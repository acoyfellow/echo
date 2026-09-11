import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const directory = new URL("../receipts/codemode/chrome-local", import.meta.url).pathname;
const receiptPath = join(directory, "receipt.json");
const receiptText = await Bun.file(receiptPath).text();
const receipt = JSON.parse(receiptText) as { sourceCommit?: string };
if (!receipt.sourceCommit) throw new Error("receipt_source_missing");
const screenshots = [];
for (const file of ["approval.png", "executed.png", "final.png"]) {
  const bytes = await Bun.file(join(directory, file)).arrayBuffer();
  screenshots.push({ file, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") });
}
const evidence = {
  schemaVersion: 1,
  sourceCommit: receipt.sourceCommit,
  receiptSha256: new Bun.CryptoHasher("sha256").update(receiptText).digest("hex"),
  screenshots,
};
const output = new URL("../proof/codemode-evidence.json", import.meta.url);
await mkdir(new URL("../proof", import.meta.url).pathname, { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("Wrote proof/codemode-evidence.json");
