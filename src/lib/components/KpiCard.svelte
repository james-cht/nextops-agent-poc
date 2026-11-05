<script lang="ts">
  import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
  import TickingMetric from '$lib/components/TickingMetric.svelte';
  import { metricPulse } from '$lib/metric-pulse.svelte';

  interface Props {
    label: string;
    value: string | number;
    unit?: string;
    subtext?: string;
    accent?: 'blue' | 'cyan' | 'red' | 'amber';
    icon?: string;
    trend?: 'up' | 'down' | 'neutral';
    progress?: number;
    /** When set, shows red error border and message instead of metric value. */
    error?: string;
    /** When set (and no error), card links to drill-down page. */
    href?: string;
  }

  let { label, value, unit, subtext, accent = 'blue', icon, trend, progress, error, href }: Props = $props();

  const pulse = metricPulse(() => (error ? `err:${error}` : value));

  const accentMap: Record<string, { color: string; glow: string }> = {
    blue:   { color: 'var(--theme-accent-signal)',  glow: 'shadow-blue-500/10' },
    cyan:   { color: 'var(--theme-accent-flow)',    glow: 'shadow-teal-500/10' },
    red:    { color: 'var(--theme-accent-alarm)',   glow: 'shadow-red-500/10' },
    amber:  { color: 'var(--theme-accent-latency)', glow: 'shadow-amber-500/10' },
  };

  const a = $derived(accentMap[accent]);
  const isLink = $derived(Boolean(href && !error));
  const rootClass = $derived(
    `metric-frame group relative block rounded-2xl border shadow-sm transition-[transform,background-color] duration-300 hover:-translate-y-[1px] ${
      error
        ? 'border-danger-border bg-danger-bg'
        : `bg-card ${a.glow}`
    }${isLink ? ' cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-alarm/50' : ''}`,
  );
</script>

<svelte:element
  this={isLink ? 'a' : 'div'}
  href={isLink ? href : undefined}
  class={rootClass}
  class:is-ticking={pulse.live}
  style={error
    ? '--tick-accent: var(--theme-danger)'
    : `--tick-accent: ${a.color}; border-color: color-mix(in srgb, ${a.color} 38%, transparent)`}
>
  <div class="relative overflow-hidden rounded-2xl p-5">
  {#if !error}
    <span class="absolute inset-y-0 left-0 w-[3px]" style="background: {a.color}"></span>
  {/if}
  <div class="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40" style="background: {a.color}"></div>

  <div class="relative z-10">
    <div class="mb-3 flex items-start justify-between gap-3">
      <span class="font-medium leading-snug tracking-[0.08em] text-muted-strong" style="font-size: var(--fs-label)">{label}</span>
      {#if icon}
        <svg class="mt-0.5 h-4 w-4 shrink-0 opacity-80" style="color: {a.color}" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d={icon} />
        </svg>
      {/if}
    </div>

    <div class="flex flex-wrap items-end justify-between gap-2">
      {#if error}
        <div class="flex items-center gap-2">
          <svg class="h-4 w-4 shrink-0 text-danger" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="font-medium text-danger" style="font-size: var(--fs-subtext)">{error}</span>
        </div>
      {:else}
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span class="font-semibold tracking-tight tabular-nums leading-none" style="font-size: var(--fs-metric-value); color: {a.color}">
            <TickingMetric {value} />
          </span>
          {#if unit}
            <span class="font-medium opacity-80" style="font-size: var(--fs-metric-unit); color: {a.color}">{unit}</span>
          {/if}
          {#if trend}
            <span class="ml-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium
              {trend === 'up' ? 'bg-success-bg text-success' : trend === 'down' ? 'bg-danger-bg text-danger' : 'bg-fg/10 text-muted-strong'}"
              style="font-size: var(--fs-trend)"
            >
              <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                {#if trend === 'up'}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                {:else if trend === 'down'}
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                {/if}
              </svg>
              {trend === 'up' ? '+2.4%' : trend === 'down' ? '-1.2%' : '0%'}
            </span>
          {/if}
        </div>
        {#if value === '---'}
          <LoadingSpinner size="sm" compact />
        {/if}
      {/if}
    </div>

    {#if subtext}
      <div class="mt-2 text-muted" style="font-size: var(--fs-subtext)">{subtext}</div>
    {/if}

    {#if progress !== undefined && !error}
      <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
        <div class="h-full rounded-full transition-all duration-500" style="width: {Math.min(progress, 100)}%; background: {a.color}"></div>
      </div>
    {/if}

    {#if isLink}
      <div class="mt-2 text-right text-muted transition-colors group-hover:text-muted-strong" style="font-size: var(--fs-small)">
        檢視詳情 →
      </div>
    {/if}
  </div>
  </div>
</svelte:element>
