<script lang="ts">
  import TickingMetric from '$lib/components/TickingMetric.svelte';
  import { metricPulse } from '$lib/metric-pulse.svelte';

  let {
    title = '',
    environment = '混合環境',
    cpu = 0,
    mem = 0,
    disk = 0,
    k8sCpu = 0,
    k8sMem = 0,
    k8sDisk = 0,
    nodeCpu = 0,
    nodeMem = 0,
    nodeDisk = 0,
    net = 0,
    osNodesReady = 0,
    osNodesTotal = 0,
    k8sNodesReady = 0,
    k8sNodesTotal = 0,
    podsReady = 0,
    podsTotal = 0,
    alertsCount = 0,
    href = '',
    error = '',
  }: {
    title: string;
    environment?: string;
    cpu?: number;
    mem?: number;
    disk?: number;
    k8sCpu?: number;
    k8sMem?: number;
    k8sDisk?: number;
    nodeCpu?: number;
    nodeMem?: number;
    nodeDisk?: number;
    net?: number;
    osNodesReady?: number;
    osNodesTotal?: number;
    k8sNodesReady?: number;
    k8sNodesTotal?: number;
    podsReady?: number;
    podsTotal?: number;
    alertsCount?: number;
    href?: string;
    error?: string;
  } = $props();

  function colorFor(value: number): string {
    return value > 80 ? 'var(--theme-accent-alarm)' : value > 60 ? 'var(--theme-accent-latency)' : 'var(--theme-accent-signal)';
  }

  const finalK8sCpu = $derived(k8sCpu !== undefined && k8sCpu !== 0 ? k8sCpu : cpu);
  const finalK8sMem = $derived(k8sMem !== undefined && k8sMem !== 0 ? k8sMem : mem);
  const finalK8sDisk = $derived(k8sDisk !== undefined && k8sDisk !== 0 ? k8sDisk : disk);

  const finalNodeCpu = $derived(nodeCpu !== undefined && nodeCpu !== 0 ? nodeCpu : Math.max(0, cpu - 5));
  const finalNodeMem = $derived(nodeMem !== undefined && nodeMem !== 0 ? nodeMem : Math.max(0, mem - 5));
  const finalNodeDisk = $derived(nodeDisk !== undefined && nodeDisk !== 0 ? nodeDisk : Math.max(0, disk - 5));

  const k8sMetrics = $derived([
    { key: 'cpu', label: 'CPU', value: finalK8sCpu },
    { key: 'mem', label: 'MEM', value: finalK8sMem },
    { key: 'disk', label: 'DISK', value: finalK8sDisk },
  ]);

  const nodeMetrics = $derived([
    { key: 'cpu', label: 'CPU', value: finalNodeCpu },
    { key: 'mem', label: 'MEM', value: finalNodeMem },
    { key: 'disk', label: 'DISK', value: finalNodeDisk },
  ]);

  const snapshot = $derived(
    error
      ? `err:${error}`
      : [
          finalK8sCpu,
          finalK8sMem,
          finalK8sDisk,
          finalNodeCpu,
          finalNodeMem,
          finalNodeDisk,
          osNodesReady,
          osNodesTotal,
          k8sNodesReady,
          k8sNodesTotal,
          podsReady,
          podsTotal,
          alertsCount,
        ].join('|'),
  );
  const pulse = metricPulse(() => snapshot);
  const tickAccent = $derived(
    error
      ? 'var(--theme-danger)'
      : alertsCount > 0
        ? 'var(--theme-warning)'
        : 'var(--theme-accent-signal)',
  );
</script>

<a
  {href}
  aria-label="View details for {title}"
  class="metric-frame group relative block w-full rounded-2xl border {error ? 'border-danger-border bg-danger-bg' : 'border-line bg-card'} text-left transition-[transform,background-color,box-shadow] duration-200 {error ? '' : 'hover:border-info/50 hover:shadow-xl hover:shadow-info/5'} active:scale-[0.99]"
  class:is-ticking={pulse.live}
  style="--tick-accent: {tickAccent}"
