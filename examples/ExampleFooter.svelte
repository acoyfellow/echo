<script lang="ts">
  import { examples } from "./catalog";

  let { slug }: { slug: string } = $props();
  const index = $derived(examples.findIndex((example) => example.slug === slug));
  const previous = $derived(examples[(index - 1 + examples.length) % examples.length]);
  const next = $derived(examples[(index + 1) % examples.length]);
</script>

<nav aria-label="Example navigation" class="mx-auto grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center border-t border-white/15 px-5 py-5 text-sm">
  <a class="min-w-0 text-muted no-underline hover:text-paper" href={`/examples/${previous.slug}/`}><span class="block text-xs">Previous</span><strong class="block truncate text-paper">← {previous.name}</strong></a>
  <a class="px-4 text-center font-medium text-echo no-underline" href="/examples/">All examples</a>
  <a class="min-w-0 text-right text-muted no-underline hover:text-paper" href={`/examples/${next.slug}/`}><span class="block text-xs">Next</span><strong class="block truncate text-paper">{next.name} →</strong></a>
</nav>
