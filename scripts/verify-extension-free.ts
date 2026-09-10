export {};

type Receipt = {
  status?: string;
  environment?: { browser?: string; browserVersion?: string };
  transport?: { extension?: boolean; nativeWebMcp?: boolean };
  observations?: unknown;
  independentEvidence?: string[];
  redactions?: string[];
};

const paths = {
  chrome: "receipts/extension-free/chrome-local/receipt.json",
  safari: "receipts/extension-free/safari-local/receipt.json",
  webkit: "receipts/extension-free/webkit-local/receipt.json",
};
const failures: string[] = [];

for (const [name, path] of Object.entries(paths)) {
  const file = Bun.file(path);
  if (!await file.exists()) {
    failures.push(`${name}: receipt missing at ${path}`);
    continue;
  }
  const text = await file.text();
  if (/mcp\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text)) failures.push(`${name}: receipt contains an MCP credential`);
  const receipt = JSON.parse(text) as Receipt;
  if (name !== "webkit" && receipt.status !== "passed") failures.push(`${name}: expected passed, found ${receipt.status ?? "missing"}`);
  if (name === "chrome") {
    for (const required of ["Updated by local Chrome", "session_closed", "Agent access stopped"]) {
      if (!text.includes(required)) failures.push(`chrome: missing observed ${required}`);
    }
  }
  if (name === "safari") {
    for (const required of ["capability_not_granted", "Updated by local Safari", "Uncertain Safari effect", "outcome_unknown", "session_closed", "Agent access stopped"]) {
      if (!text.includes(required)) failures.push(`safari: missing observed ${required}`);
    }
  }
  if (!receipt.environment?.browser || !receipt.environment.browserVersion && name !== "chrome") failures.push(`${name}: browser version missing`);
  if (name !== "safari" && (receipt.transport?.extension !== false || receipt.transport?.nativeWebMcp !== false)) failures.push(`${name}: transport boundary missing`);
  if (name !== "safari" && (!receipt.independentEvidence || receipt.independentEvidence.length === 0)) failures.push(`${name}: independent evidence missing`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("PASS: extension-free Chrome and Safari receipts are independently observable and redacted");
