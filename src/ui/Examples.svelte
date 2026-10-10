<script lang="ts">
  import { onMount } from "svelte";
  import { examples } from "../../examples/catalog";

  const featuredExamples = examples.slice(0, 3);

  const moreExamples = examples.slice(3);

  onMount(() => {
    document.documentElement.dataset.hydrated = "true";
  });
</script>

<svelte:head
  ><meta
    name="description"
    content="Small web apps you can connect to an agent with Echo."
  /></svelte:head
>

<main class="min-h-svh bg-sheet font-spec text-[14px] leading-[1.7] text-pen [color-scheme:light]">
  <div class="mx-auto max-w-[1100px] px-6 pb-6 pt-6">
    <header class="flex items-baseline justify-between pb-3 text-[12px]">
      <a class="no-underline" href="/"><b>echo</b> 0.0.1</a><span class="flex gap-4"
        ><a class="underline decoration-1 underline-offset-2" href="/">home</a><a
          class="underline decoration-1 underline-offset-2"
          href="https://github.com/acoyfellow/echo">source</a
        ></span
      >
    </header>
  </div>

  <section class="border-y border-pen bg-sheet-deep/60">
    <div
      class="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-14"
    >
      <div>
        <h1 class="m-0 text-[24px] font-bold leading-[1.3] tracking-[-.01em]">
          {examples.length} small apps with Echo added.
        </h1>
        <p class="mt-3 max-w-[440px] text-pen-soft">
          Open one, press Connect agent, paste the URL into your agent, and watch it use the app.
        </p>
      </div>
      <ul
        class="m-0 grid list-none grid-cols-6 gap-px border border-pen bg-pen p-0"
        aria-label="All examples"
      >
        {#each examples as example (example.slug)}
          <li class="aspect-square bg-sheet">
            <a
              href={`/examples/${example.slug}/`}
              title={example.name}
              class="grid size-full place-items-center text-[20px] no-underline transition-colors hover:bg-sheet-deep"
              style:color={example.color}
              ><span aria-hidden="true">{example.emoji}</span><span class="sr-only"
                >{example.name}</span
              ></a
            >
          </li>
        {/each}
        <li class="aspect-square bg-sheet"></li>
      </ul>
    </div>
  </section>

  <div class="mx-auto max-w-[1100px] px-6 pb-24">
    <section class="mt-12" aria-labelledby="live-title">
      <h2 id="live-title" class="m-0 text-[14px] font-bold">Start here</h2>
      <div class="mt-4 grid grid-cols-1 gap-px bg-pen/20 md:grid-cols-2">
        {#each featuredExamples as example}
          <a
            href={`/examples/${example.slug}/`}
            class="flex flex-col bg-sheet p-5 no-underline hover:bg-sheet-deep"
          >
            <span class="text-[12px] text-pen-faint"
              >{example.emoji} &middot; {example.tools.join(" · ")}</span
            >
            <b class="mt-2 text-[18px] underline decoration-1 underline-offset-2">{example.name}</b>
            <span class="mt-1 text-pen-soft">{example.description}</span>
            <span class="mt-4 text-[12px] italic text-pen-faint">try: “{example.prompt}”</span>
          </a>
        {/each}
      </div>
    </section>

    <section class="mt-14" aria-labelledby="more-title">
      <h2 id="more-title" class="m-0 text-[14px] font-bold">Fourteen more</h2>
      <ul class="m-0 mt-4 grid list-none grid-cols-1 gap-px bg-pen/20 p-0 md:grid-cols-2">
        {#each moreExamples as example}
          <li class="bg-sheet">
            <a
              href={`/examples/${example.slug}/`}
              class="grid h-full grid-cols-[28px_1fr] gap-3 p-4 no-underline hover:bg-sheet-deep"
              ><span class="text-pen-faint">{example.emoji}</span><span
                ><b class="underline decoration-1 underline-offset-2">{example.name}</b><span
                  class="mt-1 block text-pen-soft">{example.description}</span
                ><span class="mt-2 block text-[12px] text-pen-faint"
                  >{example.tools.join(" · ")}</span
                ></span
              ></a
            >
          </li>
        {/each}
      </ul>
    </section>

    <footer class="mt-20 flex justify-between border-t border-pen pt-3 text-[12px]">
      <span>echo 0.0.1 &middot; MIT</span><a
        class="underline decoration-1 underline-offset-2"
        href="https://github.com/acoyfellow/echo/tree/main/examples">example source</a
      >
    </footer>
  </div>
</main>
