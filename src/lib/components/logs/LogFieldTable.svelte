<script lang="ts">
  import type { DocumentFilter } from '$lib/log-document-filter';
  import {
    formatFieldTableForCopy,
    isMessageFieldPath,
  } from '$lib/log-content-copy';
  import CopyIconButton from './CopyIconButton.svelte';

  let {
    fields = [] as { path: string; value: string | number | boolean | null }[],
    onToggleFilter,
  }: {
    fields?: { path: string; value: string | number | boolean | null }[];
    onToggleFilter?: (filter: DocumentFilter) => void;
  } = $props();

  const copyAllText = $derived(formatFieldTableForCopy(fields));
</script>

<div class="field-table">
  <div class="toolbar">
    <span class="toolbar-label">欄位表</span>
    <CopyIconButton text={copyAllText} label="複製欄位表" />
  </div>
  {#each fields as row}
    <div class="field-row" class:message-row={isMessageFieldPath(row.path)}>
      <span class="path">{row.path}</span>
      <div class="value-cell">
        {#if row.value !== null && typeof row.value !== 'object'}
          <button
            type="button"
            class="value"
            title="Toggle Document Filter"
            onclick={() =>
              onToggleFilter?.({
                path: row.path,
                value: row.value as string | number | boolean,
              })}
          >
            {String(row.value)}
          </button>
        {:else}
          <span class="value muted">null</span>
        {/if}
        {#if isMessageFieldPath(row.path) && row.value != null}
          <CopyIconButton text={String(row.value)} label="複製訊息欄位" />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .field-table {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    max-height: 280px;
    overflow: auto;
    border-top: 1px solid var(--theme-line);
    background: var(--theme-elevated);
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 10px;
    position: sticky;
    top: 0;
    background: var(--theme-elevated);
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
    z-index: 1;
  }
  .toolbar-label {
    font-size: 0.6875rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .field-row {
    display: grid;
    grid-template-columns: minmax(140px, 32%) 1fr;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
  }
  .path {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    word-break: break-all;
  }
  .value-cell {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }
  .value {
    flex: 1;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--theme-fg);
    cursor: pointer;
    padding: 0;
    font: inherit;
    word-break: break-all;
  }
  .value:hover {
    color: var(--theme-info, #38bdf8);
    text-decoration: underline;
  }
  .muted {
    opacity: 0.5;
  }
</style>
