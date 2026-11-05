<script lang="ts">
  import { page } from '$app/stores';
  import {
    ACCOUNT_ADMIN_TAB_HREF,
    ACCOUNT_ADMIN_TAB_LABELS,
    accountAdminTabs,
    type AccountAdminTab,
  } from '$lib/account-admin-nav';
  import type { OperatorRole } from '$lib/operator-role';

  let { role }: { role: OperatorRole | null | undefined } = $props();

  const tabs = $derived(role ? accountAdminTabs(role) : []);

  function isActive(tab: AccountAdminTab): boolean {
    const path = $page.url.pathname;
    const href = ACCOUNT_ADMIN_TAB_HREF[tab];
    if (tab === 'accounts') {
      if (path === '/admin/account/me' || path === '/admin/account/roles') return false;
      return path === '/admin/account' || path.startsWith('/admin/account/');
    }
    return path === href || path.startsWith(`${href}/`);
  }
</script>

{#if role && tabs.length > 0}
  <nav class="mb-6 flex flex-wrap gap-1 border-b border-fg/10 pb-px" aria-label="帳號安全">
    {#each tabs as tab}
      <a
        href={ACCOUNT_ADMIN_TAB_HREF[tab]}
        aria-current={isActive(tab) ? 'page' : undefined}
        class="px-3 py-2 text-[13px] font-medium transition-colors
          {isActive(tab)
            ? 'border-b-2 border-fg text-fg'
            : 'text-fg/45 hover:text-fg/80'}"
      >
        {ACCOUNT_ADMIN_TAB_LABELS[tab]}
      </a>
    {/each}
  </nav>
{/if}
