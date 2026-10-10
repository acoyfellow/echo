<script lang="ts">
  import { onMount } from "svelte";
  import { z } from "zod";
  import { createEcho, type EchoCapabilities, type EchoClient, type Json } from "../client";
  import { examples } from "./catalog";
  import ExampleFooter from "./ExampleFooter.svelte";

  let { slug }: { slug: string } = $props();

  const example = examples.find((candidate) => candidate.slug === slug) ?? examples[0];

  const toolInput = z.object({ text: z.string().max(240).optional() }).catch({});

  const readTools = new Set([
    "list",
    "read premise",
    "check mood",
    "read copy",
    "list options",
    "read board",
    "list tracks",
    "read pantry",
    "list sounds",
  ]);

  const capabilityName = (tool: string) =>
    tool.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase());

  let status = $state("Agent disconnected");

  let activity = $state("Only you can use this app.");

  let mcpUrl = $state("");

  let connecting = $state(false);

  let copied = $state(false);

  let score = $state(0);

  let history = $state<string[]>([`Ready: ${example.prompt}`]);

  let echo: EchoClient | undefined;

  function perform(tool: string, input: Json) {
    const detail = toolInput.parse(input).text?.trim() || `${tool} completed`;

    if (!readTools.has(tool)) score += 1;
    history = [`${tool}: ${detail}`, ...history].slice(0, 6);

    return { app: example.name, action: tool, detail, score, history };
  }

  async function connect() {
    if (!echo || connecting) return;
    connecting = true;
    status = "Connecting…";

    try {
      const connected = await echo.connect();
      mcpUrl = connected.mcpUrl;
      status = "Agent connected";
      activity = `${example.tools.length} tools are ready.`;
    } catch {
      status = "Connection failed";
    } finally {
      connecting = false;
    }
  }

  function stop() {
    echo?.stop();
    mcpUrl = "";
    status = "Agent disconnected";
    activity = "Only you can use this app.";
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(mcpUrl);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    echo = createEcho({
      workerBase: location.origin,
      appId: `echo-${example.slug}`,
      onActivity(event) {
        activity = `${event.status}: ${event.capability}`;
      },
    });

    const capabilities: EchoCapabilities = Object.fromEntries(
      example.tools.map((tool) => [
        capabilityName(tool),
        {
          description: `${tool} in ${example.name}`,
          effect: readTools.has(tool) ? "read" : "mutation",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string", maxLength: 240 } },
            additionalProperties: false,
          },
          run: (input: Json) => perform(tool, input),
        },
      ]),
    );

    echo.register(capabilities);

    return () => echo?.stop();
  });
</script>

<svelte:head
  ><meta name="description" content={`${example.name}: ${example.description}`} /></svelte:head
>

