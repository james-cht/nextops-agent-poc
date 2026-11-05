import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import {
  getMysqlProxyEnabledPreference,
  isMysqlProxyEnabled,
  setMysqlProxyEnabled,
} from '$lib/server/mysql-proxy';
import { applyMysqlProxySave } from '$lib/server/mysql-proxy-admin';
import { createErrorResponse, ErrorCode } from '$lib/errors';
import {
  ensureAppLocalSettings,
  verifyStepUpPassword,
} from '$lib/server/app-local-settings';

export const GET: RequestHandler = async () => {
  await ensureAppLocalSettings();
  return json({
    enabled: getMysqlProxyEnabledPreference(),
    usingTunnel: isMysqlProxyEnabled(),
    proxyHost: env.PUBLIC_DEFAULT_PROXY_HOST ?? '',
    proxyPort: env.PUBLIC_DEFAULT_PROXY_PORT ?? '',
  });
};

export const PUT: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }

  const enabled = (body as { enabled?: unknown })?.enabled;
  const adminPassword = (body as { adminPassword?: unknown })?.adminPassword;
  if (typeof enabled !== 'boolean') {
    return json(
      createErrorResponse(ErrorCode.BAD_REQUEST, 'Body must include boolean "enabled"'),
      { status: 400 },
    );
  }
  if (typeof adminPassword !== 'string') {
    return json(
      createErrorResponse(ErrorCode.BAD_REQUEST, 'Body must include adminPassword'),
      { status: 400 },
    );
  }

  const store = await ensureAppLocalSettings();
  const result = await applyMysqlProxySave({
    adminPassword,
    verifyStepUp: verifyStepUpPassword,
    actor: store.getAdminUsername() ?? 'admin',
    enabled,
    store,
    setEnabled: setMysqlProxyEnabled,
    getEnabled: getMysqlProxyEnabledPreference,
  });

  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, result.error), { status: 401 });
  }

  return json({
    enabled: result.enabled,
    usingTunnel: isMysqlProxyEnabled(),
    proxyHost: env.PUBLIC_DEFAULT_PROXY_HOST ?? '',
    proxyPort: env.PUBLIC_DEFAULT_PROXY_PORT ?? '',
    notice: '一經修改即會生效',
  });
};
