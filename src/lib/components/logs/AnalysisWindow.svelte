<script lang="ts">
  import DiagnosisAnswerView from '$lib/components/ai/DiagnosisAnswerView.svelte';
  import {
    blockedNoticeText,
    loadFailedNoticeText,
    truncationNoticeText,
    type ChatImageNotice,
  } from '$lib/assistant-chat-view';
  import {
    applyAnalysisWindowMove,
    applyAnalysisWindowResize,
    createAnalysisWindowLayout,
    type AnalysisWindowLayout,
  } from '$lib/analysis-window-layout';

  let {
    open = false,
    layout = createAnalysisWindowLayout(1280, 720),
    streaming = false,
    error = '',
    answer = '',
    suggestions = [] as string[],
    images = [] as Array<{ url: string }>,
    notices = [] as ChatImageNotice[],
    truncated = false,
    selectedCount = 0,
    onClose,
    onLayoutChange,
    onSuggestion,
    onImageLoadFailed,
  }: {
    open?: boolean;
    layout?: AnalysisWindowLayout;
    streaming?: boolean;
    error?: string;
    answer?: string;
    suggestions?: string[];
    images?: Array<{ url: string }>;
    notices?: ChatImageNotice[];
    truncated?: boolean;
    selectedCount?: number;
    onClose?: () => void;
    onLayoutChange?: (next: AnalysisWindowLayout) => void;
    onSuggestion?: (question: string) => void;
    onImageLoadFailed?: (url: string) => void;
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
      : `left:${layout.x}px;top:${layout.y}px;width:${layout.mode === 'minimized' ? Math.min(layout.width, 320) : layout.width}px;${layout.mode === 'floating' ? `height:${layout.height}px;` : ''}`,
  );
</script>

{#if open}
  <aside
    class="analysis-window"
    class:minimized={layout.mode === 'minimized'}
    class:maximized={layout.mode === 'maximized'}
    style={floatingStyle}
    aria-label="日誌分析視窗"
  >
    <header
      class="aw-header"
      onpointerdown={onHeaderPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    >
      <div class="aw-title">
        <strong>日誌分析</strong>
        {#if selectedCount > 0}
          <span class="aw-meta">{selectedCount} 筆</span>
        {/if}
        {#if streaming}
          <span class="aw-live">分析中…</span>
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
        {/if}
        {#if answer}
          <DiagnosisAnswerView text={answer} />
        {:else if streaming}
          <p class="aw-muted">正在產生 Diagnosis Answer…</p>
        {:else if !error}
          <p class="aw-muted">尚無分析結果</p>
        {/if}

        {#if images.length}
          <div class="aw-images">
            {#each images as img}
              <img src={img.url} alt="" onerror={() => onImageLoadFailed?.(img.url)} />
            {/each}
          </div>
        {/if}
        {#if truncated}
          <p class="aw-notice">{truncationNoticeText()}</p>
        {/if}
        {#each notices as n}
          <p class="aw-notice">
            {n.kind === 'blocked' ? blockedNoticeText(n.host) : loadFailedNoticeText(n.host)}
          </p>
        {/each}

        {#if suggestions.length && !streaming}
          <div class="aw-suggestions">
            <h4>建議提問</h4>
            <div class="chips">
              {#each suggestions as q}
                <button type="button" class="chip" onclick={() => onSuggestion?.(q)}>{q}</button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      {#if layout.mode === 'floating'}
        <button
          type="button"
          class="aw-resize"
          aria-label="調整分析視窗大小"
          onpointerdown={onResizePointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
        ></button>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  .analysis-window {
    position: fixed;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--theme-elevated);
    border: 1px solid var(--theme-line);
    border-radius: 12px;
    box-shadow: 0 12px 40px color-mix(in srgb, #000 35%, transparent);
    color: var(--theme-fg);
  }
  .analysis-window.maximized {
    left: 12px !important;
    right: 12px;
    top: 68px !important;
    bottom: 12px;
    width: auto !important;
    height: auto !important;
  }
  .analysis-window.minimized {
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
  .aw-images {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }
  .aw-images img {
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid var(--theme-line);
  }
  .aw-notice {
    font-size: 0.8125rem;
    color: var(--theme-muted-strong);
    margin: 6px 0 0;
  }
  .aw-suggestions {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-line);
  }
  .aw-suggestions h4 {
    margin: 0 0 8px;
    font-size: 0.78rem;
    font-weight: 700;
  }
  .chips {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chip {
    text-align: left;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--theme-line);
    background: var(--theme-inset);
    color: var(--theme-fg);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--theme-info);
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
