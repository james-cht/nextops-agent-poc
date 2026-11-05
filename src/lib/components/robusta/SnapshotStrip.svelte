<script lang="ts">
  import {
    stripRobustaSnapshotForPage,
    type RobustaClusterSnapshot,
  } from '$lib/robusta-cluster-snapshot';
  import {
    ROBUSTA_AUTOSCALE_KIND,
    type RobustaHistoryKindFilter,
  } from '$lib/robusta-history';

  let {
    snapshot,
    kindFilter = null,
    onKindClick,
    onClearFilter,
  }: {
    snapshot: RobustaClusterSnapshot;
    kindFilter?: RobustaHistoryKindFilter;
    onKindClick?: (kind: string) => void;
    onClearFilter?: () => void;
  } = $props();

  const strip = $derived(stripRobustaSnapshotForPage(snapshot));
  const filterActive = $derived(kindFilter != null);
  let hotOpen = $state(false);

  function chipCount(kind: string, allCount: number): number {
    if (
      kind === ROBUSTA_AUTOSCALE_KIND &&
      kindFilter?.kind === ROBUSTA_AUTOSCALE_KIND &&
      kindFilter.cpuSuccess
    ) {
      return strip.autoscaleSuccessCount;
    }
    return allCount;
  }

  function chipSelected(kind: string): boolean {
    return kindFilter?.kind === kind;
  }

  function onWindowClick(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest('.hot-wrap')) hotOpen = false;
  }
</script>

<svelte:window onclick={onWindowClick} />

<section class="strip" aria-label="Cluster Operations Snapshot">
  <div class="mix">
    {#if strip.mix.length === 0}
      <span class="muted">此時間窗沒有事件</span>
    {:else}
      {#each strip.mix as row}
        <button
          type="button"
          class="chip"
          class:action={row.isAction}
          class:selected={chipSelected(row.kind)}
          onclick={() => onKindClick?.(row.kind)}
        >
          <span class="kind">{row.kind}</span>
          {#if row.kind === ROBUSTA_AUTOSCALE_KIND && chipSelected(row.kind)}
            <em>{kindFilter?.cpuSuccess ? '成功' : '全部'}</em>
          {:else if row.isAction}
            <em>動作</em>
          {/if}
          <span class="count">{chipCount(row.kind, row.count)}</span>
        </button>
      {/each}
    {/if}

    <div class="strip-end">
      {#if onClearFilter && filterActive && kindFilter?.kind === ROBUSTA_AUTOSCALE_KIND}
        <button type="button" class="meta meta-btn" onclick={onClearFilter} title="清除篩選，顯示整段時間窗">
          {strip.total} 筆 · {strip.windowHours} 小時
        </button>
      {:else}
        <span class="meta">{strip.total} 筆 · {strip.windowHours} 小時</span>
      {/if}

      {#if strip.topWorkloads.length > 0}
        <div class="hot-wrap" class:is-open={hotOpen}>
          <button
            type="button"
            class="hot-btn"
            aria-expanded={hotOpen}
            aria-describedby="robusta-hotspots"
            title="熱點工作負載"
            onclick={() => (hotOpen = !hotOpen)}
          >
            熱點 {strip.topWorkloads.length}
          </button>
          <ul id="robusta-hotspots" class="workloads" role="tooltip">
            {#each strip.topWorkloads as row}
              <li>
                <span class="wk">{row.namespace}/{row.workloadKey}</span>
                <span class="count">{row.count}</span>
                <span class="kinds">{row.kinds.join(', ')}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    flex-shrink: 0;
  }
  .mix {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .strip-end {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .meta,
  .muted {
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
    font-size: 0.75rem;
  }
  .meta-btn {
    border: 0;
    background: transparent;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .chip,
  .hot-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    min-height: 1.5rem;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 12%, transparent);
    background: var(--theme-inset, transparent);
    color: inherit;
    cursor: pointer;
  }
  .chip.action {
    border-color: color-mix(in srgb, var(--theme-info) 40%, transparent);
  }
  .chip.selected {
    border-color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    background: color-mix(in srgb, var(--theme-fg) 8%, transparent);
  }
  .chip .kind {
    font-variant-numeric: tabular-nums;
  }
  .chip .count,
  .workloads .count {
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--theme-fg) 70%, transparent);
  }
  .chip em {
    font-style: normal;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--theme-info);
  }
  .hot-wrap {
    position: relative;
  }
  .workloads {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 25;
    margin: 0;
    padding: 8px 10px;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 16rem;
    max-width: min(28rem, 80vw);
    font-size: 0.75rem;
    border: 1px solid var(--theme-line, color-mix(in srgb, var(--theme-fg) 12%, transparent));
    border-radius: 8px;
    background: var(--theme-elevated, var(--theme-table));
    box-shadow: 0 8px 24px color-mix(in srgb, #000 18%, transparent);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  .hot-wrap:hover .workloads,
  .hot-wrap:focus-within .workloads,
  .hot-wrap.is-open .workloads {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
  .workloads li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: color-mix(in srgb, var(--theme-fg) 80%, transparent);
  }
  .wk {
    font-weight: 600;
  }
  .kinds {
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
  }
</style>
