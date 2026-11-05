/**
 * Log Summary column projection from a log `_source` (ADR-0021 / CONTEXT).
 */

export type LogSummaryRow = {
  timestamp: string;
  serviceName: string;
  httpStatus: string;
  userAgent: string;
  httpMethod: string;
  networkProtocol: string;
  path: string;
  message: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Dot-path get; supports nested objects only (not arrays). */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = source;
  for (const part of path.split('.')) {
    const obj = asObject(cur);
    if (!obj || !(part in obj)) return undefined;
    cur = obj[part];
  }
  return cur;
}

function firstNonEmptyString(source: unknown, paths: string[]): string {
  for (const path of paths) {
    const v = getByPath(source, path);
    if (v === null || v === undefined) continue;
    const s = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v).trim() : '';
    if (s) return s;
  }
  return '';
}

const SERVICE_NAME_PATHS = ['kubernetes.pod_name', 'container.name', 'process.name'];
const HTTP_STATUS_PATHS = ['http.response.status_code', 'http.status_code', 'status'];
const USER_AGENT_PATHS = ['user_agent.original', 'user_agent'];
const HTTP_METHOD_PATHS = ['http.request.method', 'method'];
const NETWORK_PROTOCOL_PATHS = ['network.protocol', 'network.transport'];
const PATH_PATHS = ['url.path', 'http.request.path', 'path'];

export function resolveServiceName(source: unknown): string {
  return firstNonEmptyString(source, SERVICE_NAME_PATHS);
}

export function projectLogSummary(source: unknown, messageMax = 200): LogSummaryRow {
  const s = asObject(source) ?? {};
  const messageRaw =
    firstNonEmptyString(s, ['message', 'message_log', 'log']) ||
    (typeof s.message === 'string' ? s.message : '');
  const message =
    messageRaw.length > messageMax ? `${messageRaw.slice(0, messageMax)}…` : messageRaw;

  return {
    timestamp: firstNonEmptyString(s, ['@timestamp']) || '',
    serviceName: resolveServiceName(s),
    httpStatus: firstNonEmptyString(s, HTTP_STATUS_PATHS),
    userAgent: firstNonEmptyString(s, USER_AGENT_PATHS),
    httpMethod: firstNonEmptyString(s, HTTP_METHOD_PATHS),
    networkProtocol: firstNonEmptyString(s, NETWORK_PROTOCOL_PATHS),
    path: firstNonEmptyString(s, PATH_PATHS),
    message,
  };
}

/** Flatten nested object to dotted paths (scalars only). */
export function flattenLogFields(
  source: unknown,
  prefix = '',
  out: { path: string; value: string | number | boolean | null }[] = [],
): { path: string; value: string | number | boolean | null }[] {
  const obj = asObject(source);
  if (!obj) return out;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out.push({ path, value });
    } else if (Array.isArray(value)) {
      out.push({ path, value: JSON.stringify(value) });
    } else if (typeof value === 'object') {
      flattenLogFields(value, path, out);
    }
  }
  return out;
}
