<script lang="ts">
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';
  import { capabilityAllowed } from '$lib/operator-role-capabilities';
  import { operatorRoleLabel, type OperatorRole } from '$lib/operator-role';

  type SelfAccount = {
    username: string;
    email: string;
    displayName?: string | null;
    role: OperatorRole;
    secondFactorEnrolled: boolean;
    lastSuccessfulLoginAt: string | null;
    sessionCount: number;
    loginLocked: boolean;
    disabled: boolean;
  };

  type SelfSession = {
    id: string;
    clientIp: string;
    userAgent: string | null;
    createdAt: string;
    lastSeenAt: string;
  };

  type SelfLoginEvent = {
    username: string;
    outcome: 'success' | 'failure' | 'lockout' | 'unlock';
    clientIp: string;
    at: string;
  };

  let {
    account,
    sessions,
    loginEvents,
    currentSessionId,
    onChanged,
  }: {
    account: SelfAccount;
    sessions: SelfSession[];
    loginEvents: SelfLoginEvent[];
    currentSessionId: string | null;
    onChanged: () => Promise<void>;
  } = $props();

  let currentPassword = $state('');
  let newPassword = $state('');
  let totpCode = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);
  let totpSecret = $state<string | null>(null);
  let enrollCode = $state('');
  let enrolling = $state(false);

  function formatAt(iso: string | null): string {
    if (!iso) return '尚未登入';
    return new Date(iso).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
  }

  const outcomeLabel: Record<SelfLoginEvent['outcome'], string> = {
    success: '成功',
    failure: '失敗',
    lockout: '鎖定',
    unlock: '解鎖',
  };

  async function savePassword() {
    saving = true;
    error = null;
    message = null;
    try {
      const res = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          totpCode: totpCode.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `儲存失敗 (HTTP ${res.status})`;
        return;
      }
      currentPassword = '';
      newPassword = '';
      totpCode = '';
      message = 'Lasting Password 已更新';
    } catch {
      error = '無法連線伺服器';
    } finally {
      saving = false;
    }
  }

  async function beginTotp() {
    error = null;
    const res = await fetch('/api/account/totp');
    if (!res.ok) {
      error = '無法產生 Second Factor secret';
      return;
    }
    const data = (await res.json()) as { secret?: string };
    totpSecret = data.secret ?? null;
  }

  async function enrollTotp() {
    if (!totpSecret) return;
    enrolling = true;
    error = null;
    try {
      const res = await fetch('/api/account/totp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret: totpSecret, code: enrollCode }),
      });
      if (!res.ok) {
        error = 'Second Factor 綁定失敗，請確認驗證碼';
        return;
      }
      totpSecret = null;
      enrollCode = '';
      message = 'Second Factor 已綁定';
      await onChanged();
    } finally {
      enrolling = false;
    }
  }

  async function revoke(id: string) {
    error = null;
    const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { currentRevoked?: boolean };
    if (!res.ok) {
      error = '無法撤 Session';
      return;
    }
    if (data.currentRevoked) {
      goto(publicHref('/login'));
      return;
    }
    await onChanged();
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <div class="mb-6">
    <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">自己的 Operator Account</h2>
    <p class="mt-1 text-[11px] text-fg/30">
      {account.displayName?.trim() ? `${account.displayName.trim()} · ` : ''}{account.username} · {operatorRoleLabel(account.role)} · 上次登入 {formatAt(account.lastSuccessfulLoginAt)}
      · Session {account.sessionCount}
    </p>
  </div>

  {#if error}
    <p class="mb-3 text-[12px] text-danger">{error}</p>
  {/if}
  {#if message}
    <p class="mb-3 text-[12px] text-fg/70">{message}</p>
  {/if}

  {#if capabilityAllowed('change_own_authenticators', account.role)}
    <form
      class="mb-6 grid gap-3 sm:grid-cols-2"
      onsubmit={(e) => {
        e.preventDefault();
        void savePassword();
      }}
    >
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        type="password"
        placeholder="目前 Lasting Password"
        bind:value={currentPassword}
        required
      />
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        type="password"
        placeholder="新 Lasting Password（至少 12 字）"
        bind:value={newPassword}
        required
      />
      {#if account.secondFactorEnrolled}
        <input
          class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
          placeholder="TOTP"
          bind:value={totpCode}
          autocomplete="one-time-code"
        />
      {/if}
      <button
        class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] font-medium text-fg/80 disabled:opacity-50"
        type="submit"
        disabled={saving}
      >
        {saving ? '儲存中…' : '更新 Lasting Password'}
      </button>
    </form>

    <div class="mb-6">
      <p class="mb-2 text-[12px] text-fg/50">
        Second Factor：{account.secondFactorEnrolled ? '已綁定' : '尚未綁定'}
      </p>
      {#if !account.secondFactorEnrolled}
        {#if !totpSecret}
          <button
            type="button"
            class="rounded-lg border border-fg/10 px-3 py-1.5 text-[12px] text-fg/70"
            onclick={() => void beginTotp()}
          >
            開始綁定 TOTP
          </button>
        {:else}
          <p class="mb-2 break-all font-mono text-[11px] text-fg/70">Secret：{totpSecret}</p>
          <form
            class="flex gap-2"
            onsubmit={(e) => {
              e.preventDefault();
              void enrollTotp();
            }}
          >
            <input
              class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
              placeholder="驗證碼"
              bind:value={enrollCode}
              required
            />
            <button
              class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] text-fg/80"
              type="submit"
              disabled={enrolling}
            >
              綁定
            </button>
          </form>
        {/if}
      {/if}
    </div>
  {:else}
    <p class="mb-6 text-[12px] text-fg/40">
      Viewer 可檢視自己的 Session 與 Login Event；Lasting Password 與 TOTP 綁定僅限登入所需，不在此變更。
    </p>
  {/if}

  <h3 class="mb-2 text-[13px] font-medium text-fg/80">有效 Session</h3>
  <ul class="mb-6 space-y-2">
    {#each sessions as s (s.id)}
      <li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-fg/[0.06] px-3 py-2 text-[12px]">
        <span class="font-mono text-fg/70">{s.clientIp}</span>
        <span class="text-fg/40">{formatAt(s.lastSeenAt)}</span>
        {#if s.id === currentSessionId}
          <span class="text-success">目前</span>
        {/if}
        <button
          type="button"
          class="text-[11px] text-danger/80 hover:text-danger"
          onclick={() => void revoke(s.id)}
        >
          撤 Session
        </button>
      </li>
    {/each}
    {#if sessions.length === 0}
      <li class="text-[12px] text-fg/40">無有效 Session</li>
    {/if}
  </ul>

  <h3 class="mb-2 text-[13px] font-medium text-fg/80">Login Event</h3>
  <ul class="space-y-1">
    {#each loginEvents as ev, i (`${ev.at}-${ev.outcome}-${i}`)}
      <li class="flex justify-between gap-3 font-mono text-[11px] text-fg/50">
        <span>{formatAt(ev.at)}</span>
        <span>{outcomeLabel[ev.outcome]}</span>
        <span>{ev.clientIp}</span>
      </li>
    {/each}
    {#if loginEvents.length === 0}
      <li class="text-[12px] text-fg/40">尚無 Login Event</li>
    {/if}
  </ul>
</div>
