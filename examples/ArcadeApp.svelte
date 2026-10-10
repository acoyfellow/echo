<script lang="ts">
  import { onMount } from "svelte";
  import { createEcho, type EchoClient } from "../client";
  import { examples } from "./catalog";
  import ExampleFooter from "./ExampleFooter.svelte";

  let { slug }: { slug: string } = $props();
  const example = examples.find((candidate) => candidate.slug === slug)!;
  const readTools = new Set(["list", "read premise", "check mood", "read copy", "list options", "read board", "list tracks", "read pantry", "list sounds"]);
  const capabilityName = (tool: string) => tool.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase());
  let status = $state("Agent disconnected");
  let activity = $state("Only you can use this app.");
  let mcpUrl = $state("");
  let connecting = $state(false);
  let copied = $state(false);
  let score = $state(0);
  let history = $state<string[]>([`Ready: ${example.prompt}`]);
  let echo: EchoClient | undefined;

  function perform(tool: string, input: unknown) {
    const value = input && typeof input === "object" && "text" in input ? String((input as { text?: unknown }).text ?? "") : "";
    const detail = value.trim() || `${tool} completed`;
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
    setTimeout(() => copied = false, 1500);
  }

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    echo = createEcho({
      workerBase: location.origin,
      appId: `echo-${example.slug}`,
      onActivity(event) { activity = `${event.status}: ${event.capability}`; },
    });
    const capabilities = Object.fromEntries(example.tools.map((tool) => [capabilityName(tool), {
      description: `${tool} in ${example.name}`,
      effect: readTools.has(tool) ? "read" : "mutation",
      inputSchema: { type: "object", properties: { text: { type: "string", maxLength: 240 } }, additionalProperties: false },
      run: (input: unknown) => perform(tool, input),
    }])) as Parameters<EchoClient["register"]>[0];
    echo.register(capabilities);
    return () => echo?.stop();
  });
</script>

<svelte:head><meta name="description" content={`${example.name}: ${example.description}`} /></svelte:head>

