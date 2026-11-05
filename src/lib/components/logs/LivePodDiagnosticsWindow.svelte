<script lang="ts">
  import {
    applyAnalysisWindowMove,
    applyAnalysisWindowResize,
    createAnalysisWindowLayout,
    type AnalysisWindowLayout,
  } from '$lib/analysis-window-layout';
  import {
    livePodDiagnosticsPhaseLabel,
    livePodDiagnosticsWaitingCopy,
    omitLivePodDiagnosticsSecret,
    readLivePodDiagnosticsRow,
    type LivePodDiagnosticsRowPhase,
  } from '$lib/live-pod-diagnostics';

  let {
    open = false,
    layout = createAnalysisWindowLayout(1280, 720),
    phase = 'pending' as LivePodDiagnosticsRowPhase,
    error = '',
    namespace = '',
    pod = '',
    taskId = '',
    row = null as Record<string, unknown> | null,
    onClose,
    onLayoutChange,
  }: {
    open?: boolean;
    layout?: AnalysisWindowLayout;
    phase?: LivePodDiagnosticsRowPhase;
    error?: string;
    namespace?: string;
    pod?: string;
    taskId?: string;
    row?: Record<string, unknown> | null;
    onClose?: () => void;
    onLayoutChange?: (next: AnalysisWindowLayout) => void;
  } = $props();

  let drag: { kind: 'move' | 'resize'; ox: number; oy: number } | null = null;

  function viewport() {
    return {
      w: typeof window === 'undefined' ? 1280 : window.innerWidth,
      h: typeof window === 'undefined' ? 720 : window.innerHeight,
    };
  }

  function onHeaderPointerDown(e: PointerEvent) {
    if (layout.mode !== 'floating') return;
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    e.preventDefault();
    drag = { kind: 'move', ox: e.clientX - layout.x, oy: e.clientY - layout.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: PointerEvent) {
    if (layout.mode !== 'floating') return;
    e.preventDefault();
    e.stopPropagation();
    drag = { kind: 'resize', ox: e.clientX - layout.width, oy: e.clientY - layout.height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const { w, h } = viewport();
    if (drag.kind === 'move') {
      onLayoutChange?.(applyAnalysisWindowMove(layout, e.clientX - drag.ox, e.clientY - drag.oy, w, h));
    } else {
      onLayoutChange?.(
        applyAnalysisWindowResize(layout, e.clientX - drag.ox, e.clientY - drag.oy, w, h),
      );
    }
  }

  function onPointerUp() {
    drag = null;
  }

  const floatingStyle = $derived(
    layout.mode === 'maximized'
      ? ''
      : `left:${layout.x}px;top:${layout.y}px;width:${layout.mode === 'minimized' ? Math.min(layout.width, 360) : layout.width}px;${layout.mode === 'floating' ? `height:${layout.height}px;` : ''}`,
  );

  const shownRow = $derived(omitLivePodDiagnosticsSecret(row));
  const reading = $derived(readLivePodDiagnosticsRow(shownRow));
  const bodyText = $derived(shownRow ? JSON.stringify(shownRow, null, 2) : '');
  const phaseLabel = $derived(livePodDiagnosticsPhaseLabel(row ? 'success' : phase));
  const waitingCopy = $derived(error ? '' : livePodDiagnosticsWaitingCopy(phase, taskId));
</script>

{#if open}
  <aside
    class="lpd-window"
    class:minimized={layout.mode === 'minimized'}
    class:maximized={layout.mode === 'maximized'}
    style={floatingStyle}
    aria-label="應用即時狀態分析"
  >
    <header
      class="aw-header"
      onpointerdown={onHeaderPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    >
      <div class="aw-title">
        <strong>應用即時狀態分析</strong>
        {#if pod}
          <span class="aw-meta">{namespace}/{pod}</span>
        {/if}
        {#if phaseLabel}
          <span class="aw-live">{phaseLabel}</span>
        {/if}
      </div>
      <div class="aw-actions">
        {#if layout.mode === 'minimized'}
          <button type="button" onclick={() => onLayoutChange?.({ ...layout, mode: 'floating' })} title="還原">□</button>
        {:else if layout.mode === 'maximized'}
          <button type="button" onclick={() => onLayoutChange?.({ ...layout, mode: 'floating' })} title="還原">❐</button>
        {:else}
          <button type="button" onclick={() => onLayoutChange?.({ ...layout, mode: 'minimized' })} title="最小化">—</button>
          <button type="button" onclick={() => onLayoutChange?.({ ...layout, mode: 'maximized' })} title="放大">□</button>
        {/if}
        <button type="button" onclick={() => onClose?.()} title="關閉">×</button>
      </div>
    </header>

    {#if layout.mode !== 'minimized'}
      <div class="aw-body">
        {#if error}
          <p class="aw-error">{error}</p>
        {:else if waitingCopy}
          <p class="aw-muted">{waitingCopy}</p>
        {:else if phase === 'failure'}
          <p class="aw-error">這次 Live Pod Diagnostics Task 失敗。</p>
        {/if}
        {#if reading}
          <div class="lpd-reading">
            {#if reading.conclusion || reading.healthScore}
              <section>
                {#if reading.conclusion}
                  <p class="lpd-kicker">診斷結論</p>
                  <p class="lpd-conclusion">{reading.conclusion}</p>
                {/if}
                {#if reading.healthScore}
                  <p class="lpd-score"><span>健康分數</span> {reading.healthScore}</p>
                {/if}
              </section>
            {/if}
            {#if reading.diagnosis}
              <section>
                <p class="lpd-kicker">AI 診斷</p>
                <p class="lpd-diagnosis">{reading.diagnosis}</p>
              </section>
            {/if}
            {#if reading.podUrl}
              <p class="lpd-link-row">
                <a href={reading.podUrl} target="_blank" rel="noopener noreferrer">移至服務</a>
              </p>
            {/if}
            {#if reading.resources.length}
              <section>
                <p class="lpd-kicker">容器資源</p>
                <dl>
                  {#each reading.resources as field (field.label)}
                    <div>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/if}
            {#if reading.node.length}
              <section>
                <p class="lpd-kicker">節點</p>
                <dl>
                  {#each reading.node as field (field.label)}
                    <div>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/if}
            {#if reading.risks.length}
              <section>
                <p class="lpd-kicker">重啟與風險</p>
                {#each reading.risks as field (field.label)}
                  <p class="lpd-field-label">{field.label}</p>
                  {#if field.values.length > 1 || field.label === '風險因素'}
                    <ul>
                      {#each field.values as item, index (index)}
                        <li>{item}</li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="lpd-field-value">{field.values[0]}</p>
                  {/if}
                {/each}
              </section>
            {/if}
            {#if reading.identity.length}
              <section>
                <p class="lpd-kicker">識別</p>
                <dl>
                  {#each reading.identity as field (field.label)}
                    <div>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/if}
          </div>
        {/if}
        {#if bodyText}
          <details class="lpd-raw">
            <summary>原始 JSON</summary>
            <pre class="aw-json">{bodyText}</pre>
          </details>
        {/if}
      </div>
      {#if layout.mode === 'floating'}
        <button
          type="button"
          class="aw-resize"
          aria-label="調整應用即時狀態分析視窗大小"
          onpointerdown={onResizePointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
        ></button>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .lpd-window {
    position: fixed;
    z-index: 41;
    display: flex;
    flex-direction: column;
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    border-radius: 12px;
    box-shadow: 0 12px 40px color-mix(in srgb, #000 35%, transparent);
    color: var(--theme-fg);
  }
  .lpd-window.maximized {
    left: 12px !important;
    right: 12px;
    top: 68px !important;
    bottom: 12px;
    width: auto !important;
    height: auto !important;
  }
  .lpd-window.minimized {
    height: auto;
  }
  .aw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--theme-line);
    flex-shrink: 0;
    cursor: grab;
    touch-action: none;
  }
  .aw-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 0.85rem;
  }
  .aw-meta,
  .aw-live {
    font-size: 0.75rem;
    color: var(--theme-muted);
  }
  .aw-live {
    color: var(--theme-info);
  }
  .aw-actions {
    display: flex;
    gap: 4px;
  }
  .aw-actions button {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--theme-line);
    background: var(--theme-inset);
    color: var(--theme-fg);
    cursor: pointer;
    font-size: 0.85rem;
    line-height: 1;
  }
  .aw-body {
    padding: 12px 14px 16px;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .aw-muted {
    font-size: 0.875rem;
    color: var(--theme-muted);
    margin: 0;
  }
  .aw-error {
    color: var(--theme-danger, #e35);
    font-size: 0.85rem;
    margin: 0 0 10px;
  }
  .lpd-reading {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lpd-reading section {
    margin: 0;
  }
  .lpd-kicker,
  .lpd-field-label {
    margin: 0 0 4px;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--theme-muted);
  }
  .lpd-conclusion {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .lpd-score,
  .lpd-diagnosis,
  .lpd-field-value {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .lpd-score span {
    color: var(--theme-muted);
    margin-right: 6px;
  }
  .lpd-link-row {
    margin: 0;
  }
  .lpd-link-row a {
    color: var(--theme-info);
    font-size: 0.85rem;
  }
  .lpd-reading dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  .lpd-reading dl div {
    display: contents;
  }
  .lpd-reading dt {
    color: var(--theme-muted);
    font-size: 0.8rem;
  }
  .lpd-reading dd {
    margin: 0;
    font-size: 0.85rem;
    word-break: break-word;
  }
  .lpd-reading ul {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.85rem;
    line-height: 1.45;
  }
  .lpd-raw {
    margin-top: 14px;
  }
  .lpd-raw summary {
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--theme-muted);
  }
  .aw-json {
    margin: 10px 0 0;
    padding: 10px;
    font-size: 0.75rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--theme-inset);
    border-radius: 8px;
    border: 1px solid var(--theme-line);
  }
  .aw-resize {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 14px;
    height: 14px;
    padding: 0;
    border: none;
    background:
      linear-gradient(135deg, transparent 50%, color-mix(in srgb, var(--theme-fg) 45%, transparent) 50%);
    cursor: nwse-resize;
    touch-action: none;
  }
</style>
