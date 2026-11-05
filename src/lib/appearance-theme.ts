export type AppearanceThemePreference = 'dark' | 'light' | 'system';
export type ResolvedAppearanceTheme = 'dark' | 'light';

const STORAGE_KEY = 'nextops-appearance-theme';

export const APPEARANCE_THEME_OPTIONS: ReadonlyArray<{
	value: AppearanceThemePreference;
	label: string;
}> = [
	{ value: 'dark', label: '深色' },
	{ value: 'light', label: '淺色' },
	{ value: 'system', label: '系統' },
];

export function isAppearanceThemePreference(value: unknown): value is AppearanceThemePreference {
	return value === 'dark' || value === 'light' || value === 'system';
}

export function getAppearanceThemePreference(): AppearanceThemePreference {
	if (typeof localStorage === 'undefined') return 'dark';
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (isAppearanceThemePreference(raw)) return raw;
	} catch {
		/* ignore corrupt / blocked storage */
	}
	return 'dark';
}

export function setAppearanceThemePreference(preference: AppearanceThemePreference): void {
	localStorage.setItem(STORAGE_KEY, preference);
}

export function getSystemAppearanceTheme(): ResolvedAppearanceTheme {
	if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
	return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveAppearanceTheme(
	preference: AppearanceThemePreference = getAppearanceThemePreference(),
): ResolvedAppearanceTheme {
	if (preference === 'system') return getSystemAppearanceTheme();
	return preference;
}

/** Apply resolved theme to <html data-theme="...">. */
export function applyAppearanceTheme(
	preference: AppearanceThemePreference = getAppearanceThemePreference(),
): ResolvedAppearanceTheme {
	const resolved = resolveAppearanceTheme(preference);
	if (typeof document !== 'undefined') {
		document.documentElement.dataset.theme = resolved;
		document.documentElement.classList.toggle('dark', resolved === 'dark');
		document.documentElement.classList.toggle('light', resolved === 'light');
	}
	return resolved;
}

export function subscribeSystemPreference(onChange: () => void): () => void {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};
	const mq = window.matchMedia('(prefers-color-scheme: light)');
	const handler = () => onChange();
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
}

export function labelForAppearanceTheme(preference: AppearanceThemePreference): string {
	return APPEARANCE_THEME_OPTIONS.find((o) => o.value === preference)?.label ?? preference;
}
