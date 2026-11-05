<script lang="ts">
  let {
    entries = [],
    viewMode = 'table',
    expandedRow = null as string | null,
    onToggleRow,
  }: {
    entries: any[];
    viewMode?: string;
    expandedRow?: string | null;
    onToggleRow?: (id: string) => void;
  } = $props();

  function severityColor(lvl: string): string {
    switch ((lvl || '').toLowerCase()) {
      case 'error': return '#ef4444';
      case 'warn':
      case 'warning': return '#f59e0b';
      case 'info': return '#06b6d4';
      case 'debug': return '#64748b';
      default: return '#94a3b8';
    }
  }
</script>

<div class="log-table">
  {#each entries as entry}
    {#if viewMode === 'table'}
      <div class="log-row-wrapper">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          class="log-row table-row"
          role="button"
          tabindex="0"
          onclick={() => onToggleRow?.(entry['_id'])}
          onkeypress={(e) => { if (e.key === 'Enter') onToggleRow?.(entry['_id']); }}
        >
          <span class="expand-icon">{expandedRow === entry['_id'] ? '▼' : '▶'}</span>
          <span class="col ts">{entry['@timestamp']}</span>
          <span class="col lvl" style="color: {severityColor(entry.level)}">
            <span class="severity-badge" style="background: {severityColor(entry.level)}">
              {entry.level}
            </span>
          </span>
          <span class="col source">{entry.cluster_tag}</span>
          <span class="col region">{entry.service}</span>
          <span class="col msg">{entry.message}</span>
          {#if entry.trace_id}
            <span class="col trace">{entry.trace_id}</span>
          {/if}
        </div>
        {#if expandedRow === entry['_id']}
          <pre class="expanded-json">{JSON.stringify(entry, null, 2)}</pre>
        {/if}
      </div>
    {:else if viewMode === 'raw'}
      <div class="log-row raw-row">
        [{entry.level}] {entry['@timestamp']} [{entry.cluster_tag}@{entry.service}] {entry.message}
      </div>
    {:else if viewMode === 'json'}
      <pre class="log-row json-row">{JSON.stringify(entry, null, 2)}</pre>
    {/if}
  {/each}
</div>

<style>
  .log-table {
    font-family: 'Courier New', Courier, monospace;
  }

  .log-row { padding: 0.25rem 0; border-bottom: 1px solid var(--theme-line); }
  .log-row-wrapper { border-bottom: 1px solid var(--theme-line); }
  .log-row-wrapper .table-row { border-bottom: none; cursor: pointer; }
  .log-row-wrapper .table-row:hover { background: var(--theme-elevated); }

  .table-row {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    font-size: 0.78rem;
  }
  .expand-icon {
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    font-size: 0.65rem;
    width: 1rem;
    flex-shrink: 0;
  }

  .col { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .col.ts { color: color-mix(in srgb, var(--theme-fg) 40%, transparent); font-size: 0.75rem; min-width: 160px; }
  .col.lvl { min-width: 60px; flex-shrink: 0; }
  .col.source { color: color-mix(in srgb, var(--theme-fg) 55%, transparent); min-width: 80px; }
  .col.region { color: color-mix(in srgb, var(--theme-fg) 55%, transparent); min-width: 80px; display: none; }
  .col.msg { flex: 1; color: var(--theme-fg); min-width: 0; }
  .col.trace { color: color-mix(in srgb, var(--theme-fg) 40%, transparent); font-size: 0.72rem; min-width: 80px; }

  .severity-badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 999px;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .expanded-json {
    margin: 0;
    padding: 8px 16px;
    background: var(--theme-inset);
    font-size: 0.72rem;
    white-space: pre-wrap;
    overflow-x: auto;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }

  .raw-row {
    padding: 0.25rem 0.5rem;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--theme-fg) 90%, transparent);
    white-space: pre-wrap;
  }
  .json-row {
    margin: 0;
    background: var(--theme-inset);
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
</style>
