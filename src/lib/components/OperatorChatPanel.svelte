<script lang="ts">
  import DiagnosisAnswerView from '$lib/components/ai/DiagnosisAnswerView.svelte';
  import { chatBodyNodes } from '$lib/operator-chat-body';
  import {
    OPSGPT_DISPLAY_NAME,
    OPSGPT_PARTICIPANT_ID,
    type ChatMessage,
    type ChatRoomSummary,
    type ChatRosterEntry,
  } from '$lib/operator-chat-types';
  import { operatorRoleLabel } from '$lib/operator-role';

  let {
    open = false,
    messages = [],
    sending = false,
    error = '',
    hasOlder = false,
    rooms = [],
    roster = [],
    activeRoomId = 'public',
    canSend = true,
    canMentionOpsgpt = false,
    onClose,
    onSend,
    onLoadOlder,
    onNearBottom,
    onSelectRoom,
    onPickRoster,
  }: {
    open?: boolean;
    messages?: ChatMessage[];
    sending?: boolean;
    error?: string;
    hasOlder?: boolean;
    rooms?: ChatRoomSummary[];
    roster?: ChatRosterEntry[];
    activeRoomId?: string;
    canSend?: boolean;
    canMentionOpsgpt?: boolean;
    onClose: () => void;
    onSend: (body: string, opts?: { mentionOpsgpt?: boolean }) => void | Promise<void>;
    onLoadOlder?: () => void;
    onNearBottom?: () => void;
    onSelectRoom: (roomId: string) => void;
    onPickRoster: (counterpartId: string) => void;
  } = $props();

  let draft = $state('');
  let mentionOpsgpt = $state(false);
  let listEl: HTMLDivElement | undefined;
  let stickToBottom = $state(true);

  const activeRoom = $derived(rooms.find((r) => r.id === activeRoomId) ?? rooms[0]);
  const placeholder = $derived(
    !canSend
      ? 'Viewer 不能傳送到 OPSGPT'
      : activeRoom?.kind === 'opsgpt_dm'
        ? '詢問 OPSGPT…'
        : activeRoom?.kind === 'operator_dm'
          ? `傳送到 ${activeRoom.title}…`
          : '傳送到公共…',
  );

  $effect(() => {
    if (open) stickToBottom = true;
  });

  $effect(() => {
    activeRoomId;
    mentionOpsgpt = false;
    draft = '';
  });

  function nearBottom(): boolean {
    if (!listEl) return true;
    return listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 32;
  }

  $effect(() => {
    if (!open) return;
    messages;
    if (!stickToBottom) return;
    queueMicrotask(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
      onNearBottom?.();
    });
  });

  function submit() {
    const body = draft;
    if (!body.trim() || sending || !canSend) return;
    stickToBottom = true;
    const chip = canMentionOpsgpt && mentionOpsgpt;
    void onSend(body, { mentionOpsgpt: chip });
    draft = '';
    mentionOpsgpt = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function authorLabel(authorId: string): string {
    if (authorId === OPSGPT_PARTICIPANT_ID) return OPSGPT_DISPLAY_NAME;
    const entry = roster.find((e) => e.id === authorId);
    return entry?.displayName ?? authorId;
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[70] flex justify-end">
    <button
      type="button"
      class="absolute inset-0 bg-black/40"
      aria-label="關閉聊天"
      onclick={onClose}
    ></button>
    <aside
      class="relative flex h-full w-full max-w-[520px] flex-col border-l border-line bg-elevated shadow-2xl"
      role="dialog"
      aria-label="聊天"
    >
      <div class="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div>
          <p class="text-[11px] font-medium uppercase tracking-wide text-muted-strong">聊天</p>
          <h2 class="text-[14px] font-medium text-fg">{activeRoom?.title ?? '公共'}</h2>
        </div>
        <button type="button" class="chrome-control px-2" aria-label="關閉" onclick={onClose}>
          <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="flex min-h-0 flex-1">
        <nav class="flex w-[128px] shrink-0 flex-col border-r border-line py-2" aria-label="聊天房間">
          <div class="min-h-0 flex-1 overflow-y-auto">
            {#each rooms as room (room.id)}
              <button
                type="button"
                class="relative mx-2 mb-0.5 flex w-[calc(100%-1rem)] flex-col rounded-md px-2 py-1.5 text-left text-[12px] {room.id === activeRoomId ? 'bg-card text-fg' : 'text-muted-strong hover:text-fg'}"
                aria-current={room.id === activeRoomId ? 'page' : undefined}
                onclick={() => onSelectRoom(room.id)}
              >
                <span class="truncate">{room.title}</span>
                {#if room.unread}
                  <span class="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-signal" aria-label="未讀"></span>
                {/if}
              </button>
            {/each}
          </div>
          <p class="px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-strong">名單</p>
          <div class="max-h-40 overflow-y-auto">
            {#each roster as entry (entry.id)}
              <button
                type="button"
                class="mx-2 mb-0.5 flex w-[calc(100%-1rem)] flex-col rounded-md px-2 py-1 text-left text-[12px] text-muted-strong hover:text-fg"
                onclick={() => onPickRoster(entry.id)}
              >
                <span class="truncate">{entry.displayName}</span>
                {#if entry.role}
                  <span class="truncate text-[10px]">{operatorRoleLabel(entry.role)}</span>
                {/if}
              </button>
            {/each}
          </div>
        </nav>
      <div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto px-4 py-3" onscroll={() => {
        stickToBottom = nearBottom();
        if (stickToBottom) onNearBottom?.();
      }}>
        {#if hasOlder && onLoadOlder}
          <button type="button" class="mb-3 w-full text-center text-[11px] text-muted-strong hover:text-fg" onclick={onLoadOlder}>
            載入較早訊息
          </button>
        {/if}
        {#if messages.length === 0}
          <p class="text-[12px] text-muted-strong">還沒有訊息。值班交接可以直接打在這裡。</p>
        {/if}
        {#each messages as msg (msg.id)}
          <article class="mb-3">
            <p class="font-mono text-[11px] text-muted-strong">
              {authorLabel(msg.authorId)}
              <time class="ml-2">{msg.createdAt.replace('T', ' ').slice(0, 19)}</time>
            </p>
            {#if msg.authorId === OPSGPT_PARTICIPANT_ID && msg.status === 'pending'}
              <p class="text-[13px] text-muted-strong">OPSGPT 正在回答…</p>
            {:else if msg.authorId === OPSGPT_PARTICIPANT_ID && msg.status === 'error'}
              <p class="text-[13px] text-danger">{msg.body || 'OPSGPT 本回合失敗'}</p>
            {:else if msg.authorId === OPSGPT_PARTICIPANT_ID}
              <DiagnosisAnswerView text={msg.body} />
              {#if msg.assistantImages?.images?.length}
                <div class="mt-2 flex flex-wrap gap-2">
                  {#each msg.assistantImages.images as img}
                    <img src={img.url} alt="" class="max-h-32 rounded-md border border-line" />
                  {/each}
                </div>
              {/if}
            {:else}
              <p class="whitespace-pre-wrap break-words text-[13px] text-fg">
                {#each chatBodyNodes(msg.body) as node, i (`${msg.id}-${i}`)}
                  {#if node.type === 'link'}
                    <a class="text-accent-signal underline" href={node.value} target={node.value.startsWith('/') ? undefined : '_blank'} rel="noreferrer">{node.value}</a>
                  {:else}{node.value}{/if}
                {/each}
              </p>
            {/if}
          </article>
        {/each}
      </div>
      </div>
      {#if error}
        <p class="px-4 pb-1 text-[12px] text-danger">{error}</p>
      {/if}
      <form
        class="shrink-0 border-t border-line p-3"
        onsubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          class="h-20 w-full resize-none rounded-md border border-line bg-page px-2 py-1.5 text-[13px] text-fg outline-none focus:border-accent-signal"
          placeholder={placeholder}
          maxlength={4000}
          disabled={!canSend}
          bind:value={draft}
          onkeydown={onKeydown}
        ></textarea>
        <div class="mt-2 flex items-center justify-between gap-2">
          <span class="text-[11px] text-muted-strong">{draft.length}/4000</span>
          <div class="flex items-center gap-2">
            {#if canMentionOpsgpt}
              <button
                type="button"
                class="chrome-control px-2 text-[11px] {mentionOpsgpt ? 'text-accent-signal' : ''}"
                aria-pressed={mentionOpsgpt}
                onclick={() => { mentionOpsgpt = !mentionOpsgpt; }}
              >@OPSGPT</button>
            {/if}
            <button
              type="submit"
              class="chrome-control px-3 text-[12px]"
              disabled={sending || !canSend || !draft.trim()}
            >
              送出
            </button>
          </div>
        </div>
      </form>
    </aside>
  </div>
{/if}
