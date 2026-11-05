<script lang="ts">
	import {
		APPEARANCE_THEME_OPTIONS,
		labelForAppearanceTheme,
		type AppearanceThemePreference,
	} from '$lib/appearance-theme';
	import {
		getAppearanceThemeState,
		initAppearanceTheme,
		setAppearanceTheme,
	} from '$lib/appearance-theme.svelte';

	let {
		variant = 'dropdown',
	}: {
		variant?: 'dropdown' | 'panel';
	} = $props();

	const theme = getAppearanceThemeState();
	let open = $state(false);

	$effect(() => {
		initAppearanceTheme();
	});

	function select(next: AppearanceThemePreference) {
		setAppearanceTheme(next);
		open = false;
	}

	function onWindowClick(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		if (!target?.closest('[data-theme-menu]')) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} />

{#if variant === 'panel'}
	<div class="rounded-2xl border border-fg/10 bg-card p-6 shadow-sm">
		<div class="mb-4">
			<h2 class="font-semibold text-fg/90" style="font-size: var(--fs-section-title)">外觀主題</h2>
			<p class="mt-1 text-muted" style="font-size: var(--fs-subtext)">
				深色、淺色或跟隨系統。變更即時生效並儲存在此瀏覽器。
			</p>
		</div>
		<div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="外觀主題">
			{#each APPEARANCE_THEME_OPTIONS as opt (opt.value)}
				<button
					type="button"
					role="radio"
					aria-checked={theme.preference === opt.value}
					onclick={() => select(opt.value)}
					class="rounded-xl border px-3 py-3 text-center font-medium transition-all
						{theme.preference === opt.value
						? 'border-blue-500/40 bg-info-bg text-info-fg shadow-sm'
						: 'border-fg/10 bg-fg/[0.02] text-fg/60 hover:bg-fg/5 hover:text-fg/90'}"
					style="font-size: var(--fs-body)"
				>
					{opt.label}
				</button>
			{/each}
		</div>
		<p class="mt-3 text-muted" style="font-size: var(--fs-tiny)">
			目前解析：{theme.resolved === 'dark' ? '深色' : '淺色'}
			{#if theme.preference === 'system'}（系統）{/if}
		</p>
	</div>
{:else}
	<div class="relative" data-theme-menu>
		<button
			type="button"
			aria-label="外觀主題：{labelForAppearanceTheme(theme.preference)}"
			title="外觀主題：{labelForAppearanceTheme(theme.preference)}"
			aria-haspopup="menu"
			aria-expanded={open}
			onclick={(e) => {
				e.stopPropagation();
				open = !open;
			}}
			class="chrome-control px-2"
		>
			<svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				{#if theme.resolved === 'light'}
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
					/>
				{:else}
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M21.752 15.002A9.72 9.72 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
					/>
				{/if}
			</svg>
		</button>

		{#if open}
			<div
				role="menu"
				aria-label="選擇外觀主題"
				class="absolute right-0 z-50 mt-1.5 min-w-[8.5rem] overflow-hidden rounded-xl border border-fg/10 bg-card py-1 shadow-lg shadow-black/20"
			>
				{#each APPEARANCE_THEME_OPTIONS as opt (opt.value)}
					<button
						type="button"
						role="menuitemradio"
						aria-checked={theme.preference === opt.value}
						onclick={() => select(opt.value)}
						class="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-medium transition-colors
							{theme.preference === opt.value
							? 'bg-nav-active text-nav-active-fg'
							: 'text-fg/70 hover:bg-fg/5 hover:text-fg'}"
					>
						{opt.label}
						{#if theme.preference === opt.value}
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
