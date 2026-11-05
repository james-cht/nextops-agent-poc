<script lang="ts">
  import FontSizeConfig from '$lib/components/FontSizeConfig.svelte';
  import AppearanceThemeControl from '$lib/components/AppearanceThemeControl.svelte';
</script>

<div class="mx-auto flex max-w-2xl flex-col gap-6">
  <AppearanceThemeControl variant="panel" />
  <FontSizeConfig />
</div>
