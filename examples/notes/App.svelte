<script lang="ts">
  import { onMount } from "svelte";
  import { createEcho, type EchoClient } from "../../client";
  import ExampleFooter from "../ExampleFooter.svelte";

  let draft = $state("Initial draft");
  let status = $state("Agent access stopped");
  let activity = $state("No agent activity");
  let mcpUrl = $state("");
  let connecting = $state(false);
  let copied = $state(false);
  let echo: EchoClient | undefined;

  async function connect() {
    if (!echo || connecting) return;
    connecting = true;
    status = "Connecting";
    try {
      const connected = await echo.connect();
      mcpUrl = connected.mcpUrl;
      status = "Agent access active";
    } catch (error) {
      status = error instanceof Error ? error.message : "Connection failed";
    } finally {
      connecting = false;
    }
  }

  function stop() {
    echo?.stop();
    mcpUrl = "";
    status = "Agent access stopped";
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    copied = true;
    setTimeout(() => copied = false, 1500);
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    const saved = sessionStorage.getItem("echo-demo-proof");
    if (saved) {
      const proof = JSON.parse(saved) as { draft?: string; activity?: string };
      if (proof.draft) draft = proof.draft;
      if (proof.activity) activity = proof.activity;
    }
    echo = createEcho({
      workerBase: location.origin,
      appId: "echo-notes-demo",
      onActivity(event) {
        activity = `${event.status}: ${event.capability}`;
        sessionStorage.setItem("echo-demo-proof", JSON.stringify({ draft, activity }));
      },
    });
    echo.register({
      readState: {
        description: "Read the demo title and draft",
        effect: "read",
        inputSchema: { type: "object", additionalProperties: false },
        outputSchema: { type: "object", properties: { title: { type: "string" }, draft: { type: "string" } }, required: ["title", "draft"] },
        run: () => ({ title: "Quarterly notes", draft }),
      },
      setDraft: {
        description: "Replace the demo draft",
        effect: "mutation",
        inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 2000 } }, required: ["text"], additionalProperties: false },
        outputSchema: { type: "object", properties: { draft: { type: "string" } }, required: ["draft"] },
        run(value) {
          const input = value as { text?: unknown };
          if (typeof input.text !== "string" || input.text.length > 2000) throw new Error("draft_invalid");
          draft = input.text;
          return { draft };
        },
      },
      uncertainMutation: {
        description: "Test a disconnect after a visible mutation and before its result",
        effect: "mutation",
        inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 2000 } }, required: ["text"], additionalProperties: false },
        async run(value) {
          const input = value as { text?: unknown };
          if (typeof input.text !== "string" || input.text.length > 2000) throw new Error("draft_invalid");
          draft = input.text;
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          return { draft };
        },
      },
    });
    const click = (event: MouseEvent) => {
      const target = event.target as Element;
      if (target.closest("#connect")) void connect();
      if (target.closest("#copy")) void copyUrl();
      if (target.closest("#stop")) stop();
    };
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("click", click);
      echo?.stop();
    };
  });
</script>

<svelte:head><meta name="description" content="A live notes app that exposes three explicit Echo capabilities." /></svelte:head>

<main class="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_20%_10%,#3f2718_0,transparent_35%),#0b1118] p-5">
  <section class="w-full max-w-2xl rounded-2xl border border-white/15 bg-layer p-7 shadow-2xl">
    <p class="m-0 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-amber">Echo live notes</p>
    <h1 id="title" class="mb-3 mt-2 text-3xl font-black tracking-[-.04em]">Quarterly notes</h1>
    <p class="text-sm text-muted">This app exposes read, draft update, and uncertainty-test actions. Approval and Stop stay here.</p>
    <textarea id="draft" bind:value={draft} class="mt-3 min-h-40 w-full rounded-lg border border-white/15 bg-[#182431] p-4 text-paper outline-none focus:border-[#76c7f0]"></textarea>
    <div class="my-4 rounded-lg bg-[#182431] p-4"><strong id="status">{status}</strong><p id="activity" class="my-2 text-sm text-muted">{activity}</p>{#if mcpUrl}<code id="session" class="block [overflow-wrap:anywhere] font-mono text-[10px] text-[#76c7f0]">{mcpUrl}</code><button id="copy" type="button" class="mt-3 rounded-lg bg-[#76c7f0] px-4 py-2 text-xs font-bold text-ink">{copied ? 'Copied' : 'Copy session URL'}</button>{:else}<code id="session"></code>{/if}</div>
    <div class="flex gap-2">{#if !mcpUrl}<button id="connect" type="button" disabled={connecting} class="rounded-lg bg-echo px-4 py-3 font-bold text-ink disabled:opacity-50">Connect this tab</button>{:else}<button id="stop" type="button" class="rounded-lg bg-danger px-4 py-3 font-bold text-ink">Stop agent access</button>{/if}</div>
    {#if !mcpUrl}<button id="stop" type="button" class="hidden">Stop agent access</button>{/if}
    <ExampleFooter slug="notes" />
  </section>
</main>
