<script lang="ts">
  let {
    online,
    total,
    hostTypes,
  }: {
    online: number;
    total: number;
    hostTypes?: string[];
  } = $props();

  let offline = $derived(total - online);
</script>

<div class="node-status-grid">
  <div class="stat-card stat-online">
    <span class="stat-number">{online}</span>
    <span class="stat-label">在線</span>
  </div>
  <div class="stat-card">
    <span class="stat-number">{total}</span>
    <span class="stat-label">總計</span>
  </div>
  <div class="stat-card" class:stat-warn={offline > 0}>
    <span class="stat-number">{offline}</span>
    <span class="stat-label">離線</span>
  </div>
  {#if hostTypes && hostTypes.length > 0}
    <div class="host-type-pills">
      <span class="pill-label">主機類型:</span>
      {#each hostTypes as ht}
        <span class="pill">{ht}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .node-status-grid {
    display: flex;
    gap: 1rem;
    align-items: stretch;
    flex-wrap: wrap;
  }
  .stat-card {
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 1rem 1.5rem;
    background: var(--theme-elevated);
    text-align: center;
    min-width: 100px;
  }
  .stat-number {
    display: block;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--theme-fg);
  }
  .stat-label {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    text-transform: uppercase;
  }
  .stat-online .stat-number {
    color: var(--theme-success);
  }
  .stat-warn .stat-number {
    color: var(--theme-danger);
  }
  .host-type-pills {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding: 0.5rem 0;
  }
  .pill-label {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .pill {
    padding: 0.2rem 0.6rem;
    background: var(--theme-info-bg);
    color: var(--theme-info-fg);
    border: 1px solid var(--theme-info-border);
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 500;
  }
</style>
