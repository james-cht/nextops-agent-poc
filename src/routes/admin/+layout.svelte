<script lang="ts">
  import AdminSettingsNav from '$lib/components/AdminSettingsNav.svelte';

  let { children } = $props();
</script>

<div class="flex min-h-full">
  <AdminSettingsNav />
  <div class="flex-1 min-w-0 overflow-y-auto">
    <div class="mx-auto w-full max-w-5xl p-7">
      {#if children}
        {@render children()}
      {/if}
    </div>
  </div>
</div>
