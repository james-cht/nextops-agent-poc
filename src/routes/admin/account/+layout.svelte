<script lang="ts">
  import { page } from '$app/stores';
  import OperatorAccountAdminNav from '$lib/components/OperatorAccountAdminNav.svelte';
  import type { OperatorRole } from '$lib/operator-role';

  let { children } = $props();

  const role = $derived(($page.data.operator as { role: OperatorRole } | null | undefined)?.role);
</script>

<OperatorAccountAdminNav {role} />
{#if children}
  {@render children()}
{/if}
