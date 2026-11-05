<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  type TraceUsage = {
    inputTokens: number;
    outputTokens: number;
    usd: number;
    source: 'recorded' | 'estimated';
  };

  type TraceSummary = {
    id: string;
    conversationId: string;
    siteId: string;
    operatorUsername: string | null;
    query: string;
    error: string;
    model: string;
    usage: TraceUsage;
    observationCount: number;
    createdAt: string;
  };

  type TraceObservation = {
    kind: string;
    name: string;
    truncated: boolean;
    payload: Record<string, unknown>;
    startedAt: string;
    endedAt: string;
    status?: number;
    error?: string;
  };

  type DiagnosisTrace = TraceSummary & {
    answer: string;
    observations: TraceObservation[];
  };

  let loading = $state(true);
  let error = $state<string | null>(null);
  let traces = $state<TraceSummary[]>([]);
  let selected = $state<DiagnosisTrace | null>(null);
  let detailError = $state<string | null>(null);

  async function loadList() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/admin/traces?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      traces = Array.isArray(data.traces) ? data.traces : [];
    } catch {
      error = '無法載入 Diagnosis Trace（LangGraph sidecar 是否在跑？）';
    } finally {
      loading = false;
    }
  }

  async function openTrace(id: string) {
    detailError = null;
    selected = null;
    try {
      const res = await fetch(`/api/admin/traces/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      selected = await res.json();
    } catch {
      detailError = '無法載入這條 Trace';
    }
  }

  onMount(() => {
    void loadList();
  });
</script>

<div class="mb-6">
  <h2 class="text-[15px] font-semibold tracking-tight text-fg">診斷鏈條</h2>
  <p class="mt-1 text-[13px] text-muted">
    一次 Orchestrator 回合一條 Diagnosis Trace。僅 Platform Owner。資料留在部署內 30 天。
  </p>
</div>

{#if loading}
  <LoadingSpinner />
{:else if error}
  <p class="text-[13px] text-danger">{error}</p>
{:else if traces.length === 0}
  <p class="text-[13px] text-muted">尚無 Diagnosis Trace。</p>
{:else}
  <div class="overflow-x-auto rounded-2xl border border-line">
    <table class="w-full text-left text-[13px]">
      <thead class="bg-header/60 text-[11px] uppercase tracking-wide text-muted-strong">
        <tr>
          <th class="px-3 py-2">時間</th>
          <th class="px-3 py-2">Username</th>
          <th class="px-3 py-2">Site</th>
          <th class="px-3 py-2">Prompt</th>
          <th class="px-3 py-2">Usage</th>
        </tr>
      </thead>
      <tbody>
        {#each traces as row (row.id)}
          <tr>
            <td class="px-3 py-2 font-mono text-[11px] text-fg/60">{row.createdAt}</td>
            <td class="px-3 py-2">{row.operatorUsername ?? '（未歸屬）'}</td>
            <td class="px-3 py-2">{row.siteId || '—'}</td>
            <td class="px-3 py-2">
              <button type="button" class="text-left text-info hover:underline" onclick={() => openTrace(row.id)}>
                {row.query}
              </button>
            </td>
            <td class="px-3 py-2 font-mono text-[11px]">
              {row.usage.inputTokens}/{row.usage.outputTokens}
              · ${row.usage.usd.toFixed(6)}
              · {row.usage.source}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if detailError}
  <p class="mt-4 text-[13px] text-red-400">{detailError}</p>
{/if}

{#if selected}
  <div class="mt-6 rounded-2xl border border-fg/[0.06] bg-card p-5">
    <div class="mb-3 flex items-center justify-between gap-3">
      <h3 class="text-[14px] font-semibold">Trace {selected.id}</h3>
      <button type="button" class="text-[12px] text-fg/50 hover:text-fg" onclick={() => (selected = null)}>關閉</button>
    </div>
    <p class="text-[12px] text-fg/60">model {selected.model} · conversation {selected.conversationId}</p>
    {#if selected.error}
      <p class="mt-2 text-[12px] text-amber-300">{selected.error}</p>
    {/if}
    <ol class="mt-4 flex flex-col gap-3">
      {#each selected.observations as obs, i (`${obs.kind}-${i}`)}
        <li class="rounded-xl border border-fg/[0.06] bg-page p-3">
          <p class="font-mono text-[11px] text-fg/50">
            {obs.kind} · {obs.name}
            {#if obs.truncated}<span class="ml-2 text-amber-300">truncated</span>{/if}
            {#if obs.status}<span class="ml-2">HTTP {obs.status}</span>{/if}
          </p>
          <pre class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-fg/80">{JSON.stringify(obs.payload, null, 2)}</pre>
        </li>
      {/each}
    </ol>
  </div>
{/if}
