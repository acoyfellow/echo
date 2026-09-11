import { $ } from "bun";
import { join } from "node:path";
import { codemodeExtensionOrigin } from "../src/codemode";

const failures: string[] = [];
const ephemeral = process.env.ECHO_CODEMODE_EPHEMERAL === "1";
let receiptText = "";
let receiptSourceCommit = "";
const receiptDirectory = process.env.ECHO_CODEMODE_OUTPUT || "receipts/codemode/chrome-local";
const receiptFile = Bun.file(join(receiptDirectory, "receipt.json"));
if (!await receiptFile.exists()) failures.push("Codemode Chrome receipt is missing");
else {
  const text = await receiptFile.text();
  receiptText = text;
  const receipt = JSON.parse(text) as {
    status?: string;
    sourceCommit?: string;
    environment?: { browser?: string; origin?: string };
    authority?: { mode?: string; extensionId?: string; exactTab?: boolean; exactOrigin?: boolean; trustedStop?: string };
    observations?: {
      beforeApproval?: { active?: boolean };
      execution?: { ok?: boolean; readPrivateState?: boolean; readStorage?: boolean };
      approvedTab?: { draft?: string; marker?: string };
      otherTab?: { draft?: string; marker?: string };
      receipt?: { status?: string; codeHashLength?: number };
      uncertainOutcome?: { error?: string; effectVisible?: boolean; receiptStatus?: string };
      stop?: { error?: string; reason?: string };
      workerRestart?: { error?: string; reason?: string };
      navigation?: { error?: string; reason?: string };
      expiry?: { error?: string; reason?: string };
    };
    redactions?: string[];
    screenshots?: Array<{ file?: string; sha256?: string }>;
    independentEvidence?: string[];
  };
  if (receipt.status !== "passed" || !receipt.environment?.browser?.startsWith("Chrome/")) failures.push("Codemode did not pass in named Chrome");
  if (!receipt.sourceCommit || receipt.sourceCommit.length !== 40) failures.push("Codemode receipt is not bound to source");
  else {
    receiptSourceCommit = receipt.sourceCommit;
    const head = (await $`git rev-parse HEAD`.text()).trim();
    const ancestor = await $`git merge-base --is-ancestor ${receipt.sourceCommit} ${head}`.quiet().nothrow();
    if (ancestor.exitCode !== 0) failures.push("Codemode receipt source is not an ancestor of HEAD");
    else {
      const changed = (await $`git diff --name-only ${receipt.sourceCommit}..${head}`.text()).trim().split("\n").filter(Boolean);
      const unreviewed = changed.filter((path) => path !== "proof/codemode-evidence.json" && !path.startsWith("receipts/codemode/") && !path.startsWith("receipts/reviews/"));
      if (unreviewed.length) failures.push(`Codemode source changed after browser proof: ${unreviewed.join(", ")}`);
    }
  }
  if (receipt.authority?.mode !== "page.javascript.full" || !receipt.authority.exactTab || !receipt.authority.exactOrigin || receipt.authority.trustedStop !== "Chrome extension service worker") failures.push("Codemode authority boundary is incomplete");
  if (`chrome-extension://${receipt.authority?.extensionId ?? ""}` !== codemodeExtensionOrigin) failures.push("Codemode receipt used a different extension identity");
  const observations = receipt.observations;
  if (observations?.beforeApproval?.active !== false) failures.push("Codemode was active before approval");
  if (!observations?.execution?.ok || !observations.execution.readPrivateState || !observations.execution.readStorage) failures.push("full page JavaScript execution was not independently observed");
  if (observations?.approvedTab?.draft !== "Changed by Codemode" || observations.approvedTab.marker !== "executed") failures.push("approved tab mutation was not observed");
  if (observations?.otherTab?.draft !== "Initial draft" || observations.otherTab.marker) failures.push("unapproved tab was affected");
  if (observations?.receipt?.status !== "completed" || observations.receipt.codeHashLength !== 64) failures.push("redacted execution receipt is incomplete");
  if (observations?.uncertainOutcome?.error !== "outcome_unknown" || !observations.uncertainOutcome.effectVisible || observations.uncertainOutcome.receiptStatus !== "outcome_unknown") failures.push("post-effect failure was not recorded as outcome unknown");
  if (observations?.stop?.error !== "session_closed" || observations.stop.reason !== "user_stopped") failures.push("trusted Stop did not revoke access");
  if (observations?.workerRestart?.error !== "session_closed" || observations.workerRestart.reason !== "worker_restarted") failures.push("service worker restart did not fail closed");
  if (observations?.navigation?.error !== "session_closed" || observations.navigation.reason !== "origin_changed") failures.push("cross-origin navigation did not revoke access");
  if (observations?.expiry?.error !== "session_closed" || observations.expiry.reason !== "expired") failures.push("expiry did not revoke access");
  if (!receipt.independentEvidence?.length || !receipt.redactions?.includes("generated JavaScript source")) failures.push("Codemode evidence or redactions are incomplete");
  const expectedScreenshots = ["approval.png", "executed.png", "final.png"];
  if (receipt.screenshots?.length !== expectedScreenshots.length) failures.push("Codemode screenshot manifest is incomplete");
  else {
    for (const expected of expectedScreenshots) {
      const entry = receipt.screenshots.find((candidate) => candidate.file === expected);
      if (!entry?.sha256) {
        failures.push(`Codemode screenshot hash is missing: ${expected}`);
        continue;
      }
      const screenshot = Bun.file(join(receiptDirectory, expected));
      if (!await screenshot.exists() || screenshot.size < 10_000) {
        failures.push(`Codemode screenshot is missing or empty: ${expected}`);
        continue;
      }
      const actual = new Bun.CryptoHasher("sha256").update(await screenshot.arrayBuffer()).digest("hex");
      if (actual !== entry.sha256) failures.push(`Codemode screenshot hash mismatch: ${expected}`);
    }
  }
  if (/mcp\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text) || /page\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text)) failures.push("Codemode receipt contains a credential");
}

