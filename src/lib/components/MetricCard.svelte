<script lang="ts">
  let {
    title,
    metrics,
  }: {
    title: string;
    metrics: { cpu: number; memory: number; disk: number };
  } = $props();

  const METRICS = ['cpu', 'memory', 'disk'] as const;

  function pctColor(val: number): string {
    if (val >= 85) return '#ef4444';
    if (val >= 70) return '#f59e0b';
    return '#10b981';
  }

  function metricLabel(key: string): string {
    switch (key) {
      case 'cpu': return 'CPU';
      case 'memory': return '記憶體';
      case 'disk': return '磁碟';
      default: return key.charAt(0).toUpperCase() + key.slice(1);
    }
  }
</script>

<div class="metric-card">
  <h3>{title}</h3>
  {#each METRICS as met}
    {@const val = metrics[met]}
    <div class="metric-row">
      <span class="metric-label">{metricLabel(met)}</span>
      <div class="bar-track">
        <div
          class="bar-fill"
          style="width: {val}%; background: {pctColor(val)}"
        ></div>
      </div>
      <span class="metric-val" style="color: {pctColor(val)}">{val}%</span>
    </div>
  {/each}
</div>

<style>
  .metric-card {
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 1rem;
    background: var(--theme-elevated);
  }
  .metric-card h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    letter-spacing: 0.05em;
  }
  .metric-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .metric-label {
    font-size: 0.8rem;
    width: 3.5rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--theme-line);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  .metric-val {
    font-size: 0.85rem;
    font-weight: 600;
    width: 3rem;
    text-align: right;
  }
</style>
