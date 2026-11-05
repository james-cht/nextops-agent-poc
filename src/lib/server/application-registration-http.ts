import type { RegisterApplicationInput } from './application-registration.ts';
import { unpackRegistrationZip } from './application-registration-zip.ts';

export type ParseRegisterBodyResult =
  | { ok: true; input: RegisterApplicationInput }
  | { ok: false; error: string };

function filesFromBody(b: Record<string, unknown>): Array<{ path: string; content: string }> | undefined {
  if (!Array.isArray(b.files)) return undefined;
  const files: Array<{ path: string; content: string }> = [];
  for (const row of b.files) {
    if (!row || typeof row !== 'object') continue;
    const f = row as Record<string, unknown>;
    if (typeof f.path === 'string' && typeof f.content === 'string') {
      files.push({ path: f.path.replace(/^\/+/, ''), content: f.content });
    }
  }
  return files;
}

function filesFromZipBase64(raw: unknown): Array<{ path: string; content: string }> | { error: string } | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const bytes = Uint8Array.from(Buffer.from(raw, 'base64'));
    return unpackRegistrationZip(bytes);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invalid zip' };
  }
}

/** HTTP body → Registration input (folder files and/or zipBase64). */
export function parseRegisterApplicationBody(body: unknown): ParseRegisterBodyResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON body' };
  }
  const b = body as Record<string, unknown>;
  const mode = b.mode === 'create' || b.mode === 'attach' ? b.mode : null;
  if (!mode) return { ok: false, error: 'mode must be attach or create' };
  const name = typeof b.name === 'string' ? b.name : '';
  const gitlabProjectPath =
    typeof b.gitlabProjectPath === 'string' ? b.gitlabProjectPath : '';
  if (!name.trim() || !gitlabProjectPath.trim()) {
    return { ok: false, error: 'Application name and GitLab Project path are required' };
  }

  let files = filesFromBody(b);
  const fromZip = filesFromZipBase64(b.zipBase64);
  if (fromZip && 'error' in fromZip) {
    return { ok: false, error: fromZip.error };
  }
  if (fromZip && Array.isArray(fromZip)) {
    files = [...(files ?? []), ...fromZip];
  }

  let advanced: RegisterApplicationInput['advanced'];
  if (b.advanced && typeof b.advanced === 'object') {
    const a = b.advanced as Record<string, unknown>;
    const visibility =
      a.visibility === 'private' || a.visibility === 'internal' || a.visibility === 'public'
        ? a.visibility
        : undefined;
    advanced = {
      visibility,
      defaultBranch: typeof a.defaultBranch === 'string' ? a.defaultBranch : undefined,
      description: typeof a.description === 'string' ? a.description : undefined,
      gitignoreTemplate: typeof a.gitignoreTemplate === 'string' ? a.gitignoreTemplate : undefined,
      commitMessage: typeof a.commitMessage === 'string' ? a.commitMessage : undefined,
    };
  }

  return {
    ok: true,
    input: {
      mode,
      name,
      gitlabProjectPath,
      files,
      advanced,
    },
  };
}

export function registerFailStatus(
  code:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'BAD_REQUEST'
    | 'CONFLICT'
    | 'GITLAB_REAUTH'
    | 'GITLAB_ERROR',
): number {
  if (code === 'UNAUTHORIZED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'CONFLICT') return 409;
  if (code === 'GITLAB_REAUTH') return 401;
  if (code === 'GITLAB_ERROR') return 502;
  return 400;
}
