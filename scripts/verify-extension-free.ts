import { z } from "zod";

const receiptSchema = z
  .object({
    status: z.string().optional(),
    environment: z
      .object({ browser: z.string().optional(), browserVersion: z.string().optional() })
      .optional(),
    transport: z
      .object({ extension: z.boolean().optional(), nativeWebMcp: z.boolean().optional() })
      .optional(),
    observations: z.json().optional(),
    independentEvidence: z.array(z.string()).optional(),
    redactions: z.array(z.string()).optional(),
  })
  .passthrough();

const paths = {
  chrome: "receipts/extension-free/chrome-local/receipt.json",
  safari: "receipts/extension-free/safari-local/receipt.json",
  webkit: "receipts/extension-free/webkit-local/receipt.json",
};

const failures: string[] = [];

for (const [name, path] of Object.entries(paths)) {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    failures.push(`${name}: receipt missing at ${path}`);
    continue;
  }

  const text = await file.text();

  if (/mcp\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]{40,}/.test(text))
    failures.push(`${name}: receipt contains an MCP credential`);
  const receipt = receiptSchema.parse(JSON.parse(text));

  if (name !== "webkit" && receipt.status !== "passed")
    failures.push(`${name}: expected passed, found ${receipt.status ?? "missing"}`);

  if (name === "chrome") {
    for (const required of ["Updated by local Chrome", "session_closed", "Agent access stopped"]) {
      if (!text.includes(required)) failures.push(`chrome: missing observed ${required}`);
    }
  }

  if (name === "safari") {
    for (const required of [
      "capability_not_granted",
      "Updated by local Safari",
      "Uncertain Safari effect",
      "outcome_unknown",
      "session_closed",
      "Agent access stopped",
    ]) {
      if (!text.includes(required)) failures.push(`safari: missing observed ${required}`);
    }
  }

  if (!receipt.environment?.browser || (!receipt.environment.browserVersion && name !== "chrome"))
    failures.push(`${name}: browser version missing`);

  if (
    name !== "safari" &&
    (receipt.transport?.extension !== false || receipt.transport?.nativeWebMcp !== false)
  )
    failures.push(`${name}: transport boundary missing`);

  if (!receipt.independentEvidence || receipt.independentEvidence.length === 0)
    failures.push(`${name}: independent evidence missing`);

  for (const evidence of receipt.independentEvidence ?? []) {
    if (!evidence.startsWith("receipts/")) continue;

    if (!(await Bun.file(evidence).exists()))
      failures.push(`${name}: evidence file missing at ${evidence}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log(
  "PASS: extension-free Chrome and Safari receipts are independently observable and redacted",
);
