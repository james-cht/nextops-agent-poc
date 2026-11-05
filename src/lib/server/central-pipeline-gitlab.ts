import type { CentralPipelineGitLabPort } from './application-online-actions.ts';
import type { MrFile } from '../spec-submit-mr.ts';

/**
 * Deploy-env machine account for opening MRs on the central pipeline repo.
 * Not a Runtime Setting. Real HTTP wiring lands with #33; this slice ships a
 * configurable port boundary for tests and env-backed HTTP when configured.
 */
export function createHttpCentralPipelineGitLabPort(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): CentralPipelineGitLabPort {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');
  return {
    async openMergeRequest(mr) {
      const projectId = encodeURIComponent(mr.projectPath);
      const branchRes = await fetchImpl(`${base}/api/v4/projects/${projectId}/repository/branches`, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': mr.machineToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          branch: mr.sourceBranch,
          ref: mr.targetBranch,
        }),
      });
      if (!branchRes.ok && branchRes.status !== 400) {
        return { ok: false, error: `GitLab branch create failed (HTTP ${branchRes.status})` };
      }
      const commitRes = await fetchImpl(
        `${base}/api/v4/projects/${projectId}/repository/commits`,
        {
          method: 'POST',
          headers: {
            'PRIVATE-TOKEN': mr.machineToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            branch: mr.sourceBranch,
            commit_message: mr.title,
            actions: mr.files.map((f: MrFile) => ({
              action: 'create',
              file_path: f.path,
              content: f.content,
            })),
          }),
        },
      );
      if (!commitRes.ok) {
        return { ok: false, error: `GitLab commit failed (HTTP ${commitRes.status})` };
      }
      const mrRes = await fetchImpl(`${base}/api/v4/projects/${projectId}/merge_requests`, {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': mr.machineToken,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          source_branch: mr.sourceBranch,
          target_branch: mr.targetBranch,
          title: mr.title,
          remove_source_branch: false,
        }),
      });
      if (!mrRes.ok) {
        return { ok: false, error: `GitLab MR open failed (HTTP ${mrRes.status})` };
      }
      const body = (await mrRes.json()) as { web_url?: string; iid?: number };
      if (!body.web_url || typeof body.iid !== 'number') {
        return { ok: false, error: 'GitLab MR response missing web_url/iid' };
      }
      return { ok: true, mrUrl: body.web_url, mrIid: body.iid };
    },
    async getMergeRequestState(opts) {
      const projectId = encodeURIComponent(opts.projectPath);
      const res = await fetchImpl(
        `${base}/api/v4/projects/${projectId}/merge_requests/${opts.mrIid}`,
        {
          headers: { 'PRIVATE-TOKEN': opts.machineToken },
        },
      );
      if (!res.ok) {
        return { ok: false, error: `GitLab MR status failed (HTTP ${res.status})` };
      }
      const body = (await res.json()) as {
        state?: string;
        merge_commit_sha?: string | null;
        sha?: string;
      };
      if (body.state === 'merged') {
        const sha = (body.merge_commit_sha || body.sha || '').trim();
        if (!sha) return { ok: false, error: 'Merged MR missing SHA' };
        return { ok: true, merged: true, sha };
      }
      return { ok: true, merged: false };
    },
  };
}

export function createUnconfiguredCentralPipelineGitLabPort(): CentralPipelineGitLabPort {
  return {
    async openMergeRequest() {
      return {
        ok: false,
        error:
          'IDP machine account not configured (set NEXTOPS_IDP_GITLAB_BASE_URL and token in deploy env)',
      };
    },
    async getMergeRequestState() {
      return {
        ok: false,
        error:
          'IDP machine account not configured (set NEXTOPS_IDP_GITLAB_BASE_URL and token in deploy env)',
      };
    },
  };
}

export function getCentralPipelineGitLabPort(): {
  gitlab: CentralPipelineGitLabPort;
  machineToken: string;
  centralProjectPath: string;
} {
  const baseUrl = process.env.NEXTOPS_IDP_GITLAB_BASE_URL?.trim() ?? '';
  const machineToken = process.env.NEXTOPS_IDP_GITLAB_MACHINE_TOKEN?.trim() ?? '';
  const centralProjectPath =
    process.env.NEXTOPS_IDP_CENTRAL_PIPELINE_PROJECT?.trim() ||
    'dgroup_devops/cicd/jenkins-deployment-pipeline';
  if (!baseUrl || !machineToken) {
    return {
      gitlab: createUnconfiguredCentralPipelineGitLabPort(),
      machineToken: machineToken || 'missing',
      centralProjectPath,
    };
  }
  return {
    gitlab: createHttpCentralPipelineGitLabPort({ baseUrl }),
    machineToken,
    centralProjectPath,
  };
}
