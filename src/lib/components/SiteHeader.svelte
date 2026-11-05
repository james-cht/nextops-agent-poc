<script lang="ts">
  import { page } from '$app/stores';
  import { publicHref } from '$lib/kit-public-href';

  let {
    siteId,
    clusterTag,
    online,
    total,
  }: {
    siteId: string;
    clusterTag?: string;
    online?: number;
    total?: number;
  } = $props();

  function pctOnline(): number {
    if (total && total > 0) return Math.round((online ?? 0) / total * 100);
    return 0;
  }
</script>

<svelte:head>
  <title>{siteId} — NextOps</title>
</svelte:head>

<div class="site-header">
  <div>
    <h1>{siteId}</h1>
    {#if clusterTag}
      <p class="cluster-tag">{clusterTag}</p>
    {/if}
  </div>
  <div class="header-actions">
    {#if online !== undefined && total !== undefined}
      <div class="status-badge-set">
        <span class="status-badge nodes-badge">
          {online} / {total} 節點在線 · {pctOnline()}%
        </span>
      </div>
    {/if}
    <a href={publicHref(`/ai?siteId=${encodeURIComponent(siteId)}`)} class="assist-btn">
      運維助手診斷
    </a>
    <a href={publicHref(`/logs?site=${encodeURIComponent(siteId)}`)} class="logging-btn">
      智能日誌流
    </a>
  </div>
</div>

<style>
  .site-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }
  .site-header h1 {
    margin: 0 0 0.25rem 0;
    font-size: 1.5rem;
    color: var(--theme-fg);
  }
  .cluster-tag {
    font-size: 0.85rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    margin: 0;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .status-badge-set {
    display: flex;
    gap: 0.5rem;
  }
  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
  }
  .nodes-badge {
    background: var(--theme-success-bg);
    color: var(--theme-success);
    border: 1px solid var(--theme-success-border);
  }
  .assist-btn,
  .logging-btn {
    padding: 0.4rem 0.8rem;
    color: #fff;
    text-decoration: none;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
    transition: background 0.2s;
  }
  .assist-btn {
    background: #0d9488;
  }
  .assist-btn:hover {
    background: #0f766e;
  }
  .logging-btn {
    background: #2563eb;
  }
  .logging-btn:hover {
    background: #1d4ed8;
  }
</style>
