<script lang="ts">
  let {
    value = 0,
    animated = true,
    showLabel = false,
    height = 6,
  }: {
    value: number;
    animated?: boolean;
    showLabel?: boolean;
    height?: number;
  } = $props();

  const barColor = $derived(
    value > 80 ? '#ef4444' :
    value > 60 ? '#f59e0b' :
    '#06b6d4'
  );
</script>

<div class="progress-wrapper">
  <div class="progress-track" style="height: {height}px;">
    <div
      class="progress-fill"
      class:animated
      style="width: {Math.min(value, 100)}%; background: {barColor};"
    ></div>
  </div>
  {#if showLabel}
    <span class="progress-label">{Math.round(value)}%</span>
  {/if}
</div>

<style>
  .progress-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .progress-track {
    flex: 1;
    border-radius: 999px;
    background: var(--theme-line);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s ease;
  }
  .progress-fill.animated {
    transition: width 0.5s ease;
  }
  .progress-label {
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    font-weight: 600;
    min-width: 3em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
