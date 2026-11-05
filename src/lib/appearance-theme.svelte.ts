import {
	applyAppearanceTheme,
	getAppearanceThemePreference,
	setAppearanceThemePreference,
	subscribeSystemPreference,
	type AppearanceThemePreference,
	type ResolvedAppearanceTheme,
} from '$lib/appearance-theme';

let preference = $state<AppearanceThemePreference>('dark');
let resolved = $state<ResolvedAppearanceTheme>('dark');
let initialized = false;
let stopSystem: (() => void) | undefined;

function syncFromDom() {
	preference = getAppearanceThemePreference();
	resolved = applyAppearanceTheme(preference);
}

export function initAppearanceTheme() {
	if (initialized || typeof document === 'undefined') return;
	initialized = true;
	syncFromDom();
	stopSystem = subscribeSystemPreference(() => {
		if (preference === 'system') {
			resolved = applyAppearanceTheme('system');
		}
	});
}

export function destroyAppearanceTheme() {
	stopSystem?.();
	stopSystem = undefined;
	initialized = false;
}

export function getAppearanceThemeState() {
	return {
		get preference() {
			return preference;
		},
		get resolved() {
			return resolved;
		},
	};
}

export function setAppearanceTheme(next: AppearanceThemePreference) {
	setAppearanceThemePreference(next);
	preference = next;
	resolved = applyAppearanceTheme(next);
}
