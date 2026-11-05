<script lang="ts">
  import { ErrorCode } from '$lib/errors';

  interface Props {
    /** Error message to display. */
    message: string;
    /** Optional error code for a small badge. */
    code?: string;
    /** Called when the retry button is clicked. If omitted, no retry button is shown. */
    onRetry?: () => void;
    /** Called when the dismiss button is clicked. If omitted, no dismiss button is shown. */
    onDismiss?: () => void;
    /** If true, renders a compact inline version (for embedded contexts). */
    compact?: boolean;
  }

  let { message, code = '', onRetry = undefined, onDismiss = undefined, compact = false }: Props = $props();

  const codeColors: Record<string, string> = {
    [ErrorCode.NOT_FOUND]: '#f59e0b',
    [ErrorCode.BAD_REQUEST]: '#f97316',
    [ErrorCode.UNAUTHORIZED]: '#ef4444',
    [ErrorCode.UPSTREAM_ERROR]: '#dc2626',
    [ErrorCode.RATE_LIMITED]: '#f59e0b',
    [ErrorCode.INTERNAL_ERROR]: '#ef4444',
    [ErrorCode.TIMEOUT]: '#a855f7',
  };

  let badgeColor = $derived(code ? (codeColors[code] ?? '#64748b') : '');
</script>

{#if compact}
  <div class="error-compact" class:with-dismiss={onDismiss !== undefined}>
    <span class="error-icon">&#9888;</span>
    <span class="error-msg">{message}</span>
    {#if onRetry}
      <button class="retry-link" onclick={onRetry}>Retry</button>
    {/if}
    {#if onDismiss}
      <button class="dismiss-btn" onclick={onDismiss} aria-label="Dismiss">&times;</button>
    {/if}
  </div>
{:else}
  <div class="error-card" class:with-dismiss={onDismiss !== undefined}>
    <div class="error-header">
      <span class="error-icon">&#9888;</span>
      <span class="error-title">Error</span>
      {#if code}
        <span class="error-badge" style="background: {badgeColor}40; color: {badgeColor}; border-color: {badgeColor}60;">
          {code}
        </span>
      {/if}
      {#if onDismiss}
        <button class="dismiss-btn" onclick={onDismiss} aria-label="Dismiss">&times;</button>
      {/if}
    </div>
    <p class="error-msg">{message}</p>
    {#if onRetry}
      <button class="retry-btn" onclick={onRetry}>&#x21bb; Retry</button>
    {/if}
  </div>
{/if}

<style>
  /* ── Error Card (default / full) ── */
  .error-card {
    border: 1px solid var(--theme-danger-border);
    border-radius: 8px;
    padding: 16px;
    background: var(--theme-danger-bg);
    margin-bottom: 16px;
  }
  .error-card.with-dismiss {
    padding-right: 12px;
  }

  .error-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .error-icon {
    color: var(--theme-danger);
    font-size: 1rem;
    flex-shrink: 0;
  }

  .error-title {
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--theme-danger-fg);
  }

  .error-badge {
    display: inline-block;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .error-msg {
    color: var(--theme-danger-fg);
    font-size: 0.85rem;
    margin: 0;
    line-height: 1.4;
  }

  .retry-btn {
    margin-top: 10px;
    padding: 6px 16px;
    background: var(--theme-danger);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
    transition: background 0.15s;
  }
  .retry-btn:hover { background: color-mix(in srgb, var(--theme-danger) 85%, black); }

  .dismiss-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .dismiss-btn:hover { color: var(--theme-fg); }

  /* ── Error Compact (inline / banner style) ── */
  .error-compact {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--theme-danger-bg);
    border: 1px solid var(--theme-danger-border);
    border-radius: 6px;
    font-size: 0.82rem;
  }
  .error-compact .error-icon { font-size: 0.9rem; }
  .error-compact .error-msg { flex: 1; }

  .retry-link {
    background: none;
    border: 1px solid var(--theme-danger);
    color: var(--theme-danger-fg);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }
  .retry-link:hover { background: var(--theme-danger-bg); }
</style>
