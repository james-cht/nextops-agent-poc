<script lang="ts">
  import { operatorRoleLabel, type OperatorRole } from '$lib/operator-role';

  let {
    role,
    class: className = 'h-3.5 w-3.5',
  }: {
    role: OperatorRole;
    class?: string;
  } = $props();

  const label = $derived(operatorRoleLabel(role));
</script>

<svg
  aria-hidden="true"
  class={className}
  fill="none"
  viewBox="0 0 24 24"
  stroke-width="1.6"
  stroke="currentColor"
  data-role={role}
>
  {#if role === 'platform_owner'}
    <!-- Keyholder: shield — Platform Owner holds the console. -->
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M12 3l7.5 3v5.25c0 4.5-3.12 8.55-7.5 9.75C7.62 19.8 4.5 15.75 4.5 11.25V6L12 3z"
    />
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 12.25l1.75 1.75 3.25-3.5" />
  {:else if role === 'operator'}
    <!-- Hands-on: wrench — Operator runs the shift. -->
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M14.7 6.3a4.1 4.1 0 00-5.8 5.8L4 16.95V20h3.05l4.85-4.9a4.1 4.1 0 005.8-5.8l-2.2 2.2-1.9-1.9 2.1-2.3z"
    />
  {:else if role === 'application_developer'}
    <!-- Ship: rocket — Application Developer brings services online. -->
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
    />
  {:else}
    <!-- Observe: eye — Viewer can watch, not act. -->
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12s3.6-6.75 9.75-6.75S21.75 12 21.75 12s-3.6 6.75-9.75 6.75S2.25 12 2.25 12z" />
    <circle cx="12" cy="12" r="2.4" />
  {/if}
</svg>
<span class="sr-only">{label}</span>
