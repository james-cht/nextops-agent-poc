const STORAGE_KEY = 'nextops-font-size-config';

export interface FontSizeCategory {
  id: string;
  label: string;
  description: string;
  sizes: FontSizeEntry[];
}

export interface FontSizeEntry {
  key: string;
  label: string;
  value: string;
  default: string;
  min: string;
  max: string;
  step: number;
}

const defaultConfig: FontSizeEntry[] = [
  // Dashboard Labels
  { key: 'fs-label', label: '標籤文字', value: '13px', default: '13px', min: '11px', max: '24px', step: 1 },
  { key: 'fs-section-title', label: '區塊標題', value: '15px', default: '15px', min: '12px', max: '28px', step: 1 },

  // Metric Values
  { key: 'fs-metric-value', label: '指標數值', value: '36px', default: '36px', min: '24px', max: '64px', step: 2 },
  { key: 'fs-metric-unit', label: '指標單位', value: '16px', default: '16px', min: '12px', max: '32px', step: 1 },
  { key: 'fs-trend', label: '趨勢標籤', value: '12px', default: '12px', min: '10px', max: '18px', step: 1 },

  // Body & Support
  { key: 'fs-body', label: '正文字體', value: '14px', default: '14px', min: '12px', max: '24px', step: 1 },
  { key: 'fs-subtext', label: '輔助文字', value: '12px', default: '12px', min: '11px', max: '18px', step: 1 },
  { key: 'fs-header-clock', label: '頂欄時鐘', value: '13px', default: '13px', min: '12px', max: '18px', step: 1 },

  // Small & Meta
  { key: 'fs-small', label: '小型文字', value: '12px', default: '12px', min: '11px', max: '16px', step: 1 },
  { key: 'fs-tiny', label: '極小文字', value: '11px', default: '11px', min: '10px', max: '14px', step: 1 },
];

export const categories: FontSizeCategory[] = [
  {
    id: 'labels',
    label: '儀表板標籤',
    description: 'KPI 卡片標籤、區塊標題等導覽性文字',
    sizes: defaultConfig.filter(e => ['fs-label', 'fs-section-title'].includes(e.key)),
  },
  {
    id: 'metrics',
    label: '指標數值',
    description: 'KPI 卡片上的數值、單位與趨勢指示',
    sizes: defaultConfig.filter(e => ['fs-metric-value', 'fs-metric-unit', 'fs-trend'].includes(e.key)),
  },
  {
    id: 'body',
    label: '正文與輔助',
    description: '頁面主體文字與次要說明',
    sizes: defaultConfig.filter(e => ['fs-body', 'fs-subtext'].includes(e.key)),
  },
  {
    id: 'header',
    label: '頂欄',
    description: '全域頂欄的時鐘，與其他字級分開調整',
    sizes: defaultConfig.filter(e => e.key === 'fs-header-clock'),
  },
  {
    id: 'small',
    label: '小型與註解',
    description: '時間標籤、統計資料等最小一級文字',
    sizes: defaultConfig.filter(e => ['fs-small', 'fs-tiny'].includes(e.key)),
  },
];

function clampSize(entry: FontSizeEntry, value: string): string {
  const n = parseInt(value, 10);
  const min = parseInt(entry.min, 10);
  const max = parseInt(entry.max, 10);
  if (Number.isNaN(n)) return entry.default;
  return `${Math.min(max, Math.max(min, n))}px`;
}

function loadConfig(): FontSizeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, string>;
      return defaultConfig.map(entry => ({
        ...entry,
        value: clampSize(entry, saved[entry.key] ?? entry.default),
      }));
    }
  } catch { /* ignore corrupt data */ }
  return defaultConfig.map(e => ({ ...e }));
}

export function getFontSizeConfig(): FontSizeEntry[] {
  return loadConfig();
}

export function saveFontSizeConfig(sizes: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
}

export function resetFontSizeConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function buildCssVars(sizes: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const entry of defaultConfig) {
    vars[`--${entry.key}`] = sizes[entry.key] ?? entry.default;
  }
  return vars;
}