if (!ephemeral) {
  const evidenceFile = Bun.file("proof/codemode-evidence.json");
  if (!await evidenceFile.exists()) failures.push("Codemode evidence manifest is missing");
  else {
    const evidence = await evidenceFile.json() as {
      sourceCommit?: string;
      receiptSha256?: string;
      screenshots?: Array<{ file?: string; sha256?: string }>;
    };
    const receiptSha256 = new Bun.CryptoHasher("sha256").update(receiptText).digest("hex");
    if (evidence.sourceCommit !== receiptSourceCommit || evidence.receiptSha256 !== receiptSha256) failures.push("Codemode receipt does not match its committed evidence manifest");
    for (const file of ["approval.png", "executed.png", "final.png"]) {
      const expected = evidence.screenshots?.find((entry) => entry.file === file)?.sha256;
      const actual = new Bun.CryptoHasher("sha256").update(await Bun.file(join(receiptDirectory, file)).arrayBuffer()).digest("hex");
      if (!expected || expected !== actual) failures.push(`Codemode evidence manifest does not match: ${file}`);
    }
    const evidenceCommit = (await $`git log -1 --format=%H -- proof/codemode-evidence.json`.text()).trim();
    if (!evidenceCommit) failures.push("Codemode evidence manifest is not committed");
    else {
      for (const path of [
        "proof/codemode-evidence.json",
        "receipts/codemode/chrome-local/receipt.json",
        "receipts/codemode/chrome-local/approval.png",
        "receipts/codemode/chrome-local/executed.png",
        "receipts/codemode/chrome-local/final.png",
      ]) {
        const lastCommit = (await $`git log -1 --format=%H -- ${path}`.text()).trim();
        if (lastCommit !== evidenceCommit) failures.push(`Codemode evidence changed outside its binding commit: ${path}`);
      }
    }
  }
}

const manifest = await Bun.file("extension/manifest.json").json() as { key?: string };
if (!manifest.key) failures.push("Codemode manifest identity is missing");
else {
  const key = Uint8Array.from(atob(manifest.key), (value) => value.charCodeAt(0));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", key)).slice(0, 16);
  const extensionId = [...digest].map((value) => `${String.fromCharCode(97 + (value >> 4))}${String.fromCharCode(97 + (value & 15))}`).join("");
  if (codemodeExtensionOrigin !== `chrome-extension://${extensionId}`) failures.push("Worker allowlist does not match the signed extension identity");
}
const popup = await Bun.file("extension/popup.html").text();
for (const warning of ["Full page access", "anything this page’s JavaScript can access", "Stop and detach"]) {
  if (!popup.includes(warning)) failures.push(`approval UI is missing: ${warning}`);
}
const background = await Bun.file("extension/background.ts").text();
for (const boundary of ["chrome.debugger.attach", "chrome.debugger.detach", "origin_changed", "expired", "user_stopped", "SHA-256"]) {
  if (!background.includes(boundary)) failures.push(`Codemode boundary is missing: ${boundary}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: Chrome Codemode full-page authority is explicit, tab-bound, origin-bound, revocable, expiring, and redacted");
