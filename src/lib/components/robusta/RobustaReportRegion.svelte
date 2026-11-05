<script lang="ts">
  import DiagnosisAnswerView from '$lib/components/ai/DiagnosisAnswerView.svelte';
  import { splitDiagnosisAnswer } from '$lib/diagnosis-answer-view';
  import {
    blockedNoticeText,
    loadFailedNoticeText,
    truncationNoticeText,
    type ChatImageNotice,
  } from '$lib/assistant-chat-view';

  let {
    streaming = false,
    error = '',
    answer = '',
    suggestions = [] as string[],
    images = [] as Array<{ url: string }>,
    notices = [] as ChatImageNotice[],
    truncated = false,
    stale = false,
    canFollowUp = false,
    onSuggestion,
    onFollowUp,
    onImageLoadFailed,
  }: {
    streaming?: boolean;
    error?: string;
    answer?: string;
    suggestions?: string[];
    images?: Array<{ url: string }>;
    notices?: ChatImageNotice[];
    truncated?: boolean;
    stale?: boolean;
    canFollowUp?: boolean;
    onSuggestion?: (question: string) => void;
    onFollowUp?: (question: string) => void;
    onImageLoadFailed?: (url: string) => void;
  } = $props();

  let openAppendix = $state(false);
  let followUp = $state('');
  const split = $derived(splitDiagnosisAnswer(answer));

  $effect(() => {
    answer;
    openAppendix = false;
  });

  function submitFollowUp(event: SubmitEvent) {
    event.preventDefault();
    const q = followUp.trim();
    if (!q || !canFollowUp || streaming) return;
    onFollowUp?.(q);
    followUp = '';
  }
</script>

<section class="region" aria-label="調查建議報告">
  <div class="region-head">
    <strong>調查建議報告</strong>
    {#if streaming}
      <span class="live">產生中…</span>
    {/if}
  </div>
  {#if stale}
    <p class="stale">列表已更新，報告可能過時。可再次生成調查建議報告。</p>
  {/if}
  {#if error}
    <p class="err">{error}</p>
  {/if}
  <div class="scroll">
    {#if split.summary}
      <DiagnosisAnswerView text={split.summary} />
    {:else if streaming}
      <p class="muted">正在產生 Diagnosis Answer…</p>
    {:else if !error}
      <p class="muted">尚未產生報告。</p>
    {/if}
    {#if split.appendix !== null}
      <button
        type="button"
        class="appendix-toggle"
        aria-expanded={openAppendix}
        onclick={() => (openAppendix = !openAppendix)}
      >
        {openAppendix ? '收合詳細資料' : '顯示詳細資料'}
      </button>
      {#if openAppendix}
        <div class="appendix-body">
          {#if split.appendix}
            <DiagnosisAnswerView text={split.appendix} />
          {:else}
            <p class="muted">沒有額外詳細資料。</p>
          {/if}
        </div>
      {/if}
    {/if}
    {#if images.length}
      <div class="images">
        {#each images as img}
          <img src={img.url} alt="" onerror={() => onImageLoadFailed?.(img.url)} />
        {/each}
      </div>
    {/if}
    {#if truncated}
      <p class="notice">{truncationNoticeText()}</p>
    {/if}
    {#each notices as n}
      <p class="notice">
        {n.kind === 'blocked' ? blockedNoticeText(n.host) : loadFailedNoticeText(n.host)}
      </p>
    {/each}
    {#if suggestions.length && !streaming}
      <div class="suggestions">
        <h4>建議提問</h4>
        <div class="chips">
          {#each suggestions as q}
            <button type="button" class="chip" disabled={!canFollowUp} onclick={() => onSuggestion?.(q)}>
              {q}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  {#if canFollowUp}
    <form class="follow" onsubmit={submitFollowUp}>
      <input
        type="text"
        bind:value={followUp}
        placeholder="追問此報告"
        disabled={streaming}
        aria-label="追問調查建議報告"
      />
      <button type="submit" class="ghost" disabled={streaming || !followUp.trim()}>送出</button>
    </form>
  {/if}
</section>

<style>
  .region {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 140px;
    flex: 1 1 48%;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 8%, transparent);
    background: var(--theme-elevated, var(--theme-table));
    padding: 8px 10px 10px;
    min-width: 0;
  }
  .region-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
    font-size: var(--fs-small);
  }
  .live {
    color: var(--theme-info);
    font-size: 12px;
  }
  .stale,
  .err,
  .muted,
  .notice {
    margin: 0;
    font-size: var(--fs-small);
    line-height: 1.45;
  }
  .stale {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 12%, transparent);
    border-radius: 6px;
    padding: 6px 8px;
    flex-shrink: 0;
  }
  .err {
    color: var(--theme-danger, #e35);
  }
  .muted,
  .notice {
    color: color-mix(in srgb, var(--theme-fg) 50%, transparent);
  }
  .scroll {
    overflow: auto;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .appendix-toggle {
    align-self: flex-start;
    border: none;
    background: none;
    color: var(--theme-info);
    font-size: var(--fs-small);
    cursor: pointer;
    padding: 0;
  }
  .appendix-body {
    padding: 4px 0 8px;
  }
  .images {
    display: grid;
    gap: 8px;
  }
  .images img {
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid var(--theme-line);
  }
  .suggestions h4 {
    margin: 8px 0 6px;
    font-size: 12px;
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
    border: 1px solid color-mix(in srgb, var(--theme-fg) 12%, transparent);
    background: transparent;
    color: var(--theme-fg);
    font-size: var(--fs-small);
    cursor: pointer;
  }
  .chip:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .follow {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .follow input {
    flex: 1;
    min-width: 0;
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    background: var(--theme-input);
    color: var(--theme-fg);
    padding: 6px 8px;
    font-size: var(--fs-small);
  }
  .ghost {
    border-radius: 6px;
    border: 1px solid color-mix(in srgb, var(--theme-fg) 15%, transparent);
    background: transparent;
    color: var(--theme-fg);
    padding: 6px 10px;
    font-size: var(--fs-small);
    cursor: pointer;
  }
  .ghost:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
