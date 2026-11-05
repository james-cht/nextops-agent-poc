<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Header from '$lib/components/Header.svelte';
  import OperatorChatPanel from '$lib/components/OperatorChatPanel.svelte';
  import { connectAlertStream } from '$lib/alert-sse';
  import { connectChatStream } from '$lib/chat-sse';
  import { canStartDiagnosisTurn } from '$lib/operator-role';
  import {
    PUBLIC_ROOM_ID,
    type ChatMessage,
    type ChatMessagePage,
    type ChatRoomSummary,
    type ChatRosterEntry,
    type ChatUnreadSummary,
  } from '$lib/operator-chat-types';
  import type { Alert, AlertSummary } from '$lib/alert-manager';
  import { getFontSizeConfig, buildCssVars } from '$lib/font-size-config';
  import { getCategoryByRoute } from '$lib/sre-settings-registry';
  import {
    dashboardRefresh,
    refreshDashboardNow,
    syncDashboardRefreshInterval,
    tickDashboardRefresh,
  } from '$lib/dashboard-refresh.svelte';
  import { initAppearanceTheme } from '$lib/appearance-theme.svelte';

  let { children, data } = $props();

  $effect(() => {
    initAppearanceTheme();
  });

  let unread = $state(0);
  let unacked = $state(0);
  let sseCleanup: (() => void) | undefined;
  let chatOpen = $state(false);
  let chatMessages = $state<ChatMessage[]>([]);
  let chatCursor = $state<string | null>(null);
  let chatSending = $state(false);
  let chatError = $state('');
  let chatCleanup: (() => void) | undefined;
  let chatUnreadCount = $state(0);
  let chatRooms = $state<ChatRoomSummary[]>([]);
  let chatRoster = $state<ChatRosterEntry[]>([]);
  let activeRoomId = $state(PUBLIC_ROOM_ID);

  const canMentionOpsgpt = $derived(
    Boolean(data.operator && canStartDiagnosisTurn(data.operator.role) &&
      (chatRooms.find((r) => r.id === activeRoomId)?.kind ?? 'public') === 'public'),
  );
  const canSendChat = $derived.by(() => {
    const kind = chatRooms.find((r) => r.id === activeRoomId)?.kind ?? 'public';
    if (kind === 'opsgpt_dm') return Boolean(data.operator && canStartDiagnosisTurn(data.operator.role));
    return true;
  });

  const pageTitles: Record<string, string> = {
    '/logs': '智能日誌流',
    '/alerts': '告警中心',
    '/robusta': 'Robusta 調查歷史',
    '/ops-check': '運維點檢',
    '/admin': 'SRE 管理配置',
    '/ai': '運維助手',
    '/online': '應用上線',
    '/pipelines/timeouts': '流水線逾時分析',
  };

  let currentTitle = $derived.by(() => {
    if ($page.url.pathname === '/') return '';
    const adminCategory = getCategoryByRoute($page.url.pathname);
    if (adminCategory) return adminCategory.title;
    return pageTitles[$page.url.pathname] ?? 'NEXTOPS';
  });
  let showDashboardRefresh = $derived($page.url.pathname === '/');

  function onAlertsPage(): boolean {
    return $page.url.pathname === '/alerts';
  }

  $effect(() => {
    sseCleanup = connectAlertStream(null, {
      onSnapshot(_alerts: Alert[], summary: AlertSummary, unackedCount: number) {
        unacked = unackedCount;
        unread = onAlertsPage() ? 0 : unacked;
      },
      onAlert(_alert: Alert, _summary: AlertSummary, unackedCount: number) {
        unacked = unackedCount;
        if (!onAlertsPage()) unread = unacked;
      },
      onAck(_fingerprint, _summary, unackedCount) {
        unacked = unackedCount;
        if (!onAlertsPage()) unread = unacked;
      },
    });
    return () => { sseCleanup?.(); };
  });

  function mergeChatMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
    if (incoming.roomId !== activeRoomId) return list;
    const idx = list.findIndex((m) => m.id === incoming.id);
    if (idx !== -1) {
      const next = [...list];
      next[idx] = incoming;
      return next;
    }
    return [...list, incoming].sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt),
    );
  }

  async function fetchChatUnread() {
    const [unreadRes, roomsRes] = await Promise.all([
      fetch('/api/chat/unread'),
      fetch('/api/chat/rooms'),
    ]);
    if (unreadRes.ok) {
      const data = (await unreadRes.json()) as ChatUnreadSummary;
      chatUnreadCount = data.unreadRoomCount;
    }
    if (roomsRes.ok) {
      const data = (await roomsRes.json()) as { rooms: ChatRoomSummary[] };
      chatRooms = data.rooms;
    }
  }

  async function fetchChatRoster() {
    const res = await fetch('/api/chat/roster');
    if (!res.ok) return;
    const data = (await res.json()) as { roster: ChatRosterEntry[] };
    chatRoster = data.roster;
  }

  async function markActiveRead() {
    if (!chatOpen) return;
    const last = chatMessages.at(-1);
    await fetch(`/api/chat/rooms/${activeRoomId}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(last ? { messageId: last.id, createdAt: last.createdAt } : {}),
    });
    await fetchChatUnread();
  }

  async function loadActiveChat(opts?: { older?: boolean; roomId?: string }) {
    const roomId = opts?.roomId ?? activeRoomId;
    const params = new URLSearchParams();
    if (opts?.older && chatCursor) params.set('cursor', chatCursor);
    const res = await fetch(`/api/chat/rooms/${roomId}/messages?${params}`);
    if (!res.ok) return;
    if (roomId !== activeRoomId) return;
    const page = (await res.json()) as ChatMessagePage;
    if (opts?.older) {
      const seen = new Set(chatMessages.map((m) => m.id));
      chatMessages = [...page.messages.filter((m) => !seen.has(m.id)), ...chatMessages];
      chatCursor = page.cursor;
      return;
    }
    chatMessages = page.messages;
    chatCursor = page.cursor;
  }

  const chatSseEnabled = $derived($page.url.pathname !== '/login');

  $effect(() => {
    if (!chatSseEnabled) return;
    chatCleanup = connectChatStream({
      onHello() {
        void fetchChatUnread();
      },
      onMessage(message) {
        chatMessages = mergeChatMessage(chatMessages, message);
        void fetchChatUnread();
      },
      onMessageUpdated(message) {
        chatMessages = mergeChatMessage(chatMessages, message);
        void fetchChatUnread();
      },
    });
    const onFocus = () => { void fetchChatUnread(); };
    window.addEventListener('focus', onFocus);
    void fetchChatUnread();
    return () => {
      chatCleanup?.();
      window.removeEventListener('focus', onFocus);
    };
  });

  $effect(() => {
    if (!chatOpen) return;
    void fetchChatRoster();
  });

  $effect(() => {
    if (!chatOpen) return;
    const roomId = activeRoomId;
    void loadActiveChat({ roomId });
  });

  async function sendChat(body: string, opts?: { mentionOpsgpt?: boolean }) {
    chatSending = true;
    chatError = '';
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeRoomId,
          body,
          mentionOpsgpt: opts?.mentionOpsgpt === true,
        }),
      });
      if (res.status === 429) {
        chatError = '送出太頻繁，或 OPSGPT 回合進行中';
        return;
      }
      if (res.status === 403) {
        chatError = '沒有權限傳送到這個房間';
        return;
      }
      if (!res.ok) {
        chatError = '送出失敗';
        return;
      }
      const data = (await res.json()) as { message: ChatMessage; aiMessage?: ChatMessage | null };
      chatMessages = mergeChatMessage(chatMessages, data.message);
      if (data.aiMessage) chatMessages = mergeChatMessage(chatMessages, data.aiMessage);
      await fetchChatUnread();
    } catch {
      chatError = '送出失敗';
    } finally {
      chatSending = false;
    }
  }

  async function pickRoster(counterpartId: string) {
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counterpartId }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { room?: ChatRoomSummary };
    await fetchChatUnread();
    if (data.room) activeRoomId = data.room.id;
  }

  $effect(() => {
    if ($page.url.pathname === '/alerts') { unread = 0; }
  });

  $effect(() => {
    if ($page.url.pathname !== '/') return;
    syncDashboardRefreshInterval();
    const interval = setInterval(tickDashboardRefresh, 1000);
    return () => clearInterval(interval);
  });

  // Load font-size config from localStorage and apply as CSS vars
  $effect(() => {
    const cfg = getFontSizeConfig();
    const vars: Record<string, string> = {};
    for (const entry of cfg) {
      vars[`--${entry.key}`] = entry.value;
    }
    const root = document.documentElement;
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }
  });
</script>

{#if $page.url.pathname === '/login'}
  {#if children}
    {@render children()}
  {/if}
{:else}
<div id="nextops-app" class="flex h-screen overflow-hidden bg-page text-fg">
  <Sidebar badgeCount={unread} />
  <div class="flex flex-1 flex-col min-w-0">
    <Header
      pageTitle={currentTitle}
      unreadCount={unread}
      {showDashboardRefresh}
      dashboardRefreshSeconds={dashboardRefresh.seconds}
      dashboardRefreshTotal={dashboardRefresh.total}
      onDashboardRefresh={refreshDashboardNow}
      operator={data.operator}
      releaseNotes={data.releaseNotes}
      chatOpen={chatOpen}
      chatUnreadCount={chatUnreadCount}
      onChatClick={() => { chatOpen = !chatOpen; }}
    />
    <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {#if children}
        {@render children()}
      {/if}
    </main>
    <OperatorChatPanel
      open={chatOpen}
      messages={chatMessages}
      sending={chatSending}
      error={chatError}
      hasOlder={Boolean(chatCursor)}
      rooms={chatRooms}
      roster={chatRoster}
      activeRoomId={activeRoomId}
      canSend={canSendChat}
      canMentionOpsgpt={canMentionOpsgpt}
      onClose={() => { chatOpen = false; }}
      onSend={sendChat}
      onLoadOlder={() => { void loadActiveChat({ older: true }); }}
      onNearBottom={() => { void markActiveRead(); }}
      onSelectRoom={(roomId) => { activeRoomId = roomId; }}
      onPickRoster={(id) => { void pickRoster(id); }}
    />
  </div>
</div>
{/if}
