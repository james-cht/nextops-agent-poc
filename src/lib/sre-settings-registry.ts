import {
  PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD,
  PUBLIC_DEFAULT_ELASTICSEARCH_URL,
  PUBLIC_DEFAULT_ELASTICSEARCH_USER,
  PUBLIC_DEFAULT_PROMETHEUS_URL,
  PUBLIC_DEFAULT_PROXY_ENABLED,
  PUBLIC_DEFAULT_PROXY_HOST,
  PUBLIC_DEFAULT_PROXY_PORT,
} from '$env/static/public';

export const MAIN_CONFIG_STORAGE_KEY = 'nextops-config';

/** Whether a saved field actually affects runtime behaviour. */
export type FieldEffect = 'client' | 'demo' | 'server' | 'runtime';

export type FieldType = 'text' | 'password' | 'checkbox' | 'select';

export interface SettingsFieldDef {
  key: string;
  label: string;
  type: FieldType;
  effect: FieldEffect;
  defaultValue: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface SettingsFieldGroup {
  badge: string;
  badgeColor: string;
  label: string;
  fields: SettingsFieldDef[];
}

export type SettingsCategoryKind =
  | 'fields'
  | 'typography'
  | 'promql'
  | 'diagnosis'
  | 'audit'
  | 'dify'
  | 'gitlab'
  | 'account'
  | 'traces';

export interface SettingsCategoryDef {
  id: string;
  navLabel: string;
  title: string;
  description: string;
  route: string;
  kind: SettingsCategoryKind;
  /** Field groups (資料源) or flat fields (AI, 儀表板). */
  groups?: SettingsFieldGroup[];
  fields?: SettingsFieldDef[];
}

export const FIELD_EFFECT_LABELS: Record<FieldEffect, { text: string; hint: string }> = {
  client: { text: '客戶端生效', hint: '儲存後由儀表板立即讀取' },
  demo: { text: '僅供參考', hint: '儲存於瀏覽器，後端仍使用部署 env' },
  server: { text: '部署 env', hint: '需修改 .env 並重新部署方可生效' },
  runtime: { text: '執行期生效', hint: '儲存後立即套用；寫入伺服器並跨重啟保留' },
};

export const SRE_SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  {
    id: 'sources',
    navLabel: '資料源',
    title: 'SRE 管理配置 — 資料源',
    description: 'ElasticSearch、Prometheus、Proxy 與 MySQL 連線設定',
    route: '/admin/sources',
    kind: 'fields',
    groups: [
      {
        badge: 'ES',
        badgeColor: '#dc2626',
        label: 'LOGGING — ElasticSearch',
        fields: [
          {
            key: 'elasticsearch_url',
            label: 'elasticsearch_url',
            type: 'text',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_ELASTICSEARCH_URL,
            placeholder: 'http://...',
          },
          {
            key: 'elasticsearch_user',
            label: 'elasticsearch_user',
            type: 'text',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_ELASTICSEARCH_USER,
            placeholder: '用戶名',
          },
          {
            key: 'elasticsearch_password',
            label: 'elasticsearch_password',
            type: 'password',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_ELASTICSEARCH_PASSWORD,
            placeholder: '密碼',
          },
        ],
      },
      {
        badge: 'PR',
        badgeColor: '#dc2626',
        label: 'RESOURCE — Prometheus',
        fields: [
          {
            key: 'prometheus_url',
            label: 'prometheus_url',
            type: 'text',
            effect: 'client',
            defaultValue: PUBLIC_DEFAULT_PROMETHEUS_URL,
            placeholder: 'http://...',
          },
        ],
      },
      {
        badge: 'PX',
        badgeColor: '#f59e0b',
        label: 'PROXY — ElasticSearch & Prometheus',
        fields: [
          {
            key: 'proxy_enabled',
            label: 'proxy_enabled',
            type: 'checkbox',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_PROXY_ENABLED,
            placeholder: '啟用 Proxy（ES / Prometheus fetch）',
          },
          {
            key: 'proxy_host',
            label: 'proxy_host',
            type: 'text',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_PROXY_HOST,
            placeholder: 'Proxy 主機',
          },
          {
            key: 'proxy_port',
            label: 'proxy_port',
            type: 'text',
            effect: 'demo',
            defaultValue: PUBLIC_DEFAULT_PROXY_PORT,
            placeholder: 'Proxy 埠號',
          },
        ],
      },
      {
        badge: 'DB',
        badgeColor: '#0ea5e9',
        label: 'MYSQL — Pipeline metrics',
        fields: [
          {
            key: 'mysql_proxy_enabled',
            label: 'mysql_proxy_enabled',
            type: 'checkbox',
            effect: 'runtime',
            defaultValue: 'false',
            placeholder: '經 HTTP CONNECT Proxy 連 MySQL（預設直連）',
          },
        ],
      },
    ],
  },
  {
    id: 'account',
    navLabel: '帳號安全',
    title: 'SRE 管理配置 — 帳號安全',
    description: 'Operator Account、Session、登入歷史（Local Settings Store）',
    route: '/admin/account',
    kind: 'account',
  },
  {
    id: 'ai-agents',
    navLabel: 'AI Agents',
    title: 'SRE 管理配置 — AI Agents',
    description:
      'Tool Endpoint Token 與 Model Rate Table（Runtime Setting：測通／確認後立即生效）',
    route: '/admin/ai-agents',
    kind: 'dify',
  },
  {
    id: 'gitlab',
    navLabel: 'GitLab',
    title: 'SRE 管理配置 — GitLab',
    description:
      'GitLab OAuth Client 與 GitLab Read Access（Runtime Setting：測通／確認後立即生效）',
    route: '/admin/gitlab',
    kind: 'gitlab',
  },
  {
    id: 'dashboard',
    navLabel: '儀表板',
    title: 'SRE 管理配置 — 儀表板',
    description: 'Global Matrix Dashboard 自動更新與顯示設定',
    route: '/admin/dashboard',
    kind: 'fields',
    fields: [
      {
        key: 'dashboard_refresh_sec',
        label: 'dashboard_refresh_sec',
        type: 'select',
        effect: 'client',
        defaultValue: '30',
        placeholder: '儀表板自動更新間隔',
        options: [
          { value: '15', label: '15 秒' },
          { value: '30', label: '30 秒' },
          { value: '60', label: '60 秒' },
        ],
      },
      {
        key: 'pipeline_timeout_sec',
        label: 'pipeline_timeout_sec',
        type: 'select',
        effect: 'client',
        defaultValue: '300',
        placeholder: '流水線逾時閾值（秒）',
        options: [
          { value: '180', label: '180 秒' },
          { value: '300', label: '300 秒' },
          { value: '600', label: '600 秒' },
          { value: '900', label: '900 秒' },
        ],
      },
      {
        key: 'pipeline_metrics_window_hours',
        label: 'pipeline_metrics_window_hours',
        type: 'select',
        effect: 'client',
        defaultValue: '24',
        placeholder: '流水線指標視窗',
        options: [
          { value: '24', label: '24 小時' },
          { value: '48', label: '48 小時' },
          { value: '168', label: '168 小時（7 天）' },
        ],
      },
    ],
  },
  {
    id: 'typography',
    navLabel: '顯示',
    title: 'SRE 管理配置 — 顯示',
    description: '外觀主題與字體大小，變更即時生效',
    route: '/admin/typography',
    kind: 'typography',
  },
  {
    id: 'promql',
    navLabel: 'PromQL',
    title: 'SRE 管理配置 — PromQL',
    description: '自訂 Prometheus 查詢語句',
    route: '/admin/promql',
    kind: 'promql',
  },
  {
    id: 'diagnosis',
    navLabel: '上游診斷',
    title: '上游診斷',
    description: '外部資料源連線失敗註冊表',
    route: '/admin/diagnosis',
    kind: 'diagnosis',
  },
  {
    id: 'traces',
    navLabel: '診斷鏈條',
    title: 'SRE 管理配置 — 診斷鏈條',
    description: 'Diagnosis Trace：LangGraph 回合的 Tool Endpoint、Context Reduction、Gateway payload 與 Trace Usage',
    route: '/admin/traces',
    kind: 'traces',
  },
  {
    id: 'audit',
    navLabel: '設定稽核',
    title: 'Config Audit Log',
    description: 'Runtime Setting 變更紀錄（不含密鑰明文）',
    route: '/admin/audit',
    kind: 'audit',
  },
];

export function getCategoryById(id: string): SettingsCategoryDef | undefined {
  return SRE_SETTINGS_CATEGORIES.find((c) => c.id === id);
}

export function getCategoryByRoute(pathname: string): SettingsCategoryDef | undefined {
  return SRE_SETTINGS_CATEGORIES.find((c) => pathname === c.route || pathname.startsWith(`${c.route}/`));
}

/** All field defs for a category (flat). */
export function getCategoryFields(category: SettingsCategoryDef): SettingsFieldDef[] {
  if (category.fields) return category.fields;
  return category.groups?.flatMap((g) => g.fields) ?? [];
}

export function getDefaultMainConfig(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cat of SRE_SETTINGS_CATEGORIES) {
    if (cat.kind !== 'fields') continue;
    for (const field of getCategoryFields(cat)) {
      out[field.key] = field.defaultValue;
    }
  }
  return out;
}
