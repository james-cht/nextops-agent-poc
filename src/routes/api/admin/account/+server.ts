import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import {
  ensureAppLocalSettings,
  verifyStepUpPassword,
} from '$lib/server/app-local-settings';
import { appendConfigAuditEntry } from '$lib/server/config-audit-log';

export const GET: RequestHandler = async () => {
  const store = await ensureAppLocalSettings();
  return json({ username: store.getAdminUsername() ?? '' });
};

export const PUT: RequestHandler = async ({ request }) => {
  let body: {
    currentPassword?: unknown;
    newUsername?: unknown;
    newPassword?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newUsername = typeof body.newUsername === 'string' ? body.newUsername : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

  const store = await ensureAppLocalSettings();
  const actor = store.getAdminUsername() ?? 'admin';
  const result = await store.changeAdmin({
    currentPassword,
    newUsername,
    newPassword,
  });

  if (!result.ok) {
    appendConfigAuditEntry(
      {
        action: 'save',
        setting: 'admin_credential',
        outcome: 'rejected',
        actor,
        detail: { reason: result.code },
      },
      { store },
    );
    const status = result.code === 'UNAUTHORIZED' ? 401 : 400;
    return json(
      createErrorResponse(
        result.code === 'UNAUTHORIZED' ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST,
        result.error,
      ),
      { status },
    );
  }

  appendConfigAuditEntry(
    {
      action: 'save',
      setting: 'admin_credential',
      outcome: 'saved',
      actor: newUsername.trim() || actor,
      detail: { fieldsChanged: ['username', 'password'] },
    },
    { store },
  );

  return json({
    username: store.getAdminUsername(),
    notice: '一經修改即會生效',
  });
};

/** Optional: verify step-up password only (for shared modal). */
export const POST: RequestHandler = async ({ request }) => {
  let body: { adminPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const adminPassword = typeof body.adminPassword === 'string' ? body.adminPassword : '';
  const ok = await verifyStepUpPassword(adminPassword);
  if (!ok) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, 'Admin password required'), {
      status: 401,
    });
  }
  return json({ ok: true });
};
