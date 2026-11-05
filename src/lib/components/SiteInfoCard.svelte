<script lang="ts">
  let {
    clusterTag,
    factoryCode = '',
    defaultLogMode = 'k8s',
    esIndices,
    prometheusMetrics,
  }: {
    clusterTag: string;
    factoryCode?: string;
    defaultLogMode?: 'k8s' | 'non_k8s';
    esIndices: Array<{ pattern: string; description: string; fields: string[]; hostType: string | string[] }>;
    prometheusMetrics: string[];
  } = $props();

  let esExpanded = $state(false);
</script>

<div class="info-card">
  <div class="info-row">
    <span class="info-key">叢集標籤</span>
    <span class="info-val">{clusterTag}</span>
  </div>
  <div class="info-row">
    <span class="info-key">Factory Code</span>
    <span class="info-val">{factoryCode || '—'}</span>
  </div>
  <div class="info-row">
    <span class="info-key">預設日誌模式</span>
    <span class="info-val">{defaultLogMode}</span>
  </div>
  <div class="info-row">
    <span class="info-key">Prometheus 指標</span>
    <span class="info-val">{prometheusMetrics.join(', ')}</span>
  </div>
  <div class="info-row info-row-es">
    <span class="info-key">ES 索引</span>
    <span class="info-val">
      <button class="es-toggle" onclick={() => (esExpanded = !esExpanded)}>
        {esIndices.length} 個索引配置
        <span class="toggle-caret">{esExpanded ? '▾' : '▸'}</span>
      </button>
    </span>
  </div>
  {#if esExpanded}
    <div class="es-detail">
      {#each esIndices as idx, i}
        <div class="es-item">
          <div class="es-header">
            <code class="es-pattern">{idx.pattern}</code>
            <span class="es-host-type">{Array.isArray(idx.hostType) ? idx.hostType.join(', ') : idx.hostType}</span>
          </div>
          <p class="es-desc">{idx.description}</p>
          <details class="es-fields">
            <summary class="es-fields-toggle">欄位 ({idx.fields.length})</summary>
            <ul class="es-field-list">
              {#each idx.fields as field}
                <li><code>{field}</code></li>
              {/each}
            </ul>
          </details>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#snippet skeleton()}
  <div class="info-card info-card-skeleton">
    <div class="skeleton-line" style="width: 60%"></div>
    <div class="skeleton-line" style="width: 80%"></div>
    <div class="skeleton-line" style="width: 45%"></div>
  </div>
{/snippet}

<style>
  .info-card {
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 1rem;
    background: var(--theme-elevated);
  }
  .info-row {
    display: flex;
    gap: 1rem;
    padding: 0.4rem 0;
  }
  .info-row + .info-row {
    border-top: 1px solid var(--theme-line);
  }
  .info-key {
    font-size: 0.85rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    min-width: 140px;
  }
  .info-val {
    font-size: 0.85rem;
    color: var(--theme-fg);
  }
  .es-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--theme-info);
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .es-toggle:hover {
    text-decoration: underline;
  }
  .toggle-caret {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .es-detail {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: var(--theme-inset);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .es-item {
    border-left: 2px solid var(--theme-line);
    padding-left: 0.75rem;
  }
  .es-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }
  .es-pattern {
    font-size: 0.8rem;
    color: var(--theme-info-fg);
    background: var(--theme-info-bg);
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    border: 1px solid var(--theme-info-border);
  }
  .es-host-type {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    text-transform: uppercase;
  }
  .es-desc {
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-fg) 90%, transparent);
    margin: 0 0 0.25rem 0;
  }
  .es-fields {
    font-size: 0.75rem;
  }
  .es-fields-toggle {
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    cursor: pointer;
  }
  .es-field-list {
    margin: 0.25rem 0 0 0;
    padding-left: 1rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    list-style: none;
  }
  .es-field-list li code {
    font-size: 0.7rem;
    background: var(--theme-elevated);
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    border: 1px solid var(--theme-line);
  }
  .info-card-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .skeleton-line {
    height: 0.85rem;
    background: linear-gradient(90deg, var(--theme-elevated) 25%, var(--theme-line) 50%, var(--theme-elevated) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
