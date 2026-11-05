<script lang="ts">
  import CopyIconButton from './CopyIconButton.svelte';
  import HighlightedLogText from './HighlightedLogText.svelte';

  let {
    open = false,
    text = '',
    keyword = '',
    categoryPatterns = [] as string[],
    onClose,
  }: {
    open?: boolean;
    text?: string;
    keyword?: string;
    categoryPatterns?: string[];
    onClose?: () => void;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="backdrop" role="presentation" onclick={() => onClose?.()} onkeydown={onKey}>
    <div
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-label="訊息放大"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKey}
    >
      <header class="hdr">
        <strong>訊息放大</strong>
        <div class="actions">
          <CopyIconButton text={text} label="複製完整訊息" />
          <button type="button" class="close" onclick={() => onClose?.()} aria-label="關閉">×</button>
        </div>
      </header>
      <div class="body">
        <HighlightedLogText {text} {keyword} {categoryPatterns} />
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in srgb, #000 45%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .panel {
    width: min(720px, 100%);
    max-height: min(80vh, 640px);
    display: flex;
    flex-direction: column;
    background: var(--theme-elevated, #111);
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    box-shadow: 0 12px 40px color-mix(in srgb, #000 35%, transparent);
  }
  .hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--theme-line);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .close {
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: transparent;
    color: var(--theme-fg);
    font-size: 1.25rem;
    cursor: pointer;
    line-height: 1;
  }
  .body {
    padding: 12px 14px;
    overflow: auto;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.8125rem;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
</style>
