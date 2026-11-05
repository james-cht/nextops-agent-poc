<script lang="ts">
  import { onMount } from 'svelte';
  import { publicHref } from '$lib/kit-public-href';
  import { filterOperatorAccounts } from '$lib/operator-account-list';
  import { operatorRoleLabel, type OperatorRole } from '$lib/operator-role';

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

  type LoginEventRow = {
    username: string;
    outcome: 'success' | 'failure' | 'lockout' | 'unlock';
    clientIp: string;
    at: string;
  };

  let accounts = $state<AccountRow[]>([]);
  let unmatched = $state<LoginEventRow[]>([]);
  let fleetSessions = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');
  let roleFilter = $state<'' | OperatorRole>('');
  let onlyDisabled = $state(false);
  let onlyLocked = $state(false);
  let onlyPending2fa = $state(false);

  const filtered = $derived(
    filterOperatorAccounts(accounts, {
      query,
      roles: roleFilter ? [roleFilter] : [],
      disabled: onlyDisabled ? true : null,
      loginLocked: onlyLocked ? true : null,
      pendingSecondFactor: onlyPending2fa ? true : null,
    }),
  );

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
      const res = await fetch('/api/admin/operators');
      if (res.status === 403) {
        error = '需要 Platform Owner';
        accounts = [];
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      accounts = data.accounts ?? [];
      unmatched = data.unmatchedLoginEvents ?? [];
      fleetSessions = data.sessions?.fleet ?? 0;
    } catch {
      error = '無法載入 Operator Account';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">Operator Accounts</h2>
      <p class="mt-1 text-[11px] text-fg/30">
        Username 不可改。全站有效 Session：{fleetSessions}。點 Username 進入詳情。
      </p>
    </div>
    <a
      href={publicHref('/admin/account/new')}
      class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] font-medium text-fg/80 hover:bg-fg/15"
    >
      建立 Operator Account
    </a>
  </div>

  {#if error}
    <p class="mb-3 text-[12px] text-danger">{error}</p>
  {/if}

  <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
    <input
      class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
      placeholder="搜 Username、姓名或 Operator Email"
      bind:value={query}
    />
    <select
      class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
      bind:value={roleFilter}
    >
      <option value="">全部 Role</option>
      <option value="platform_owner">Platform Owner</option>
      <option value="operator">Operator</option>
      <option value="viewer">Viewer</option>
    </select>
    <label class="flex items-center gap-2 text-[12px] text-fg/60">
      <input type="checkbox" bind:checked={onlyDisabled} />
      停用
    </label>
    <label class="flex items-center gap-2 text-[12px] text-fg/60">
      <input type="checkbox" bind:checked={onlyLocked} />
      Login Lockout
    </label>
    <label class="flex items-center gap-2 text-[12px] text-fg/60 sm:col-span-2">
      <input type="checkbox" bind:checked={onlyPending2fa} />
      待綁 2FA
    </label>
  </div>

  {#if loading}
    <p class="text-[12px] text-fg/40">載入中…</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full min-w-[720px] text-left text-[12px]">
        <thead class="text-[11px] uppercase tracking-wide text-muted-strong">
          <tr>
            <th class="pb-2 pr-3 font-medium">Username</th>
            <th class="pb-2 pr-3 font-medium">姓名</th>
            <th class="pb-2 pr-3 font-medium">Operator Email</th>
            <th class="pb-2 pr-3 font-medium">Role</th>
            <th class="pb-2 pr-3 font-medium">上次登入</th>
            <th class="pb-2 pr-3 font-medium">Session</th>
            <th class="pb-2 font-medium">標記</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as a (a.username)}
            <tr class="border-t border-fg/[0.06]">
              <td class="py-2 pr-3">
                <a class="font-mono text-fg/80 hover:underline" href={publicHref(`/admin/account/${encodeURIComponent(a.username)}`)}>
                  {a.username}
                </a>
              </td>
              <td class="py-2 pr-3 text-fg/70">{a.displayName?.trim() || '—'}</td>
              <td class="py-2 pr-3 text-fg/40">{a.email}</td>
              <td class="py-2 pr-3 text-fg/50">{operatorRoleLabel(a.role)}</td>
              <td class="py-2 pr-3 text-fg/40">{formatAt(a.lastSuccessfulLoginAt)}</td>
              <td class="py-2 pr-3 tabular-nums text-fg/70">{a.sessionCount}</td>
              <td class="py-2 text-[11px] text-fg/40">
                {a.disabled ? '停用 ' : ''}{a.loginLocked ? 'Lockout ' : ''}{a.secondFactorEnrolled ? '' : '待綁 2FA'}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if filtered.length === 0}
      <p class="mt-3 text-[12px] text-fg/40">沒有符合的 Operator Account。</p>
    {/if}
  {/if}
</div>

{#if unmatched.length > 0}
  <div class="mt-6 rounded-2xl border border-fg/[0.06] bg-card p-6">
    <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">未對上 Username 的嘗試</h2>
    <ul class="mt-3 space-y-1">
      {#each unmatched as ev, i (`${ev.at}-${ev.username}-${i}`)}
        <li class="flex justify-between gap-3 font-mono text-[11px] text-fg/50">
          <span>{formatAt(ev.at)}</span>
          <span>{ev.username}</span>
          <span>{outcomeLabel[ev.outcome]}</span>
          <span>{ev.clientIp}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
