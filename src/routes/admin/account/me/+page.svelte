<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { publicHref } from '$lib/kit-public-href';
  import OperatorSelfService from '$lib/components/OperatorSelfService.svelte';
  import { canRegisterApplication } from '$lib/application-catalog';
  import type { OperatorRole } from '$lib/operator-role';

  type AccountRow = {
    username: string;
    email: string;
    role: OperatorRole;
    secondFactorEnrolled: boolean;
    lastSuccessfulLoginAt: string | null;
    sessionCount: number;
    loginLocked: boolean;
    disabled: boolean;
  };

  type GitLabAccessStatus = {
    connected: boolean;
    expiresAt: string | null;
    valid: boolean;
  };

  let account = $state<AccountRow | null>(null);
  let sessions = $state<
    { id: string; clientIp: string; userAgent: string | null; createdAt: string; lastSeenAt: string }[]
  >([]);
  let loginEvents = $state<
    { username: string; outcome: 'success' | 'failure' | 'lockout' | 'unlock'; clientIp: string; at: string }[]
  >([]);
  let currentSessionId = $state<string | null>(null);
  let gitlabAccess = $state<GitLabAccessStatus | null>(null);
  let oauthRedirectUri = $state<string | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let gitlabBanner = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/account/me');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      account = data.account ?? null;
      sessions = data.sessions ?? [];
      loginEvents = data.loginEvents ?? [];
      currentSessionId = data.currentSessionId ?? null;
      gitlabAccess = data.gitlabAccess ?? null;
      oauthRedirectUri = data.oauthRedirectUri ?? null;
    } catch {
      error = '無法載入自己的 Operator Account';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const gitlab = $page.url.searchParams.get('gitlab');
    const reason = $page.url.searchParams.get('reason');
    if (gitlab === 'connected') gitlabBanner = 'GitLab Access 已連線';
    else if (gitlab === 'error') gitlabBanner = reason ? `GitLab Access 失敗：${reason}` : 'GitLab Access 失敗';
    void load();
  });
</script>

{#if loading}
  <p class="text-[12px] text-fg/40">載入中…</p>
{:else if account}
  {#if gitlabBanner}
    <p class="mb-3 text-[12px] text-fg/70">{gitlabBanner}</p>
  {/if}
  {#if canRegisterApplication(account.role)}
    <div class="mb-4 rounded-2xl border border-fg/[0.06] bg-card p-6">
      <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">GitLab Access</h2>
      <p class="mt-1 text-[12px] text-fg/45">
        授權 NextOps 使用你的 GitLab 身分進行 Application Registration。與 Session 分開；過期只會再挑戰
        GitLab。
      </p>
      <p class="mt-3 text-[12px] text-fg/60">
        {#if gitlabAccess?.valid}
          已連線{#if gitlabAccess.expiresAt}（到期 {new Date(gitlabAccess.expiresAt).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' })}）{/if}
        {:else if gitlabAccess?.connected}
          已連線但已過期 — 請重新授權
        {:else}
          尚未連線
        {/if}
      </p>
      {#if oauthRedirectUri}
        <p class="mt-2 break-all font-mono text-[11px] text-fg/40">
          請把此 Redirect URI 原樣貼到 GitLab OAuth App（須與下方連接時送出的完全一致）：
          <br />
          {oauthRedirectUri}
        </p>
      {/if}
      <a
        href={publicHref('/api/auth/gitlab/authorize')}
        class="mt-3 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white"
      >
        {gitlabAccess?.valid ? '重新授權 GitLab' : '連接 GitLab'}
      </a>
    </div>
  {/if}
  <OperatorSelfService
    {account}
    {sessions}
    {loginEvents}
    {currentSessionId}
    onChanged={load}
  />
{:else}
  <p class="text-[12px] text-danger">{error ?? 'Session required'}</p>
{/if}
