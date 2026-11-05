import type { ExploreData, Route } from './types';

async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`./data/${name}`);
  if (!res.ok) throw new Error(`Failed to load ${name}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadExploreData(): Promise<ExploreData> {
  const [corpus, inventory, drift, graph, links, meta, outbound] = await Promise.all([
    loadJson('corpus.json'),
    loadJson('inventory.json'),
    loadJson('drift.json'),
    loadJson('graph.json'),
    loadJson('links.json'),
    loadJson('meta.json'),
    loadJson('outbound.json')
  ]);
  return { corpus, inventory, drift, graph, links, meta, outbound } as ExploreData;
}

export function parseHash(hash = window.location.hash): Route {
  const raw = (hash || '#/').replace(/^#/, '') || '/';
  const url = new URL(raw, 'http://local.explore');
  const parts = url.pathname.split('/').filter(Boolean);
  const head = parts[0] || 'home';

  if (head === 'home' || head === '') return { name: 'home' };
  if (head === 'doc' && parts[1]) return { name: 'doc', id: decodeURIComponent(parts[1]) };
  if (head === 'search') return { name: 'search', q: url.searchParams.get('q') || '' };
  if (head === 'graph') return { name: 'graph', focus: url.searchParams.get('focus') || undefined };
  if (head === 'drift') return { name: 'drift' };
  if (head === 'links') return { name: 'links' };
  if (head === 'features') return { name: 'features' };
  if (head === 'dify-chatflow') return { name: 'dify-chatflow' };
  if (head === 'future') return { name: 'future' };
  if (head === 'outbound') return { name: 'outbound' };
  return { name: 'home' };
}

export function toHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'doc':
      return `#/doc/${encodeURIComponent(route.id)}`;
    case 'search':
      return `#/search?q=${encodeURIComponent(route.q)}`;
    case 'graph':
      return route.focus ? `#/graph?focus=${encodeURIComponent(route.focus)}` : '#/graph';
    case 'drift':
      return '#/drift';
    case 'links':
      return '#/links';
    case 'features':
      return '#/features';
    case 'dify-chatflow':
      return '#/dify-chatflow';
    case 'future':
      return '#/future';
    case 'outbound':
      return '#/outbound';
  }
}

export function githubBlobUrl(repoFile: string): string {
  // Best-effort: works when browsing from GitHub; locally still useful as path hint
  return `https://github.com/james-cht/nextops/blob/main/${repoFile}`;
}

export function searchDocs(docs: ExploreData['corpus']['docs'], q: string) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const terms = query.split(/\s+/).filter(Boolean);
  return docs
    .map((doc) => {
      const hay = `${doc.title}\n${doc.plainText}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (doc.title.toLowerCase().includes(t)) score += 8;
        const idx = hay.indexOf(t);
        if (idx >= 0) score += 2;
        // count occurrences (capped)
        let from = 0;
        let n = 0;
        while (n < 20) {
          const i = hay.indexOf(t, from);
          if (i < 0) break;
          n++;
          from = i + t.length;
          score += 0.2;
        }
      }
      return { doc, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}
