export type DocEntry = {
  id: string;
  title: string;
  section: string;
  sectionLabel: string;
  file: string;
  html: string;
  headings: Array<{ level: number; title: string; id: string }>;
  routeMentions: string[];
  plainText: string;
  openSource: string;
};

export type Corpus = {
  sections: Record<string, string>;
  docs: DocEntry[];
};

export type Inventory = {
  pages: Array<{ id: string; kind: 'page'; route: string; file: string }>;
  apis: Array<{
    id: string;
    kind: 'api';
    route: string;
    methods: string[];
    file: string;
  }>;
};

export type Drift = {
  undocumented: Array<{ id: string; kind: string; route: string; file: string }>;
  documented: Array<{ id: string; kind: string; route: string; file: string }>;
  stale: Array<{ route: string; note: string }>;
  summary: {
    undocumentedPages: number;
    undocumentedApis: number;
    staleMentions: number;
    documentedCount: number;
  };
};

export type GraphData = {
  nodes: Array<{ id: string; kind: string; label: string; section?: string; href?: string }>;
  edges: Array<{ from: string; to: string; kind: string }>;
};

export type LinksReport = {
  broken: Array<{ from: string; fromFile: string; label: string; href: string; resolved?: string }>;
  okCount: number;
  brokenCount: number;
};

export type Meta = {
  generatedAt: string;
  curatedCount: number;
  pageCount: number;
  apiCount: number;
  driftSummary: Drift['summary'];
  linksSummary: { ok: number; broken: number };
  hosting: string;
  legacyHub: string;
};

export type Outbound = {
  items: Array<{ file: string; title: string; group: string; openSource: string }>;
};

export type ExploreData = {
  corpus: Corpus;
  inventory: Inventory;
  drift: Drift;
  graph: GraphData;
  links: LinksReport;
  meta: Meta;
  outbound: Outbound;
};

export type Route =
  | { name: 'home' }
  | { name: 'doc'; id: string }
  | { name: 'search'; q: string }
  | { name: 'graph'; focus?: string }
  | { name: 'drift' }
  | { name: 'links' }
  | { name: 'features' }
  | { name: 'dify-chatflow' }
  | { name: 'future' }
  | { name: 'outbound' };
