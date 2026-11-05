const STORAGE_KEY = 'nextops-promql-config';

export interface PromqlEntry {
  key: string;
  label: string;
  defaultQuery: string;
  description: string;
}

export const DEFAULT_PROMQL_QUERIES: Record<string, string> = {
  cpu: '100 - (avg by (cluster,job) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
  memory: '100 * (1 - (sum by (cluster,job) (node_memory_MemFree_bytes{role!="ASIA-Kettle"} + node_memory_Buffers_bytes{role!="ASIA-Kettle"} + node_memory_Cached_bytes{role!="ASIA-Kettle"}) / sum by (cluster,job) (node_memory_MemTotal_bytes{role!="ASIA-Kettle"})))',
  disk: '100 * (sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"} - node_filesystem_free_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"}) / sum by (cluster,job) (node_filesystem_size_bytes{fstype!~"tmpfs|fuse.lxcfs|overlay", role!="ASIA-Kettle"}))',
  node_total: 'count by (cluster)(up{job=~"os|node-exporter",rolegroup!="PT-Kettle"})',
  node_online: 'sum by (cluster) (up{job=~"os|node-exporter",rolegroup!="PT-Kettle"} == 1)'
};

export const PROMQL_METADATA: PromqlEntry[] = [
  {
    key: 'cpu',
    label: 'CPU 使用率',
    defaultQuery: DEFAULT_PROMQL_QUERIES.cpu,
    description: '計算叢集/工作節點的平均 CPU 使用率百分比'
  },
  {
    key: 'memory',
    label: '記憶體使用率',
    defaultQuery: DEFAULT_PROMQL_QUERIES.memory,
    description: '計算排除特定角色後的實體記憶體已使用百分比'
  },
  {
    key: 'disk',
    label: '磁碟使用率',
    defaultQuery: DEFAULT_PROMQL_QUERIES.disk,
    description: '計算排除虛擬與臨時檔案系統後的磁碟空間使用百分比'
  },
  {
    key: 'node_total',
    label: '節點總數',
    defaultQuery: DEFAULT_PROMQL_QUERIES.node_total,
    description: '計算監控中的主機/節點總量'
  },
  {
    key: 'node_online',
    label: '在線節點數',
    defaultQuery: DEFAULT_PROMQL_QUERIES.node_online,
    description: '計算目前狀態為 up (1) 的在線節點數量'
  }
];

export function getPromqlConfig(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, string>;
      return {
        cpu: saved.cpu ?? DEFAULT_PROMQL_QUERIES.cpu,
        memory: saved.memory ?? DEFAULT_PROMQL_QUERIES.memory,
        disk: saved.disk ?? DEFAULT_PROMQL_QUERIES.disk,
        node_total: saved.node_total ?? DEFAULT_PROMQL_QUERIES.node_total,
        node_online: saved.node_online ?? DEFAULT_PROMQL_QUERIES.node_online,
      };
    }
  } catch { /* ignore localStorage errors */ }
  return { ...DEFAULT_PROMQL_QUERIES };
}

export function savePromqlConfig(config: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* ignore localStorage errors */ }
}

export function resetPromqlConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore localStorage errors */ }
}

export function buildPromqlQueryParams(config: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(config)) {
    params.set(key, val);
  }
  return params.toString();
}
