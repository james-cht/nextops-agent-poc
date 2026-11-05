/**
 * Session cookie → operator key for personal preferences (ADR-0022).
 * Full multi-account Operator Account table is not required yet: username is the key.
 * Legacy cookie value `authenticated` falls back to the singular admin username.
 */

export const LEGACY_SESSION_VALUE = 'authenticated';
export const SESSION_PREFIX = 'op:';

export function encodeOperatorSession(username: string): string {
  const u = username.trim();
  if (!u) return LEGACY_SESSION_VALUE;
  return `${SESSION_PREFIX}${u}`;
}

export function decodeOperatorSession(
  cookieValue: string | undefined | null,
  fallbackUsername: string | null | undefined,
): string | null {
  if (!cookieValue) return null;
  if (cookieValue.startsWith(SESSION_PREFIX)) {
    const u = cookieValue.slice(SESSION_PREFIX.length).trim();
    return u || null;
  }
  if (cookieValue === LEGACY_SESSION_VALUE) {
    const fb = fallbackUsername?.trim();
    return fb || null;
  }
  // Treat unknown non-empty cookie as legacy authenticated
  const fb = fallbackUsername?.trim();
  return fb || null;
}
