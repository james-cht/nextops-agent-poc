<script lang="ts">
  import { onMount } from 'svelte';
  import AdminStepUpModal from '$lib/components/AdminStepUpModal.svelte';

  let baseUrl = $state('');
  let clientId = $state('');
  let clientSecret = $state('');
  let clientSecretMasked = $state('');
  let token = $state('');
  let tokenMasked = $state('');
  let oauthRedirectUri = $state('');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let stepUpOpen = $state(false);
  let pendingKind = $state<'oauth_client' | 'read_access'>('oauth_client');

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/gitlab-settings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      baseUrl = data.oauth?.baseUrl ?? '';
      clientId = data.oauth?.clientId ?? '';
      clientSecretMasked = data.oauth?.clientSecretMasked ?? '';
      clientSecret = '';
      tokenMasked = data.readAccess?.tokenMasked ?? '';
      token = '';
      oauthRedirectUri = data.oauthRedirectUri ?? '';
    } catch {
      error = '無法載入 GitLab Runtime Settings（需 Platform Owner）';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  function requestSaveOAuth() {
    pendingKind = 'oauth_client';
    stepUpOpen = true;
  }

  function requestSaveRead() {
    pendingKind = 'read_access';
    stepUpOpen = true;
  }

  async function runWithPassword(adminPassword: string) {
    saving = true;
    error = null;
    message = null;
    try {
      const body =
        pendingKind === 'oauth_client'
          ? {
              adminPassword,
              kind: 'oauth_client',
              baseUrl,
              clientId,
              clientSecret,
            }
          : {
              adminPassword,
              kind: 'read_access',
              token,
            };
      const res = await fetch('/api/admin/gitlab-settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : `操作失敗 (HTTP ${res.status})`;
        throw new Error(msg);
      }
      message = (data as { notice?: string }).notice || '一經修改即會生效';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : '儲存失敗';
      throw e instanceof Error ? e : new Error('儲存失敗');
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
    <div class="mb-6">
      <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">GitLab OAuth Client</h2>
      <p class="mt-1 text-[11px] text-fg/30">
        base URL、Application ID（client id）、secret。儲存時會測 OpenID 與 client
        認證；Redirect URI 必須與 GitLab OAuth App 登記的完全一致（跟 NextOps 公開
        URL，不是 Runtime Setting）。
      </p>
      {#if oauthRedirectUri}
        <p class="mt-2 font-mono text-[10px] text-fg/40">Redirect URI：{oauthRedirectUri}</p>
      {/if}
    </div>

    {#if loading}
      <p class="text-[12px] text-fg/40">載入中…</p>
    {:else}
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[9px] uppercase text-fg/30">GitLab base URL</span>
          <input
            type="text"
            class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
            bind:value={baseUrl}
            placeholder="https://gitlab.example"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[9px] uppercase text-fg/30">Client ID</span>
          <input
            type="text"
            class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
            bind:value={clientId}
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[9px] uppercase text-fg/30">
            Client secret{#if clientSecretMasked}（目前 {clientSecretMasked}）{/if}
          </span>
          <input
            type="password"
            class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
            bind:value={clientSecret}
            placeholder="空白＝維持不變"
          />
        </label>
        <button
          type="button"
          class="self-start rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onclick={requestSaveOAuth}
        >
          儲存 OAuth Client
        </button>
      </div>
    {/if}
  </div>

  <div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
    <div class="mb-6">
      <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">GitLab Read Access</h2>
      <p class="mt-1 text-[11px] text-fg/30">
        NextOps 全站唯讀機器憑證（GitLab Personal／Project Access Token，用 PRIVATE-TOKEN 測
        /api/v4/user）。不要貼 OAuth client secret，也不要貼「連接 GitLab」拿到的個人 OAuth
        Access。需先設定 OAuth Client 的 base URL；測通後才可儲存。
      </p>
    </div>

    {#if !loading}
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="font-mono text-[9px] uppercase text-fg/30">
            Read token{#if tokenMasked}（目前 {tokenMasked}）{/if}
          </span>
          <input
            type="password"
            class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
            bind:value={token}
            placeholder="空白＝維持不變"
          />
        </label>
        <button
          type="button"
          class="self-start rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          disabled={saving}
          onclick={requestSaveRead}
        >
          儲存 Read Access
        </button>
      </div>
    {/if}
  </div>

  {#if message}
    <p class="text-[12px] text-emerald-500/90">{message}</p>
  {/if}
  {#if error}
    <p class="text-[12px] text-red-400">{error}</p>
  {/if}
</div>

<AdminStepUpModal
  bind:open={stepUpOpen}
  title="確認變更 GitLab Runtime Setting"
  confirmLabel="測試並儲存"
  onConfirm={runWithPassword}
/>
