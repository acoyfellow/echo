export {};

const failures: string[] = [];
const receiptFile = Bun.file("receipts/codemode/chrome-local/receipt.json");
if (!await receiptFile.exists()) failures.push("Codemode Chrome receipt is missing");
else {
  const text = await receiptFile.text();
  const receipt = JSON.parse(text) as {
    status?: string;
    environment?: { browser?: string; origin?: string };
    authority?: { mode?: string; exactTab?: boolean; exactOrigin?: boolean; trustedStop?: string };
    observations?: {
      beforeApproval?: { active?: boolean };
      execution?: { ok?: boolean; readPrivateState?: boolean; readStorage?: boolean };
      approvedTab?: { draft?: string; marker?: string };
      otherTab?: { draft?: string; marker?: string };
      receipt?: { status?: string; codeHashLength?: number };
      stop?: { error?: string; reason?: string };
      navigation?: { error?: string; reason?: string };
      expiry?: { error?: string; reason?: string };
    };
    redactions?: string[];
    independentEvidence?: string[];
  };
  if (receipt.status !== "passed" || !receipt.environment?.browser?.startsWith("Chrome/")) failures.push("Codemode did not pass in named Chrome");
  if (receipt.authority?.mode !== "page.javascript.full" || !receipt.authority.exactTab || !receipt.authority.exactOrigin || receipt.authority.trustedStop !== "Chrome extension service worker") failures.push("Codemode authority boundary is incomplete");
  const observations = receipt.observations;
  if (observations?.beforeApproval?.active !== false) failures.push("Codemode was active before approval");
  if (!observations?.execution?.ok || !observations.execution.readPrivateState || !observations.execution.readStorage) failures.push("full page JavaScript execution was not independently observed");
  if (observations?.approvedTab?.draft !== "Changed by Codemode" || observations.approvedTab.marker !== "executed") failures.push("approved tab mutation was not observed");
  if (observations?.otherTab?.draft !== "Initial draft" || observations.otherTab.marker) failures.push("unapproved tab was affected");
  if (observations?.receipt?.status !== "completed" || observations.receipt.codeHashLength !== 64) failures.push("redacted execution receipt is incomplete");
  if (observations?.stop?.error !== "session_closed" || observations.stop.reason !== "user_stopped") failures.push("trusted Stop did not revoke access");
  if (observations?.navigation?.error !== "session_closed" || observations.navigation.reason !== "origin_changed") failures.push("cross-origin navigation did not revoke access");
  if (observations?.expiry?.error !== "session_closed" || observations.expiry.reason !== "expired") failures.push("expiry did not revoke access");
  if (!receipt.independentEvidence?.length || !receipt.redactions?.includes("generated JavaScript source")) failures.push("Codemode evidence or redactions are incomplete");
  if (/mcp\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text) || /page\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text)) failures.push("Codemode receipt contains a credential");
}

for (const path of ["receipts/codemode/chrome-local/approval.png", "receipts/codemode/chrome-local/executed.png", "receipts/codemode/chrome-local/final.png"]) {
  const screenshot = Bun.file(path);
  if (!await screenshot.exists() || screenshot.size < 10_000) failures.push(`Codemode screenshot is missing or empty: ${path}`);
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
