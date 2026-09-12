<script lang="ts">
  import { onMount } from "svelte";
  onMount(() => { document.documentElement.dataset.hydrated = "true"; });
</script>

<svelte:head>
  <meta name="description" content="Give an agent temporary JavaScript access to one live Chrome tab." />
  <meta property="og:title" content="Echo — a live browser tab for your agent" />
  <meta property="og:description" content="Approve one tab. Copy one MCP URL. Stop from trusted browser UI." />
  <meta property="og:image" content="https://echo.coey.dev/og.svg" />
</svelte:head>

<main class="min-h-svh bg-ink text-paper">
  <nav class="mx-auto flex h-16 max-w-[1120px] items-center justify-between px-5"><a href="/" class="text-xl font-semibold tracking-[-.03em] no-underline">echo</a><div class="flex gap-5 text-sm text-muted"><a href="/demo/">Todo</a><a href="https://github.com/acoyfellow/echo">Source</a></div></nav>

  <section class="mx-auto grid min-h-[calc(100svh-4rem)] max-w-[1120px] items-center gap-14 px-5 py-16 lg:grid-cols-[1.05fr_.95fr]">
    <header><p class="font-mono text-xs uppercase tracking-[.16em] text-amber">AX, not browser automation</p><h1 class="my-5 text-[clamp(4rem,9vw,7.5rem)] font-semibold leading-[.84] tracking-[-.065em]">Give your agent a live tab.</h1><p class="max-w-xl text-xl leading-8 text-muted">Echo gives an MCP agent temporary JavaScript access to one Chrome tab you approve. It can work with the page you are already signed into. You keep Stop.</p><div class="mt-9 flex flex-wrap gap-3"><a href="/demo/" class="rounded-lg bg-echo px-5 py-3 font-semibold text-black no-underline">Open the Todo target</a><a href="https://github.com/acoyfellow/echo#install" class="rounded-lg border border-white/20 px-5 py-3 font-semibold text-paper no-underline">Install the companion</a></div></header>

    <div class="overflow-hidden rounded-2xl border border-white/15 bg-[#0c1219] shadow-2xl"><div class="flex items-center justify-between border-b border-white/10 px-5 py-4 text-xs text-muted"><span>ONE APPROVED TAB</span><span class="text-signal">10 MINUTES</span></div><div class="p-6 font-mono text-sm leading-7"><p class="m-0 text-[#cb8cff]">page.evaluate</p><pre id="hero-code" class="my-5 overflow-hidden whitespace-pre-wrap rounded-lg bg-[#070b0f] p-5 text-[#d8e5ee]"><code>const open = [...document.querySelectorAll(
  '#todos li'
)].filter(row =&gt; !row.querySelector(
  'input[type=checkbox]'
).checked);

open[0]?.querySelector('input').click();</code></pre><div class="grid gap-2 text-xs text-muted"><span><b class="text-signal">BOUND</b> exact tab + exact origin</span><span><b class="text-amber">REVOKED</b> Stop + navigation + expiry</span><span><b class="text-danger">BROAD</b> everything page JavaScript can reach</span></div></div></div>
  </section>

  <section class="border-y border-white/15 bg-[#0b1016] px-5 py-24"><div class="mx-auto max-w-[1120px]"><header class="max-w-3xl"><p class="font-mono text-xs uppercase tracking-[.16em] text-amber">One honest permission</p><h2 class="my-4 text-[clamp(2.8rem,6vw,5rem)] font-semibold leading-[.95] tracking-[-.05em]">The agent gets the page’s authority.</h2><p class="text-lg leading-8 text-muted">That includes the DOM, browser storage for this origin, hidden JavaScript state, and authenticated requests the page can make. Echo does not pretend those powers are isolated from one another.</p></header><div class="mt-12 grid gap-px bg-white/15 md:grid-cols-3"><article class="bg-[#0b1016] p-6"><strong>Approve outside the page</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">A trusted Chrome companion selects the exact tab and shows Chrome’s debugger disclosure.</p></article><article class="bg-[#0b1016] p-6"><strong>Fail closed</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">Cross-origin navigation, expiry, tab closure, companion restart, and Stop end the session.</p></article><article class="bg-[#0b1016] p-6"><strong>Do not promise undo</strong><p class="mb-0 mt-3 text-sm leading-6 text-muted">Stop blocks future code. Requests and mutations already completed remain completed.</p></article></div></div></section>

  <section class="px-5 py-24"><div class="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[.8fr_1.2fr]"><header><p class="font-mono text-xs uppercase tracking-[.16em] text-amber">Install</p><h2 class="my-4 text-5xl font-semibold leading-none tracking-[-.05em]">From clone to agent in five steps.</h2></header><ol class="m-0 list-none p-0">{#each ['Clone Echo and run bun install','Build the Chrome companion','Load extension/ as an unpacked extension','Open the Todo target or your own app','Approve the tab and paste its MCP URL into your agent'] as step, index}<li class="grid grid-cols-[3rem_1fr] border-t border-white/15 py-4"><span class="font-mono text-muted">0{index + 1}</span><strong>{step}</strong></li>{/each}</ol></div></section>

  <section class="bg-[#0b1016] px-5 py-24"><div class="mx-auto max-w-[1120px]"><p class="font-mono text-xs uppercase tracking-[.16em] text-amber">One real target</p><div class="mt-4 grid gap-8 md:grid-cols-[1fr_auto] md:items-end"><div><h2 class="m-0 max-w-3xl text-[clamp(3rem,7vw,6rem)] font-semibold leading-[.9] tracking-[-.055em]">Let the agent finish the Todo.</h2><p class="mt-6 max-w-2xl text-lg leading-8 text-muted">The demo is an ordinary Svelte app with no Echo integration. Codemode changes it from outside the page through the temporary MCP connection.</p></div><a href="/demo/" class="rounded-lg bg-echo px-5 py-3 font-semibold text-black no-underline">Open Todo →</a></div></div></section>

  <footer class="mx-auto flex max-w-[1120px] flex-col justify-between gap-4 border-t border-white/15 px-5 py-8 text-sm text-muted sm:flex-row"><span>Echo 0.0.1 · experimental software</span><div class="flex gap-5"><a href="https://github.com/acoyfellow/echo/blob/main/SECURITY.md">Security boundary</a><a href="https://github.com/acoyfellow/echo/tree/main/receipts/codemode">Receipts</a></div></footer>
</main>
