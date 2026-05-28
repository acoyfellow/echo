type Status = {
  open: boolean;
  sessionId?: string;
  signed?: string;
  origin?: string;
  mcpUrl?: string;
};

const statusEl = document.getElementById("status")!;
const originEl = document.getElementById("origin")!;
const urlEl = document.getElementById("url") as HTMLDivElement;
const toggle = document.getElementById("toggle") as HTMLButtonElement;
const copyBtn = document.getElementById("copy") as HTMLButtonElement;
const errEl = document.getElementById("err") as HTMLDivElement;

async function refresh(): Promise<void> {
  const s = (await chrome.runtime.sendMessage({ type: "status" })) as Status;
  if (s.open) {
    statusEl.textContent = "⏺ open";
    originEl.textContent = s.origin ?? "";
    urlEl.textContent = s.mcpUrl ?? "";
    toggle.textContent = "Close echo";
    copyBtn.disabled = false;
  } else {
    statusEl.textContent = "⛔ closed";
    originEl.textContent = "";
    urlEl.textContent = "";
    toggle.textContent = "Open echo on this tab";
    copyBtn.disabled = true;
  }
  errEl.textContent = "";
}

toggle.addEventListener("click", async () => {
  errEl.textContent = "";
  const s = (await chrome.runtime.sendMessage({ type: "status" })) as Status;
  if (s.open) {
    await chrome.runtime.sendMessage({ type: "close" });
  } else {
    // Popup needs to tell SW which tab it was anchored to. `lastFocusedWindow`
    // is unreliable when the popup is on a separate window or in test rigs.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const r = (await chrome.runtime.sendMessage({ type: "open", tabId: tab?.id })) as { ok: boolean; error?: string };
    if (!r.ok) errEl.textContent = friendly(r.error);
  }
  refresh();
});

copyBtn.addEventListener("click", async () => {
  if (urlEl.textContent) {
    await navigator.clipboard.writeText(urlEl.textContent);
    copyBtn.textContent = "copied";
    setTimeout(() => (copyBtn.textContent = "copy mcp url"), 1200);
  }
});

function friendly(err: string | undefined): string {
  if (!err) return "failed";
  if (err === "worker_base_unset_open_options") return "set a worker url in settings first";
  if (err === "no_active_http_tab") return "open a regular http(s) tab first, then click again";
  if (err === "bad_tab_url") return "cannot parse this tab's url";
  return err;
}

refresh();
