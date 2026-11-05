<script lang="ts">
  let {
    status = 'normal',
    pulse = false,
  }: {
    /** 'normal' | 'warning' | 'critical' */
    status?: string;
    pulse?: boolean;
  } = $props();

  const colorMap: Record<string, string> = {
    normal: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
  };
</script>

<span
  class="status-dot"
  class:pulse
  style="background: {colorMap[status] ?? '#64748b'}"
></span>

<style>
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.pulse {
    animation: pulse-anim 1.5s ease-in-out infinite;
  }
  @keyframes pulse-anim {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