<main style={`--accent:${example.color}`} class="min-h-svh bg-[radial-gradient(circle_at_20%_0,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_34rem),#0b1118] px-4 py-6 text-paper">
  <section class="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-layer shadow-2xl">
    <header class="border-b border-white/10 p-6"><div class="flex items-center justify-between"><span class="text-4xl text-[var(--accent)]">{example.emoji}</span><span class="text-sm font-medium text-[var(--accent)]">Echo arcade</span></div><h1 class="mb-2 mt-6 text-4xl font-semibold tracking-[-.04em]">{example.name}</h1><p class="m-0 max-w-xl leading-6 text-muted">{example.description}</p></header>
    <div class="grid gap-5 p-6 sm:grid-cols-[1fr_180px]">
      <section aria-label="App state" class="min-h-64 rounded-xl bg-[#0b1118] p-5"><p class="m-0 text-sm font-medium text-[var(--accent)]">Live state · {score} moves</p>
        {#if slug === 'tiny-dungeon'}<div class="my-5 grid grid-cols-3 gap-2">{#each ['ENTRY','?','?','⚔','?','LOOT'] as room}<div class="grid aspect-square place-items-center border border-white/15 text-xs text-[var(--accent)]">{room}</div>{/each}</div>
        {:else if slug === 'joke-lab'}<div class="my-5 rounded-xl border border-white/15 p-5"><p class="text-lg">A developer walks into a browser…</p><div class="mt-6 h-2 overflow-hidden rounded bg-white/10"><div class="h-full bg-[var(--accent)]" style={`width:${Math.min(100, 20 + score * 16)}%`}></div></div><span class="mt-2 block text-xs text-muted">laugh pressure</span></div>
        {:else if slug === 'pixel-pet'}<div class="my-5 text-center"><div class="text-8xl">{score % 3 === 0 ? '◕‿◕' : score % 3 === 1 ? '◕ᴗ◕' : '◠‿◠'}</div><div class="mt-5 grid grid-cols-2 gap-2 text-xs"><span class="rounded bg-white/5 p-2">HUNGER {Math.max(0, 70-score*8)}%</span><span class="rounded bg-white/5 p-2">JOY {Math.min(100, 40+score*10)}%</span></div></div>
        {:else if slug === 'copy-roast'}<div class="my-5 grid gap-3"><div class="rounded border border-danger/40 p-4"><span class="text-xs text-danger">BEFORE</span><p>Software that helps you succeed.</p></div><div class="rounded border border-[var(--accent)] p-4"><span class="text-xs text-[var(--accent)]">CHALLENGER {score}</span><p>Your app already knows what to do.</p></div></div>
        {:else if slug === 'decision-wheel'}<div class="mx-auto my-5 grid aspect-square max-w-56 place-items-center rounded-full border-[14px] border-[var(--accent)] bg-[conic-gradient(#ffffff10_0_25%,transparent_25%_50%,#ffffff10_50%_75%,transparent_75%)]"><strong class="text-center">SPIN<br/><span class="text-3xl">{score}</span></strong></div>
        {:else if slug === 'meeting-bingo'}<div class="my-5 grid grid-cols-3 gap-1">{#each ['SYNERGY','OFFLINE','ALIGN','CIRCLE BACK','HARD STOP','BANDWIDTH','PARK IT','NORTH STAR','BINGO'] as square, index}<div class:bg-[var(--accent)]={index < score} class:text-ink={index < score} class="grid aspect-square place-items-center p-1 text-center text-[10px]">{square}</div>{/each}</div>
        {:else if slug === 'mixtape'}<div class="my-5 grid gap-2">{#each ['Neon Exit','Soft Static','Last Train','Afterglow'] as track, index}<div class="flex items-center gap-3 border-b border-white/10 py-2"><span class="text-[var(--accent)]">0{index+1}</span><span>{track}</span><span class="ml-auto text-xs text-muted">{3+index}:2{index}</span></div>{/each}</div>
        {:else if slug === 'story-dice'}<div class="my-8 grid grid-cols-3 gap-3 text-center">{#each ['ASTRONAUT','LIGHTHOUSE','SECRET'] as die}<div class="grid aspect-square place-items-center rounded-xl border border-[var(--accent)] p-2 text-xs">{die}</div>{/each}</div>
        {:else if slug === 'trivia-night'}<div class="my-5"><span class="text-xs text-[var(--accent)]">ROUND {score + 1}</span><p class="text-2xl font-semibold">Which browser first shipped CSS Grid?</p><div class="mt-5 grid grid-cols-2 gap-2 text-sm">{#each ['Firefox','Chrome','Safari','Edge'] as answer}<span class="rounded border border-white/15 p-3">{answer}</span>{/each}</div></div>
        {:else if slug === 'recipe-remix'}<div class="my-5"><div class="flex flex-wrap gap-2">{#each ['tomatoes','rice','lime','beans','chili'] as food}<span class="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-ink">{food}</span>{/each}</div><div class="mt-6 border-l-2 border-[var(--accent)] pl-4"><strong>Tonight’s remix</strong><p class="text-sm text-muted">Smoky tomato rice bowl · 22 min</p></div></div>
        {:else if slug === 'debate-club'}<div class="my-5 grid grid-cols-2 gap-3"><div class="border-t-2 border-[var(--accent)] p-3"><span class="text-xs text-muted">FOR</span><p>Tabs encode intent.</p></div><div class="border-t-2 border-danger p-3"><span class="text-xs text-muted">AGAINST</span><p>Spaces render everywhere.</p></div></div>
        {:else if slug === 'fortune-cookie'}<div class="my-10 text-center"><div class="text-7xl">◒</div><p class="mx-auto mt-5 max-w-xs font-serif text-xl italic">“The tool you avoid will become the door.”</p></div>
        {:else if slug === 'soundboard'}<div class="my-5 grid grid-cols-2 gap-2">{#each ['APPLAUSE','AIRHORN','SAD TROMBONE','TINY WOW'] as sound}<div class="rounded-lg border border-white/15 p-4 text-center text-xs hover:border-[var(--accent)]">▶ {sound}</div>{/each}</div>
        {:else}<div class="my-8 text-center"><div class="text-7xl">◇</div><p class="mt-4 text-lg">Sealed until next summer</p><span class="text-xs text-muted">{score} messages prepared</span></div>{/if}
        <ol id="history" class="m-0 grid list-none gap-2 p-0 text-xs">{#each history.slice(0, 2) as event}<li class="border-l-2 border-[var(--accent)] pl-3 text-muted">{event}</li>{/each}</ol></section>
      <section aria-label="Manual controls"><p class="mb-3 mt-0 text-sm text-muted">Try a tool</p><div class="grid gap-2">{#each example.tools as tool}<button type="button" onclick={() => perform(tool, {})} class="rounded-lg border border-white/15 bg-transparent px-3 py-2 text-left text-sm text-paper hover:border-[var(--accent)]">{tool}</button>{/each}</div></section>
    </div>
    <section class="border-t border-white/10 bg-[#0e161f] p-5"><div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><strong id="status" class="text-sm">{status}</strong><span id="activity" class="block text-xs text-muted">{activity}</span></div><div class="flex gap-2">{#if !mcpUrl}<button id="connect" type="button" onclick={connect} disabled={connecting} class="rounded-lg bg-echo px-4 py-2 text-xs font-bold text-ink disabled:opacity-50">Connect agent</button>{:else}<button id="copy" type="button" onclick={copyUrl} class="rounded-lg bg-[#76c7f0] px-4 py-2 text-xs font-bold text-ink">{copied ? 'Copied' : 'Copy URL'}</button><button id="stop" type="button" onclick={stop} class="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-ink">Stop</button>{/if}</div></div>{#if mcpUrl}<code id="session" class="mt-3 block [overflow-wrap:anywhere] rounded-lg bg-[#182431] p-3 font-mono text-[10px] text-[#76c7f0]">{mcpUrl}</code>{:else}<code id="session"></code>{/if}</section>
    <ExampleFooter slug={example.slug} />
  </section>
</main>
