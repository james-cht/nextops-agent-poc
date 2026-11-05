import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ErrorCode, createErrorResponse } from '$lib/errors';
import {
  parseRegisterApplicationBody,
  registerFailStatus,
} from '$lib/server/application-registration-http';
import { registerApplication } from '$lib/server/application-registration';
import { listApplicationCatalog } from '$lib/server/application-catalog-list';
import { getApplicationStore } from '$lib/server/application-store';
import { ensureAppLocalSettings } from '$lib/server/app-local-settings';
import { createHttpGitLabRegistrationPort } from '$lib/server/gitlab-registration-http';

export const GET: RequestHandler = async ({ locals }) => {
  const settings = await ensureAppLocalSettings();
  const result = listApplicationCatalog({
    operatorKey: locals.operatorKey,
    settings,
    apps: getApplicationStore(),
  });
  if (!result.ok) {
    return json(createErrorResponse(ErrorCode.UNAUTHORIZED, result.error), { status: 401 });
  }
  return json({ applications: result.applications });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const settings = await ensureAppLocalSettings();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid JSON body'), { status: 400 });
  }
  const parsed = parseRegisterApplicationBody(body);
  if (!parsed.ok) {
    return json(createErrorResponse(ErrorCode.BAD_REQUEST, parsed.error), { status: 400 });
  }
  const oauth = settings.getGitLabOAuthClient();
  if (!oauth?.baseUrl) {
    return json(
      createErrorResponse(ErrorCode.BAD_REQUEST, 'GitLab OAuth Client is not configured'),
      { status: 400 },
    );
  }
  const result = await registerApplication({
    operatorKey: locals.operatorKey,
    settings,
    apps: getApplicationStore(),
    gitlab: createHttpGitLabRegistrationPort({ baseUrl: oauth.baseUrl }),
    input: parsed.input,
  });
  if (!result.ok) {
    const status = registerFailStatus(result.code);
    const code =
      result.code === 'UNAUTHORIZED' || result.code === 'GITLAB_REAUTH' || result.code === 'FORBIDDEN'
        ? ErrorCode.UNAUTHORIZED
        : result.code === 'GITLAB_ERROR'
          ? ErrorCode.UPSTREAM_ERROR
          : ErrorCode.BAD_REQUEST;
    return json(
      {
        ...createErrorResponse(code, result.error),
        gitlabReauth: result.code === 'GITLAB_REAUTH',
      },
      { status },
    );
  }
  return json({ ok: true, application: result.application }, { status: 201 });
};
