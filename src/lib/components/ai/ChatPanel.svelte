<script lang="ts">
  import { onMount } from 'svelte';
  import { createDifyStream } from '$lib/dify-client';
  import {
    applyAssistantImagesPayload,
    blockedNoticeText,
    loadFailedNoticeText,
    noticeForImageLoadFailure,
    truncationNoticeText,
    type ChatImageNotice,
    OPSGPT_CHAT_FOOTER,
  } from '$lib/assistant-chat-view';
  import DiagnosisAnswerView from './DiagnosisAnswerView.svelte';

  export type SendPromptOpts = { paint?: boolean };

  let {
    siteId = '',
    siteName = '',
    canStartTurn = true,
    onStreamingChange,
    onChatReady,
    onAssistantComplete,
    onTurnFailed,
  }: {
    siteId: string;
    siteName: string;
    canStartTurn?: boolean;
    onStreamingChange?: (streaming: boolean) => void;
    onChatReady?: (api: { sendPrompt: (text: string, opts?: SendPromptOpts) => void }) => void;
    onAssistantComplete?: (text: string) => void;
    onTurnFailed?: () => void;
  } = $props();

  type ChatMessage = {
    role: 'user' | 'assistant' | 'system';
    content: string;
    images?: Array<{ url: string }>;
    notices?: ChatImageNotice[];
    truncated?: boolean;
  };

  let messages = $state<ChatMessage[]>([]);
  let inputText = $state('');
  let connectionStatus = $state<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  let streamingAbort: { abort: () => void } | undefined;
  let messageArea: HTMLDivElement | undefined = $state(undefined);
  let lastSiteId = $state<string | undefined>(undefined);
  let conversationId = $state('');

  const opsgptTitle = 'OPSGPT 助手';
  const sparkleIcon = '\u2728';
  const connectedPrefix = '\u4ee3\u7406\u9023\u7dda\u6210\u529f\uff1a';
  const connectingText = '\u4ee3\u7406\u9023\u7dda\u4e2d...';
  const disconnectedText = '\u4ee3\u7406\u672a\u9023\u7dda';
  const errorStatusText = '\u9023\u7dda\u5931\u6557';
  const greeting =
    '\ud83d\udc4b \u4f60\u597d\uff01\u6211\u662f OPSGPT \u52a9\u624b\uff0c\u53ef\u4ee5\u5e6b\u52a9\u4f60\u9032\u884c\u6545\u969c\u6392\u9664\u548c\u6839\u56e0\u5206\u6790\u3002';
  const unboundHint =
    '\u5c1a\u672a\u7d81\u5b9a\u7ad9\u9ede\u3002\u53ef\u5148\u8a62\u554f\u4e00\u822c\u904b\u7dad\u554f\u984c\uff0c\u6216\u5728\u4e0a\u65b9\u9078\u64c7\u7ad9\u9ede\u5f8c\u518d\u67e5\u770b\u8cc7\u6e90\u5065\u5eb7\u3002';
  const inputPlaceholder = '\u8a62\u554f\u4efb\u4f55\u6392\u969c\u7d30\u7bc0\u6216\u4e0b\u9054\u7dad\u8b77\u6307\u4ee4...';
  const sendButtonText = '\u767c\u9001';
  const footerText = OPSGPT_CHAT_FOOTER;
  const contextSwitchNote = '\u5df2\u5207\u63db\u7ad9\u9ede\u4e0a\u4e0b\u6587';

  const suggestedChips = $derived.by(() => {
    if (!siteId) return [] as Array<{ label: string; prompt: string }>;
    const name = siteName || siteId;
    return [
      { label: '資源熱點', prompt: `列出「${name}」目前 CPU／記憶體／磁碟最高的節點與工作負載` },
      { label: '重啟風險', prompt: `檢查「${name}」近期 Pod／容器重啟情況與不穩定風險` },
    ];
  });

  const greetingHint = $derived(
    siteId
      ? `\u8a66\u8a66\u554f\uff1a\u300c\u5206\u6790${siteName || siteId}\u7684\u7576\u524d\u72c0\u614b\u300d\u6216\u9ede\u9078\u5efa\u8b70\u63d0\u793a`
      : unboundHint,
  );

  const statusLabel = $derived(
    siteId ? siteName || siteId : '\u672a\u7d81\u5b9a\u7ad9\u9ede',
  );

  function setStreaming(streaming: boolean) {
    onStreamingChange?.(streaming);
  }

  function handleImageLoadError(messageIndex: number, url: string) {
    const msgs = [...messages];
    const msg = msgs[messageIndex];
    if (!msg || msg.role !== 'assistant') return;
    msg.images = (msg.images ?? []).filter((img) => img.url !== url);
    msg.notices = [...(msg.notices ?? []), noticeForImageLoadFailure(url)];
    messages = msgs;
  }

  function sendPrompt(text: string, opts?: SendPromptOpts) {
    const trimmed = text.trim();
    if (!canStartTurn || !trimmed || connectionStatus === 'connecting') return;
    const paint = opts?.paint !== false;
    let hiddenContent = '';

    if (paint) {
      messages = [...messages, { role: 'user', content: trimmed }];
      messages = [...messages, { role: 'assistant', content: '' }];
    }
    setStreaming(true);

    streamingAbort = createDifyStream({
      query: trimmed,
      siteId,
      conversationId: conversationId || undefined,
      callbacks: {
        onStatusChange(status) {
          connectionStatus = status;
          if (status === 'connecting' || status === 'connected') setStreaming(true);
          if (status === 'disconnected' || status === 'error') setStreaming(false);
        },
        onMessage(chunk) {
          if (!paint) {
            hiddenContent += chunk;
            return;
          }
          const msgs = [...messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === 'assistant') last.content += chunk;
          messages = msgs;
        },
        onAssistantImages(payload) {
          if (!paint) {
            const view = applyAssistantImagesPayload(hiddenContent, payload);
            hiddenContent = view.content;
            return;
          }
          const msgs = [...messages];
          const last = msgs[msgs.length - 1];
          if (last?.role !== 'assistant') return;
          const view = applyAssistantImagesPayload(last.content, payload);
          last.content = view.content;
          last.images = view.images;
          last.notices = view.notices;
          last.truncated = view.truncated;
          messages = msgs;
        },
        onEnd(nextConversationId) {
          connectionStatus = 'disconnected';
          setStreaming(false);
          if (nextConversationId) conversationId = nextConversationId;
          const finalText = paint
            ? (messages[messages.length - 1]?.role === 'assistant' ? messages[messages.length - 1].content : '')
            : hiddenContent;
          if (finalText) {
            onAssistantComplete?.(finalText);
          } else {
            onTurnFailed?.();
          }
        },
        onError(error) {
          connectionStatus = 'error';
          setStreaming(false);
          if (paint) {
            messages = [...messages, { role: 'assistant', content: '\u26a0\ufe0f \u932f\u8aa4\uff1a' + error }];
          }
          onTurnFailed?.();
        },
      },
    });
  }

  function sendMessage() {
    const text = inputText.trim();
    if (!text) return;
    inputText = '';
    sendPrompt(text);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  $effect(() => {
    if (lastSiteId === undefined) {
      lastSiteId = siteId;
      return;
    }
    if (lastSiteId === siteId) return;
    const prev = lastSiteId;
    lastSiteId = siteId;
    conversationId = '';
    // Skip catalog/URL hydration: unbound → bound with an empty transcript
    if (messages.length === 0 && prev === '' && siteId) return;
    const label = siteId ? siteName || siteId : '\u672a\u7d81\u5b9a';
    messages = [...messages, { role: 'system', content: `${contextSwitchNote}\uff1a${label}` }];
  });

  $effect(() => {
    if (messages.length && messageArea) {
      requestAnimationFrame(() => {
        messageArea!.scrollTop = messageArea!.scrollHeight;
      });
    }
  });

  onMount(() => {
    onChatReady?.({ sendPrompt });
  });
</script>

<div class="chat-panel">
  <div class="chat-header">
    <span class="sparkle-icon">{sparkleIcon}</span>
    <h3>{opsgptTitle}</h3>
  </div>

  <div
    class="connection-status"
    class:connected={connectionStatus === 'connected'}
    class:connecting={connectionStatus === 'connecting'}
    class:error-state={connectionStatus === 'error'}
  >
    <span class="status-dot"></span>
    <span class="status-text">
      {#if connectionStatus === 'connected'}
        {connectedPrefix}{statusLabel}
      {:else if connectionStatus === 'connecting'}
        {connectingText}
      {:else if connectionStatus === 'error'}
        {errorStatusText}
      {:else}
        {disconnectedText}
        {#if siteId}
          · {statusLabel}
        {/if}
      {/if}
    </span>
  </div>

  <div class="message-area" bind:this={messageArea}>
    {#each messages as msg, msgIndex}
      <div
        class="message"
        class:user={msg.role === 'user'}
        class:assistant={msg.role === 'assistant'}
        class:system={msg.role === 'system'}
      >
        {#if msg.role === 'system'}
          <div class="system-note">{msg.content}</div>
        {:else}
          <div class="bubble">
            {#if msg.content}
              {#if msg.role === 'assistant'}
                <DiagnosisAnswerView text={msg.content} />
              {:else}
                <div class="bubble-text">{msg.content}</div>
              {/if}
            {:else if msg.role === 'assistant'}
              <span class="typing-indicator">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </span>
            {/if}

            {#if msg.role === 'assistant' && msg.images && msg.images.length > 0}
              <div class="assistant-images">
                {#each msg.images as img}
                  <img
                    class="assistant-image"
                    src={img.url}
                    alt="Assistant Image"
                    loading="lazy"
                    onerror={() => handleImageLoadError(msgIndex, img.url)}
                  />
                {/each}
              </div>
            {/if}

            {#if msg.role === 'assistant' && msg.notices && msg.notices.length > 0}
              <div class="image-notices">
                {#each msg.notices as notice}
                  <div class="image-notice">
                    {notice.kind === 'blocked'
                      ? blockedNoticeText(notice.host)
                      : loadFailedNoticeText(notice.host)}
                  </div>
                {/each}
              </div>
            {/if}

            {#if msg.role === 'assistant' && msg.truncated}
              <div class="image-notice truncation">{truncationNoticeText()}</div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if messages.length === 0}
      <div class="greeting">
        <p class="greeting-text">{greeting}</p>
        <p class="greeting-hint">{greetingHint}</p>
      </div>
    {/if}
  </div>

  {#if suggestedChips.length > 0}
    <div class="chip-row">
      {#each suggestedChips as chip}
        <button
          type="button"
          class="chip"
          disabled={!canStartTurn || connectionStatus === 'connecting'}
          onclick={() => sendPrompt(chip.prompt)}
        >
          {chip.label}
        </button>
      {/each}
    </div>
  {/if}

  <div class="input-area">
    <input
      type="text"
      bind:value={inputText}
      placeholder={canStartTurn ? inputPlaceholder : 'Viewer 不能發起 AI 診斷'}
      onkeydown={handleKeydown}
      disabled={!canStartTurn || connectionStatus === 'connecting'}
    />
    <button
      onclick={sendMessage}
      disabled={!canStartTurn || !inputText.trim() || connectionStatus === 'connecting'}
    >
      {sendButtonText}
    </button>
  </div>

  <div class="chat-footer">{footerText}</div>
</div>

<style>
  .chat-panel {
    background: var(--theme-elevated);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .chat-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-line);
  }
  .sparkle-icon {
    font-size: 1.2rem;
  }
  .chat-header h3 {
    color: var(--theme-fg);
    font-size: 16px;
    font-weight: 700;
    margin: 0;
  }
  .connection-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    font-size: 12px;
    border-bottom: 1px solid var(--theme-line);
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    flex-shrink: 0;
  }
  .connected .status-dot {
    background: var(--theme-success);
  }
  .connecting .status-dot {
    background: var(--theme-warning);
    animation: pulse 1s infinite;
  }
  .error-state .status-dot {
    background: var(--theme-danger);
  }
  .status-text {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .connected .status-text {
    color: var(--theme-success);
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
  .message-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message {
    display: flex;
  }
  .message.user {
    justify-content: flex-end;
  }
  .message.assistant {
    justify-content: flex-start;
  }
  .message.system {
    justify-content: center;
  }
  .system-note {
    font-size: 11px;
    color: color-mix(in srgb, var(--theme-fg) 45%, transparent);
    background: var(--theme-inset);
    border: 1px dashed var(--theme-line);
    border-radius: 999px;
    padding: 4px 12px;
  }
  .bubble {
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
    color: var(--theme-fg);
  }
  .user .bubble {
    background: #3b82f6;
    color: #fff;
    border-bottom-right-radius: 4px;
    white-space: pre-wrap;
  }
  .assistant .bubble {
    background: var(--theme-inset);
    border-bottom-left-radius: 4px;
    white-space: normal;
  }
  .bubble-text {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .assistant-images {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }
  .assistant-image {
    max-width: 100%;
    border-radius: 8px;
    border: 1px solid var(--theme-line);
    background: var(--theme-elevated);
  }
  .image-notices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
  }
  .image-notice {
    font-size: 11px;
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    background: color-mix(in srgb, var(--theme-warning-bg, #fef3c7) 80%, transparent);
    border: 1px dashed var(--theme-line);
    border-radius: 6px;
    padding: 6px 8px;
  }
  .image-notice.truncation {
    margin-top: 8px;
  }
  .typing-indicator {
    display: inline-flex;
    gap: 3px;
    align-items: center;
    padding: 4px 0;
  }
  .typing-indicator .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    animation: typing-bounce 1.4s infinite ease-in-out;
  }
  .typing-indicator .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .typing-indicator .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes typing-bounce {
    0%,
    60%,
    100% {
      transform: translateY(0);
    }
    30% {
      transform: translateY(-4px);
    }
  }
  .greeting {
    text-align: center;
    padding: 40px 20px;
  }
  .greeting-text {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    font-size: 13px;
    margin: 0 0 8px 0;
    line-height: 1.5;
  }
  .greeting-hint {
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    font-size: 12px;
    margin: 0;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 20px 10px;
  }
  .chip {
    border: 1px solid var(--theme-line);
    background: var(--theme-inset);
    color: var(--theme-fg);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .chip:hover:not(:disabled) {
    border-color: #3b82f6;
    color: #3b82f6;
  }
  .chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .input-area {
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--theme-line);
  }
  .input-area input {
    flex: 1;
    background: var(--theme-inset);
    border: 1px solid var(--theme-line);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--theme-fg);
    font-size: 13px;
    outline: none;
  }
  .input-area input:focus {
    border-color: #3b82f6;
  }
  .input-area input::placeholder {
    color: color-mix(in srgb, var(--theme-fg) 30%, transparent);
  }
  .input-area input:disabled {
    opacity: 0.5;
  }
  .input-area button {
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .input-area button:hover:not(:disabled) {
    background: #2563eb;
  }
  .input-area button:disabled {
    background: var(--theme-line);
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    cursor: not-allowed;
  }
  .chat-footer {
    padding: 8px 20px;
    font-size: 11px;
    color: color-mix(in srgb, var(--theme-fg) 30%, transparent);
    text-align: center;
    border-top: 1px solid var(--theme-line);
  }
</style>
