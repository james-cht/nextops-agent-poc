export function authorizeIdpCallbackToken(opts: {
  provided: string | null | undefined;
  expected: string | null | undefined;
}): { ok: true } | { ok: false; code: 'UNAUTHORIZED'; error: string } {
  const expected = opts.expected?.trim() ?? '';
  const provided = opts.provided?.trim() ?? '';
  if (!expected) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'IDP Callback Token is not configured' };
  }
  if (!provided || provided !== expected) {
    return { ok: false, code: 'UNAUTHORIZED', error: 'Invalid IDP Callback Token' };
  }
  return { ok: true };
}

export type RuntimeCheckRecord = {
  nameSpace: string;
  appName: string;
  runId: string;
  ready: boolean;
  probe: string;
};

export function parseRuntimeCheckPayload(body: Record<string, unknown>):
  | { ok: true; check: RuntimeCheckRecord }
  | { ok: false; code: 'BAD_REQUEST'; error: string } {
  const nameSpace = typeof body.nameSpace === 'string' ? body.nameSpace.trim().toLowerCase() : '';
  const appName = typeof body.appName === 'string' ? body.appName.trim().toLowerCase() : '';
  const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
  const probe = typeof body.probe === 'string' ? body.probe.trim() : '';
  const ready = body.ready === true;
  if (!nameSpace || !appName || !runId) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'nameSpace, appName, and runId are required',
    };
  }
  return {
    ok: true,
    check: { nameSpace, appName, runId, ready, probe },
  };
}
