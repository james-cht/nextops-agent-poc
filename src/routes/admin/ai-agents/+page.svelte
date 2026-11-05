<script lang="ts">
  import { page } from '$app/stores';
  import DifyCredentialsPanel from '$lib/components/DifyCredentialsPanel.svelte';
  import ModelRateTablePanel from '$lib/components/ModelRateTablePanel.svelte';
  import { canViewDiagnosisTraces, type OperatorRole } from '$lib/operator-role';

  const role = $derived(($page.data.operator?.role ?? null) as OperatorRole | null);
</script>

<div class="flex flex-col gap-6">
  <DifyCredentialsPanel />
  {#if canViewDiagnosisTraces(role)}
    <ModelRateTablePanel />
  {/if}
</div>
