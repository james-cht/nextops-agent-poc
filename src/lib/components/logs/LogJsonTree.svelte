<script lang="ts">
  import LogJsonTree from './LogJsonTree.svelte';
  import type { DocumentFilter } from '$lib/log-document-filter';

  let {
    value,
    path = '',
    depth = 0,
    onToggleFilter,
  }: {
    value: unknown;
    path?: string;
    depth?: number;
    onToggleFilter?: (filter: DocumentFilter) => void;
  } = $props();

  let open = $state(depth < 2);

  const isObj = $derived(value !== null && typeof value === 'object' && !Array.isArray(value));
  const isArr = $derived(Array.isArray(value));
  const isScalar = $derived(!isObj && !isArr);
</script>

{#if isScalar}
  <span class="leaf">
    {#if path}
      <span class="key">{path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : path}:</span>
    {/if}
    {#if typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'}
      <button
        type="button"
        class="scalar"
        onclick={() => onToggleFilter?.({ path, value })}
        disabled={!path}
      >
        {JSON.stringify(value)}
      </button>
    {:else}
      <span class="null">null</span>
    {/if}
  </span>
{:else}
  <div class="node" style="margin-left: {depth === 0 ? 0 : 12}px">
    <button type="button" class="toggle" onclick={() => (open = !open)}>
      {open ? '▼' : '▶'}
      <span class="key">
        {path
          ? path.includes('.')
            ? path.slice(path.lastIndexOf('.') + 1)
            : path
          : isArr
            ? 'array'
            : '_source'}
      </span>
      <span class="meta">{isArr ? `[${(value as unknown[]).length}]` : '{…}'}</span>
    </button>
    {#if open}
      {#if isArr}
        {#each value as item, i}
          <LogJsonTree
            value={item}
            path={path ? `${path}.${i}` : String(i)}
            depth={depth + 1}
            {onToggleFilter}
          />
        {/each}
      {:else}
        {#each Object.entries(value as Record<string, unknown>) as [k, v]}
          <LogJsonTree
            value={v}
            path={path ? `${path}.${k}` : k}
            depth={depth + 1}
            {onToggleFilter}
          />
        {/each}
      {/if}
    {/if}
  </div>
{/if}

<style>
  .node {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem;
  }
  .toggle {
    background: transparent;
    border: none;
    color: var(--theme-fg);
    cursor: pointer;
    padding: 2px 0;
    font: inherit;
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .key {
    color: color-mix(in srgb, var(--theme-fg) 60%, transparent);
  }
  .meta {
    opacity: 0.45;
  }
  .leaf {
    display: block;
    margin-left: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.72rem;
  }
  .scalar {
    background: transparent;
    border: none;
    color: var(--theme-success, #34d399);
    cursor: pointer;
    font: inherit;
    padding: 0;
  }
  .scalar:hover:not(:disabled) {
    text-decoration: underline;
  }
  .null {
    opacity: 0.4;
  }
</style>
