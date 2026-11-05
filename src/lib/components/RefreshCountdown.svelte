<script lang="ts">
  let {
    seconds,
    total,
    onRefresh,
    size = 'default',
  }: {
    seconds: number;
    total: number;
    onRefresh: () => void;
    size?: 'default' | 'compact';
  } = $props();

  const compact = $derived(size === 'compact');
  const circumference = 75.4;
  const progress = $derived(total > 0 ? seconds / total : 0);
</script>

<button
  type="button"
  class="group relative flex cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95 {compact ? 'h-8 w-8' : 'h-11 w-11'}"
  onclick={onRefresh}
  aria-label="立即更新儀表板"
  title="點擊立即更新"
>
  <svg
    class="-rotate-90 {compact ? 'h-8 w-8' : 'h-11 w-11'}"
    viewBox="0 0 32 32"
    aria-hidden="true"
  >
    <circle
      cx="16"
      cy="16"
      r="12"
      class="fill-none stroke-fg/10"
      stroke-width="2.5"
    />
    <circle
      cx="16"
      cy="16"
      r="12"
      class="fill-none stroke-blue-400/80 transition-all duration-1000"
      stroke-width="2.5"
      stroke-dasharray={circumference}
      stroke-dashoffset={circumference * (1 - progress)}
      stroke-linecap="round"
    />
  </svg>
  <span class="absolute font-mono font-medium text-fg/70 group-hover:text-fg/90 {compact ? 'text-[10px]' : 'text-[11px]'}">
    {seconds}s
  </span>
</button>
