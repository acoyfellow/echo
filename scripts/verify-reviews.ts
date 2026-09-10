import { $ } from "bun";

const head = (await $`git rev-parse HEAD`.text()).trim();
const failures: string[] = [];
let reviewedSha = "";
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
  if (!receipt.sha) failures.push(`round ${round} has no reviewed SHA`);
  else if (!reviewedSha) reviewedSha = receipt.sha;
  else if (receipt.sha !== reviewedSha) failures.push(`round ${round} reviewed ${receipt.sha}, expected ${reviewedSha}`);
  if (receipt.verdict !== "ship" || receipt.mustFix !== 0) failures.push(`round ${round} is not review-zero`);
  if (!receipt.reviewer || !receipt.verifiedAt || !Array.isArray(receipt.findings)) failures.push(`round ${round} receipt is incomplete`);
}

if (reviewedSha) {
  const ancestor = await $`git merge-base --is-ancestor ${reviewedSha} ${head}`.quiet().nothrow();
  if (ancestor.exitCode !== 0) failures.push(`reviewed SHA ${reviewedSha} is not an ancestor of ${head}`);
  else {
    const changed = (await $`git diff --name-only ${reviewedSha}..${head}`.text()).trim().split("\n").filter(Boolean);
    const unreviewed = changed.filter((path) => !path.startsWith("receipts/reviews/"));
    if (unreviewed.length) failures.push(`unreviewed files changed after ${reviewedSha}: ${unreviewed.join(", ")}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log(`PASS: two review-zero receipts verify ${reviewedSha}`);
