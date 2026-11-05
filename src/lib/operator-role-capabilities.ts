import type { OperatorRole } from './operator-role.ts';

export type CapabilityGroupId = 'accounts' | 'settings' | 'diagnosis_governance' | 'daily';

export type CapabilityId =
  | 'manage_other_accounts'
  | 'change_own_authenticators'
  | 'revoke_own_sessions'
  | 'revoke_others_sessions'
  | 'read_own_login_events'
  | 'read_fleet_login_events'
  | 'clear_login_lockout'
  | 'change_runtime_settings'
  | 'read_config_audit'
  | 'read_diagnosis_traces'
  | 'read_dashboard'
  | 'acknowledge_alerts'
  | 'start_ai_diagnosis'
  | 'operator_chat_human'
  | 'invoke_opsgpt_chat'
  | 'robusta_history_generate'
  | 'trigger_live_pod_diagnostics'
  | 'read_live_pod_diagnostics'
  | 'read_application_catalog'
  | 'application_registration'
  | 'application_unregistration';

export type CapabilityRow = {
  id: CapabilityId;
  group: CapabilityGroupId;
  label: string;
  allowed: Record<OperatorRole, boolean>;
};

const yes: Record<OperatorRole, boolean> = {
  platform_owner: true,
  operator: true,
  application_developer: true,
  viewer: true,
};

const ownerOnly: Record<OperatorRole, boolean> = {
  platform_owner: true,
  operator: false,
  application_developer: false,
  viewer: false,
};

/** Hands-on ops: Owner + Operator. Application Developer matches Viewer here. */
const ownerOperator: Record<OperatorRole, boolean> = {
  platform_owner: true,
  operator: true,
  application_developer: false,
  viewer: false,
};

/** Lasting Password / TOTP for the signed-in account (Developer must be able to harden Temporary Password). */
const selfAuthenticators: Record<OperatorRole, boolean> = {
  platform_owner: true,
  operator: true,
  application_developer: true,
  viewer: false,
};

/** Flattened Operator Role definitions (CONTEXT.md) — read-only matrix, not a Runtime Setting. */
export const OPERATOR_ROLE_CAPABILITIES: CapabilityRow[] = [
  { id: 'manage_other_accounts', group: 'accounts', label: '管理其他 Operator Account', allowed: ownerOnly },
  { id: 'change_own_authenticators', group: 'accounts', label: '改自己的 Lasting Password／Second Factor', allowed: selfAuthenticators },
  { id: 'revoke_own_sessions', group: 'accounts', label: '列出／撤自己的 Session', allowed: yes },
  { id: 'revoke_others_sessions', group: 'accounts', label: '撤別人的 Session', allowed: ownerOnly },
  { id: 'read_own_login_events', group: 'accounts', label: '看自己的 Login Event', allowed: yes },
  { id: 'read_fleet_login_events', group: 'accounts', label: '看全站 Login Event（含未對上 Username）', allowed: ownerOnly },
  { id: 'clear_login_lockout', group: 'accounts', label: '清 Login Lockout', allowed: ownerOnly },
  { id: 'change_runtime_settings', group: 'settings', label: '改 Runtime Setting', allowed: ownerOnly },
  { id: 'read_config_audit', group: 'settings', label: '看 Config Audit Log', allowed: ownerOnly },
  { id: 'read_diagnosis_traces', group: 'diagnosis_governance', label: '看 Diagnosis Traces', allowed: ownerOnly },
  { id: 'read_dashboard', group: 'daily', label: '讀 Global Matrix／Site／Smart Logging', allowed: yes },
  { id: 'acknowledge_alerts', group: 'daily', label: 'Acknowledge 告警', allowed: ownerOperator },
  { id: 'start_ai_diagnosis', group: 'daily', label: '開始 AI Diagnosis', allowed: ownerOperator },
  { id: 'operator_chat_human', group: 'daily', label: 'Operator Chat 人話（Public／DM）', allowed: yes },
  { id: 'invoke_opsgpt_chat', group: 'daily', label: '從聊天呼叫 OPSGPT', allowed: ownerOperator },
  { id: 'robusta_history_generate', group: 'daily', label: '產生 Robusta History Report', allowed: ownerOperator },
  { id: 'trigger_live_pod_diagnostics', group: 'daily', label: '觸發 Live Pod Diagnostics', allowed: ownerOperator },
  { id: 'read_live_pod_diagnostics', group: 'daily', label: '讀 Live Pod Diagnostics 結果', allowed: yes },
  { id: 'read_application_catalog', group: 'daily', label: '讀 Application Catalog', allowed: yes },
  { id: 'application_registration', group: 'daily', label: 'Application Registration', allowed: ownerOperator },
  { id: 'application_unregistration', group: 'daily', label: 'Application Unregistration', allowed: ownerOperator },
];

export const CAPABILITY_GROUP_LABELS: Record<CapabilityGroupId, string> = {
  accounts: '帳務',
  settings: '設定',
  diagnosis_governance: '診斷治理',
  daily: '日常',
};

export function capabilityAllowed(id: CapabilityId, role: OperatorRole): boolean {
  const row = OPERATOR_ROLE_CAPABILITIES.find((r) => r.id === id);
  return row?.allowed[role] ?? false;
}

export function operatorRoleCapabilityGroups(): Array<{
  id: CapabilityGroupId;
  label: string;
  rows: CapabilityRow[];
}> {
  const order: CapabilityGroupId[] = ['accounts', 'settings', 'diagnosis_governance', 'daily'];
  return order.map((id) => ({
    id,
    label: CAPABILITY_GROUP_LABELS[id],
    rows: OPERATOR_ROLE_CAPABILITIES.filter((r) => r.group === id),
  }));
}
