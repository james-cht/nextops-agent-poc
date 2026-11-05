<script lang="ts">
  import { metricPulse } from '$lib/metric-pulse.svelte';

  let {
    value,
    class: className = '',
  }: {
    value: string | number;
    class?: string;
  } = $props();

  const pulse = metricPulse(() => value);
</script>

<span
  class="ticking-metric {className}"
  class:is-live={pulse.live}
  aria-live="polite"
  onanimationend={() => pulse.settle()}
>{value}</span>

<style>
  .ticking-metric {
    display: inline-block;
    border-radius: 4px;
    padding: 0 0.15em;
    transform-origin: center bottom;
  }
  .ticking-metric.is-live {
    animation: ticking-metric 0.85s cubic-bezier(0.22, 1.15, 0.36, 1);
  }
  @keyframes ticking-metric {
    0% {
      transform: scale(1);
      background-color: transparent;
    }
    24% {
      transform: scale(1.18);
      background-color: color-mix(in srgb, currentColor 42%, transparent);
    }
    100% {
      transform: scale(1);
      background-color: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ticking-metric.is-live {
      animation: ticking-wash 0.55s ease;
    }
    @keyframes ticking-wash {
      0%,
      100% {
        background-color: transparent;
      }
      35% {
        background-color: color-mix(in srgb, currentColor 42%, transparent);
      }
    }
  }
</style>
