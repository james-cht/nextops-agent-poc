<script lang="ts">
  import { page } from '$app/stores';
  import { publicHref } from '$lib/kit-public-href';
  import { SRE_SETTINGS_CATEGORIES } from '$lib/sre-settings-registry';
  import { canViewDiagnosisTraces, type OperatorRole } from '$lib/operator-role';
  import { capabilityAllowed } from '$lib/operator-role-capabilities';

  const navIcons: Record<string, string> = {
    sources:
      'M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375',
    'ai-agents':
      'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
    gitlab:
      'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
    dashboard:
      'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
    typography:
      'M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802',
    promql:
      'M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5',
    diagnosis:
      'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
    audit:
      'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    account:
      'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    traces:
      'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z',
  };

  function isActive(route: string): boolean {
    return $page.url.pathname === route;
  }

  const role = $derived(($page.data.operator?.role ?? null) as OperatorRole | null);
  const categories = $derived(
    SRE_SETTINGS_CATEGORIES.filter((cat) => {
      if (cat.id === 'traces') return canViewDiagnosisTraces(role);
      if (cat.id === 'gitlab') return role ? capabilityAllowed('change_runtime_settings', role) : false;
      return true;
    }),
  );
</script>

<nav
  class="flex w-52 shrink-0 flex-col border-r border-line bg-header/50 py-6"
  aria-label="SRE 設定導覽"
>
  <div class="mb-4 px-5">
    <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">SRE 管理配置</p>
    <p class="mt-1 text-[12px] text-muted-strong">資料源 · 集成 · 顯示</p>
  </div>

  <ul class="flex flex-col gap-1 px-3">
    {#each categories as cat (cat.id)}
      <li>
        <a
          href={publicHref(cat.route)}
          aria-current={isActive(cat.route) ? 'page' : undefined}
          class="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200
            {isActive(cat.route)
            ? 'bg-nav-active text-nav-active-fg shadow-sm'
            : 'text-muted-strong hover:bg-fg/5 hover:text-fg'}"
        >
          <svg
            aria-hidden="true"
            class="h-4 w-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d={navIcons[cat.id] ?? navIcons.sources} />
          </svg>
          <span>{cat.navLabel}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
