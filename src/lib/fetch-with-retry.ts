import { ErrorCode, statusToErrorCode, type ErrorCode as ErrorCodeType } from './errors';

export interface FetchError {
  error: string;
  code: ErrorCodeType;
  status?: number;
}

export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of retries for transient failures (default: 3). */
  retries?: number;
  /** Whether to throw on non-ok responses (default: true). Set false to handle errors manually. */
  throwOnError?: boolean;
}

/**
 * Wrapper around fetch with:
 * - Exponential backoff retry (1s, 2s, 4s) for 5xx / network errors
 * - Structured error parsing
 * - Type-safe response
 */
export async function fetchWithRetry<T>(
  input: RequestInfo | URL,
  init?: FetchWithRetryOptions,
): Promise<T> {
  const maxRetries = init?.retries ?? 3;
  const throwOnError = init?.throwOnError ?? true;
  let lastError: FetchError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(input, init);

      if (res.ok) {
        // Handle 204 No Content
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      // Try to parse structured error from body
      let body: any;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      const code = body?.code ?? statusToErrorCode(res.status);
      const message = body?.error ?? (res.statusText || `HTTP ${res.status}`);
      lastError = { error: message, code, status: res.status };

      // Only retry on 5xx (server errors) — 4xx are client errors, don't retry
      if (res.status < 500 || attempt >= maxRetries) {
        if (throwOnError) throw lastError;
        return lastError as unknown as T;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (e) {
      // Network / timeout errors — retry
      if (e instanceof TypeError || (e instanceof Error && e.name === 'AbortError')) {
        lastError = {
          error: e instanceof Error ? e.message : 'Network error',
          code: ErrorCode.TIMEOUT,
        };

        if (attempt >= maxRetries) {
          if (throwOnError) throw lastError;
          return lastError as unknown as T;
        }

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // If it's our own FetchError, re-throw
      if ((e as FetchError)?.code !== undefined) {
        throw e;
      }

      // Unknown error
      throw e;
    }
  }

  // Shouldn't reach here, but just in case
  if (throwOnError && lastError) throw lastError;
  return lastError as unknown as T;
}
