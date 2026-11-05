<script lang="ts">
  import { PROMQL_METADATA, getPromqlConfig, savePromqlConfig, resetPromqlConfig } from '$lib/promql-config';

  let {
    onSave,
    onClose
  }: {
    onSave: () => void;
    onClose?: () => void;
  } = $props();

  let queries = $state<Record<string, string>>(getPromqlConfig());
  let savedMessage = $state(false);

  function handleSave() {
    savePromqlConfig(queries);
    savedMessage = true;
    setTimeout(() => {
      savedMessage = false;
    }, 2000);
    onSave();
  }

  function handleReset() {
    if (confirm('確定要將所有 PromQL 查詢恢復為系統預設值嗎？')) {
      resetPromqlConfig();
      queries = getPromqlConfig();
      onSave();
    }
  }
</script>

<div class="promql-panel">
  <div class="panel-header">
    <div class="title-group">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      <div>
        <h3>PromQL 查詢配置 (Grafana 模式)</h3>
        <p class="subtitle">自訂 Prometheus 查詢語句以適應不同的指標收集器與標籤結構</p>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn-reset" onclick={handleReset}>恢復預設值</button>
      {#if onClose}
        <button class="btn-close" onclick={onClose}>
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div class="panel-body">
    {#each PROMQL_METADATA as item (item.key)}
      <div class="query-row">
        <div class="query-info">
          <span class="query-label">{item.label}</span>
          <span class="query-key">key: {item.key}</span>
          <p class="query-desc">{item.description}</p>
        </div>
        <div class="query-input-container">
          <textarea
            bind:value={queries[item.key]}
            placeholder="輸入 PromQL 查詢語句..."
            rows="2"
            class="query-textarea"
          ></textarea>
          {#if queries[item.key] === item.defaultQuery}
            <span class="badge-default">預設</span>
          {:else}
            <span class="badge-modified">已修改</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="panel-footer">
    <div class="footer-status">
      {#if savedMessage}
        <span class="status-success">✓ 配置已儲存，指標將立即重新載入</span>
      {/if}
    </div>
    <div class="footer-actions">
      {#if onClose}
        <button class="btn-cancel" onclick={onClose}>取消</button>
      {/if}
      <button class="btn-save" onclick={handleSave}>儲存並套用</button>
    </div>
  </div>
</div>

<style>
  .promql-panel {
    border: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    border-radius: 12px;
    background: var(--theme-card);
    margin-bottom: 1.5rem;
    overflow: hidden;
    box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 6%, transparent);
    background: color-mix(in srgb, var(--theme-fg) 1%, transparent);
  }
  .title-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .title-group h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--theme-fg);
  }
  .subtitle {
    margin: 0.15rem 0 0 0;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #06b6d4;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .btn-reset {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-reset:hover {
    border-color: color-mix(in srgb, var(--theme-fg) 30%, transparent);
    color: var(--theme-fg);
    background: color-mix(in srgb, var(--theme-fg) 3%, transparent);
  }
  .btn-close {
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }
  .btn-close:hover {
    color: var(--theme-fg);
    background: color-mix(in srgb, var(--theme-fg) 5%, transparent);
  }
  .panel-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .query-row {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 1.25rem;
    align-items: start;
    padding-bottom: 1rem;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-fg) 4%, transparent);
  }
  .query-row:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }
  .query-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .query-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-fg) 90%, transparent);
  }
  .query-key {
    font-family: monospace;
    font-size: 0.7rem;
    color: #06b6d4;
  }
  .query-desc {
    margin: 0.25rem 0 0 0;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    line-height: 1.3;
  }
  .query-input-container {
    position: relative;
    display: flex;
    align-items: start;
    width: 100%;
  }
  .query-textarea {
    width: 100%;
    background: var(--theme-input);
    border: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    border-radius: 8px;
    padding: 0.5rem 3.5rem 0.5rem 0.75rem;
    color: color-mix(in srgb, var(--theme-fg) 85%, transparent);
    font-family: monospace;
    font-size: 0.8rem;
    line-height: 1.4;
    outline: none;
    resize: vertical;
    transition: all 0.2s;
  }
  .query-textarea:focus {
    border-color: #06b6d4;
    box-shadow: 0 0 0 1px rgba(6, 182, 212, 0.2);
  }
  .badge-default {
    position: absolute;
    right: 0.75rem;
    top: 0.5rem;
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    background: color-mix(in srgb, var(--theme-fg) 5%, transparent);
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    border-radius: 4px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 5%, transparent);
  }
  .badge-modified {
    position: absolute;
    right: 0.75rem;
    top: 0.5rem;
    font-size: 0.65rem;
    padding: 0.1rem 0.4rem;
    background: var(--theme-warning-bg);
    color: var(--theme-warning);
    border-radius: 4px;
    border: 1px solid var(--theme-warning-border);
  }
  .panel-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid color-mix(in srgb, var(--theme-fg) 6%, transparent);
    background: color-mix(in srgb, var(--theme-fg) 1%, transparent);
  }
  .status-success {
    font-size: 0.8rem;
    color: var(--theme-success);
    font-weight: 500;
  }
  .footer-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
  }
  .btn-cancel {
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    padding: 0.4rem 1rem;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
  }
  .btn-cancel:hover {
    color: var(--theme-fg);
    background: color-mix(in srgb, var(--theme-fg) 3%, transparent);
  }
  .btn-save {
    background: #0891b2;
    border: none;
    color: #ffffff;
    padding: 0.4rem 1.25rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(8, 145, 178, 0.2);
  }
  .btn-save:hover {
    background: #06b6d4;
    box-shadow: 0 4px 6px rgba(6, 182, 212, 0.3);
  }
</style>
