/**
 * Documentation Explorer generator
 * Produces public/data/{corpus,inventory,graph,links,drift,outbound,meta}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const OUT_DIR = path.join(APP_ROOT, 'public', 'data');

const CURATED = [
  { id: 'context', file: 'CONTEXT.md', title: '詞彙表 (CONTEXT)', section: 'glossary' },
  { id: 'readme-docs', file: 'docs/README.md', title: '文件索引', section: 'getting-started' },
  { id: 'tutorial', file: 'docs/tutorial.md', title: '教學總覽', section: 'getting-started' },
  { id: 'tutorial-operator', file: 'docs/tutorial-operator.md', title: '操作教學', section: 'getting-started' },
  { id: 'tutorial-integrator', file: 'docs/tutorial-integrator.md', title: 'Integrator Tutorial', section: 'getting-started' },
  { id: 'local-development', file: 'docs/local-development.md', title: '本地開發', section: 'getting-started' },
  { id: 'architecture', file: 'docs/architecture.md', title: '架構總覽', section: 'architecture' },
  { id: 'data-flow', file: 'docs/data-flow.md', title: '資料流', section: 'architecture' },
  { id: 'technical-stack', file: 'docs/technical-stack.md', title: '技術棧', section: 'architecture' },
  { id: 'configuration', file: 'docs/configuration.md', title: '設定參考', section: 'ops' },
  { id: 'deployment', file: 'docs/deployment.md', title: '部署指南', section: 'ops' },
  { id: 'dify-setup', file: 'docs/dify-setup.md', title: 'Dify 設定', section: 'integration' },
  { id: 'api-contract', file: 'docs/api-contract.md', title: 'API 契約', section: 'integration' },
  { id: 'future', file: 'docs/explore-app/FUTURE.md', title: '下一步', section: 'planning' }
];

const DRIFT_AUTHORITY_IDS = new Set([
  'architecture',
  'readme-docs',
  'api-contract',
  'data-flow',
  'configuration',
  'tutorial',
  'tutorial-operator',
  'tutorial-integrator'
]);

const OUTBOUND_GLOBS = [
  { dir: 'docs/adr', label: 'ADR' },
  { dir: 'docs/design', label: 'Design' },
  { dir: 'docs/designs', label: 'Designs' },
  { dir: 'docs/plan', label: 'Plan' },
  { dir: 'docs/plans', label: 'Plans' }
];

const SECTION_LABELS = {
  'getting-started': '入門教學',
  architecture: '架構與資料流',
  ops: '設定與部署',
  integration: 'API 與整合',
  glossary: '詞彙',
  planning: '規劃'
};

const MD_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_RE = /^(#{1,6})\s+(.+)$/gm;
const EXPORT_METHOD_RE = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readText(abs) {
  return fs.readFileSync(abs, 'utf8');
}

function writeJson(name, data) {
  const dest = path.join(OUT_DIR, name);
  fs.writeFileSync(dest, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  wrote data/${name}`);
}

function slugifyHeading(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\{#([^}]+)\}/, (_, id) => id)
    .replace(/\{#[^}]+\}/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\w\s\u4e00-\u9fff-]/gu, '')
    .replace(/\s+/g, '-');
}

function extractExplicitId(headingLine) {
  const m = headingLine.match(/\{#([^}]+)\}/);
  return m ? m[1] : null;
}

function routeFromPageFile(relFromRoutes) {
  // e.g. logs/+page.svelte → /logs ; +page.svelte → / ; sites/[siteId]/+page.svelte
  const parts = relFromRoutes.split(path.sep).filter(Boolean);
  parts.pop(); // remove +page.svelte
  if (parts.length === 0) return '/';
  return '/' + parts.join('/');
}

function routeFromServerFile(relFromRoutes) {
  // api/sites/[siteId]/overview/+server.ts → /api/sites/[siteId]/overview
  const parts = relFromRoutes.split(path.sep).filter(Boolean);
  parts.pop();
  return '/' + parts.join('/');
}

function walkFiles(dir, predicate, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, acc);
    else if (predicate(full, entry.name)) acc.push(full);
  }
  return acc;
}

function collectInventory() {
  const routesDir = path.join(REPO_ROOT, 'src', 'routes');
  const pages = [];
  const apis = [];

  for (const file of walkFiles(routesDir, (f, name) => name === '+page.svelte')) {
    const rel = path.relative(routesDir, file);
    const route = routeFromPageFile(rel).replace(/\\/g, '/');
    pages.push({
      id: `page:${route}`,
      kind: 'page',
      route,
      file: path.relative(REPO_ROOT, file).replace(/\\/g, '/')
    });
  }

  for (const file of walkFiles(
    path.join(routesDir, 'api'),
    (f, name) => name === '+server.ts'
  )) {
    const rel = path.relative(routesDir, file);
    const route = routeFromServerFile(rel).replace(/\\/g, '/');
    const src = readText(file);
    const methods = [...src.matchAll(EXPORT_METHOD_RE)].map((m) => m[1]);
    apis.push({
      id: `api:${route}`,
      kind: 'api',
      route,
      methods: [...new Set(methods)].sort(),
      file: path.relative(REPO_ROOT, file).replace(/\\/g, '/')
    });
  }

  pages.sort((a, b) => a.route.localeCompare(b.route));
  apis.sort((a, b) => a.route.localeCompare(b.route));
  return { pages, apis };
}

function resolveDocPath(fromFile, href) {
  if (/^(https?:|mailto:|data:)/i.test(href)) return { type: 'external', href };
  const [pathPart, hash] = href.split('#');
  if (!pathPart) return { type: 'anchor', href, hash };
  const abs = path.resolve(path.dirname(path.join(REPO_ROOT, fromFile)), pathPart);
  const exists = fs.existsSync(abs);
  return {
    type: 'relative',
    href,
    hash: hash || null,
    resolved: path.relative(REPO_ROOT, abs).replace(/\\/g, '/'),
    exists
  };
}

function parseMarkdownDoc(entry) {
  const abs = path.join(REPO_ROOT, entry.file);
  if (!fs.existsSync(abs)) {
    console.warn(`  missing curated file: ${entry.file}`);
    return null;
  }
  const markdown = readText(abs);
  const headings = [];
  let m;
  const headingRe = new RegExp(HEADING_RE.source, 'gm');
  while ((m = headingRe.exec(markdown))) {
    const raw = m[2].trim();
    const explicit = extractExplicitId(raw);
    const title = raw.replace(/\s*\{#[^}]+\}\s*$/, '').trim();
    headings.push({
      level: m[1].length,
      title,
      id: explicit || slugifyHeading(title)
    });
  }

  const links = [];
  const linkRe = new RegExp(MD_LINK_RE.source, 'g');
  while ((m = linkRe.exec(markdown))) {
    links.push({
      label: m[1],
      ...resolveDocPath(entry.file, m[2].trim())
    });
  }

  // Mentioned routes/APIs (simple path tokens)
  const routeMentions = new Set();
  const mentionRe = /`(\/(?:api\/)?[a-zA-Z0-9_./\[\]:-]+)`|(\/(?:api\/)[a-zA-Z0-9_./\[\]:-]+)|(\/(?:logs|alerts|ai|admin|login|pipelines|sites)[a-zA-Z0-9_./\[\]-]*)/g;
  while ((m = mentionRe.exec(markdown))) {
    const raw = (m[1] || m[2] || m[3] || '').trim();
    if (!raw || raw.length < 2) continue;
    // normalize trailing punctuation
    const cleaned = raw.replace(/[.,;:)]+$/, '');
    if (cleaned.startsWith('/')) routeMentions.add(cleaned);
  }

  const renderer = new marked.Renderer();
  renderer.heading = function ({ text, depth }) {
    const explicit = extractExplicitId(text);
    const title = String(text).replace(/\s*\{#[^}]+\}\s*$/, '').trim();
    const id = explicit || slugifyHeading(title);
    return `<h${depth} id="${id}">${title}</h${depth}>\n`;
  };
  const html = marked.parse(markdown, { async: false, renderer });

  return {
    id: entry.id,
    title: entry.title,
    section: entry.section,
    sectionLabel: SECTION_LABELS[entry.section] || entry.section,
    file: entry.file,
    markdown,
    html,
    headings,
    links,
    routeMentions: [...routeMentions].sort(),
    plainText: markdown.replace(/[#>*`_\[\]()]/g, ' ').replace(/\s+/g, ' ').trim()
  };
}

function collectOutbound() {
  const items = [];
  for (const g of OUTBOUND_GLOBS) {
    const abs = path.join(REPO_ROOT, g.dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walkFiles(abs, (f, name) => name.endsWith('.md'))) {
      const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
      const firstLine = readText(file).split('\n').find((l) => l.startsWith('#')) || rel;
      items.push({
        file: rel,
        title: firstLine.replace(/^#+\s*/, '').trim(),
        group: g.label,
        openSource: rel
      });
    }
  }
  items.sort((a, b) => a.file.localeCompare(b.file));
  return items;
}

