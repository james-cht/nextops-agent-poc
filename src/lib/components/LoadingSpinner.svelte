<script lang="ts">
  interface Props {
    /** Optional label shown below the spinner. */
    label?: string;
    /** Size variant: 'sm', 'md' (default), 'lg'. */
    size?: 'sm' | 'md' | 'lg';
    /** If true, centres the spinner in a full-height container (for page-level loading). */
    fullPage?: boolean;
    /** Icon-only, no padding — for inline use (e.g. KPI cards). */
    compact?: boolean;
  }

  let { label = '', size = 'md', fullPage = false, compact = false }: Props = $props();
</script>

<div class="loading-wrapper" class:full-page={fullPage} class:compact>
  <img
    src="/loading-spinner.png"
    class="spinner {size}"
    alt="Loading"
    aria-label="Loading"
  />
  {#if label}
    <p class="label">{label}</p>
  {/if}
</div>

<style>
  .loading-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
  }
  .loading-wrapper.compact {
    padding: 0;
    gap: 0;
  }
  .loading-wrapper.full-page {
    min-height: 60vh;
  }

  .spinner {
    display: block;
    object-fit: contain;
    opacity: 0.7;
    /* Dark grayscale asset — invert for default/dark theme */
    filter: invert(1);
    animation: spin 0.8s linear infinite;
  }

  :global([data-theme='light']) .spinner {
    filter: none;
  }

  .sm.spinner {
    width: 20px;
    height: 20px;
  }
  .md.spinner {
    width: 32px;
    height: 32px;
  }
  .lg.spinner {
    width: 48px;
    height: 48px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .label {
    color: color-mix(in srgb, var(--theme-fg) 40%, transparent);
    font-size: 0.85rem;
    margin: 0;
  }
</style>
