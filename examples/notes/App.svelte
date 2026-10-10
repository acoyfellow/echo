<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import { createEcho, type EchoClient } from "../../client";
  import ExampleFooter from "../ExampleFooter.svelte";

  let draft = $state("Initial draft");

  let status = $state("Agent access stopped");

  let activity = $state("No agent activity");

  let mcpUrl = $state("");

  let connecting = $state(false);

  let copied = $state(false);

  let echo: EchoClient | undefined;

  const draftInput = z.object({ text: z.string().max(2000) });

  const savedProof = z.object({ draft: z.string().optional(), activity: z.string().optional() });

  function readProof(saved: string): z.infer<typeof savedProof> {
    try {
      const parsed = savedProof.safeParse(JSON.parse(saved));

      return parsed.success ? parsed.data : {};
    } catch {
      return {};
    }
  }

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
    setTimeout(() => (copied = false), 1500);
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    const saved = sessionStorage.getItem("echo-demo-proof");

    if (saved) {
      const proof = readProof(saved);

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
        outputSchema: {
          type: "object",
          properties: { title: { type: "string" }, draft: { type: "string" } },
          required: ["title", "draft"],
        },
        run: () => ({ title: "Quarterly notes", draft }),
      },
      setDraft: {
        description: "Replace the demo draft",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 2000 } },
          required: ["text"],
          additionalProperties: false,
        },
        outputSchema: {
          type: "object",
          properties: { draft: { type: "string" } },
          required: ["draft"],
        },
        run(value) {
          draft = draftInput.parse(value).text;

          return { draft };
        },
      },
      uncertainMutation: {
        description: "Test a disconnect after a visible mutation and before its result",
        effect: "mutation",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", maxLength: 2000 } },
          required: ["text"],
          additionalProperties: false,
        },
        async run(value) {
          draft = draftInput.parse(value).text;
          await new Promise((resolve) => setTimeout(resolve, 5_000));

          return { draft };
        },
      },
    });

    const click = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) return;

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

<svelte:head
  ><meta
    name="description"
    content="A live notes app that exposes three explicit Echo capabilities."
  /></svelte:head
>

<main class="min-h-svh bg-sheet font-spec text-[14px] leading-[1.7] text-pen [color-scheme:light]">
  <section class="mx-auto w-full max-w-[680px] px-5 py-5">
    <header class="border-b border-pen pb-3">
      <p class="m-0 text-[12px] text-pen-faint">your app</p>
      <h1 id="title" class="mb-0 mt-1 text-[18px] font-bold">Quarterly notes</h1>
      <p class="m-0 text-[12px] text-pen-soft">
        exposes read, draft update, and an uncertainty test. Connect and Stop stay here.
      </p>
    </header>
    <textarea
      id="draft"
      bind:value={draft}
      class="mt-4 min-h-44 w-full resize-y border border-pen bg-sheet-deep p-3 font-spec text-[14px] leading-[1.7] text-pen outline-none focus:bg-sheet"
    ></textarea>
    <div class="mt-4 border-t border-pen pt-3">
      <strong id="status" class="text-[12px] font-bold">{status}</strong>
      <p id="activity" class="m-0 text-[12px] text-pen-soft">{activity}</p>
      {#if mcpUrl}<code
          id="session"
          class="mt-3 block [overflow-wrap:anywhere] border-l-2 border-pen bg-sheet-deep px-3 py-2 text-[11px] leading-relaxed"
          >{mcpUrl}</code
        >{:else}<code id="session"></code>{/if}
    </div>
    <div class="mt-3 flex gap-2">
      {#if !mcpUrl}<button
          id="connect"
          type="button"
          disabled={connecting}
          class="border border-pen bg-pen px-4 py-2 text-[12px] font-bold text-sheet disabled:opacity-50"
          >Connect this tab</button
        >{:else}<button
          id="copy"
          type="button"
          class="border border-pen bg-transparent px-4 py-2 text-[12px] font-bold text-pen"
          >{copied ? "Copied" : "Copy session URL"}</button
        ><button
          id="stop"
          type="button"
          class="border border-stop bg-stop px-4 py-2 text-[12px] font-bold text-sheet"
          >Stop agent access</button
        >{/if}
    </div>
    {#if !mcpUrl}<button id="stop" type="button" class="hidden">Stop agent access</button>{/if}
    <ExampleFooter slug="notes" />
  </section>
</main>
