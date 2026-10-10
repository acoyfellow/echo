<script lang="ts">
  import { examples } from "./catalog";

  let { slug }: { slug: string } = $props();

  const index = $derived(examples.findIndex((example) => example.slug === slug));

  const previous = $derived(examples[(index - 1 + examples.length) % examples.length]);

  const next = $derived(examples[(index + 1) % examples.length]);
</script>

<nav
  aria-label="Example navigation"
  class="mx-auto mt-6 grid w-full grid-cols-[1fr_auto_1fr] items-center border-t border-pen pt-3 font-spec text-[12px] text-pen"
>
  <a class="min-w-0 no-underline" href={`/examples/${previous.slug}/`}
    ><span class="block text-pen-faint">previous</span><span
      class="block truncate underline decoration-1 underline-offset-2">← {previous.name}</span
    ></a
  >
  <a class="px-4 text-center underline decoration-1 underline-offset-2" href="/examples/"
    >all examples</a
  >
  <a class="min-w-0 text-right no-underline" href={`/examples/${next.slug}/`}
    ><span class="block text-pen-faint">next</span><span
      class="block truncate underline decoration-1 underline-offset-2">{next.name} →</span
    ></a
  >
</nav>