function buildLinksReport(docs) {
  const broken = [];
  const ok = [];
  for (const doc of docs) {
    for (const link of doc.links) {
      if (link.type === 'external' || link.type === 'anchor') continue;
      const row = {
        from: doc.id,
        fromFile: doc.file,
        label: link.label,
        href: link.href,
        resolved: link.resolved
      };
      if (!link.exists) broken.push(row);
      else ok.push(row);
    }
  }
  return { broken, okCount: ok.length, brokenCount: broken.length };
}

function buildDrift(inventory, docs) {
  const authorityText = docs
    .filter((d) => DRIFT_AUTHORITY_IDS.has(d.id))
    .map((d) => d.markdown)
    .join('\n');

  const undocumented = [];
  const documented = [];

  function isMentioned(route) {
    if (authorityText.includes(route)) return true;
    // also try without trailing params noise
    const base = route.replace(/\/\[[^\]]+\]/g, '/:param');
    if (base !== route && authorityText.includes(base)) return true;
    // siteId variants
    if (route.includes('[siteId]') && authorityText.includes(':siteId')) return true;
    if (route.includes('[siteId]') && authorityText.includes('/sites/')) return true;
    return false;
  }

  for (const item of [...inventory.pages, ...inventory.apis]) {
    const row = { id: item.id, kind: item.kind, route: item.route, file: item.file };
    if (isMentioned(item.route)) documented.push(row);
    else undocumented.push(row);
  }

  // Stale: authority mentions /api/ or known UI paths not in inventory
  const inventoryRoutes = new Set([...inventory.pages, ...inventory.apis].map((i) => i.route));
  const stale = [];
  const candidateRe = /`(\/(?:api\/)?[a-zA-Z0-9_./:[\]-]+)`/g;
  const seen = new Set();
  let m;
  while ((m = candidateRe.exec(authorityText))) {
    let route = m[1].replace(/:siteId/g, '[siteId]');
    if (!route.startsWith('/')) continue;
    if (seen.has(route)) continue;
    seen.add(route);
    // skip clearly non-route fragments
    if (route.length < 2) continue;
    const exact = inventoryRoutes.has(route);
    const fuzzy = [...inventoryRoutes].some(
      (r) => r === route || r.replace(/\[siteId\]/g, ':siteId') === route.replace(/\[siteId\]/g, ':siteId')
    );
    if (!exact && !fuzzy) {
      // only flag if looks like a real app path
      if (
        route.startsWith('/api/') ||
        ['/logs', '/alerts', '/ai', '/admin', '/login', '/pipelines', '/sites'].some((p) =>
          route === p || route.startsWith(p + '/')
        ) ||
        route === '/'
      ) {
        stale.push({ route, note: 'mentioned in authority docs but not found in inventory' });
      }
    }
  }

  return {
    undocumented,
    documented,
    stale,
    summary: {
      undocumentedPages: undocumented.filter((u) => u.kind === 'page').length,
      undocumentedApis: undocumented.filter((u) => u.kind === 'api').length,
      staleMentions: stale.length,
      documentedCount: documented.length
    }
  };
}

