import { getDashboardRefreshSec } from '$lib/dashboard-refresh-config';

type RefreshHandler = () => void;

let refreshHandler = $state<RefreshHandler | null>(null);

export const dashboardRefresh = $state({
  seconds: getDashboardRefreshSec(),
  total: getDashboardRefreshSec(),
});

export function registerDashboardRefresh(handler: RefreshHandler): void {
  refreshHandler = handler;
}

export function unregisterDashboardRefresh(): void {
  refreshHandler = null;
}

export function syncDashboardRefreshInterval(): void {
  dashboardRefresh.total = getDashboardRefreshSec();
  dashboardRefresh.seconds = dashboardRefresh.total;
}

export function refreshDashboardNow(): void {
  dashboardRefresh.seconds = dashboardRefresh.total;
  refreshHandler?.();
}

export function tickDashboardRefresh(): void {
  if (dashboardRefresh.seconds > 1) {
    dashboardRefresh.seconds--;
    return;
  }
  dashboardRefresh.seconds = dashboardRefresh.total;
  refreshHandler?.();
}
