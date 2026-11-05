<script lang="ts">
  import {
    canStartRobustaHistoryGenerate,
    robustaGenerateActionHint,
  } from '$lib/robusta-cluster-snapshot';

  let {
    canDiagnose = false,
    total = 0,
    generating = false,
    onGenerate,
  }: {
    canDiagnose?: boolean;
    total?: number;
    generating?: boolean;
    onGenerate?: () => void;
  } = $props();

  const hint = $derived(robustaGenerateActionHint({ canDiagnose, total, generating }));
  const canStart = $derived(
    canStartRobustaHistoryGenerate({ canDiagnose, total, generating }),
  );
  let pinned = $state(false);

  $effect(() => {
    if (canStart) pinned = false;
  });

  function onWindowClick(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('.gen-wrap')) pinned = false;
  }

  function onClick() {
    if (!canStart) {
      pinned = !pinned;
      return;
    }
    onGenerate?.();
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="gen-wrap" class:is-open={pinned}>
  <button
    type="button"
    class="generate"
    class:is-blocked={!canStart}
    aria-disabled={!canStart}
    aria-expanded={pinned && !canStart}
    aria-describedby="robusta-gen-hint"
    title={hint}
    onclick={onClick}
  >
    {generating ? '產生中…' : '生成調查建議報告'}
  </button>
  <p id="robusta-gen-hint" class="hint-pop" role="tooltip">{hint}</p>
</div>

<style>
  .gen-wrap {
    position: relative;
    flex-shrink: 0;
    margin-left: auto;
  }
  .generate {
    border: 1px solid var(--theme-info-border, color-mix(in srgb, var(--theme-info) 40%, transparent));
    background: var(--theme-info-bg, color-mix(in srgb, var(--theme-info) 10%, transparent));
    color: var(--theme-info);
    border-radius: 6px;
    padding: 4px 10px;
    min-height: 1.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .generate.is-blocked {
    opacity: 0.45;
    cursor: help;
  }
  .hint-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    width: min(22rem, 70vw);
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--theme-info-border, color-mix(in srgb, var(--theme-info) 40%, transparent));
    border-radius: 8px;
    background: var(--theme-elevated, var(--theme-table));
    color: var(--theme-fg);
    font-size: 0.75rem;
    line-height: 1.45;
    box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.12s ease, transform 0.12s ease, visibility 0.12s;
  }
  .gen-wrap:hover .hint-pop,
  .gen-wrap:focus-within .hint-pop,
  .gen-wrap.is-open .hint-pop {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  @media (prefers-reduced-motion: reduce) {
    .hint-pop {
      transition: none;
    }
  }
</style>
