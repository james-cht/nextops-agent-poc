<script lang="ts">
  import { goto } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';
  import { OPERATOR_ROLES, operatorRoleLabel, type OperatorRole } from '$lib/operator-role';

  let username = $state('');
  let email = $state('');
  let displayName = $state('');
  let role = $state<OperatorRole>('viewer');
  let creating = $state(false);
  let error = $state<string | null>(null);
  let shownTemp = $state<string | null>(null);
  let createdName = $state<string | null>(null);

  async function create() {
    creating = true;
    error = null;
    shownTemp = null;
    createdName = null;
    try {
      const res = await fetch('/api/admin/operators', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, email, displayName, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `建立失敗 (HTTP ${res.status})`;
        return;
      }
      shownTemp = (data as { temporaryPassword?: string }).temporaryPassword ?? null;
      createdName = username.trim();
      username = '';
      email = '';
      displayName = '';
      role = 'viewer';
    } catch {
      error = '無法連線伺服器';
    } finally {
      creating = false;
    }
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <a href={publicHref('/admin/account')} class="text-[12px] text-fg/50 hover:text-fg/80">← Accounts</a>
  <h2 class="mt-3 text-[15px] font-semibold tracking-tight text-fg/90">建立 Operator Account</h2>
  <p class="mt-1 text-[11px] text-fg/30">
    Username 建立後不可改。Operator Role 能力見 <a class="underline" href={publicHref('/admin/account/roles')}>Roles</a>。
  </p>

  {#if error}
    <p class="mt-3 text-[12px] text-danger">{error}</p>
  {/if}

  {#if shownTemp}
    <p class="mt-4 text-[12px] text-fg/70">已建立 {createdName}。請用帶外通道交付 Temporary Password（只顯示一次）。</p>
    <p class="mt-2 break-all font-mono text-[12px] text-fg/80">Temporary Password：{shownTemp}</p>
    {#if createdName}
      <a class="mt-3 inline-block text-[12px] text-fg/60 underline" href={publicHref(`/admin/account/${encodeURIComponent(createdName)}`)}>
        前往詳情
      </a>
    {/if}
  {:else}
    <form
      class="mt-4 grid gap-3 sm:grid-cols-2"
      onsubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        placeholder="Username"
        bind:value={username}
        required
      />
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        placeholder="姓名"
        bind:value={displayName}
        required
        maxlength={64}
      />
      <input
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        type="email"
        placeholder="Operator Email"
        bind:value={email}
        required
      />
      <select
        class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        bind:value={role}
      >
        {#each OPERATOR_ROLES as r}
          <option value={r}>{operatorRoleLabel(r)}</option>
        {/each}
      </select>
      <button
        class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] font-medium text-fg/80 disabled:opacity-50"
        type="submit"
        disabled={creating}
      >
        {creating ? '建立中…' : '建立'}
      </button>
    </form>
  {/if}
</div>
