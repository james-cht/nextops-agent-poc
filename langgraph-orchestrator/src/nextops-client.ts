/** Thin HTTP client: Diagnosis Graph → NextOps Tool Endpoints only (no Prom/ES). */

export type ToolFetchResult = {
  ok: boolean;
  status: number;
  bodyText: string;
};

export type NextOpsClientOptions = {
  toolBase: string;
  toolToken: string;
  fetchTimeoutMs: number;
  fetchImpl?: typeof fetch;
};

export class NextOpsClient {
  private readonly toolBase: string;
  private readonly toolToken: string;
  private readonly fetchTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: NextOpsClientOptions) {
    this.toolBase = opts.toolBase.replace(/\/+$/, '');
    this.toolToken = opts.toolToken;
    this.fetchTimeoutMs = opts.fetchTimeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get(path: string): Promise<ToolFetchResult> {
    const url = `${this.toolBase}${path.startsWith('/') ? path : `/${path}`}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.toolToken}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      const bodyText = await res.text();
      return { ok: res.ok, status: res.status, bodyText };
    } finally {
      clearTimeout(timer);
    }
  }

  listSites(): Promise<ToolFetchResult> {
    return this.get('/api/sites');
  }

  describeSite(siteId: string): Promise<ToolFetchResult> {
    return this.get(`/api/sites/${encodeURIComponent(siteId)}/describe`);
  }

  getSiteOverview(siteId: string): Promise<ToolFetchResult> {
    return this.get(`/api/sites/${encodeURIComponent(siteId)}/overview`);
  }

  getSiteResourceHealth(siteId: string): Promise<ToolFetchResult> {
    return this.get(`/api/sites/${encodeURIComponent(siteId)}/resource-health`);
  }
}

export function matchCatalogSiteId(query: string, sitesJson: string): string {
  let sites: unknown;
  try {
    sites = JSON.parse(sitesJson);
  } catch {
    return '';
  }
  if (!Array.isArray(sites)) return '';
  const q = query.trim();
  if (!q) return '';
  for (const row of sites) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as { siteId?: unknown; title?: unknown };
    const siteId = typeof rec.siteId === 'string' ? rec.siteId : '';
    const title = typeof rec.title === 'string' ? rec.title : '';
    if (siteId && (q.includes(siteId) || siteId.includes(q))) return siteId;
    if (title && q.includes(title)) return siteId || title;
  }
  return '';
}
