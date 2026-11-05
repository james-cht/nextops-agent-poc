<script lang="ts">
  type AuditEntry = {
    ts: string;
    action: string;
    setting: string;
    outcome: string;
    actor: string;
    detail?: Record<string, unknown>;
  };

  let entries = $state<AuditEntry[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/audit?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      entries = Array.isArray(data.entries) ? data.entries : [];
    } catch {
      error = '無法載入稽核紀錄';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void load();
  });
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
  <div class="mb-6 flex items-start justify-between gap-3">
    <div>
      <h2 class="text-[15px] font-semibold tracking-tight text-fg">Config Audit Log</h2>
      <p class="mt-1 text-[13px] text-muted">Runtime Setting 變更嘗試與結果（密鑰不明文記錄）</p>
    </div>
    <button
      type="button"
      class="chrome-control"
      onclick={load}
    >
      重新整理
    </button>
  </div>

  {#if loading}
    <p class="text-[13px] text-muted">載入中…</p>
  {:else if error}
    <p class="text-[13px] text-danger">{error}</p>
  {:else if entries.length === 0}
    <p class="text-[13px] text-muted">尚無紀錄</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-left text-[13px]">
        <thead class="font-mono text-[11px] uppercase tracking-wide text-muted-strong">
          <tr>
            <th class="py-2 pr-3">時間</th>
            <th class="py-2 pr-3">設定</th>
            <th class="py-2 pr-3">動作</th>
            <th class="py-2 pr-3">結果</th>
            <th class="py-2">操作者</th>
          </tr>
        </thead>
        <tbody class="text-fg">
          {#each entries as e (e.ts + e.setting + e.outcome)}
            <tr class="border-t border-line">
              <td class="py-2 pr-3 font-mono text-[12px] whitespace-nowrap">{e.ts}</td>
              <td class="py-2 pr-3 font-mono">{e.setting}</td>
              <td class="py-2 pr-3">{e.action}</td>
              <td class="py-2 pr-3">{e.outcome}</td>
              <td class="py-2 font-mono">{e.actor}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
