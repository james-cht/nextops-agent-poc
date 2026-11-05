import type { OperatorRole } from './operator-role.ts';

export function canOpenApplicationOnline(role: OperatorRole | null | undefined): boolean {
  return (
    role === 'platform_owner' ||
    role === 'operator' ||
    role === 'application_developer' ||
    role === 'viewer'
  );
}

export function canWriteApplicationOnline(role: OperatorRole | null | undefined): boolean {
  return role === 'platform_owner' || role === 'operator' || role === 'application_developer';
}

export type ApplicationOnlineEmptyState = {
  title: string;
  body: string;
  readOnly: boolean;
};

export function applicationOnlineEmptyState(role: OperatorRole): ApplicationOnlineEmptyState {
  const readOnly = !canWriteApplicationOnline(role);
  if (readOnly) {
    return {
      title: '應用上線',
      body: '只讀。目前沒有可顯示的 Project；之後 Membership 就緒時仍只能瀏覽。',
      readOnly: true,
    };
  }
  if (role === 'application_developer') {
    return {
      title: '應用上線',
      body: '尚未加入任何 Project。請請 Operator 將你加入 Project Membership 後再填 Spec。',
      readOnly: false,
    };
  }
  return {
    title: '應用上線',
    body: '尚未建立 Project。在此建立 Project 並管理 Project Membership。',
    readOnly: false,
  };
}
