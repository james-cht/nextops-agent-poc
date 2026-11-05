function formatUpstreamFetchError(
  product: string,
  baseUrl: string,
  hint: string,
  err: unknown,
): string {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  if (
    msg === 'fetch failed' ||
    /ECONNREFUSED|ENOTFOUND|getaddrinfo|UND_ERR|ECONNRESET|ETIMEDOUT/i.test(msg)
  ) {
    return `Cannot reach ${product} at ${baseUrl} (${msg}). Check ${hint} and network from the NextOps host.`;
  }
  return msg;
}

/** Same rewrite for LangGraph Orchestrator Chat Contract failures (ADR-0016). */
export function formatOrchestratorFetchError(baseUrl: string, err: unknown): string {
  return formatUpstreamFetchError('LangGraph orchestrator', baseUrl, 'ORCH_BASE_URL', err);
}
