<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { connectAlertStream } from '$lib/alert-sse';
  import type { Alert } from '$lib/alert-manager';
  import { buildAlertDrilldownHref } from '$lib/alert-active-window';
  import siteConfig from '$lib/site-config.json';
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

  let alerts = $state<Alert[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Filters
  let selectedSite = $state('All Sites');
  let selectedLevel = $state('All Levels');

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/alerts?limit=200');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      alerts = data.alerts || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to fetch alerts';
    } finally {
      loading = false;
    }
  }

  // Calculate 24 hourly bins (from 23 hours ago up to the current hour)
  let bins = $derived.by(() => {
    const now = new Date();
    const result = [];

    // Pre-filter alerts based on selected filters
    const filteredAlerts = alerts.filter(alert => {
      // 1. Site Location Filter
      if (selectedSite !== 'All Sites') {
        const config = siteConfig[selectedSite as keyof typeof siteConfig];
        if (config) {
          const cluster = alert.labels.cluster;
          const k8sCluster = alert.labels.kubernetes_cluster;
          if (cluster !== config.clusterTag && k8sCluster !== config.clusterTag) {
            return false;
          }
        }
      }

      // 2. Alert Level Filter
      if (selectedLevel !== 'All Levels') {
        const severity = (alert.labels.severity || '').toLowerCase();
        if (severity !== selectedLevel.toLowerCase()) {
          return false;
        }
      }

      return true;
    });

    for (let i = 23; i >= 0; i--) {
      const hourStart = new Date(now);
      hourStart.setHours(now.getHours() - i, 0, 0, 0);
      
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourStart.getHours() + 1);
      const hourEndMs = hourEnd.getTime() - 1;

      let critical = 0;
      let warning = 0;
      let info = 0;

      const startMs = hourStart.getTime();
      const endMs = hourEndMs;

      for (const alert of filteredAlerts) {
        const alertStart = new Date(alert.startsAt).getTime();
        const alertEnd = alert.endsAt ? new Date(alert.endsAt).getTime() : null;

        const isActive = alertStart <= endMs && (alertEnd === null || alertEnd >= startMs);
        if (isActive) {
          const severity = (alert.labels.severity || '').toLowerCase();
          if (severity === 'critical') {
            critical++;
          } else if (severity === 'warning') {
            warning++;
          } else {
            info++;
          }
        }
      }

      const total = critical + warning + info;
      const label = `${hourStart.getHours().toString().padStart(2, '0')}:00`;

      result.push({
        hourStart,
        hourEnd,
        endMs: hourEndMs,
        critical,
        warning,
        info,
        total,
        label
      });
    }

    return result;
  });

  // Calculate max count across all bins to scale the chart bars
  let maxCount = $derived(Math.max(...bins.map(b => b.total), 1));

  // Calculate linear regression (best-fit) line parameters
  let trendLine = $derived.by(() => {
    const N = bins.length;
    if (N === 0) return null;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < N; i++) {
      const x = i;
      const y = bins[i].total;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const denominator = N * sumX2 - sumX * sumX;
    const m = denominator === 0 ? 0 : (N * sumXY - sumX * sumY) / denominator;
    const c = (sumY - m * sumX) / N;

    const yStart = c;
    const yEnd = 23 * m + c;

    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    const yStartSvg = clamp(100 - (yStart / maxCount) * 100, 0, 100);
    const yEndSvg = clamp(100 - (yEnd / maxCount) * 100, 0, 100);

    return {
      x1: 5,
      y1: yStartSvg,
      x2: 235,
      y2: yEndSvg
    };
  });

  // Calculate the trend percentage dynamically: current 12 hours vs previous 12 hours
  let trendData = $derived.by(() => {
    const prev12 = bins.slice(0, 12);
    const curr12 = bins.slice(12, 24);

    const prevCount = prev12.reduce((sum, b) => sum + b.total, 0);
    const currCount = curr12.reduce((sum, b) => sum + b.total, 0);

    let text = '0.0%';
    let color = 'text-fg/40';
    let direction: 'up' | 'down' | 'neutral' = 'neutral';

    if (prevCount === 0) {
      if (currCount === 0) {
        text = '0.0%';
        color = 'text-fg/40';
        direction = 'neutral';
      } else {
        text = `+${currCount}`;
        color = 'text-danger';
        direction = 'up';
      }
    } else {
      const pct = ((currCount - prevCount) / prevCount) * 100;
      if (pct > 0) {
        text = `+${pct.toFixed(1)}%`;
        color = 'text-danger';
        direction = 'up';
      } else if (pct < 0) {
        text = `${pct.toFixed(1)}%`;
        color = 'text-success';
        direction = 'down';
      } else {
        text = '0.0%';
        color = 'text-fg/40';
        direction = 'neutral';
      }
    }

    return {
      prevCount,
      currCount,
      text,
      color,
      direction
    };
  });

  type TrendBin = { hourStart: Date; endMs: number; total: number };

  function drillDown(bin: TrendBin) {
    if (bin.total <= 0) return;
    let siteClusterTag: string | undefined;
    if (selectedSite !== 'All Sites') {
      const config = siteConfig[selectedSite as keyof typeof siteConfig];
      siteClusterTag = config?.clusterTag;
    }
    const severity = selectedLevel !== 'All Levels' ? selectedLevel : undefined;
    goto(buildAlertDrilldownHref({
      publicBasePath: base,
      hourStart: bin.hourStart,
      hourEndMs: bin.endMs,
      siteClusterTag,
      severity,
    }));
  }

  onMount(() => {
    fetchAlerts();

    const sseCleanup = connectAlertStream(null, {
      onSnapshot(snapshotAlerts, _summary, _unacked) {
        // Don't wipe Prometheus-fetched data when the webhook store is still empty.
        if (snapshotAlerts.length > 0 || alerts.length === 0) {
          alerts = snapshotAlerts;
        }
        loading = false;
      },
      onAlert(newAlert) {
        const index = alerts.findIndex(a => a.fingerprint === newAlert.fingerprint);
        if (index !== -1) {
          alerts[index] = newAlert;
        } else {
          alerts = [newAlert, ...alerts];
        }
      },
    });

    return () => {
      sseCleanup();
    };
  });
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6 shadow-sm">
  <!-- Header with Title and Legend -->
  <div class="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <div>
      <h3 class="font-medium tracking-[0.06em] text-muted-strong" style="font-size: var(--fs-section-title)">告警趨勢 24H</h3>
      <p class="mt-1 text-muted" style="font-size: var(--fs-small)">
        實時統計過去 24 小時內各級別的活動告警
      </p>
    </div>
    
    <!-- Filters and Legend -->
    <div class="flex flex-wrap items-center gap-4 text-sm text-fg/40">
      <!-- Site Location Filter -->
      <select
        bind:value={selectedSite}
        class="rounded-lg border border-fg/10 bg-input px-2.5 py-1.5 text-xs text-fg/70 outline-none transition-colors hover:border-fg/20 focus:border-cyan-500/50 cursor-pointer"
      >
        <option value="All Sites">All Sites</option>
        {#each Object.keys(siteConfig) as site}
          <option value={site}>{site}</option>
        {/each}
      </select>

      <!-- Alert Level Filter -->
      <select
        bind:value={selectedLevel}
        class="rounded-lg border border-fg/10 bg-input px-2.5 py-1.5 text-xs text-fg/70 outline-none transition-colors hover:border-fg/20 focus:border-cyan-500/50 cursor-pointer"
      >
        <option value="All Levels">All Levels</option>
        <option value="Critical">Critical</option>
        <option value="Warning">Warning</option>
        <option value="Info">Info</option>
      </select>

      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-danger"></span>
          Critical
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-warning"></span>
          Warning
        </span>
        <span class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-info"></span>
          Info
        </span>
      </div>
    </div>
  </div>

  {#if loading}
    <div class="flex h-40 items-center justify-center">
      <LoadingSpinner size="sm" label="載入中..." />
    </div>
  {:else if error}
    <div class="flex h-40 items-center justify-center rounded-xl border border-red-500/10 bg-red-500/5 p-4 text-center">
      <div class="flex flex-col items-center gap-2">
        <svg class="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span class="text-red-400" style="font-size: var(--fs-small)">{error}</span>
      </div>
    </div>
  {:else}
    <!-- Stacked Bar Chart -->
    <div class="relative">
      <div class="relative flex h-24 items-end gap-[4px] sm:gap-[6px]">
        {#each bins as bin, idx}
          {@const infoHeight = (bin.info / maxCount) * 100}
          {@const warningHeight = (bin.warning / maxCount) * 100}
          {@const criticalHeight = (bin.critical / maxCount) * 100}
          
          <div
            class="group relative flex h-full flex-1 flex-col justify-end"
            class:cursor-pointer={bin.total > 0}
            role={bin.total > 0 ? 'button' : undefined}
            tabindex={bin.total > 0 ? 0 : undefined}
            onclick={() => drillDown(bin)}
            onkeydown={(e) => {
              if (bin.total > 0 && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                drillDown(bin);
              }
            }}
          >
            <!-- Tooltip -->
            <div class="absolute bottom-full left-1/2 z-20 mb-2.5 hidden -translate-x-1/2 rounded-lg border border-fg/10 bg-card p-3 shadow-xl pointer-events-none min-w-[160px] group-hover:block">
              <div class="mb-1.5 font-mono font-medium text-xs text-fg/50 text-center">
                {bin.label}
              </div>
              {#if bin.total === 0}
                <div class="flex items-center justify-center gap-1 text-sm text-success font-medium py-1">
                  <span>✓</span>
                  <span>All Clear (0 Alerts)</span>
                </div>
              {:else}
                <div class="flex flex-col gap-1.5 text-sm">
                  <div class="flex items-center justify-between gap-4">
                    <span class="flex items-center gap-1.5 text-danger">
                      <span class="h-1.5 w-1.5 rounded-full bg-danger"></span>
                      Critical
                    </span>
                    <span class="font-mono font-semibold text-fg">{bin.critical}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="flex items-center gap-1.5 text-warning">
                      <span class="h-1.5 w-1.5 rounded-full bg-warning"></span>
                      Warning
                    </span>
                    <span class="font-mono font-semibold text-fg">{bin.warning}</span>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="flex items-center gap-1.5 text-info">
                      <span class="h-1.5 w-1.5 rounded-full bg-info"></span>
                      Info
                    </span>
                    <span class="font-mono font-semibold text-fg">{bin.info}</span>
                  </div>
                  <div class="mt-1 border-t border-fg/5 pt-1.5 flex items-center justify-between gap-4 text-fg/60">
                    <span>Total</span>
                    <span class="font-mono font-bold text-fg">{bin.total}</span>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Bar segments -->
            {#if bin.total === 0}
              <div class="text-center w-full text-[10px] text-fg/10 group-hover:text-emerald-400/50 font-mono transition-colors duration-200 select-none">0</div>
            {:else}
              <div class="flex w-full flex-col justify-end overflow-hidden rounded-t-sm transition-all duration-300 group-hover:brightness-110" style="height: {((bin.total) / maxCount) * 100}%">
                {#if bin.info > 0}
                  <div class="w-full bg-info" style="height: {(bin.info / bin.total) * 100}%"></div>
                {/if}
                {#if bin.warning > 0}
                  <div class="w-full bg-warning" style="height: {(bin.warning / bin.total) * 100}%"></div>
                {/if}
                {#if bin.critical > 0}
                  <div class="w-full bg-danger" style="height: {(bin.critical / bin.total) * 100}%"></div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        <!-- SVG Overlay for Trend Line -->
        <svg class="absolute inset-0 pointer-events-none w-full h-full" viewBox="0 0 240 100" preserveAspectRatio="none">
          {#if trendLine}
            <line
              x1={trendLine.x1}
              y1={trendLine.y1}
              x2={trendLine.x2}
              y2={trendLine.y2}
              stroke="var(--theme-success)"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          {/if}
        </svg>
      </div>

      <!-- X-Axis Labels (Start, 6h, 12h, 18h, End) -->
      <div class="mt-3 flex justify-between font-mono text-xs text-fg/40">
        <span>{bins[0]?.label}</span>
        <span>{bins[6]?.label}</span>
        <span>{bins[12]?.label}</span>
        <span>{bins[18]?.label}</span>
        <span>{bins[23]?.label}</span>
      </div>
    </div>

    <!-- Trend Footer -->
    <div class="mt-4 flex items-center gap-2 border-t border-fg/5 pt-4">
      <span class="font-medium {trendData.color}" style="font-size: var(--fs-body)">
        {trendData.text}
      </span>
      <span class="text-fg/25" style="font-size: var(--fs-small)">
        {#if trendData.direction === 'up'}
          較前 12 小時上升 (活動告警增加)
        {:else if trendData.direction === 'down'}
          較前 12 小時下降 (活動告警減少)
        {:else}
          與前 12 小時持平
        {/if}
      </span>
    </div>
  {/if}
</div>
