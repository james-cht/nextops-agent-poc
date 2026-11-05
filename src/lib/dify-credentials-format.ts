export type ToolEndpointAdminPayload = {
  toolTokenMasked: string;
  toolTokenSet: boolean;
  source: 'env' | 'override';
};

/** Admin display mask — never echo full secrets. */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (v.length < 8) return '••••';
  const prefix = v.slice(0, 4);
  const suffix = v.slice(-4);
  return `${prefix}••••${suffix}`;
}

/** Admin GET/PUT/DELETE body for the Tool Endpoint Token. Never includes Dify Chat Credentials. */
export function toToolEndpointAdminPayload(opts: {
  toolToken: string;
  source: 'env' | 'override';
}): ToolEndpointAdminPayload {
  return {
    toolTokenMasked: maskSecret(opts.toolToken),
    toolTokenSet: Boolean(opts.toolToken),
    source: opts.source,
  };
}
