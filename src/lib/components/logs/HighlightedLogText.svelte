<script lang="ts">
  import { applyHighlightSegments, computeLogHighlights } from '$lib/log-highlight';

  let {
    text = '',
    keyword = '',
    categoryPatterns = [] as string[],
  }: {
    text?: string;
    keyword?: string;
    categoryPatterns?: string[];
  } = $props();

  const segments = $derived(
    applyHighlightSegments(
      text,
      computeLogHighlights(text, { keyword, categoryPatterns }),
    ),
  );
</script>

<span class="hl">
  {#each segments as seg}
    {#if seg.kind}
      <mark class="hl-{seg.kind}">{seg.text}</mark>
    {:else}
      {seg.text}
    {/if}
  {/each}
</span>

<style>
  .hl {
    white-space: pre-wrap;
    word-break: break-word;
  }
  mark {
    color: inherit;
    border-radius: 2px;
    padding: 0 1px;
  }
  .hl-keyword {
    background: color-mix(in srgb, var(--theme-info, #38bdf8) 35%, transparent);
  }
  .hl-category {
    background: color-mix(in srgb, var(--theme-warning, #f59e0b) 35%, transparent);
  }
  .hl-lexicon {
    background: color-mix(in srgb, var(--theme-error, #ef4444) 30%, transparent);
  }
</style>
