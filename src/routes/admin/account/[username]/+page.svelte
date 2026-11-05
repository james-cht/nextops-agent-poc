<script lang="ts">
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';
  import { onMount } from 'svelte';
  import { OPERATOR_ROLES, operatorRoleLabel, type OperatorRole } from '$lib/operator-role';

  type AccountRow = {
    username: string;
    email: string;
    displayName: string | null;
    role: OperatorRole;
    disabled: boolean;
    secondFactorEnrolled: boolean;
    lastSuccessfulLoginAt: string | null;
    sessionCount: number;
    loginLocked: boolean;
  };

  type SessionRow = {
    id: string;
    clientIp: string;
    lastSeenAt: string;
  };

  type LoginEventRow = {
    outcome: 'success' | 'failure' | 'lockout' | 'unlock';
    clientIp: string;
    at: string;
  };

  let { data } = $props();
  const username = $derived((data as { username: string }).username);

  let meUsername = $state<string | null>(null);
  let currentSessionId = $state<string | null>(null);
  let account = $state<AccountRow | null>(null);
  let sessions = $state<SessionRow[]>([]);
  let events = $state<LoginEventRow[]>([]);
  let editEmail = $state('');
  let editDisplayName = $state('');
  let editRole = $state<OperatorRole>('viewer');
  let selfTotp = $state('');
  let loading = $state(true);
  let acting = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let shownTemp = $state<string | null>(null);

  function formatAt(iso: string | null): string {
    if (!iso) return '尚未登入';
    return new Date(iso).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  }

  const outcomeLabel: Record<LoginEventRow['outcome'], string> = {
    success: '成功',
    failure: '失敗',
    lockout: '鎖定',
    unlock: '解鎖',
  };

  async function load() {
    loading = true;
    error = null;
    try {
      const meRes = await fetch('/api/account/me');
      if (meRes.ok) {
        const me = await meRes.json();
        meUsername = me.account?.username ?? null;
        currentSessionId = me.currentSessionId ?? null;
      }
      const res = await fetch(`/api/admin/operators/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      account = body.account ?? null;
      sessions = body.sessions ?? [];
      events = body.loginEvents ?? [];
      editEmail = account?.email ?? '';
      editDisplayName = account?.displayName ?? '';
      editRole = account?.role ?? 'viewer';
    } catch {
      error = '無法載入帳號細節';
      account = null;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function saveFields() {
    acting = true;
    error = null;
    message = null;
    try {
      const res = await fetch(`/api/admin/operators/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: editEmail,
          displayName: editDisplayName,
          role: editRole,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `儲存失敗 (HTTP ${res.status})`;
        return;
      }
      message = '已更新姓名 / Operator Email / Role';
      await load();
    } finally {
      acting = false;
    }
  }

  async function runAction(action: string) {
    acting = true;
    error = null;
    message = null;
    shownTemp = null;
    try {
      const res = await fetch(`/api/admin/operators/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, totpCode: selfTotp.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `操作失敗 (HTTP ${res.status})`;
        return;
      }
      if ((body as { temporaryPassword?: string }).temporaryPassword) {
        shownTemp = (body as { temporaryPassword: string }).temporaryPassword;
        message = 'Temporary Password 只顯示一次。';
      } else {
        message = '已完成';
      }
      selfTotp = '';
      await load();
    } finally {
      acting = false;
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const body = (await res.json().catch(() => ({}))) as { currentRevoked?: boolean };
    if (!res.ok) {
      error = '無法撤 Session';
      return;
    }
    if (body.currentRevoked) {
      goto(publicHref('/login'));
      return;
    }
    await load();
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <a href={publicHref('/admin/account')} class="text-[12px] text-fg/50 hover:text-fg/80">← Accounts</a>

  {#if loading}
    <p class="mt-4 text-[12px] text-fg/40">載入中…</p>
  {:else if account}
    <h2 class="mt-3 font-mono text-[15px] font-semibold tracking-tight text-fg/90">{account.username}</h2>
    <p class="mt-1 text-[11px] text-fg/30">
      Username 不可改。姓名 {account.displayName?.trim() || '（未填）'} · 上次登入 {formatAt(account.lastSuccessfulLoginAt)} · Session {account.sessionCount}
      {account.disabled ? ' · 停用' : ''}{account.loginLocked ? ' · Lockout' : ''}{account.secondFactorEnrolled
        ? ''
        : ' · 待綁 2FA'}
    </p>

    {#if error}
      <p class="mt-3 text-[12px] text-danger">{error}</p>
    {/if}
    {#if message}
      <p class="mt-3 text-[12px] text-fg/70">{message}</p>
    {/if}
    {#if shownTemp}
      <p class="mt-3 break-all font-mono text-[12px] text-fg/80">Temporary Password：{shownTemp}</p>
    {/if}

    <form
      class="mt-4 grid gap-3 sm:grid-cols-2"
      onsubmit={(e) => {
        e.preventDefault();
        void saveFields();
      }}
    >
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        placeholder="姓名"
        bind:value={editDisplayName}
        required
        maxlength={64}
      />
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        type="email"
        bind:value={editEmail}
        required
      />
      <select
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        bind:value={editRole}
      >
        {#each OPERATOR_ROLES as r}
          <option value={r}>{operatorRoleLabel(r)}</option>
        {/each}
      </select>
      <button
        class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] text-fg/80 disabled:opacity-50"
        type="submit"
        disabled={acting}
      >
        儲存姓名 / Email / Role
      </button>
    </form>

    {#if meUsername === account.username}
      <input
        class="mt-3 w-full rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        placeholder="清自己的 Second Factor 時需要目前 TOTP"
        bind:value={selfTotp}
      />
    {/if}

    <div class="mt-4 flex flex-wrap gap-2">
      {#if account.disabled}
        <button type="button" class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70" disabled={acting} onclick={() => void runAction('enable')}>啟用</button>
      {:else}
        <button type="button" class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70" disabled={acting} onclick={() => void runAction('disable')}>停用</button>
      {/if}
      <button type="button" class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70" disabled={acting} onclick={() => void runAction('reset-password')}>發 Temporary Password</button>
      <button type="button" class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70" disabled={acting} onclick={() => void runAction('clear-second-factor')}>清 Second Factor</button>
      {#if account.loginLocked}
        <button type="button" class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70" disabled={acting} onclick={() => void runAction('clear-lockout')}>清 Login Lockout</button>
      {/if}
    </div>

    <h3 class="mb-2 mt-6 text-[13px] font-medium text-fg/80">有效 Session</h3>
    <ul class="mb-6 space-y-2">
      {#each sessions as s (s.id)}
        <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-fg/[0.06] px-3 py-2 text-[12px]">
          <span class="font-mono text-fg/70">{s.clientIp}</span>
          <span class="text-fg/40">{formatAt(s.lastSeenAt)}</span>
          {#if s.id === currentSessionId}
            <span class="text-success">目前</span>
          {/if}
          <button type="button" class="text-[11px] text-danger/80 hover:text-danger" onclick={() => void revoke(s.id)}>撤 Session</button>
        </li>
      {/each}
      {#if sessions.length === 0}
        <li class="text-[12px] text-fg/40">無有效 Session</li>
      {/if}
    </ul>

    <h3 class="mb-2 text-[13px] font-medium text-fg/80">Login Event</h3>
    <ul class="space-y-1">
      {#each events as ev, i (`${ev.at}-${ev.outcome}-${i}`)}
        <li class="flex justify-between gap-3 font-mono text-[11px] text-fg/50">
          <span>{formatAt(ev.at)}</span>
          <span>{outcomeLabel[ev.outcome]}</span>
          <span>{ev.clientIp}</span>
        </li>
      {/each}
      {#if events.length === 0}
        <li class="text-[12px] text-fg/40">尚無 Login Event</li>
      {/if}
    </ul>
  {:else}
    <p class="mt-4 text-[12px] text-danger">{error ?? 'Operator Account not found'}</p>
  {/if}
</div>
