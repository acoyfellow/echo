export {};

const port = 11800 + Math.floor(Math.random() * 500);
const appOrigin = `http://127.0.0.1:${port}`;
const signingSecret = process.env.ECHO_SIGNING_SECRET ?? "echo-examples-e2e-signing-secret-32-chars";
const worker = Bun.spawn(["bunx", "wrangler", "dev", "--port", String(port), "--inspector-port", "0", "--var", `ECHO_SIGNING_SECRET:${signingSecret}`], { stdout: "ignore", stderr: "ignore" });
try {
  let ready = false;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const response = await fetch(`${appOrigin}/health`).catch(() => null);
    if (response?.ok) {
      ready = true;
      break;
    }
    await Bun.sleep(100);
  }
  if (!ready) throw new Error("examples_worker_start_failed");
  const result = Bun.spawnSync(["bun", "e2e/examples.ts"], {
    env: { ...process.env, ECHO_E2E_ORIGIN: appOrigin },
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) throw new Error(`examples_e2e_failed_${result.exitCode}`);
} finally {
  worker.kill();
  await worker.exited;
}
