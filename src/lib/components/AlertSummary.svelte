<script lang="ts">
  import { page } from '$app/stores';

  let {
    critical,
    warning,
    total,
    clusterTag = '',
  }: {
    critical: number;
    warning: number;
    total: number;
    clusterTag?: string;
  } = $props();

  const alertsHref = $derived(
    clusterTag ? `/alerts?site=${encodeURIComponent(clusterTag)}` : '/alerts',
  );

  let alertsExpanded = $state(false);
</script>

<div class="alert-bar" class:has-alerts={total > 0}>
  {#if total > 0}
    <button class="alert-toggle" onclick={() => (alertsExpanded = !alertsExpanded)}>
      <span class="alert-badge critical">{critical} 嚴重</span>
      <span class="alert-badge warning">{warning} 警告</span>
      <span class="toggle-icon">{alertsExpanded ? '▾' : '▸'}</span>
    </button>
    {#if alertsExpanded}
      <div class="alert-detail">
        <p>完整告警詳情請查看 <a href={alertsHref} class="alert-link-btn">告警中心 →</a></p>
      </div>
    {/if}
  {:else}
    <div class="all-clear">
      <span class="check-icon">✓</span>
      一切正常
    </div>
  {/if}
</div>

<style>
  .alert-bar {
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-bottom: 1.5rem;
    background: var(--theme-elevated);
  }
  .alert-bar.has-alerts {
    border-color: var(--theme-danger-border);
    background: var(--theme-danger-bg);
  }
  .alert-toggle {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    width: 100%;
    text-align: left;
    padding: 0;
    color: var(--theme-fg);
  }
  .alert-badge {
    padding: 0.15rem 0.6rem;
    border-radius: 3px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .alert-badge.critical {
    background: var(--theme-danger-bg);
    color: var(--theme-danger-fg);
    border: 1px solid var(--theme-danger-border);
  }
  .alert-badge.warning {
    background: var(--theme-warning-bg);
    color: var(--theme-warning-fg);
    border: 1px solid var(--theme-warning-border);
  }
  .toggle-icon {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    margin-left: auto;
  }
  .alert-detail {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--theme-line);
    font-size: 0.85rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .alert-link-btn {
    color: var(--theme-info);
    text-decoration: none;
    font-weight: 500;
  }
  .alert-link-btn:hover {
    text-decoration: underline;
  }
  .all-clear {
    color: var(--theme-success);
    font-weight: 600;
    font-size: 0.9rem;
  }
  .check-icon {
    color: var(--theme-success);
    font-weight: bold;
  }
</style>
