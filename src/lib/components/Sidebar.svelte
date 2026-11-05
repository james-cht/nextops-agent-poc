<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';
  import { mainSidebarNavItems } from '$lib/main-sidebar-nav';
  import { publicHref } from '$lib/kit-public-href';
  import { stripPublicBasePath } from '$lib/public-base-path';

  let { badgeCount = 0 }: { badgeCount?: number } = $props();

  const STORAGE_KEY = 'nextops-sidebar-collapsed';
  const brandTooltip = 'NEXTOPS - AIOps Platform';

  let collapsed = $state(false);
  const navItems = mainSidebarNavItems();

  $effect(() => {
    if (!browser) return;
    try {
      collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* ignore blocked / unavailable storage */
    }
  });

  function toggleCollapsed() {
    collapsed = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore blocked / unavailable storage */
    }
  }

  function isActive(path: string): boolean {
    const current = stripPublicBasePath($page.url.pathname, base);
    if (path === '/') return current === '/';
    return current === path || current.startsWith(`${path}/`);
  }
</script>

<aside
  class="relative flex h-full shrink-0 flex-col border-r border-line bg-header transition-[width] duration-200 ease-out
    {collapsed ? 'w-[4.5rem]' : 'w-64'}"
>
  <!-- Logo + collapse toggle -->
  <div
    class="flex border-b border-line
      {collapsed ? 'flex-col items-center gap-2 px-2 py-4' : 'items-center gap-3 px-4 py-4'}"
  >
    <div
      class="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20"
      title={collapsed ? brandTooltip : undefined}
      aria-label={collapsed ? brandTooltip : undefined}
    >
      <span class="font-mono text-xl font-bold tracking-[-1.5px] text-white">N</span>
      {#if collapsed}
        <span
          role="tooltip"
          class="pointer-events-none absolute left-full top-1/2 z-[60] ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-fg/15 bg-elevated px-2.5 py-1 text-[11px] font-medium text-fg opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
          {brandTooltip}
        </span>
      {/if}
    </div>
    {#if !collapsed}
      <div class="min-w-0 flex-1">
        <span class="block text-[18px] font-semibold leading-tight tracking-[2px]">NEXTOPS</span>
        <div class="mt-0.5 font-mono text-[10px] tracking-[1.5px] text-muted">AI OPS PLATFORM</div>
      </div>
    {/if}
    <button
      type="button"
      aria-label={collapsed ? '展開功能導覽' : '收合功能導覽'}
      aria-expanded={!collapsed}
      onclick={toggleCollapsed}
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg/50 transition-colors hover:bg-fg/5 hover:text-fg/90"
    >
      <svg aria-hidden="true" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        {#if collapsed}
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        {/if}
      </svg>
    </button>
  </div>

  <!-- Navigation -->
  <nav class="flex-1 space-y-1 overflow-y-auto overflow-x-visible px-3 py-6">
    {#each navItems as item}
      <a
        href={publicHref(item.path)}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={isActive(item.path) ? 'page' : undefined}
        class="relative flex items-center rounded-xl py-2.5 text-sm font-medium transition-all duration-200
          {collapsed ? 'justify-center px-0' : 'gap-3 px-4'}
          {isActive(item.path)
            ? 'bg-nav-active text-nav-active-fg shadow-sm'
            : 'text-muted-strong hover:bg-fg/5 hover:text-fg'}"
      >
        <svg aria-hidden="true" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
        </svg>
        {#if !collapsed}
          <span>{item.label}</span>
          {#if item.badge && badgeCount > 0}
            <span class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white tabular-nums">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          {/if}
        {:else if item.badge && badgeCount > 0}
          <span
            class="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white tabular-nums"
            aria-label="{badgeCount} active alerts"
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        {/if}
      </a>
    {/each}
  </nav>
</aside>