<main class="min-h-svh bg-sheet font-spec text-[14px] leading-[1.7] text-pen [color-scheme:light]">
  <section class="mx-auto w-full max-w-[680px] px-5 py-5">
    <header class="border-b border-pen pb-3">
      <p class="m-0 text-[12px] text-pen-faint">echo example &middot; {example.emoji}</p>
      <h1 class="mb-0 mt-1 text-[18px] font-bold">{example.name}</h1>
      <p class="m-0 text-[12px] text-pen-soft">{example.description}</p>
    </header>
    <div class="grid gap-5 py-4 sm:grid-cols-[minmax(0,1fr)_170px]">
      <section aria-label="App state" class="min-h-64 border border-pen bg-sheet-deep p-4">
        <p class="m-0 text-[12px] text-pen-faint">live state &middot; {score} moves</p>
        {#if slug === "tiny-dungeon"}<div class="my-4 grid grid-cols-3 gap-px bg-pen">
            {#each ["ENTRY", "?", "?", "⚔", "?", "LOOT"] as room}<div
                class="grid aspect-square place-items-center bg-sheet text-[12px]"
              >
                {room}
              </div>{/each}
          </div>
        {:else if slug === "joke-lab"}<div class="my-4 border border-pen bg-sheet p-4">
            <p class="m-0">A developer walks into a browser…</p>
            <div class="mt-5 h-2 border border-pen">
              <div class="h-full bg-pen" style={`width:${Math.min(100, 20 + score * 16)}%`}></div>
            </div>
            <span class="mt-1 block text-[12px] text-pen-faint">laugh pressure</span>
          </div>
        {:else if slug === "pixel-pet"}<div class="my-4 text-center">
            <div class="text-6xl">{score % 3 === 0 ? "◕‿◕" : score % 3 === 1 ? "◕ᴗ◕" : "◠‿◠"}</div>
            <div class="mt-4 grid grid-cols-2 gap-2 text-[12px]">
              <span class="border border-pen bg-sheet p-2"
                >hunger {Math.max(0, 70 - score * 8)}%</span
              ><span class="border border-pen bg-sheet p-2"
                >joy {Math.min(100, 40 + score * 10)}%</span
              >
            </div>
          </div>
        {:else if slug === "copy-roast"}<div class="my-4 grid gap-2">
            <div class="border border-pen bg-sheet p-3">
              <span class="text-[12px] text-stop">before</span>
              <p class="m-0">Software that helps you succeed.</p>
            </div>
            <div class="border-2 border-pen bg-sheet p-3">
              <span class="text-[12px] text-pen-faint">challenger {score}</span>
              <p class="m-0">Your app already knows what to do.</p>
            </div>
          </div>
        {:else if slug === "decision-wheel"}<div
            class="mx-auto my-4 grid aspect-square max-w-48 place-items-center rounded-full border-[10px] border-pen bg-[conic-gradient(#1b1a1712_0_25%,transparent_25%_50%,#1b1a1712_50%_75%,transparent_75%)]"
          >
            <strong class="text-center">spin<br /><span class="text-3xl">{score}</span></strong>
          </div>
        {:else if slug === "meeting-bingo"}<div class="my-4 grid grid-cols-3 gap-px bg-pen">
            {#each ["SYNERGY", "OFFLINE", "ALIGN", "CIRCLE BACK", "HARD STOP", "BANDWIDTH", "PARK IT", "NORTH STAR", "BINGO"] as square, index}<div
                class:bg-pen={index < score}
                class:text-sheet={index < score}
                class:bg-sheet={index >= score}
                class="grid aspect-square place-items-center p-1 text-center text-[10px]"
              >
                {square}
              </div>{/each}
          </div>
        {:else if slug === "mixtape"}<div class="my-4 grid">
            {#each ["Neon Exit", "Soft Static", "Last Train", "Afterglow"] as track, index}<div
                class="flex items-center gap-3 border-b border-pen/20 py-2"
              >
                <span class="text-pen-faint">0{index + 1}</span><span>{track}</span><span
                  class="ml-auto text-[12px] text-pen-faint">{3 + index}:2{index}</span
                >
              </div>{/each}
          </div>
        {:else if slug === "story-dice"}<div class="my-6 grid grid-cols-3 gap-3 text-center">
            {#each ["ASTRONAUT", "LIGHTHOUSE", "SECRET"] as die}<div
                class="grid aspect-square place-items-center border border-pen bg-sheet p-2 text-[12px]"
              >
                {die}
              </div>{/each}
          </div>
        {:else if slug === "trivia-night"}<div class="my-4">
            <span class="text-[12px] text-pen-faint">round {score + 1}</span>
            <p class="m-0 text-[16px] font-bold">Which browser first shipped CSS Grid?</p>
            <div class="mt-4 grid grid-cols-2 gap-2 text-[13px]">
              {#each ["Firefox", "Chrome", "Safari", "Edge"] as answer}<span
                  class="border border-pen bg-sheet p-2">{answer}</span
                >{/each}
            </div>
          </div>
        {:else if slug === "recipe-remix"}<div class="my-4">
            <div class="flex flex-wrap gap-2">
              {#each ["tomatoes", "rice", "lime", "beans", "chili"] as food}<span
                  class="border border-pen bg-sheet px-2 text-[12px]">{food}</span
                >{/each}
            </div>
            <div class="mt-5 border-l-2 border-pen pl-3">
              <strong>tonight’s remix</strong>
              <p class="m-0 text-[12px] text-pen-soft">smoky tomato rice bowl &middot; 22 min</p>
            </div>
          </div>
        {:else if slug === "debate-club"}<div class="my-4 grid grid-cols-2 gap-3">
            <div class="border-t-2 border-pen p-2">
              <span class="text-[12px] text-pen-faint">for</span>
              <p class="m-0">Tabs encode intent.</p>
            </div>
            <div class="border-t-2 border-stop p-2">
              <span class="text-[12px] text-pen-faint">against</span>
              <p class="m-0">Spaces render everywhere.</p>
            </div>
          </div>
        {:else if slug === "fortune-cookie"}<div class="my-8 text-center">
            <div class="text-6xl">◒</div>
            <p class="mx-auto mt-4 max-w-xs italic">“The tool you avoid will become the door.”</p>
          </div>
        {:else if slug === "soundboard"}<div class="my-4 grid grid-cols-2 gap-2">
            {#each ["APPLAUSE", "AIRHORN", "SAD TROMBONE", "TINY WOW"] as sound}<div
                class="border border-pen bg-sheet p-3 text-center text-[12px]"
              >
                ▶ {sound}
              </div>{/each}
          </div>
        {:else}<div class="my-8 text-center">
            <div class="text-6xl">◇</div>
            <p class="m-0 mt-3">sealed until next summer</p>
            <span class="text-[12px] text-pen-faint">{score} messages prepared</span>
          </div>{/if}
        <ol id="history" class="m-0 grid list-none gap-1 p-0 text-[12px]">
          {#each history.slice(0, 2) as event}<li class="border-l-2 border-pen pl-2 text-pen-soft">
              {event}
            </li>{/each}
        </ol>
      </section>
      <section aria-label="Manual controls">
        <p class="m-0 mb-2 text-[12px] text-pen-faint">try a tool</p>
        <div class="grid gap-2">
          {#each example.tools as tool}<button
              type="button"
              onclick={() => perform(tool, {})}
              class="border border-pen bg-transparent px-3 py-1.5 text-left text-[13px] text-pen hover:bg-pen hover:text-sheet"
              >{tool}</button
            >{/each}
        </div>
      </section>
    </div>
    <section class="border-t border-pen pt-3">
      <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <strong id="status" class="text-[12px] font-bold">{status}</strong><span
            id="activity"
            class="block text-[12px] text-pen-soft">{activity}</span
          >
        </div>
        <div class="flex gap-2">
          {#if !mcpUrl}<button
              id="connect"
              type="button"
              onclick={connect}
              disabled={connecting}
              class="border border-pen bg-pen px-4 py-2 text-[12px] font-bold text-sheet disabled:opacity-50"
              >Connect agent</button
            >{:else}<button
              id="copy"
              type="button"
              onclick={copyUrl}
              class="border border-pen bg-transparent px-4 py-2 text-[12px] font-bold text-pen"
              >{copied ? "Copied" : "Copy URL"}</button
            ><button
              id="stop"
              type="button"
              onclick={stop}
              class="border border-stop bg-stop px-4 py-2 text-[12px] font-bold text-sheet"
              >Stop</button
            >{/if}
        </div>
      </div>
      {#if mcpUrl}<code
          id="session"
          class="mt-3 block [overflow-wrap:anywhere] border-l-2 border-pen bg-sheet-deep px-3 py-2 text-[11px] leading-relaxed"
          >{mcpUrl}</code
        >{:else}<code id="session"></code>{/if}
    </section>
    <ExampleFooter slug={example.slug} />
  </section>
</main>
