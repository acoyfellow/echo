const input = document.getElementById("workerBase") as HTMLInputElement;
const save = document.getElementById("save") as HTMLButtonElement;
const err = document.getElementById("err") as HTMLDivElement;
const probe = document.getElementById("probe") as HTMLDivElement;

chrome.storage.local.get({ workerBase: "" }, (data) => {
  input.value = String(data.workerBase || "");
  if (data.workerBase) testWorker(String(data.workerBase));
});

function setErr(message: string): void { err.textContent = message; }

async function testWorker(base: string): Promise<void> {
  probe.textContent = "checking…";
  try {
    const r = await fetch(base.replace(/\/$/, "") + "/health", { method: "GET" });
    if (!r.ok) { probe.textContent = `worker returned ${r.status}`; return; }
    const data = (await r.json()) as { version?: string; mode?: string };
    probe.textContent = `ok · version ${data.version ?? "?"} · ${data.mode ?? ""}`;
  } catch (e) {
    probe.textContent = `unreachable: ${String(e)}`;
  }
}

save.addEventListener("click", async () => {
  setErr("");
  const raw = input.value.trim();
  if (!raw) { setErr("worker base url is required"); return; }
  let u: URL;
  try { u = new URL(raw); } catch { setErr("not a valid url"); return; }
  if (u.protocol !== "http:" && u.protocol !== "https:") { setErr("must be http(s)"); return; }
  if (u.pathname !== "/" && u.pathname !== "") { setErr("worker base must have no path"); return; }
  const normalized = u.origin;
  await chrome.storage.local.set({ workerBase: normalized });
  input.value = normalized;
  save.textContent = "saved";
  setTimeout(() => (save.textContent = "Save"), 1200);
  testWorker(normalized);
});
