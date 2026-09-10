import { $ } from "bun";

const head = (await $`git rev-parse HEAD`.text()).trim();
const failures: string[] = [];
for (const round of [1, 2]) {
  const path = `receipts/reviews/round-${round}.json`;
  const file = Bun.file(path);
  if (!await file.exists()) {
    failures.push(`missing ${path}`);
    continue;
  }
  const receipt = await file.json() as {
    sha?: string;
    verdict?: string;
    mustFix?: number;
    reviewer?: string;
    findings?: unknown[];
    verifiedAt?: string;
  };
  if (receipt.sha !== head) failures.push(`round ${round} reviewed ${receipt.sha ?? "no SHA"}, expected ${head}`);
  if (receipt.verdict !== "ship" || receipt.mustFix !== 0) failures.push(`round ${round} is not review-zero`);
  if (!receipt.reviewer || !receipt.verifiedAt || !Array.isArray(receipt.findings)) failures.push(`round ${round} receipt is incomplete`);
}
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: two review-zero receipts verify ${head}`);