function buildGraph(docs, inventory, drift) {
  const nodes = [];
  const edges = [];

  for (const doc of docs) {
    nodes.push({
      id: `doc:${doc.id}`,
      kind: 'doc',
      label: doc.title,
      section: doc.section,
      href: `#/doc/${doc.id}`
    });
  }

  for (const page of inventory.pages) {
    nodes.push({
      id: page.id,
      kind: 'page',
      label: page.route,
      href: `#/graph?focus=${encodeURIComponent(page.id)}`
    });
  }
  for (const api of inventory.apis) {
    nodes.push({
      id: api.id,
      kind: 'api',
      label: api.route,
      href: `#/graph?focus=${encodeURIComponent(api.id)}`
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Doc → doc via relative markdown links into curated corpus
  const fileToDocId = new Map(docs.map((d) => [d.file.replace(/\\/g, '/'), d.id]));
  for (const doc of docs) {
    for (const link of doc.links) {
      if (link.type !== 'relative' || !link.exists) continue;
      const targetId = fileToDocId.get(link.resolved);
      if (!targetId) continue;
      edges.push({
        from: `doc:${doc.id}`,
        to: `doc:${targetId}`,
        kind: 'doc-link'
      });
    }
  }

  // Doc → code via route mentions
  const routeToId = new Map(
    [...inventory.pages, ...inventory.apis].map((i) => [i.route, i.id])
  );
  for (const doc of docs) {
    for (const route of doc.routeMentions) {
      let id = routeToId.get(route);
      if (!id && route.includes(':siteId')) {
        id = routeToId.get(route.replace(/:siteId/g, '[siteId]'));
      }
      if (!id) {
        // prefix match for /admin → skip too broad; require inventory hit
        continue;
      }
      edges.push({
        from: `doc:${doc.id}`,
        to: id,
        kind: 'mentions'
      });
    }
  }

  // Mismatch edges
  for (const u of drift.undocumented) {
    edges.push({
      from: 'drift:undocumented',
      to: u.id,
      kind: 'undocumented'
    });
  }
  if (drift.undocumented.length) {
    nodes.push({
      id: 'drift:undocumented',
      kind: 'drift',
      label: '未文件化 (Drift)',
      href: '#/drift'
    });
  }

  // Dedupe edges
  const edgeKey = (e) => `${e.from}->${e.to}:${e.kind}`;
  const seen = new Set();
  const uniqueEdges = [];
  for (const e of edges) {
    if (!nodeIds.has(e.from) && e.from !== 'drift:undocumented') continue;
    if (!nodeIds.has(e.to) && !e.to.startsWith('page:') && !e.to.startsWith('api:')) {
      // refresh nodeIds after drift node added
    }
    const k = edgeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    uniqueEdges.push(e);
  }

  // Ensure all edge endpoints exist
  const allIds = new Set(nodes.map((n) => n.id));
  const filtered = uniqueEdges.filter((e) => allIds.has(e.from) && allIds.has(e.to));

  return { nodes, edges: filtered };
}

function main() {
  console.log('Generating Documentation Explorer data…');
  console.log(`  repo: ${REPO_ROOT}`);
  ensureDir(OUT_DIR);

  const inventory = collectInventory();
  const docs = CURATED.map(parseMarkdownDoc).filter(Boolean);
  const outbound = collectOutbound();
  const links = buildLinksReport(docs);
  const drift = buildDrift(inventory, docs);
  const graph = buildGraph(docs, inventory, drift);

  // Strip heavy markdown from corpus payload used by UI search — keep html + plainText + meta
  const corpus = {
    sections: SECTION_LABELS,
    docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      section: d.section,
      sectionLabel: d.sectionLabel,
      file: d.file,
      html: d.html,
      headings: d.headings,
      routeMentions: d.routeMentions,
      plainText: d.plainText,
      openSource: d.file
    }))
  };

  writeJson('inventory.json', inventory);
  writeJson('corpus.json', corpus);
  writeJson('outbound.json', { items: outbound });
  writeJson('links.json', links);
  writeJson('drift.json', drift);
  writeJson('graph.json', graph);
  writeJson('meta.json', {
    generatedAt: new Date().toISOString(),
    curatedCount: docs.length,
    pageCount: inventory.pages.length,
    apiCount: inventory.apis.length,
    driftSummary: drift.summary,
    linksSummary: { ok: links.okCount, broken: links.brokenCount },
    hosting: 'local-first (publish target TBD)',
    legacyHub: 'docs/explore/index.html'
  });

  console.log('Done.');
  console.log(
    `  pages=${inventory.pages.length} apis=${inventory.apis.length} docs=${docs.length} driftUndoc=${drift.undocumented.length} brokenLinks=${links.brokenCount}`
  );
}

main();
