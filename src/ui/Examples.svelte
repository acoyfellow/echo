<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";

  onMount(() => { document.documentElement.dataset.hydrated = "true"; });
</script>

<svelte:head><meta name="description" content="Small web apps you can connect to an agent with Echo." /></svelte:head>

<main class="min-h-svh bg-[radial-gradient(circle_at_18%_-5%,rgba(255,122,24,.17),transparent_34rem)] px-5">
  <nav class="mx-auto flex h-[70px] max-w-[1180px] items-center justify-between border-b border-white/15"><a class="text-xl font-black tracking-[-.05em] text-paper no-underline" href="/">echo</a><a class="text-sm text-muted" href="https://github.com/acoyfellow/echo">GitHub</a></nav>
  <header class="mx-auto max-w-[1180px] pb-14 pt-20"><p class="font-mono text-[11px] font-bold uppercase tracking-[.18em] text-amber">The playground</p><h1 class="my-4 max-w-[12ch] text-[clamp(3rem,8vw,5.6rem)] font-black leading-[.96] tracking-[-.065em]">Little apps. Real agent tools.</h1><p class="max-w-2xl text-xl text-muted">Todo and Notes are complete web apps you can connect right now. The other fourteen cabinets are concrete experiments waiting to be built.</p></header>
  <section class="mx-auto grid max-w-[1180px] grid-cols-1 gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
    {#each examples as example}
      <svelte:element this={example.live ? 'a' : 'article'} href={example.live ? `/examples/${example.slug}/` : undefined} style={`--accent:${example.color}`} class:opacity-60={!example.live} class="flex min-h-[350px] flex-col rounded-2xl border border-[color-mix(in_srgb,var(--accent)_45%,rgba(180,205,225,.15))] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent)_7%,transparent),transparent_45%),#101720] p-5 text-paper no-underline shadow-xl transition hover:-translate-y-1">
        <div class="flex items-center justify-between"><span class="grid size-11 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-2xl text-[var(--accent)]">{example.emoji}</span><span class="font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[var(--accent)]">{example.live ? 'play now' : 'next up'}</span></div>
        <h2 class="mb-2 mt-6 text-2xl font-bold tracking-[-.04em]">{example.name}</h2><p class="m-0 text-sm text-muted">{example.description}</p>
        <div class="mt-5 flex flex-wrap gap-1">{#each example.tools as tool}<span class="rounded border border-white/15 px-2 py-1 font-mono text-[10px] text-[#b7c5d2]">{tool}</span>{/each}</div>
        <blockquote class="mb-0 mt-auto pt-5 text-sm italic text-[var(--accent)]">“{example.prompt}”</blockquote>
      </svelte:element>
    {/each}
  </section>
  <footer class="mx-auto max-w-[1180px] border-t border-white/15 py-9 text-sm text-muted">Two live. Fourteen strange little ideas waiting their turn.</footer>
</main>
