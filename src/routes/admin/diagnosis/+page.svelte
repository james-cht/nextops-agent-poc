<script lang="ts">
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  type TabId = 'errors' | 'tracking';
  type SignalLevel = 'healthy' | 'degraded' | 'critical';

  interface DiagnosisError {
    id: string;
    service: string;
    message: string;
    detail?: string;
    timestamp: string;
    status: 'active' | 'resolved';
  }

  interface TrackingEvent {
    schemaVersion: string;
    ts: string;
    severity: 'debug' | 'info' | 'warn' | 'error';
    status: 'success' | 'failure';
    eventType: 'inbound_request' | 'dependency_request' | 'tracking_pipeline';
    requestId: string;
    route: string;
    method?: string;
    dependency?: string;
    url?: string;
    statusCode?: number;
    durationMs?: number;
    message?: string;
    errorCode?: string;
    responseBody?: unknown;
    runtime: {
      serviceName: string;
      instanceId: string;
      containerId: string;
      hostname: string;
      pid: number;
    };
  }

  interface DependencySignal {
    dependency: string;
    level: SignalLevel;
    successRate: number;
    p95DurationMs: number;
    retryRate: number;
    queueDrops: number;
    sampleCount: number;
  }

  interface TrackingPayload {
    enabled: boolean;
    persistEnabled: boolean;
    droppedCount: number;
    runtime: TrackingEvent['runtime'];
    events: TrackingEvent[];
    status: {
      windowMinutes: number;
      generatedAt: string;
      overallLevel: SignalLevel;
      dependencies: DependencySignal[];
    } | null;
  }

  let activeTab = $state<TabId>('errors');
  let errors = $state<DiagnosisError[]>([]);
  let tracking = $state<TrackingPayload | null>(null);
  let loading = $state(true);
  let expandedErrors = $state<Record<string, boolean>>({});
  let expandedEvents = $state<Record<string, boolean>>({});
  let eventFilter = $state('');
  let severityFilter = $state<'all' | 'error' | 'warn' | 'info' | 'debug'>('all');

  const signalLabel: Record<SignalLevel, string> = {
    healthy: '健康',
    degraded: '降級',
    critical: '嚴重',
  };

  const signalClass: Record<SignalLevel, string> = {
    healthy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    degraded: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  };

  async function loadDiagnosis() {
    loading = true;
    try {
      const res = await fetch('/api/diagnosis?limit=300');
      if (res.ok) {
        const data = await res.json();
        errors = data.errors ?? [];
        tracking = data.tracking ?? null;
      }
    } catch (err) {
      console.error('Failed to load diagnosis data:', err);
    } finally {
      loading = false;
    }
  }

  async function clearAll() {
    if (!confirm('您確定要將所有錯誤標記為已解決嗎？')) return;
    try {
      const res = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      if (res.ok) {
        const data = await res.json();
        errors = data.errors ?? [];
      }
    } catch (err) {
      console.error('Failed to clear errors:', err);
    }
  }

  function toggleExpand(id: string, kind: 'error' | 'event') {
    if (kind === 'error') {
      expandedErrors[id] = !expandedErrors[id];
      return;
    }
    expandedEvents[id] = !expandedEvents[id];
  }

  function formatTime(isoStr: string) {
    try {
      return new Date(isoStr).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  }

  function eventKey(event: TrackingEvent, index: number) {
    return `${event.requestId}-${event.ts}-${index}`;
  }

  const filteredEvents = $derived(
    (tracking?.events ?? []).filter((event) => {
      if (severityFilter !== 'all' && event.severity !== severityFilter) return false;
      if (!eventFilter.trim()) return true;
      const needle = eventFilter.trim().toLowerCase();
      return [
        event.requestId,
        event.route,
        event.dependency,
        event.url,
        event.message,
        event.errorCode,
      ].some((value) => value?.toLowerCase().includes(needle));
    }),
  );

  $effect(() => {
    loadDiagnosis();
  });
</script>

<div class="flex max-w-none flex-col gap-6">
  <div class="flex flex-col gap-4 border-b border-fg/10 pb-5 md:flex-row md:items-center md:justify-between">
    <div>
      <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-fg">
        <svg class="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        系統健康診斷與異常註冊表
      </h1>
      <p class="mt-1 text-fg/50" style="font-size: var(--fs-subtext)">
        上游異常快照與 System Behavior Tracking 事件追蹤，協助容器環境除錯。
      </p>
    </div>
    <div class="flex items-center gap-3">
      <button
        onclick={loadDiagnosis}
        class="flex cursor-pointer items-center gap-2 rounded-lg bg-fg/5 px-4 py-2 font-medium text-fg/80 transition-colors hover:bg-fg/10 active:scale-95"
        style="font-size: var(--fs-small)"
      >
        <svg class="h-4 w-4 {loading ? 'animate-spin' : ''}" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
        重新整理
      </button>
      {#if activeTab === 'errors'}
        <button
          onclick={clearAll}
          disabled={errors.length === 0}
          class="flex cursor-pointer items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 font-medium text-red-400 transition-colors hover:bg-red-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          style="font-size: var(--fs-small)"
        >
          清除所有錯誤
        </button>
      {/if}
    </div>
  </div>

  <div class="flex gap-2 rounded-xl border border-fg/[0.06] bg-card p-1">
    <button
      class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors {activeTab === 'errors' ? 'bg-fg/10 text-fg' : 'text-fg/50 hover:text-fg/80'}"
      onclick={() => (activeTab = 'errors')}
    >
      上游異常
    </button>
    <button
      class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors {activeTab === 'tracking' ? 'bg-fg/10 text-fg' : 'text-fg/50 hover:text-fg/80'}"
      onclick={() => (activeTab = 'tracking')}
    >
      行為追蹤
    </button>
  </div>

  {#if activeTab === 'errors'}
    <div class="flex flex-col gap-4 rounded-xl border border-fg/[0.06] bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4 text-fg/60" style="font-size: var(--fs-small)">
        <span>總記錄: <strong class="text-fg">{errors.length}</strong></span>
        <div class="h-3 w-px bg-fg/10"></div>
        <span>未解決: <strong class="text-red-400">{errors.filter((e) => e.status === 'active').length}</strong></span>
        <div class="h-3 w-px bg-fg/10"></div>
        <span>已解決: <strong class="text-emerald-400">{errors.filter((e) => e.status === 'resolved').length}</strong></span>
      </div>
    </div>

    {#if loading && errors.length === 0}
      <div class="flex animate-pulse flex-col items-center justify-center rounded-2xl border border-fg/[0.06] bg-card py-20">
        <LoadingSpinner size="lg" label="正在載入系統診斷數據..." />
      </div>
    {:else if errors.length === 0}
      <div class="flex flex-col items-center justify-center rounded-2xl border border-fg/[0.06] bg-card px-4 py-20 text-center">
        <h3 class="text-lg font-semibold text-fg">目前沒有上游異常記錄</h3>
        <p class="mt-1 max-w-sm text-fg/50" style="font-size: var(--fs-subtext)">
          可切換到「行為追蹤」查看完整請求事件與 System Status Signal。
        </p>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        {#each errors as error (error.id)}
          <div class="overflow-hidden rounded-xl border border-fg/[0.06] bg-card">
            <button
              class="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left hover:bg-fg/[0.02]"
              onclick={() => toggleExpand(error.id, 'error')}
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wider {error.status === 'active' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}">
                    {error.service}
                  </span>
                  <span class="text-fg/40" style="font-size: var(--fs-small)">{formatTime(error.timestamp)}</span>
                </div>
                <h3 class="mt-1.5 break-all font-medium text-fg/90" style="font-size: var(--fs-body)">{error.message}</h3>
              </div>
            </button>
            {#if expandedErrors[error.id] && error.detail}
              <div class="border-t border-fg/[0.06] bg-fg/5 px-5 py-4">
                <pre class="max-h-96 overflow-x-auto rounded-lg border border-fg/5 bg-table p-4 font-mono text-xs leading-relaxed text-danger-fg">{error.detail}</pre>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    {#if !tracking?.enabled}
      <div class="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-6 text-amber-100">
        <h3 class="text-lg font-semibold">System Behavior Tracking 尚未啟用</h3>
        <p class="mt-2 text-sm text-amber-100/80">
          請在部署環境設定 <code class="rounded bg-fg/10 px-1.5 py-0.5">SYSTEM_BEHAVIOR_TRACKING_ENABLED=true</code>。
          docker-compose 已預設啟用；Helm 可透過 ConfigMap 調整。
        </p>
      </div>
    {:else}
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-xl border border-fg/[0.06] bg-card p-4">
          <p class="text-xs uppercase tracking-wider text-fg/40">整體狀態</p>
          <p class="mt-2 text-xl font-semibold text-fg">
            {signalLabel[tracking.status?.overallLevel ?? 'healthy']}
          </p>
        </div>
        <div class="rounded-xl border border-fg/[0.06] bg-card p-4">
          <p class="text-xs uppercase tracking-wider text-fg/40">執行個體</p>
          <p class="mt-2 truncate font-mono text-sm text-fg/80">{tracking.runtime.instanceId}</p>
        </div>
        <div class="rounded-xl border border-fg/[0.06] bg-card p-4">
          <p class="text-xs uppercase tracking-wider text-fg/40">容器 / 主機</p>
          <p class="mt-2 truncate font-mono text-sm text-fg/80">{tracking.runtime.hostname}</p>
        </div>
        <div class="rounded-xl border border-fg/[0.06] bg-card p-4">
          <p class="text-xs uppercase tracking-wider text-fg/40">佇列丟棄</p>
          <p class="mt-2 text-xl font-semibold {tracking.droppedCount > 0 ? 'text-red-400' : 'text-emerald-400'}">
            {tracking.droppedCount}
          </p>
        </div>
      </div>

      {#if tracking.status && tracking.status.dependencies.length > 0}
        <div class="grid gap-3 md:grid-cols-2">
          {#each tracking.status.dependencies as signal (signal.dependency)}
            <div class="rounded-xl border {signalClass[signal.level]} bg-card p-4">
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-semibold text-fg">{signal.dependency}</h3>
                <span class="rounded border px-2 py-0.5 text-xs font-semibold {signalClass[signal.level]}">
                  {signalLabel[signal.level]}
                </span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-sm text-fg/70">
                <span>成功率: <strong class="text-fg">{signal.successRate}%</strong></span>
                <span>P95: <strong class="text-fg">{signal.p95DurationMs}ms</strong></span>
                <span>重試率: <strong class="text-fg">{signal.retryRate}%</strong></span>
                <span>樣本數: <strong class="text-fg">{signal.sampleCount}</strong></span>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="rounded-xl border border-fg/[0.06] bg-card px-4 py-8 text-center text-fg/50">
          尚無依賴服務樣本。請觸發 API 請求（例如 ES 查詢或站點概覽）後重新整理。
        </div>
      {/if}

      <div class="flex flex-col gap-3 rounded-xl border border-fg/[0.06] bg-card p-4 sm:flex-row">
        <input
          type="text"
          bind:value={eventFilter}
          placeholder="搜尋 requestId / route / dependency..."
          class="flex-1 rounded-lg border border-fg/10 bg-input px-3 py-2 text-sm text-fg"
        />
        <select
          bind:value={severityFilter}
          class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-sm text-fg"
        >
          <option value="all">全部嚴重度</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
          <option value="debug">debug</option>
        </select>
      </div>

      {#if filteredEvents.length === 0}
        <div class="rounded-xl border border-fg/[0.06] bg-card px-4 py-10 text-center text-fg/50">
          目前沒有符合條件的追蹤事件。
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each filteredEvents as event, index (eventKey(event, index))}
            {@const key = eventKey(event, index)}
            <div class="overflow-hidden rounded-xl border border-fg/[0.06] bg-card">
              <button
                class="flex w-full cursor-pointer items-start justify-between gap-4 p-4 text-left hover:bg-fg/[0.02]"
                onclick={() => toggleExpand(key, 'event')}
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="rounded bg-fg/5 px-2 py-0.5 font-mono text-fg/70">{event.eventType}</span>
                    <span class="rounded px-2 py-0.5 {event.severity === 'error' ? 'bg-danger-bg text-danger' : event.severity === 'warn' ? 'bg-warning-bg text-warning' : 'bg-info-bg text-info-fg'}">
                      {event.severity}
                    </span>
                    <span class="text-fg/40">{formatTime(event.ts)}</span>
                  </div>
                  <p class="mt-2 break-all font-medium text-fg/90">
                    {event.dependency ?? event.route}
                    {#if event.statusCode}
                      <span class="text-fg/50"> · HTTP {event.statusCode}</span>
                    {/if}
                    {#if event.durationMs}
                      <span class="text-fg/50"> · {event.durationMs}ms</span>
                    {/if}
                  </p>
                  <p class="mt-1 truncate font-mono text-xs text-fg/45">requestId: {event.requestId}</p>
                </div>
              </button>
              {#if expandedEvents[key]}
                <div class="border-t border-fg/[0.06] bg-fg/5 px-4 py-3">
                  <pre class="max-h-96 overflow-x-auto rounded-lg border border-fg/5 bg-table p-3 font-mono text-xs leading-relaxed text-fg/80">{JSON.stringify(event, null, 2)}</pre>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>
