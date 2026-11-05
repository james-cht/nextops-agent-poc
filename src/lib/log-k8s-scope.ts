/**
 * Log Namespace / Log Pod document scope (ADR-0013).
 * Pure helpers — not part of Log Index Pattern assembly.
 */

export const LOG_NAMESPACE_FIELD = 'kubernetes.namespace_name';
export const LOG_POD_FIELD = 'kubernetes.pod_name';
export const LOG_FACETS_SIZE = 50;

export type LogK8sScopeOk = { ok: true; namespace?: string; pod?: string };
export type LogK8sScopeErr = {
  ok: false;
  code: 'POD_REQUIRES_NAMESPACE';
  message: string;
};
export type LogK8sScopeResult = LogK8sScopeOk | LogK8sScopeErr;

/** Normalize K8s document-scope params. non_k8s ignores namespace/pod. */
export function normalizeLogK8sScope(input: {
  mode?: string | null;
  namespace?: string | null;
  pod?: string | null;
}): LogK8sScopeResult {
  if (input.mode === 'non_k8s') {
    return { ok: true };
  }

  const namespace = input.namespace?.trim() || undefined;
  const pod = input.pod?.trim() || undefined;

  if (pod && !namespace) {
    return {
      ok: false,
      code: 'POD_REQUIRES_NAMESPACE',
      message: 'pod requires namespace',
    };
  }

  const out: LogK8sScopeOk = { ok: true };
  if (namespace) out.namespace = namespace;
  if (pod) out.pod = pod;
  return out;
}

/** ES bool.filter clauses for Log Namespace / Log Pod. */
export function buildLogK8sDocFilters(scope: { namespace?: string; pod?: string }): object[] {
  const filters: object[] = [];
  if (scope.namespace) {
    filters.push({ term: { [LOG_NAMESPACE_FIELD]: scope.namespace } });
  }
  if (scope.pod) {
    filters.push({ term: { [LOG_POD_FIELD]: scope.pod } });
  }
  return filters;
}
