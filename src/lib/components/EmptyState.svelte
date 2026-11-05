<script lang="ts">
  interface Props {
    /** Title of the empty state. */
    title: string;
    /** Description / subtitle. */
    description?: string;
    /** Label for the action button. If omitted, no button is shown. */
    actionLabel?: string;
    /** Called when the action button is clicked. */
    onAction?: () => void;
    /** Optional icon override (emoji character, default: 📄). */
    icon?: string;
  }

  let { title, description = '', actionLabel = '', onAction = undefined, icon = '📄' }: Props = $props();
</script>

<div class="empty-state">
  <div class="empty-icon">{icon}</div>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if actionLabel && onAction}
    <button class="action-btn" onclick={onAction}>{actionLabel}</button>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 48px 24px;
    border: 2px dashed var(--theme-line);
    border-radius: 8px;
    background: color-mix(in srgb, var(--theme-elevated) 20%, transparent);
  }

  .empty-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
    opacity: 0.6;
  }

  .empty-title {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    font-size: 1rem;
    font-weight: 600;
    margin: 0 0 6px 0;
  }

  .empty-desc {
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    font-size: 0.85rem;
    margin: 0 0 16px 0;
    max-width: 320px;
    line-height: 1.4;
  }

  .action-btn {
    padding: 8px 20px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .action-btn:hover { background: #1d4ed8; }
</style>
