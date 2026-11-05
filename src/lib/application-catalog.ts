import { capabilityAllowed } from './operator-role-capabilities.ts';
import type { OperatorRole } from './operator-role.ts';

export function canRegisterApplication(role: OperatorRole | null | undefined): boolean {
  if (!role) return false;
  return capabilityAllowed('application_registration', role);
}

export function canUnregisterApplication(role: OperatorRole | null | undefined): boolean {
  if (!role) return false;
  return capabilityAllowed('application_unregistration', role);
}

export type ApplicationCatalogEmptyState = {
  title: string;
  body: string;
  showRegister: boolean;
  showUnregister: boolean;
};

export function applicationCatalogEmptyState(role: OperatorRole): ApplicationCatalogEmptyState {
  const showRegister = canRegisterApplication(role);
  const showUnregister = canUnregisterApplication(role);
  return {
    title: '應用目錄',
    body: showRegister
      ? '登記 Application：新建或掛上 GitLab Project。'
      : '只讀。可看已登記 Application 的名稱與 GitLab Project 路徑。',
    showRegister,
    showUnregister,
  };
}
