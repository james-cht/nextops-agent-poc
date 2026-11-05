export const DASHBOARD_REFRESH_OPTIONS = [15, 30, 60] as const;
export type DashboardRefreshSec = (typeof DASHBOARD_REFRESH_OPTIONS)[number];

export const DEFAULT_DASHBOARD_REFRESH_SEC: DashboardRefreshSec = 30;
export const DASHBOARD_REFRESH_CONFIG_KEY = 'dashboard_refresh_sec';

/** Read dashboard poll interval from nextops-config (localStorage). */
export function getDashboardRefreshSec(): DashboardRefreshSec {
  try {
    const raw = localStorage.getItem('nextops-config');
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const sec = parseInt(parsed[DASHBOARD_REFRESH_CONFIG_KEY] ?? '', 10);
      if ((DASHBOARD_REFRESH_OPTIONS as readonly number[]).includes(sec)) {
        return sec as DashboardRefreshSec;
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DASHBOARD_REFRESH_SEC;
}
