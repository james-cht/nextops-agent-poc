/**
 * Public Base Path (ADR-0035): bake-time URL prefix on a shared host.
 * Empty means NextOps is at `/` (laptop, dedicated host). Shared-host form is
 * `/nextops` (leading slash, no trailing slash) — same as SvelteKit `paths.base`.
 */

export function kitPathsBase(raw: string | undefined | null): string {
  let value = (raw ?? '').trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value || value === '/') return '';
  if (!value.startsWith('/')) value = `/${value}`;
  return value.replace(/\/+$/, '');
}

function lastDotenvAssignment(text: string, key: string): string {
  const prefix = `${key}=`;
  let found = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.startsWith('\ufeff') ? raw.slice(1) : raw;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith(prefix)) found = trimmed.slice(prefix.length);
  }
  return found;
}

/**
 * SvelteKit `paths.base` at bake time. An empty `process.env.PUBLIC_BASE_PATH`
 * (Docker `ARG PUBLIC_BASE_PATH=` / `ENV PUBLIC_BASE_PATH=`) must not shadow
 * `.env.production` — Vite leaves already-set env vars alone, including "".
 */
export function kitPathsBaseFromBuildEnv(
  processEnv: { PUBLIC_BASE_PATH?: string | undefined },
  dotenvText = '',
): string {
  const fromProcess = kitPathsBase(processEnv.PUBLIC_BASE_PATH);
  if (fromProcess) return fromProcess;
  return kitPathsBase(lastDotenvAssignment(dotenvText, 'PUBLIC_BASE_PATH'));
}

export function joinPublicPath(publicBasePath: string | undefined | null, appPath: string): string {
  const base = kitPathsBase(publicBasePath);
  const path = appPath.startsWith('/') ? appPath : `/${appPath}`;
  if (path === '/') return base ? `${base}/` : '/';
  return `${base}${path}`;
}

export function stripPublicBasePath(
  pathname: string,
  publicBasePath: string | undefined | null,
): string {
  const base = kitPathsBase(publicBasePath);
  if (!base) return pathname || '/';
  if (pathname === base || pathname === `${base}/`) return '/';
  if (pathname.startsWith(`${base}/`)) {
    const rest = pathname.slice(base.length);
    return rest || '/';
  }
  return pathname || '/';
}

/**
 * Prefix a root-relative NextOps href/fetch path. Leaves relative URLs, other
 * hosts, and already-prefixed paths unchanged.
 */
export function withPublicBasePath(
  href: string,
  publicBasePath: string | undefined | null,
): string {
  const base = kitPathsBase(publicBasePath);
  if (!base) return href;
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  if (href === base || href.startsWith(`${base}/`)) return href;
  return `${base}${href}`;
}
