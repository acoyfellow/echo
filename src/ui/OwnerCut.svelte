<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";

  let frame: HTMLIFrameElement;
  let sessionState = $state("Waiting for approval");
  let detail = $state("The app has not shared any tools.");

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== "echo-example") return;
      if (event.data.type === "connected") {
        sessionState = "Session active";
        detail = "The approved Todo tools are available through one temporary MCP URL.";
      }
      if (event.data.type === "activity") {
        sessionState = `${event.data.capability} · ${event.data.status}`;
        detail = "A real MCP call reached the live app.";
      }
      if (event.data.type === "stopped") {
        sessionState = "Session stopped";
        detail = "Later calls are rejected. Completed effects remain visible.";
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  });
</script>

<svelte:head><meta name="description" content="A quieter alternate presentation for Echo's app-owned capability model." /></svelte:head>

<main class="min-h-svh bg-ink text-paper">
  <nav class="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-5"><a href="/" class="text-xl font-semibold tracking-[-.03em] no-underline">echo</a><div class="flex gap-5 text-sm text-muted"><a href="/">Original</a><a href="/examples/">Examples</a><a href="https://github.com/acoyfellow/echo">Source</a></div></nav>

  <section class="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1180px] items-center gap-12 px-5 py-16 lg:grid-cols-[.85fr_1.15fr]">
    <div><p class="text-sm font-medium text-signal">App-owned tools for agents</p><h1 class="my-5 text-[clamp(3.4rem,7vw,6.4rem)] font-semibold leading-[.92] tracking-[-.055em]">Your app already has the tools.</h1><p class="max-w-xl text-xl leading-8 text-muted">Echo exposes only the functions you name through one temporary MCP URL. The human approves the session and keeps Stop.</p><div class="mt-9 grid gap-4 border-y border-white/15 py-6 sm:grid-cols-3"><div><strong class="text-echo">01</strong><span class="mt-2 block font-medium">Name functions</span></div><div><strong class="text-echo">02</strong><span class="mt-2 block font-medium">Approve session</span></div><div><strong class="text-echo">03</strong><span class="mt-2 block font-medium">Call until Stop</span></div></div></div>
    <div class="overflow-hidden rounded-2xl border border-white/15 bg-layer shadow-2xl"><div class="flex items-center justify-between border-b border-white/10 px-5 py-4 text-sm"><span>Live proof · Tiny Todo</span><span class="text-signal">Real MCP</span></div><iframe bind:this={frame} src="/examples/todo/" title="Echo Tiny Todo live proof" class="block h-[650px] w-full border-0 bg-[#0b1118]"></iframe></div>
  </section>

  <section class="border-y border-white/15 bg-[#0b1016] px-5 py-20"><div class="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[.75fr_1.25fr]"><header><p class="text-sm font-medium text-amber">Before Connect</p><h2 class="my-3 text-4xl font-semibold tracking-[-.04em]">The grant is visible.</h2><p class="leading-7 text-muted">The app chooses the vocabulary and classifies effects. Connect and Stop never become agent tools.</p></header><div class="overflow-hidden border-y border-white/15"><div class="grid grid-cols-[1fr_auto] border-b border-white/10 p-4"><span class="font-mono">listTodos</span><span class="text-sm text-signal">read</span></div><div class="grid grid-cols-[1fr_auto] border-b border-white/10 p-4"><span class="font-mono">addTodo</span><span class="text-sm text-amber">mutation</span></div><div class="grid grid-cols-[1fr_auto] border-b border-white/10 p-4"><span class="font-mono">setCompleted</span><span class="text-sm text-amber">mutation</span></div><div class="grid grid-cols-[1fr_auto] p-4"><span class="font-mono">deleteTodo</span><span class="text-sm text-amber">mutation</span></div></div></div></section>

  <section class="px-5 py-20"><div class="mx-auto max-w-[1180px]"><div class="mb-8 grid gap-5 md:grid-cols-[1fr_auto] md:items-end"><header><p class="text-sm font-medium text-signal">Current session</p><h2 class="my-2 text-4xl font-semibold tracking-[-.04em]">{sessionState}</h2><p aria-live="polite" class="m-0 text-muted">{detail}</p></header><div class="max-w-sm text-sm leading-6 text-muted">Temporary credential · one app · one origin · named grants · expiry · app-owned Stop</div></div><div class="grid gap-px bg-white/15 sm:grid-cols-3"><div class="bg-ink p-6"><strong>Semantic, not visual</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">Call app functions instead of guessing selectors or coordinates.</p></div><div class="bg-ink p-6"><strong>Temporary by design</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">Credentials bind the app, origin, grants, session, and expiry.</p></div><div class="bg-ink p-6"><strong>Honest about mutations</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">Operations deduplicate. An uncertain outcome stays uncertain.</p></div></div></div></section>

  <section class="bg-[#0b1016] px-5 py-20"><div class="mx-auto max-w-[1180px]"><header class="mb-8"><p class="text-sm font-medium text-amber">Three ways to see it</p><h2 class="my-2 text-4xl font-semibold tracking-[-.04em]">One reference. Two proofs of range.</h2></header><div class="grid gap-4 md:grid-cols-3">{#each examples.slice(0, 3) as example}<a href={`/examples/${example.slug}/`} style={`--accent:${example.color}`} class="border-t-2 border-[var(--accent)] bg-ink p-6 text-paper no-underline"><span class="text-3xl">{example.emoji}</span><h3 class="mb-2 mt-8 text-2xl font-semibold">{example.name}</h3><p class="min-h-16 text-sm leading-6 text-muted">{example.description}</p><strong class="text-[var(--accent)]">Open app →</strong></a>{/each}</div><a href="/examples/" class="mt-7 inline-block text-echo">Explore all sixteen playable cabinets →</a></div></section>

  <section class="px-5 py-24"><div class="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[.8fr_1.2fr]"><header><p class="text-sm font-medium text-signal">First integration</p><h2 class="my-3 text-5xl font-semibold leading-none tracking-[-.045em]">Six steps. No browser extension.</h2></header><ol class="m-0 grid list-none gap-0 p-0">{#each ['Deploy the Echo Worker','Set the signing secret','Install the client','Register named functions','Connect from a user action','Give the temporary URL to an MCP agent'] as step, index}<li class="grid grid-cols-[3rem_1fr] border-t border-white/15 py-4"><span class="font-mono text-muted">0{index+1}</span><strong>{step}</strong></li>{/each}</ol></div></section>

  <footer class="mx-auto flex max-w-[1180px] flex-col justify-between gap-4 border-t border-white/15 px-5 py-8 text-sm text-muted sm:flex-row"><span>Echo 0.0.1 · alternate owner cut</span><div class="flex gap-5"><a href="/">Compare original</a><a href="https://github.com/acoyfellow/echo/tree/main/receipts">Inspect evidence</a></div></footer>
</main>
