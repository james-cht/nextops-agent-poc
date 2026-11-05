import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
	isAppearanceThemePreference,
	resolveAppearanceTheme,
	labelForAppearanceTheme,
} from './appearance-theme.ts';

describe('appearance-theme', () => {
	it('accepts only dark, light, system', () => {
		assert.equal(isAppearanceThemePreference('dark'), true);
		assert.equal(isAppearanceThemePreference('light'), true);
		assert.equal(isAppearanceThemePreference('system'), true);
		assert.equal(isAppearanceThemePreference('high-contrast'), false);
		assert.equal(isAppearanceThemePreference(null), false);
	});

	it('resolves explicit preferences without system', () => {
		assert.equal(resolveAppearanceTheme('dark'), 'dark');
		assert.equal(resolveAppearanceTheme('light'), 'light');
	});

	it('labels preferences in Traditional Chinese', () => {
		assert.equal(labelForAppearanceTheme('dark'), '深色');
		assert.equal(labelForAppearanceTheme('light'), '淺色');
		assert.equal(labelForAppearanceTheme('system'), '系統');
	});
});