>
  <div class="relative overflow-hidden rounded-2xl p-5">
  <div class="relative z-10">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <h3 class="text-[15px] font-semibold tracking-tight">{title}</h3>
        <span class="rounded-md bg-fg/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-strong">{environment}</span>
        <span class="rounded-md border border-info-border bg-info-bg px-1.5 py-0.5 font-mono text-[11px] text-info">
          主機 <TickingMetric value={`${osNodesReady}/${osNodesTotal}`} />
        </span>
      </div>
      <div class="flex shrink-0 items-center">
        {#if error}
          <div class="flex items-center gap-1 rounded-md border border-danger-border bg-danger-bg px-1.5 py-0.5 text-[11px] font-medium text-danger">
            <span class="h-1.5 w-1.5 rounded-full bg-danger"></span>
            載入失敗
          </div>
        {:else if alertsCount > 0}
          <div class="flex items-center gap-1 rounded-md border border-warning-border bg-warning-bg px-1.5 py-0.5 text-[11px] font-medium text-warning">
            <span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
            <TickingMetric value={alertsCount} /> 告警
          </div>
        {:else}
          <div class="flex items-center gap-1 rounded-md border border-success-border bg-success-bg px-1.5 py-0.5 text-[11px] font-medium text-success">
            <span class="h-1.5 w-1.5 rounded-full bg-success"></span>
            正常
          </div>
        {/if}
      </div>
    </div>

    {#if error}
      <div class="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-danger-border bg-danger-bg p-4 text-center">
        <svg class="h-5 w-5 text-danger" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span class="text-danger" style="font-size: var(--fs-small)">{error}</span>
      </div>
    {:else}
    <div class="mb-3">
      <div class="mb-1.5 flex items-center gap-2">
        <span class="text-[11px] font-medium tracking-[1px] text-muted uppercase">K8S</span>
        <div class="h-px flex-1 bg-line"></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        {#each k8sMetrics as m}
          <div>
            <div class="mb-1 flex items-baseline justify-between gap-1 text-[11px]">
              <span class="text-muted">{m.label}</span>
              <span class="font-mono text-fg tabular-nums">
                <TickingMetric value={m.value} />%
              </span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-line">
              <div class="h-full rounded-full transition-all duration-500" style="width: {m.value}%; background: {colorFor(m.value)}"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="mb-3">
      <div class="mb-1.5 flex items-center gap-2">
        <span class="text-[11px] font-medium tracking-[1px] text-muted uppercase">節點</span>
        <div class="h-px flex-1 bg-line"></div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        {#each nodeMetrics as m}
          <div>
            <div class="mb-1 flex items-baseline justify-between gap-1 text-[11px]">
              <span class="text-muted">{m.label}</span>
              <span class="font-mono text-fg tabular-nums">
                <TickingMetric value={m.value} />%
              </span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-line">
              <div class="h-full rounded-full transition-all duration-500" style="width: {m.value}%; background: {colorFor(m.value)}"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono text-[11px]">
      <div class="min-w-0">
        <div class="text-muted">非K8s節點</div>
        <div class="mt-0.5 tabular-nums text-accent-signal">
          <TickingMetric value={`${Math.max(0, (osNodesReady ?? 0) - (k8sNodesReady ?? 0))}/${Math.max(0, (osNodesTotal ?? 0) - (k8sNodesTotal ?? 0))}`} />
        </div>
      </div>
      <div class="min-w-0">
        <div class="text-muted">K8s節點</div>
        <div class="mt-0.5 tabular-nums text-accent-flow">
          <TickingMetric value={`${k8sNodesReady}/${k8sNodesTotal}`} />
        </div>
      </div>
      <div class="min-w-0">
        <div class="text-muted">Pods</div>
        <div class="mt-0.5 tabular-nums text-success">
          <TickingMetric value={`${podsReady}/${podsTotal}`} />
        </div>
      </div>
    </div>
    {/if}
  </div>
  </div>
</a>
