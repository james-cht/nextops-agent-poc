<script lang="ts">
  import { onMount } from 'svelte';
  import AdminStepUpModal from '$lib/components/AdminStepUpModal.svelte';

  type ModelRate = { inputUsdPerMillion: number; outputUsdPerMillion: number };

  let rates = $state<Record<string, ModelRate>>({});
  let loading = $state(true);
  let saving = $state(false);
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let stepUpOpen = $state(false);
  let jsonText = $state('{}');

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/model-rates');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      rates = data.rates ?? {};
      jsonText = JSON.stringify(rates, null, 2);
    } catch {
      error = '無法載入 Model Rate Table';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
  });

  async function runWithPassword(adminPassword: string) {
    saving = true;
    error = null;
    message = null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      error = 'JSON 無法解析';
      saving = false;
      throw new Error('JSON 無法解析');
    }
    const res = await fetch('/api/admin/model-rates', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adminPassword, rates: parsed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
      error = msg;
      saving = false;
      throw new Error(msg);
    }
    message = data.notice || '一經修改即會生效';
    await load();
    saving = false;
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <div class="mb-4">
    <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">Model Rate Table</h2>
    <p class="mt-1 text-[11px] text-fg/30">
      模型 → input/output USD per 1M tokens。寫入 Trace 當下凍結；改表不回溯。估的 Usage 不是發票。
    </p>
  </div>
  {#if loading}
    <p class="text-[12px] text-fg/40">載入中…</p>
  {:else}
    <textarea
      class="min-h-40 w-full rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[12px] text-fg/80 outline-none focus:border-blue-500/40"
      bind:value={jsonText}
    ></textarea>
    <button
      type="button"
      disabled={saving}
      onclick={() => (stepUpOpen = true)}
      class="mt-3 rounded-lg bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-500 disabled:opacity-40"
    >
      {saving ? '處理中…' : '確認後儲存'}
    </button>
    {#if message}
      <p class="mt-2 text-[11px] text-emerald-400">{message}</p>
    {/if}
    {#if error}
      <p class="mt-2 text-[11px] text-red-400">{error}</p>
    {/if}
  {/if}
</div>

<AdminStepUpModal
  bind:open={stepUpOpen}
  title="確認後儲存 Model Rate Table"
  confirmLabel="儲存"
  onConfirm={runWithPassword}
/>
