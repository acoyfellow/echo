export {};

function required<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error("popup_markup_missing");
  return element;
}

const approve = required<HTMLButtonElement>("#approve");
const copy = required<HTMLButtonElement>("#copy");
const stop = required<HTMLButtonElement>("#stop");
const scope = required<HTMLElement>("#scope");
const tabs = required<HTMLSelectElement>("#tabs");
const receipt = required<HTMLElement>("#receipt");

let mcpUrl = "";

async function loadTabs(): Promise<void> {
  const available = await chrome.tabs.query({ currentWindow: true });
  tabs.replaceChildren();
  for (const tab of available) {
    if (!tab.id || !tab.url) continue;
    let url: URL;
    try {
      url = new URL(tab.url);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const option = document.createElement("option");
    option.value = String(tab.id);
    option.dataset.url = tab.url;
    option.textContent = `${tab.title || "Untitled"} · ${url.origin}`;
    tabs.append(option);
  }
  approve.disabled = tabs.options.length === 0;
}

async function refresh(): Promise<void> {
  const value = await chrome.runtime.sendMessage({ type: "status" }) as {
    active?: boolean;
    origin?: string;
    mcpUrl?: string;
    lastReceipt?: { codeHash?: string; status?: string };
    status?: { reason?: string };
  };
  mcpUrl = value.mcpUrl ?? "";
  approve.disabled = !!value.active || tabs.options.length === 0;
  tabs.disabled = !!value.active;
  copy.disabled = !value.active;
  stop.disabled = !value.active;
  scope.textContent = value.active ? `Full access active for ${value.origin}` : `No tab approved${value.status?.reason ? ` · ${value.status.reason}` : ""}.`;
  receipt.textContent = value.lastReceipt?.codeHash ? `Last run: ${value.lastReceipt.status} · ${value.lastReceipt.codeHash.slice(0, 12)}` : "";
}

approve.addEventListener("click", async () => {
  approve.disabled = true;
  scope.textContent = "Attaching to this tab";
  const result = await chrome.runtime.sendMessage({ type: "approve", tabId: Number(tabs.value) }) as { ok?: boolean; error?: string };
  if (!result.ok) scope.textContent = result.error ?? "Approval failed";
  await refresh();
});

copy.addEventListener("click", async () => {
  if (!mcpUrl) return;
  await navigator.clipboard.writeText(mcpUrl);
  copy.textContent = "Copied";
});

stop.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "stop" });
  copy.textContent = "Copy agent connection";
  await refresh();
});

void loadTabs().then(refresh);
