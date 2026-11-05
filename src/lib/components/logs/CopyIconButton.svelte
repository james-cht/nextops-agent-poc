<script lang="ts">
  import { copyTextToClipboard } from '$lib/log-content-copy';

  let {
    text = '',
    label = '複製',
    class: className = '',
  }: {
    text?: string;
    label?: string;
    class?: string;
  } = $props();

  let status = $state<'idle' | 'ok' | 'err'>('idle');
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  async function onCopy(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    clearTimeout(resetTimer);
    const ok = await copyTextToClipboard(text);
    status = ok ? 'ok' : 'err';
    resetTimer = setTimeout(() => (status = 'idle'), 1200);
  }
</script>

<button
  type="button"
  class="copy-btn {className}"
  class:ok={status === 'ok'}
  class:err={status === 'err'}
  title={status === 'ok' ? '已複製' : status === 'err' ? '複製失敗' : label}
  aria-label={label}
  onclick={onCopy}
>
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2" />
    <path
      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
</button>

<style>
  .copy-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    padding: 0;
    border: 1px solid var(--theme-line);
    border-radius: 4px;
    background: var(--theme-elevated, transparent);
    color: color-mix(in srgb, var(--theme-fg) 70%, transparent);
    cursor: pointer;
    flex-shrink: 0;
  }
  .copy-btn:hover {
    color: var(--theme-fg);
    border-color: color-mix(in srgb, var(--theme-fg) 35%, transparent);
  }
  .copy-btn.ok {
    color: var(--theme-success, #34d399);
    border-color: var(--theme-success-border, #34d399);
  }
  .copy-btn.err {
    color: var(--theme-danger, #f87171);
  }
</style>
