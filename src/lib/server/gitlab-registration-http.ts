import type { GitLabRegistrationPort } from './application-registration.ts';
import { recordUpstreamDiagnostic } from './upstream-diagnostic.ts';

function encodeProjectPath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

async function gitlabJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `GitLab HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
    }
    if (res.status === 204) return { ok: true, json: null };
    const json = await res.json().catch(() => null);
    return { ok: true, json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'GitLab request failed' };
  }
}

/** Live GitLab Registration port — Direct Upstream Access via injected fetch. */
export function createHttpGitLabRegistrationPort(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): GitLabRegistrationPort {
  const base = opts.baseUrl.replace(/\/$/, '');
  const fetchImpl = opts.fetchImpl ?? fetch;

  return {
    async proveCanAttach({ accessToken, projectPath }) {
      const url = `${base}/api/v4/projects/${encodeProjectPath(projectPath)}`;
      const result = await gitlabJson(fetchImpl, url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
      });
      if (!result.ok) {
        recordUpstreamDiagnostic({
          service: 'GitLab',
          message: result.error,
          upstreamUrl: url,
          dependency: 'GitLab',
        });
        return result;
      }
      return { ok: true };
    },

    async grantReadAccess({ accessToken, projectPath, readAccessToken }) {
      const userUrl = `${base}/api/v4/user`;
      const userResult = await gitlabJson(fetchImpl, userUrl, {
        method: 'GET',
        headers: { Accept: 'application/json', 'PRIVATE-TOKEN': readAccessToken },
      });
      if (!userResult.ok) {
        recordUpstreamDiagnostic({
          service: 'GitLab',
          message: userResult.error,
          upstreamUrl: userUrl,
          dependency: 'GitLab',
        });
        return userResult;
      }
      const userId = (userResult.json as { id?: unknown } | null)?.id;
      if (typeof userId !== 'number') {
        return { ok: false, error: 'GitLab Read Access identity missing user id' };
      }

      const membersUrl = `${base}/api/v4/projects/${encodeProjectPath(projectPath)}/members`;
      const add = await gitlabJson(fetchImpl, membersUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: userId, access_level: 20 }),
      });
      if (add.ok) return { ok: true };
      // 409 already a member is success for our purposes
      if (add.error.includes('HTTP 409')) return { ok: true };
      recordUpstreamDiagnostic({
        service: 'GitLab',
        message: add.error,
        upstreamUrl: membersUrl,
        dependency: 'GitLab',
      });
      return add;
    },

    async createProject({ accessToken, projectPath, visibility, defaultBranch, description }) {
      const slash = projectPath.lastIndexOf('/');
      const path = slash >= 0 ? projectPath.slice(slash + 1) : projectPath;
      const namespacePath = slash >= 0 ? projectPath.slice(0, slash) : undefined;
      const body: Record<string, unknown> = {
        name: path,
        path,
        visibility: visibility ?? 'private',
        initialize_with_readme: false,
      };
      if (defaultBranch) body.default_branch = defaultBranch;
      if (description) body.description = description;
      if (namespacePath) {
        const nsUrl = `${base}/api/v4/namespaces?search=${encodeURIComponent(namespacePath)}`;
        const ns = await gitlabJson(fetchImpl, nsUrl, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        });
        if (!ns.ok) return ns;
        const list = Array.isArray(ns.json) ? ns.json : [];
        const match = list.find(
          (row) =>
            typeof row === 'object' &&
            row &&
            'full_path' in row &&
            String((row as { full_path: unknown }).full_path).toLowerCase() ===
              namespacePath.toLowerCase(),
        ) as { id?: number } | undefined;
        if (!match?.id) {
          return { ok: false, error: `GitLab namespace not found: ${namespacePath}` };
        }
        body.namespace_id = match.id;
      }
      const url = `${base}/api/v4/projects`;
      const created = await gitlabJson(fetchImpl, url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!created.ok) {
        recordUpstreamDiagnostic({
          service: 'GitLab',
          message: created.error,
          upstreamUrl: url,
          dependency: 'GitLab',
        });
        return created;
      }
      return { ok: true };
    },

    async writeFirstCommit({
      accessToken,
      projectPath,
      defaultBranch,
      commitMessage,
      files,
    }) {
      const url = `${base}/api/v4/projects/${encodeProjectPath(projectPath)}/repository/commits`;
      const actions = files.map((f) => ({
        action: 'create',
        file_path: f.path,
        content: f.content,
      }));
      const committed = await gitlabJson(fetchImpl, url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          branch: defaultBranch,
          commit_message: commitMessage,
          actions,
        }),
      });
      if (!committed.ok) {
        recordUpstreamDiagnostic({
          service: 'GitLab',
          message: committed.error,
          upstreamUrl: url,
          dependency: 'GitLab',
        });
        return committed;
      }
      return { ok: true };
    },
  };
}
