import { fetch as undiciFetch, EnvHttpProxyAgent, type Dispatcher } from 'undici';

export function dispatcherFromEnv(env: NodeJS.ProcessEnv = process.env): Dispatcher | null {
  if (env.PUBLIC_DEFAULT_PROXY_ENABLED !== 'true') return null;
  const host = (env.PUBLIC_DEFAULT_PROXY_HOST ?? '').trim();
  const port = (env.PUBLIC_DEFAULT_PROXY_PORT ?? '').trim();
  if (!host || !port) return null;
  return new EnvHttpProxyAgent({
    httpProxy: `http://${host}:${port}`,
    proxyTunnel: true,
  });
}

function isUndiciDispatcher(value: unknown): value is Dispatcher {
  return !!value && typeof (value as Dispatcher).dispatch === 'function';
}

function hrefOf(url: string | URL | Request): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

/**
 * Server-side fetch that is safe to pass an undici Dispatcher.
 * Node HTTP agents are not dispatchers — undici throws `agent.dispatch is not a function`.
 */
export async function fetchWithDispatcher(
  url: string | URL | Request,
  init: RequestInit | undefined,
  dispatcher: Dispatcher | null,
): Promise<Response> {
  const usable = isUndiciDispatcher(dispatcher) ? dispatcher : null;
  if (!usable) {
    return globalThis.fetch(url, init);
  }
  return undiciFetch(hrefOf(url), {
    ...(init as Record<string, unknown>),
    dispatcher: usable,
  } as Parameters<typeof undiciFetch>[1]) as unknown as Response;
}

/**
 * Fetch for Tool Endpoints that do not have SvelteKit `event.fetch`.
 * Honors Direct Upstream Access: no dispatcher unless PUBLIC_DEFAULT_PROXY_ENABLED.
 */
export async function proxyFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return fetchWithDispatcher(url, init, dispatcherFromEnv());
}
