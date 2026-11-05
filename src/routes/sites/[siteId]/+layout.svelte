<script lang="ts">
  import { page } from '$app/stores';
  import { publicHref } from '$lib/kit-public-href';

  let { children } = $props();

  let siteId = $derived(decodeURIComponent($page.params.siteId ?? ''));
</script>

<div class="site-layout">
  <nav class="site-breadcrumb">
    <a href={publicHref('/')}>Dashboard</a>
    <span class="sep">/</span>
    <span class="current">{siteId}</span>
  </nav>

  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .site-layout { max-width: 1200px; }
  .site-breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 0.85rem;
  }
  .site-breadcrumb a {
    color: var(--theme-info);
    text-decoration: none;
    font-weight: 500;
  }
  .site-breadcrumb a:hover {
    text-decoration: underline;
    color: var(--theme-info-fg);
  }
  .sep { color: color-mix(in srgb, var(--theme-fg) 30%, transparent); }
  .current { color: var(--theme-fg); font-weight: 600; }
</style>
