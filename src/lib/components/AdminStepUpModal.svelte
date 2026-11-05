<script lang="ts">
  let {
    open = $bindable(false),
    title = '確認 Platform Owner 密碼',
    confirmLabel = '確認並套用',
    onConfirm,
  }: {
    open?: boolean;
    title?: string;
    confirmLabel?: string;
    onConfirm: (adminPassword: string) => Promise<void> | void;
  } = $props();

  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) {
      password = '';
      error = null;
      busy = false;
    }
  });

  async function submit() {
    if (!password) {
      error = '請輸入 Platform Owner 密碼';
      return;
    }
    busy = true;
    error = null;
    try {
      await onConfirm(password);
      open = false;
    } catch (e) {
      error = e instanceof Error ? e.message : '確認失敗';
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
    <div class="w-full max-w-md rounded-2xl border border-fg/10 bg-card p-5 shadow-xl">
      <h3 class="text-[15px] font-semibold text-fg/90">{title}</h3>
      <p class="mt-2 text-[11px] text-amber-200/90">
        一經修改即會生效。請再次輸入目前登入用的 Platform Owner 密碼以確認。
      </p>
      <label class="mt-4 flex flex-col gap-1">
        <span class="font-mono text-[9px] uppercase text-fg/30">Platform Owner 密碼</span>
        <input
          type="password"
          class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none focus:border-blue-500/40"
          bind:value={password}
          onkeydown={(e) => e.key === 'Enter' && void submit()}
        />
      </label>
      {#if error}
        <p class="mt-2 text-[11px] text-red-400">{error}</p>
      {/if}
      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-lg border border-fg/15 px-3 py-2 text-[13px] text-fg/60"
          disabled={busy}
          onclick={() => (open = false)}
        >
          取消
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg bg-teal-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          disabled={busy}
          onclick={() => void submit()}
        >
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
