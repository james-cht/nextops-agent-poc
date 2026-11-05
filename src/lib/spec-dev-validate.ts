import type { OperatorRole } from './operator-role.ts';

export function canTriggerDevValidate(opts: {
  role: OperatorRole;
  username: string;
  nameSpace: string;
  memberships: Array<{ nameSpace: string; username: string }>;
}): boolean {
  if (opts.role === 'platform_owner' || opts.role === 'operator') return true;
  if (opts.role !== 'application_developer') return false;
  return opts.memberships.some(
    (m) => m.nameSpace === opts.nameSpace && m.username === opts.username,
  );
}

export type DevValidateEnqueueRequest = {
  jobId: string;
  pinnedSha: string;
  defaultRef: string;
};

export function buildDevValidateEnqueue(opts: {
  jobId: string | null | undefined;
  publishedPinSha: string | null | undefined;
  defaultRef: string;
}):
  | { ok: true; request: DevValidateEnqueueRequest }
  | { ok: false; code: 'BAD_REQUEST'; error: string } {
  const jobId = opts.jobId?.trim() ?? '';
  const pinnedSha = opts.publishedPinSha?.trim() ?? '';
  const defaultRef = opts.defaultRef.trim();
  if (!jobId) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Dev job is required before 在 Dev 驗證' };
  }
  if (!pinnedSha) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      error: 'Trigger requires pinned published SHA, not an unmerged draft',
    };
  }
  if (!defaultRef) {
    return { ok: false, code: 'BAD_REQUEST', error: 'Spec default branch/tag is required' };
  }
  return {
    ok: true,
    request: { jobId, pinnedSha, defaultRef },
  };
}
