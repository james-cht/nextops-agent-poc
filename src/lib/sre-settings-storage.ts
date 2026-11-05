import { syncDashboardRefreshInterval } from '$lib/dashboard-refresh.svelte';
import {
  MAIN_CONFIG_STORAGE_KEY,
  getDefaultMainConfig,
  type SettingsCategoryDef,
} from '$lib/sre-settings-registry';

export function loadMainConfig(): Record<string, string> {
  try {
    const raw = localStorage.getItem(MAIN_CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...getDefaultMainConfig(), ...(JSON.parse(raw) as Record<string, string>) };
    }
  } catch {
    /* ignore */
  }
  return getDefaultMainConfig();
}

export function saveMainConfig(data: Record<string, string>, categoryId: string): void {
  try {
    localStorage.setItem(MAIN_CONFIG_STORAGE_KEY, JSON.stringify(data));
    runCategorySaveHooks(categoryId);
  } catch {
    /* localStorage not available */
  }
}

export function runCategorySaveHooks(categoryId: string): void {
  if (categoryId === 'dashboard') {
    syncDashboardRefreshInterval();
  }
}

export function resolveCategoryTitle(category: SettingsCategoryDef): string {
  return category.title;
}
