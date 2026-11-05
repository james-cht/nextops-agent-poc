export const RESOURCE_REQUEST_KINDS = [
  'files',
  'networks',
  'middleware',
  'vm',
  'db',
  'minio',
  'domains',
] as const;

export type ResourceRequestKind = (typeof RESOURCE_REQUEST_KINDS)[number];

export type ResourceRequestStatus = 'needed' | 'not_needed';

export type ResourceRequestSheetInput = {
  kind: ResourceRequestKind;
  fields?: Record<string, string>;
};

export type ResourceRequestSheet = {
  kind: ResourceRequestKind;
  status: ResourceRequestStatus;
  fields: Record<string, string>;
};

const SECRET_KEY_RE = /(password|passwd|secret|token|kubeconfig|private.?key|credential)/i;

export function stripSecretFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SECRET_KEY_RE.test(key)) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out[key.trim()] = trimmed;
  }
  return out;
}

export function resourceRequestStatus(sheet: {
  fields: Record<string, string>;
}): ResourceRequestStatus {
  return Object.keys(sheet.fields).length > 0 ? 'needed' : 'not_needed';
}

export function normalizeResourceRequestSheets(
  inputs: ResourceRequestSheetInput[],
): ResourceRequestSheet[] {
  const byKind = new Map<ResourceRequestKind, Record<string, string>>();
  for (const kind of RESOURCE_REQUEST_KINDS) {
    byKind.set(kind, {});
  }
  for (const input of inputs) {
    if (!(RESOURCE_REQUEST_KINDS as readonly string[]).includes(input.kind)) continue;
    byKind.set(input.kind, stripSecretFields(input.fields ?? {}));
  }
  return RESOURCE_REQUEST_KINDS.map((kind) => {
    const fields = byKind.get(kind) ?? {};
    return {
      kind,
      fields,
      status: resourceRequestStatus({ fields }),
    };
  });
}
