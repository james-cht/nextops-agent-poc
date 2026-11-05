<script lang="ts">
  import { onMount } from 'svelte';
  import AdminStepUpModal from '$lib/components/AdminStepUpModal.svelte';

  let toolToken = $state('');
  let toolTokenMasked = $state('');
  let source = $state<'env' | 'override'>('env');
  let loading = $state(true);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let stepUpOpen = $state(false);
  let pendingAction = $state<'save' | 'restore'>('save');

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/dify-credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      toolTokenMasked = data.toolTokenMasked ?? '';
      toolToken = '';
      source = data.source === 'override' ? 'override' : 'env';
    } catch {
      error = '無法載入 Tool Endpoint Token';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  function requestSave() {
    pendingAction = 'save';
    stepUpOpen = true;
  }

  function requestRestore() {
    pendingAction = 'restore';
    stepUpOpen = true;
  }

  async function runWithPassword(adminPassword: string) {
    saving = true;
    error = null;
    message = null;
    try {
      const res =
        pendingAction === 'save'
          ? await fetch('/api/admin/dify-credentials', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ adminPassword, toolToken }),
            })
          : await fetch('/api/admin/dify-credentials', {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ adminPassword }),
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
    } finally {
      saving = false;
    }
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <div class="mb-6">
    <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">Tool Endpoint Token</h2>
    <p class="mt-1 text-[11px] text-fg/30">
      `NEXTOPS_DIFY_TOKEN` — LangGraph 呼叫 Tool Endpoints 的 Bearer。測通後才可儲存；帳密確認請用共用 step-up。
    </p>
    <p class="mt-2 font-mono text-[10px] text-fg/40">
      目前來源：{source === 'override' ? 'Admin 覆寫' : '部署 env'}
    </p>
  </div>

  {#if loading}
    <p class="text-[12px] text-fg/40">載入中…</p>
  {:else}
    <div class="flex flex-col gap-3">
      <label class="flex flex-col gap-1">
        <span class="font-mono text-[9px] uppercase text-fg/30">
          NEXTOPS_DIFY_TOKEN{#if toolTokenMasked}（目前 {toolTokenMasked}）{/if}
        </span>
        <input
          type="password"
          class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
          bind:value={toolToken}
          placeholder="留空則不變更"
        />
      </label>
    </div>

    <p class="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
      警告：儲存或還原前會進行連線測試與 Platform Owner 密碼確認；通過後立即套用。
    </p>

    <div class="mt-4 flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        disabled={saving}
        onclick={requestSave}
        class="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-40"
      >
        {saving ? '處理中…' : '測試並儲存'}
      </button>
      <button
        type="button"
        disabled={saving || source !== 'override'}
        onclick={requestRestore}
        class="flex-1 rounded-lg border border-fg/15 bg-page px-4 py-2.5 text-[13px] font-semibold text-fg/70 hover:bg-fg/5 disabled:opacity-40"
      >
        還原為部署 env
      </button>
    </div>

    {#if message}
      <p class="mt-2 text-center text-[11px] text-emerald-400">{message}</p>
    {/if}
    {#if error}
      <p class="mt-2 text-center text-[11px] text-red-400">{error}</p>
    {/if}
  {/if}
</div>

<AdminStepUpModal
  bind:open={stepUpOpen}
  title={pendingAction === 'save' ? '確認後儲存 Tool Endpoint Token' : '確認後還原部署 env'}
  confirmLabel={pendingAction === 'save' ? '測試並儲存' : '測通並還原'}
  onConfirm={runWithPassword}
/>
