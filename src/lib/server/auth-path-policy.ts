import { joinPublicPath, stripPublicBasePath } from '../public-base-path.ts';

/**
 * Paths that must not require a NextOps Session cookie before the route runs.
 *
 * GitLab authorize is NOT exempt — it needs operatorKey from Session.
 * GitLab callback IS exempt — SameSite=Strict session cookies are not sent on
 * the top-level return from GitLab; OAuth state binds the Operator Account.
 */
export function isSessionExemptPath(
  path: string,
  publicBasePath: string | undefined | null = '',
): boolean {
  const appPath = stripPublicBasePath(path, publicBasePath);
  if (appPath === '/login') return true;
  if (appPath === '/api/auth/login' || appPath === '/api/auth/logout') return true;
  if (appPath === '/api/auth/gitlab/callback') return true;
  return false;
}

export function isHealthPath(
  path: string,
  publicBasePath: string | undefined | null = '',
): boolean {
  return stripPublicBasePath(path, publicBasePath) === '/api/health';
}

const TOOL_PATHS = ['/api/sites', '/api/es', '/api/ai'];

export function isToolPath(
  path: string,
  publicBasePath: string | undefined | null = '',
): boolean {
  const appPath = stripPublicBasePath(path, publicBasePath);
  return TOOL_PATHS.some((prefix) => appPath === prefix || appPath.startsWith(`${prefix}/`));
}

export function sessionLoginLocation(publicBasePath: string | undefined | null = ''): string {
  return joinPublicPath(publicBasePath, '/login');
}
