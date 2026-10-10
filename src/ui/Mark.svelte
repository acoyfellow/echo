<script lang="ts">
  type Support = "yes" | "no" | "partial";

  let { support, size = 22 }: { support: Support; size?: number } = $props();

  const label = { yes: "yes", no: "no", partial: "depends" };
</script>

<svg
  class="inline-block align-middle"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  role="img"
  aria-label={label[support]}
>
  {#if support === "yes"}
    <circle cx="12" cy="12" r="11" fill="#16a34a" />
    <path
      d="M7 12.5l3.2 3.2L17 8.8"
      fill="none"
      stroke="#fff"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {:else if support === "no"}
    <circle cx="12" cy="12" r="11" fill="#dc2626" />
    <path
      d="M8.5 8.5l7 7M15.5 8.5l-7 7"
      fill="none"
      stroke="#fff"
      stroke-width="2.4"
      stroke-linecap="round"
    />
  {:else}
    <circle cx="12" cy="12" r="10" fill="none" stroke="#a8a294" stroke-width="2" />
    <path d="M7.5 12h9" stroke="#a8a294" stroke-width="2.4" stroke-linecap="round" />
  {/if}
</svg>
