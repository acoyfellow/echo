<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";

  const liveExamples = examples.filter((example) => example.live);
  const plannedExamples = examples.filter((example) => !example.live);

  onMount(() => { document.documentElement.dataset.hydrated = "true"; });
</script>

<svelte:head><meta name="description" content="Small web apps you can connect to an agent with Echo." /></svelte:head>

<main class="min-h-svh bg-[radial-gradient(circle_at_18%_-5%,rgba(255,122,24,.15),transparent_34rem)] px-5">
  <nav class="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between"><a class="text-xl font-semibold tracking-[-.03em] text-paper no-underline" href="/">echo</a><div class="flex gap-5 text-sm text-muted"><a href="/">Home</a><a href="https://github.com/acoyfellow/echo">Source</a></div></nav>

  <header class="mx-auto max-w-[1180px] pb-16 pt-20"><p class="text-sm font-medium text-amber">The arcade</p><h1 class="my-4 max-w-[13ch] text-[clamp(3rem,8vw,5.6rem)] font-semibold leading-[1] tracking-[-.045em]">Small apps with real agent tools.</h1><p class="max-w-2xl text-xl leading-8 text-muted">Open Todo or Notes and connect an agent. The other fourteen are concrete ideas, not pretend demos.</p></header>

  <section class="mx-auto max-w-[1180px] pb-24" aria-labelledby="live-title">
    <div class="mb-6 flex items-end justify-between border-b border-white/15 pb-4"><div><p class="mb-2 text-sm font-medium text-signal">Ready now</p><h2 id="live-title" class="m-0 text-3xl font-semibold tracking-[-.03em]">Two complete apps</h2></div><span class="text-sm text-muted">Connect · copy the MCP URL · call a tool</span></div>
    <div class="grid gap-5 md:grid-cols-2">
      {#each liveExamples as example}
        <a href={`/examples/${example.slug}/`} style={`--accent:${example.color}`} class="group flex min-h-[390px] flex-col border-t-2 border-[var(--accent)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_52%),#101720] p-7 text-paper no-underline transition hover:-translate-y-1">
          <div class="flex items-center justify-between"><span class="text-4xl">{example.emoji}</span><span class="inline-flex items-center gap-2 text-sm font-medium text-signal"><svg class="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>Live</span></div>
          <h3 class="mb-2 mt-12 text-4xl font-semibold tracking-[-.04em]">{example.name}</h3><p class="m-0 max-w-md text-base leading-6 text-muted">{example.description}</p>
          <div class="mt-6 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-[var(--accent)]">{#each example.tools as tool}<span>{tool}</span>{/each}</div>
          <div class="mt-auto flex items-end justify-between gap-6 pt-10"><blockquote class="m-0 max-w-sm text-sm leading-6 text-muted">“{example.prompt}”</blockquote><strong class="shrink-0 text-[var(--accent)]">Open app →</strong></div>
        </a>
      {/each}
    </div>
  </section>

  <section class="mx-auto max-w-[1180px] pb-28" aria-labelledby="planned-title">
    <div class="mb-2 border-b border-white/15 pb-5"><p class="mb-2 text-sm font-medium text-amber">Next in line</p><h2 id="planned-title" class="m-0 text-3xl font-semibold tracking-[-.03em]">Fourteen concrete experiments</h2></div>
    <div class="grid md:grid-cols-2">
      {#each plannedExamples as example, index}
        <article style={`--accent:${example.color}`} class="grid grid-cols-[auto_1fr] gap-x-4 border-b border-white/10 py-6 md:px-5" class:md:border-r={index % 2 === 0}>
          <span class="text-2xl text-[var(--accent)]">{example.emoji}</span><div><div class="flex items-baseline justify-between gap-3"><h3 class="m-0 text-lg font-semibold tracking-[-.02em]">{example.name}</h3><span class="shrink-0 text-xs text-amber">Planned</span></div><p class="mb-3 mt-2 text-sm leading-6 text-muted">{example.description}</p><div class="flex flex-wrap gap-x-3 font-mono text-[11px] text-[var(--accent)]">{#each example.tools as tool}<span>{tool}</span>{/each}</div></div>
        </article>
      {/each}
    </div>
  </section>

  <footer class="mx-auto flex max-w-[1180px] justify-between border-t border-white/15 py-9 text-sm text-muted"><span>Two live. Fourteen planned.</span><a href="https://github.com/acoyfellow/echo/tree/main/examples">Read the source</a></footer>
</main>
