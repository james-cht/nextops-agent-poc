<script lang="ts">
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';
  import RefreshCountdown from '$lib/components/RefreshCountdown.svelte';
  import AppearanceThemeControl from '$lib/components/AppearanceThemeControl.svelte';
  import ReleaseNotesControl from '$lib/components/ReleaseNotesControl.svelte';
  import OperatorRoleIcon from '$lib/components/OperatorRoleIcon.svelte';
  import { operatorAccountTooltip, operatorRoleLabel, type OperatorRole } from '$lib/operator-role';
  import { defaultAccountAdminHref } from '$lib/account-admin-nav';
  import { operatorVisibleName } from '$lib/operator-display-name';
  import type { ReleaseNotesSnapshot } from '$lib/release-notes';

  let {
    pageTitle = '',
    unreadCount = 0,
    showDashboardRefresh = false,
    dashboardRefreshSeconds = 0,
    dashboardRefreshTotal = 30,
    onDashboardRefresh,
    operator = null,
    onChatClick,
    chatOpen = false,
    chatUnreadCount = 0,
    releaseNotes = null,
  }: {
    pageTitle?: string;
    unreadCount?: number;
    showDashboardRefresh?: boolean;
    dashboardRefreshSeconds?: number;
    dashboardRefreshTotal?: number;
    onDashboardRefresh?: () => void;
    operator?: { username: string; displayName?: string | null; role: OperatorRole } | null;
    onChatClick?: () => void;
    chatOpen?: boolean;
    chatUnreadCount?: number;
    releaseNotes?: ReleaseNotesSnapshot | null;
  } = $props();

  function updateTimestamp(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
  }

  let displayTime = $state(updateTimestamp());
  let timer: ReturnType<typeof setInterval> | undefined;

  $effect(() => {
    timer = setInterval(() => { displayTime = updateTimestamp(); }, 1000);
    return () => { if (timer) clearInterval(timer); };
  });

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network errors
    }
    goto(publicHref('/login'));
  }
</script>

<header class="flex h-12 shrink-0 items-center justify-between gap-3 overflow-visible border-b border-line bg-header px-4 sticky top-0 z-50 lg:px-5">
  <div class="flex min-w-0 items-center gap-3">
    {#if pageTitle}
      <h1 class="truncate text-[14px] font-medium tracking-tight text-fg">
        <span class="mr-1 font-mono text-[11px] text-accent-signal">~$</span>
        {pageTitle}
      </h1>
      <span class="hidden h-4 w-px shrink-0 bg-line sm:block"></span>
    {/if}
    <span class="hidden shrink-0 font-mono text-muted-strong md:inline" style="font-size: var(--fs-header-clock)">UTC+8 · {displayTime}</span>
  </div>

  <div class="flex shrink-0 items-center gap-1.5">
    {#if showDashboardRefresh && onDashboardRefresh}
      <RefreshCountdown
        size="compact"
        seconds={dashboardRefreshSeconds}
        total={dashboardRefreshTotal}
        onRefresh={onDashboardRefresh}
      />
    {/if}
    <div
      class="chrome-control px-2"
      title="ALL SYSTEMS MONITORED — All systems are being monitored."
      aria-label="ALL SYSTEMS MONITORED"
    >
      <span class="h-2 w-2 shrink-0 rounded-full bg-success"></span>
    </div>

    <AppearanceThemeControl />

    <a
      href={publicHref('/admin')}
      aria-label="管理配置"
      title="管理配置"
      class="chrome-control px-2"
    >
      <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </a>

    {#if releaseNotes}
      <ReleaseNotesControl snapshot={releaseNotes} />
    {/if}

    {#if onChatClick}
      <button
        type="button"
        aria-label="聊天"
        title="聊天"
        aria-pressed={chatOpen}
        onclick={onChatClick}
        class="chrome-control relative px-2"
      >
        <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        {#if chatUnreadCount > 0}
          <span
            class="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-signal px-1 text-[10px] font-bold text-white tabular-nums"
            aria-label="{chatUnreadCount} unread chat rooms"
          >{chatUnreadCount}</span>
        {/if}
      </button>
    {/if}

    <a
      href={publicHref('/alerts')}
      aria-label="告警"
      title="告警"
      class="chrome-control relative px-2"
    >
      <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
      {#if unreadCount > 0}
        <span
          class="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-alarm px-1 text-[10px] font-bold text-white tabular-nums"
          aria-label="{unreadCount} active alerts"
        >{unreadCount}</span>
      {/if}
    </a>

    {#if operator}
      <a
        href={publicHref(defaultAccountAdminHref(operator.role))}
        class="group relative overflow-visible chrome-control gap-1.5"
        title={operatorAccountTooltip(operator.username, operator.role)}
        aria-label={operatorAccountTooltip(operator.username, operator.role)}
      >
        <span class="font-mono">{operatorVisibleName({
          displayName: operator.displayName,
          username: operator.username,
        })}</span>
        <OperatorRoleIcon role={operator.role} />
        <span
          role="tooltip"
          class="pointer-events-none absolute right-0 top-full z-[60] mt-1.5 hidden whitespace-nowrap rounded-md border border-line bg-elevated px-2 py-1 text-[11px] text-fg shadow-lg group-hover:block group-focus-visible:block"
        >
          {operatorRoleLabel(operator.role)}
        </span>
      </a>
      <button
        type="button"
        aria-label="登出"
        title="登出"
        onclick={handleLogout}
        class="chrome-control px-2 hover:border-danger-border hover:bg-danger-bg hover:text-danger"
      >
        <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
      </button>
    {/if}
  </div>
</header>
