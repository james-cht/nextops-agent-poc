<script lang="ts">
  import type { Alert } from '$lib/alert-manager';
  import siteConfig from '$lib/site-config.json';

  let {
    alert,
    expanded = false,
    onToggle,
    onAcknowledge,
  }: {
    alert: Alert;
    expanded?: boolean;
    onToggle?: () => void;
    onAcknowledge?: (fingerprint: string) => void;
  } = $props();

  const severity = $derived((alert.labels.severity ?? 'info').toLowerCase());
  const alertname = $derived(alert.labels.alertname ?? 'Unknown');
  const cluster = $derived(alert.labels.cluster ?? alert.labels.kubernetes_cluster ?? '—');
  const summary = $derived(alert.annotations.summary ?? alert.annotations.description ?? '');

  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function siteName(tag: string): string {
    for (const [name, cfg] of Object.entries(siteConfig)) {
      if (cfg.clusterTag === tag) return name;
    }
    return tag;
  }

  const severityStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    critical: { bg: 'bg-danger-bg', border: 'border-danger-border', text: 'text-danger', icon: 'text-danger' },
    warning:  { bg: 'bg-warning-bg', border: 'border-warning-border', text: 'text-warning', icon: 'text-warning' },
    info:     { bg: 'bg-info-bg', border: 'border-info-border', text: 'text-info', icon: 'text-info' },
  };

  const sev = $derived(severityStyles[severity] ?? severityStyles.info);
</script>

<div
  class="group relative overflow-hidden rounded-xl border {sev.border} {sev.bg} transition-all duration-200 hover:border-blue-500/30"
  class:opacity-55={alert.status === 'resolved'}
>
  {#if !alert.acknowledged && alert.status === 'firing'}
    <span class="absolute top-2.5 right-2.5 z-10 rounded-full bg-accent-alarm px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
      NEW
    </span>
  {/if}

  <button
    class="w-full cursor-pointer p-4 text-left"
    onclick={onToggle}
    aria-expanded={expanded}
    aria-label="Toggle alert details"
  >
    <div class="mb-2 flex items-center gap-2 pr-14 flex-wrap">
      <span class="{sev.icon}">
        {#if severity === 'critical'}
          <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 3a.75.75 0 01.75.75v10.5a.75.75 0 01-1.5 0V3.75A.75.75 0 0110 3z" clip-rule="evenodd"/><path d="M10 17a1 1 0 100-2 1 1 0 000 2z"/></svg>
        {:else if severity === 'warning'}
          <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
        {:else}
          <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>
        {/if}
      </span>
      <span class="text-[12px] font-bold tracking-wider {sev.text}">{severity.toUpperCase()}</span>
      <span class="text-[13px] font-medium text-fg">{alertname}</span>
      <span class="text-[12px] text-muted">{siteName(cluster)}</span>
      <span class="ml-auto font-mono text-[11px] text-muted">{timeAgo(alert.startsAt)}</span>
      {#if !alert.acknowledged && alert.status === 'firing' && onAcknowledge}
        <button
          class="rounded border border-success-border px-1.5 py-0.5 text-[11px] text-success transition-colors hover:bg-success-bg"
          onclick={(e) => { e.stopPropagation(); onAcknowledge?.(alert.fingerprint); }}
        >
          ACK
        </button>
      {/if}
    </div>

    <p class="text-[14px] text-fg leading-snug truncate {expanded ? 'whitespace-normal' : ''}">{summary}</p>
  </button>

  {#if expanded}
    <div class="border-t border-fg/5 px-4 py-3">
      <div class="mb-3">
        <strong class="text-[11px] font-medium text-muted-strong">Labels</strong>
        <div class="mt-1 flex flex-wrap gap-1">
          {#each Object.entries(alert.labels) as [key, val]}
            <span class="rounded bg-fg/5 px-2 py-0.5 font-mono text-[11px] text-muted-strong">{key}={val}</span>
          {/each}
        </div>
      </div>
      <div class="font-mono text-[11px] text-muted flex flex-col gap-1">
        <span>Started: {new Date(alert.startsAt).toLocaleString()}</span>
        {#if alert.endsAt}<span>Ended: {new Date(alert.endsAt).toLocaleString()}</span>{/if}
        <span>Acknowledged: {alert.acknowledged ? 'Yes' : 'No'}</span>
      </div>
    </div>
  {/if}
</div>
