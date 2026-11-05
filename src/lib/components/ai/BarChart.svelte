<script lang="ts">
  let {
    data = [],
    annotation = '',
  }: {
    data: Array<{ label: string; value: number; timestamp: string }>;
    annotation?: string;
  } = $props();

  let maxValue = $derived(Math.max(...data.map((d) => d.value), 1));
  let bars = $derived(
    data.map((d, i) => {
      const pct = i / Math.max(data.length - 1, 1);
      const color =
        pct < 0.33 ? '#eab308' : pct < 0.66 ? '#f59e0b' : '#ef4444';
      return { ...d, heightPct: (d.value / maxValue) * 100, color };
    })
  );
</script>

<div class="bar-chart">
  <h4 class="chart-title">
    <span class="title-text">I/O 消耗排序</span>
    <span class="title-annotation">{annotation}</span>
  </h4>
  <svg
    viewBox="0 0 {Math.max(data.length * 60 + 60, 200)} 200"
    class="chart-svg"
  >
    <line x1="40" y1="10" x2="40" y2="170" stroke="var(--theme-line)" stroke-width="1" />
    <line
      x1="40"
      y1="170"
      x2={data.length * 60 + 50}
      y2="170"
      stroke="var(--theme-line)"
      stroke-width="1"
    />

    {#each bars as bar, i}
      <rect
        x={40 + i * 60 + 10}
        y={170 - bar.heightPct * 1.5}
        width="40"
        height={bar.heightPct * 1.5}
        fill={bar.color}
        rx="3"
        opacity="0.85"
      />
      <text
        x={40 + i * 60 + 30}
        y="185"
        text-anchor="middle"
        class="axis-label"
        font-size="10"
      >
        {bar.label}
      </text>
    {/each}
  </svg>
  <p class="spike-warning">檢測到飄高異常波峰</p>
</div>

<style>
  .bar-chart {
    background: var(--theme-elevated);
    border-radius: 8px;
    padding: 12px;
    margin-top: 8px;
  }
  .chart-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px 0;
  }
  .title-text {
    color: color-mix(in srgb, var(--theme-fg) 55%, transparent);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .title-annotation {
    color: var(--theme-warning);
    font-size: 11px;
  }
  .chart-svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .axis-label {
    fill: color-mix(in srgb, var(--theme-fg) 55%, transparent);
  }
  .spike-warning {
    color: var(--theme-danger);
    font-size: 11px;
    font-weight: 600;
    margin: 4px 0 0 0;
    text-align: right;
  }
</style>
