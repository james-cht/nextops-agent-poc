<script lang="ts">
  import '../../app.css';
  import { initAppearanceTheme } from '$lib/appearance-theme.svelte';

  let { children } = $props();

  $effect(() => {
    initAppearanceTheme();
  });
</script>

<svelte:head><title>登入 — NEXTOPS</title></svelte:head>

{@render children()}
