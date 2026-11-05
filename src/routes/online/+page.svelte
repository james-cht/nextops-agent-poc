<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { PROMOTION_PATHS, TEMPLATE_FAMILIES } from '$lib/service-deploy-spec';
  import { RESOURCE_REQUEST_KINDS, type ResourceRequestKind } from '$lib/resource-request';

  let { data } = $props();

  let newNameSpace = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  let memberPick = $state<Record<string, string>>({});
  let draftForms = $state<
    Record<
      string,
      {
        appName: string;
        gitlabUrl: string;
        promotionPath: string;
        templateFamily: string;
        packagingCommand: string;
        defaultRef: string;
        k8sNamespace: string;
      }
    >
  >({});

  function draftForm(nameSpace: string) {
    if (!draftForms[nameSpace]) {
      draftForms[nameSpace] = {
        appName: '',
        gitlabUrl: '',
        promotionPath: PROMOTION_PATHS[0],
        templateFamily: TEMPLATE_FAMILIES[0],
        packagingCommand: '',
        defaultRef: 'main',
        k8sNamespace: '',
      };
    }
    return draftForms[nameSpace];
  }

  function loadDraftIntoForm(
    nameSpace: string,
    draft: {
      appName: string;
      gitlabUrl: string;
      promotionPath: string;
      templateFamily: string;
      packagingCommand: string;
      defaultRef: string;
      k8sNamespace: string;
    },
  ) {
    draftForms[nameSpace] = {
      appName: draft.appName,
      gitlabUrl: draft.gitlabUrl,
      promotionPath: draft.promotionPath,
      templateFamily: draft.templateFamily,
      packagingCommand: draft.packagingCommand,
      defaultRef: draft.defaultRef,
      k8sNamespace: draft.k8sNamespace,
    };
  }

  async function createProject() {
    busy = true;
    error = null;
    try {
      const res = await fetch('/api/online/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nameSpace: newNameSpace }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `建立失敗 (HTTP ${res.status})`;
        return;
      }
      newNameSpace = '';
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function addMember(nameSpace: string) {
    const username = (memberPick[nameSpace] ?? '').trim();
    if (!username) return;
    busy = true;
    error = null;
    try {
      const res = await fetch(`/api/online/projects/${encodeURIComponent(nameSpace)}/members`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `加入失敗 (HTTP ${res.status})`;
        return;
      }
      memberPick = { ...memberPick, [nameSpace]: '' };
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function removeMember(nameSpace: string, username: string) {
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/members/${encodeURIComponent(username)}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `移除失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function saveDraft(nameSpace: string) {
    const form = draftForm(nameSpace);
    busy = true;
    error = null;
    try {
      const res = await fetch(`/api/online/projects/${encodeURIComponent(nameSpace)}/drafts`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `存草稿失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  type ArtifactForm = {
    baseImage: string;
    artifactPath: string;
    workdir: string;
    entrypoint: string;
    port: number;
    replicas: number;
    cpu: string;
    memory: string;
    runtimeEnvText: string;
    handEditedDockerfile: string;
    dockerfileChoice: '' | 'regenerate' | 'keep-manual';
  };

  let artifactForms = $state<Record<string, ArtifactForm>>({});

  function artifactKey(nameSpace: string, appName: string) {
    return `${nameSpace}/${appName}`;
  }

  function artifactForm(nameSpace: string, appName: string, seed?: ArtifactForm): ArtifactForm {
    const key = artifactKey(nameSpace, appName);
    if (!artifactForms[key]) {
      artifactForms[key] = seed ?? {
        baseImage: data.baseImages[0] ?? '',
        artifactPath: 'target/*.jar',
        workdir: '/app',
        entrypoint: '["java","-jar","/app/app.jar"]',
        port: 8080,
        replicas: 1,
        cpu: '500m',
        memory: '1Gi',
        runtimeEnvText: 'SPRING_PROFILES_ACTIVE=dev',
        handEditedDockerfile: '',
        dockerfileChoice: '',
      };
    }
    return artifactForms[key];
  }

  function parseRuntimeEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const line of text.split(/\n|,/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return out;
  }

  function runtimeEnvToText(json: string): string {
    try {
      const obj = JSON.parse(json || '{}') as Record<string, string>;
      return Object.entries(obj)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  async function saveArtifacts(nameSpace: string, appName: string) {
    const form = artifactForm(nameSpace, appName);
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/artifacts`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseImage: form.baseImage,
            artifactPath: form.artifactPath,
            workdir: form.workdir,
            entrypoint: form.entrypoint,
            port: form.port,
            replicas: form.replicas,
            cpu: form.cpu,
            memory: form.memory,
            runtimeEnv: parseRuntimeEnv(form.runtimeEnvText),
            dockerfileChoice: form.dockerfileChoice || undefined,
            handEditedDockerfile: form.handEditedDockerfile.trim() || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `生成失敗 (HTTP ${res.status})`;
        return;
      }
      form.dockerfileChoice = '';
      form.handEditedDockerfile = '';
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  let rrForms = $state<Record<string, Record<ResourceRequestKind, string>>>({});

  function rrForm(
    nameSpace: string,
    appName: string,
    sheets?: Array<{ kind: string; fields: Record<string, string>; status: string }>,
  ): Record<ResourceRequestKind, string> {
    const key = artifactKey(nameSpace, appName);
    if (!rrForms[key]) {
      const init = Object.fromEntries(RESOURCE_REQUEST_KINDS.map((k) => [k, ''])) as Record<
        ResourceRequestKind,
        string
      >;
      if (sheets) {
        for (const sheet of sheets) {
          if ((RESOURCE_REQUEST_KINDS as readonly string[]).includes(sheet.kind)) {
            const kind = sheet.kind as ResourceRequestKind;
            init[kind] = Object.entries(sheet.fields)
              .map(([k, v]) => `${k}=${v}`)
              .join('\n');
          }
        }
      }
      rrForms[key] = init;
    }
    return rrForms[key];
  }

  async function saveResourceRequests(nameSpace: string, appName: string) {
    const form = rrForm(nameSpace, appName);
    busy = true;
    error = null;
    try {
      const sheets = RESOURCE_REQUEST_KINDS.map((kind) => {
        const fields: Record<string, string> = {};
        for (const line of (form[kind] ?? '').split(/\n/)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            fields[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
          } else {
            fields.summary = trimmed;
          }
        }
        return { kind, fields };
      });
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/resource-requests`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sheets }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `Resource Request 儲存失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  let bindingForms = $state<
    Record<string, { environment: string; kind: ResourceRequestKind; fieldsText: string }>
  >({});

  function bindingForm(nameSpace: string, appName: string) {
    const key = artifactKey(nameSpace, appName);
    if (!bindingForms[key]) {
      bindingForms[key] = { environment: 'qa', kind: 'db', fieldsText: '' };
    }
    return bindingForms[key];
  }

  async function saveBindings(nameSpace: string, appName: string, existing: Array<{
    environment: string;
    kind: ResourceRequestKind;
    fields: Record<string, string>;
  }>) {
    const form = bindingForm(nameSpace, appName);
    busy = true;
    error = null;
    try {
      const fields: Record<string, string> = {};
      for (const line of form.fieldsText.split(/\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          fields[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
        }
      }
      const bindings = [
        ...existing.filter(
          (b) => !(b.environment === form.environment && b.kind === form.kind),
        ),
        { environment: form.environment, kind: form.kind, fields },
      ];
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/bindings`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bindings }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `Environment Binding 儲存失敗 (HTTP ${res.status})`;
        return;
      }
      form.fieldsText = '';
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function submitSpec(nameSpace: string, appName: string, dockerfileChoice?: string) {
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/submit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            dockerfileChoice: dockerfileChoice || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `送出失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function publishDev(nameSpace: string, appName: string) {
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/publish-dev`,
        { method: 'POST' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `建立 Dev job 失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function runDevValidate(nameSpace: string, appName: string) {
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/dev-validate`,
        { method: 'POST' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `在 Dev 驗證失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }

  async function releaseHop(
    nameSpace: string,
    appName: string,
    targetEnvironment: string,
    imageTag: string,
  ) {
    busy = true;
    error = null;
    try {
      const res = await fetch(
        `/api/online/projects/${encodeURIComponent(nameSpace)}/drafts/${encodeURIComponent(appName)}/release`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetEnvironment, imageTag }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        error =
          typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : `放行 ${targetEnvironment} 失敗 (HTTP ${res.status})`;
        return;
      }
      await invalidateAll();
    } catch {
      error = '無法連線伺服器';
    } finally {
      busy = false;
    }
  }
</script>

<div class="mx-auto max-w-3xl px-4 py-8 lg:px-6">
  <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">應用上線</h2>

  {#if error}
    <p class="mt-3 text-[12px] text-danger">{error}</p>
  {/if}

  {#if data.projects.length === 0}
    <p class="mt-2 text-[13px] leading-relaxed text-fg/55">{data.empty.body}</p>
    {#if data.empty.readOnly}
      <p class="mt-4 text-[12px] text-fg/35">此角色沒有寫入控制項。</p>
    {/if}
  {:else}
    <p class="mt-2 text-[13px] leading-relaxed text-fg/55">
      {#if data.canManageMembership}
        管理 Project、Membership，並可檢視／編輯 Pipeline-block Spec 草稿。
      {:else if data.canWrite}
        你的 Project Membership 與 Service Deploy Spec 草稿（不開 GitLab）。
      {:else}
        只讀瀏覽 Project 與 Spec 草稿。
      {/if}
    </p>

    <ul class="mt-6 space-y-6">
      {#each data.projects as project}
        <li class="rounded-xl border border-fg/[0.06] bg-card px-4 py-3">
          <div class="flex items-baseline justify-between gap-3">
            <h3 class="font-mono text-[13px] font-medium text-fg/90">{project.nameSpace}</h3>
            <span class="text-[11px] text-fg/30">NAME_SPACE</span>
          </div>

          {#if data.canManageMembership}
            <ul class="mt-3 space-y-1">
              {#each project.members as member}
                <li class="flex items-center justify-between gap-2 text-[12px] text-fg/70">
                  <span class="font-mono">{member.username}</span>
                  <button
                    type="button"
                    class="text-[11px] text-fg/40 hover:text-danger disabled:opacity-50"
                    disabled={busy}
                    onclick={() => void removeMember(project.nameSpace, member.username)}
                  >
                    移除
                  </button>
                </li>
              {:else}
                <li class="text-[12px] text-fg/35">尚無 Project Membership</li>
              {/each}
            </ul>
            <form
              class="mt-3 flex flex-wrap items-center gap-2"
              onsubmit={(e) => {
                e.preventDefault();
                void addMember(project.nameSpace);
              }}
            >
              <select
                class="min-w-[10rem] rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                bind:value={memberPick[project.nameSpace]}
              >
                <option value="">選擇 Application Developer…</option>
                {#each data.developerCandidates as cand}
                  <option value={cand.username}>{cand.username}</option>
                {/each}
              </select>
              <button
                type="submit"
                class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50"
                disabled={busy}
              >
                加入
              </button>
            </form>
          {:else}
            <p class="mt-2 text-[12px] text-fg/45">
              Membership：{project.members.map((m) => m.username).join(', ') || '—'}
            </p>
          {/if}

          <div class="mt-4 border-t border-fg/[0.06] pt-3">
            <h4 class="text-[12px] font-medium text-fg/70">Service Deploy Spec（Pipeline 區塊）</h4>
            {#if project.drafts.length > 0}
              <ul class="mt-2 space-y-3">
                {#each project.drafts as draft}
                  <li class="rounded-lg border border-fg/[0.04] px-3 py-2">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-[12px] text-fg/65">
                      <span>
                        <span class="font-mono text-fg/85">{draft.appName}</span>
                        · {draft.templateFamily} · {draft.promotionPath}
                        <span class="text-fg/35"> · 草稿（無 published pin）</span>
                      </span>
                      {#if project.canEditSpec}
                        <button
                          type="button"
                          class="text-[11px] text-fg/40 hover:text-fg/70"
                          onclick={() => loadDraftIntoForm(project.nameSpace, draft)}
                        >
                          載入 Pipeline
                        </button>
                      {/if}
                    </div>

                    {#if draft.artifacts}
                      <p class="mt-2 text-[11px] text-fg/45">
                        Dockerfile {draft.artifacts.dockerfile.dirty ? '· 已手工調整' : '· 由欄位生成'}
                        {#if draft.artifacts.dockerfile.offCatalogFromWarning}
                          · <span class="text-fg/50">FROM 不在 catalog（Config Check 警告）</span>
                        {/if}
                      </p>
                      <pre
                        class="mt-1 max-h-40 overflow-auto rounded-md bg-bg/60 p-2 font-mono text-[10px] leading-relaxed text-fg/70"
                      >{draft.artifacts.dockerfile.content}</pre>
                      <pre
                        class="mt-2 max-h-28 overflow-auto rounded-md bg-bg/60 p-2 font-mono text-[10px] leading-relaxed text-fg/55"
                      >{draft.artifacts.kustomize.base}</pre>
                    {/if}

                    {#if project.canEditSpec}
                      {@const aform = artifactForm(
                        project.nameSpace,
                        draft.appName,
                        draft.artifacts
                          ? {
                              baseImage: draft.artifacts.generateFields.baseImage,
                              artifactPath: draft.artifacts.generateFields.artifactPath,
                              workdir: draft.artifacts.generateFields.workdir,
                              entrypoint: draft.artifacts.generateFields.entrypoint,
                              port: draft.artifacts.generateFields.port,
                              replicas: draft.artifacts.generateFields.replicas,
                              cpu: draft.artifacts.generateFields.cpu,
                              memory: draft.artifacts.generateFields.memory,
                              runtimeEnvText: runtimeEnvToText(
                                draft.artifacts.generateFields.runtimeEnvJson,
                              ),
                              handEditedDockerfile: '',
                              dockerfileChoice: '',
                            }
                          : undefined,
                      )}
                      <form
                        class="mt-3 grid gap-2 sm:grid-cols-2"
                        onsubmit={(e) => {
                          e.preventDefault();
                          void saveArtifacts(project.nameSpace, draft.appName);
                        }}
                      >
                        <label class="block text-[11px] text-fg/40 sm:col-span-2">
                          base image（catalog）
                          <select
                            class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                            bind:value={aform.baseImage}
                          >
                            {#each data.baseImages as img}
                              <option value={img}>{img}</option>
                            {/each}
                          </select>
                        </label>
                        <label class="block text-[11px] text-fg/40">
                          artifact path
                          <input
                            class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                            bind:value={aform.artifactPath}
                          />
                        </label>
                        <label class="block text-[11px] text-fg/40">
                          port
                          <input
                            type="number"
                            class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                            bind:value={aform.port}
                          />
                        </label>
                        <label class="block text-[11px] text-fg/40">
                          replicas / CPU / Memory
                          <div class="mt-1 flex gap-1">
                            <input
                              type="number"
                              class="w-16 rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                              bind:value={aform.replicas}
                            />
                            <input
                              class="flex-1 rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                              bind:value={aform.cpu}
                            />
                            <input
                              class="flex-1 rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                              bind:value={aform.memory}
                            />
                          </div>
                        </label>
                        <label class="block text-[11px] text-fg/40">
                          runtime env（overlay ConfigMap，KEY=VAL）
                          <textarea
                            class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[11px] text-fg/90"
                            rows="2"
                            bind:value={aform.runtimeEnvText}
                          ></textarea>
                        </label>
                        <label class="block text-[11px] text-fg/40 sm:col-span-2">
                          手工 Dockerfile（選填 → 標記 已手工調整）
                          <textarea
                            class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[10px] text-fg/90"
                            rows="3"
                            bind:value={aform.handEditedDockerfile}
                            placeholder="貼上手工 Dockerfile 以設 dirty"
                          ></textarea>
                        </label>
                        {#if draft.artifacts?.dockerfile.dirty}
                          <label class="block text-[11px] text-fg/40 sm:col-span-2">
                            Dockerfile 已手工調整 — 欄位變更時必須選擇
                            <select
                              class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                              bind:value={aform.dockerfileChoice}
                            >
                              <option value="">— 選擇 —</option>
                              <option value="regenerate">依欄位重新生成</option>
                              <option value="keep-manual">保留手工</option>
                            </select>
                          </label>
                        {/if}
                        <p class="sm:col-span-2 text-[11px] text-fg/35">
                          PACKAGING_COMMAND 不會寫進 Dockerfile。promote 的 runtime env 在 overlay。
                        </p>
                        <button
                          type="submit"
                          class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
                          disabled={busy}
                        >
                          生成／更新預覽
                        </button>
                      </form>
                    {/if}

                    <div class="mt-3 border-t border-fg/[0.04] pt-3">
                      <h5 class="text-[11px] font-medium text-fg/60">Resource Request（可空）</h5>
                      <p class="mt-1 text-[11px] text-fg/35">
                        空 sheet = 不需要。不擋 Pipeline 草稿。密碼／kubeconfig 不會被儲存。
                      </p>
                      {#if draft.resourceRequests?.length}
                        <ul class="mt-2 space-y-0.5 text-[11px] text-fg/50">
                          {#each draft.resourceRequests as sheet}
                            <li>
                              <span class="font-mono text-fg/70">{sheet.kind}</span>
                              · {sheet.status === 'needed' ? '需要' : '不需要'}
                              {#if sheet.status === 'needed'}
                                · {Object.entries(sheet.fields)
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(', ')}
                              {/if}
                            </li>
                          {/each}
                        </ul>
                      {/if}
                      {#if project.canEditSpec}
                        {@const rform = rrForm(
                          project.nameSpace,
                          draft.appName,
                          draft.resourceRequests,
                        )}
                        <form
                          class="mt-2 grid gap-2 sm:grid-cols-2"
                          onsubmit={(e) => {
                            e.preventDefault();
                            void saveResourceRequests(project.nameSpace, draft.appName);
                          }}
                        >
                          {#each RESOURCE_REQUEST_KINDS as kind}
                            <label class="block text-[11px] text-fg/40">
                              {kind}
                              <textarea
                                class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[10px] text-fg/90"
                                rows="2"
                                placeholder="空=不需要；或 type=SQLServer"
                                bind:value={rform[kind]}
                              ></textarea>
                            </label>
                          {/each}
                          <button
                            type="submit"
                            class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
                            disabled={busy}
                          >
                            存 Resource Request
                          </button>
                        </form>
                      {/if}

                      <div class="mt-3 border-t border-fg/[0.04] pt-3">
                        <h5 class="text-[11px] font-medium text-fg/60">Config Check</h5>
                        {#if draft.configCheck?.items?.length}
                          <ul class="mt-2 space-y-0.5 text-[11px]">
                            {#each draft.configCheck.items as item}
                              <li
                                class={item.level === 'error'
                                  ? 'text-rose-400/90'
                                  : item.level === 'warn'
                                    ? 'text-amber-400/90'
                                    : 'text-fg/45'}
                              >
                                {item.message}
                              </li>
                            {/each}
                          </ul>
                          <p class="mt-1 text-[11px] text-fg/35">
                            {draft.configCheck.blocksQaRelease
                              ? 'QA 放行會被 Binding 閘擋住。'
                              : 'QA Binding 閘通過（或路徑無 QA）。'}
                            Dev 驗證不需 Binding。
                          </p>
                        {/if}
                      </div>

                      <div class="mt-3 border-t border-fg/[0.04] pt-3">
                        <h5 class="text-[11px] font-medium text-fg/60">Environment Binding</h5>
                        <p class="mt-1 text-[11px] text-fg/35">
                          平台核發事實（host／namespace）。密碼不進 Git／Store 可發布欄位。僅
                          Operator／Owner 可存。
                        </p>
                        {#if draft.environmentBindings?.length}
                          <ul class="mt-2 space-y-0.5 text-[11px] text-fg/50">
                            {#each draft.environmentBindings as b}
                              <li>
                                <span class="font-mono text-fg/70">{b.environment}/{b.kind}</span>
                                · {Object.entries(b.fields)
                                  .map(([k, v]) => `${k}=${v}`)
                                  .join(', ')}
                              </li>
                            {/each}
                          </ul>
                        {/if}
                        {#if project.canRecordBinding}
                          {@const bform = bindingForm(project.nameSpace, draft.appName)}
                          <form
                            class="mt-2 grid gap-2 sm:grid-cols-3"
                            onsubmit={(e) => {
                              e.preventDefault();
                              void saveBindings(
                                project.nameSpace,
                                draft.appName,
                                draft.environmentBindings ?? [],
                              );
                            }}
                          >
                            <label class="block text-[11px] text-fg/40">
                              Environment
                              <select
                                class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                                bind:value={bform.environment}
                              >
                                <option value="qa">qa</option>
                                <option value="uat">uat</option>
                                <option value="prod">prod</option>
                                <option value="dev">dev</option>
                              </select>
                            </label>
                            <label class="block text-[11px] text-fg/40">
                              Resource kind
                              <select
                                class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                                bind:value={bform.kind}
                              >
                                {#each RESOURCE_REQUEST_KINDS as kind}
                                  <option value={kind}>{kind}</option>
                                {/each}
                              </select>
                            </label>
                            <label class="block text-[11px] text-fg/40 sm:col-span-3">
                              核發欄位（host=…）
                              <textarea
                                class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[10px] text-fg/90"
                                rows="2"
                                placeholder="host=192.0.2.9"
                                bind:value={bform.fieldsText}
                              ></textarea>
                            </label>
                            <button
                              type="submit"
                              class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50 sm:col-span-3 sm:justify-self-start"
                              disabled={busy}
                            >
                              存 Environment Binding
                            </button>
                          </form>
                        {:else}
                          <p class="mt-1 text-[11px] text-fg/35">此角色不能寫入 Binding。</p>
                        {/if}
                      </div>

                      <div class="mt-3 border-t border-fg/[0.04] pt-3">
                        <h5 class="text-[11px] font-medium text-fg/60">送出 Spec → 中央 GitLab MR</h5>
                        {#if draft.mrUrl}
                          <p class="mt-1 text-[12px] text-fg/70">
                            MR：
                            <a class="underline" href={draft.mrUrl} target="_blank" rel="noreferrer"
                              >{draft.mrUrl}</a
                            >
                          </p>
                          <p class="mt-1 text-[11px] text-fg/35">
                            Merge 請用 Operator 自己的 GitLab 身分；NextOps／機器帳號不能 merge main。
                          </p>
                        {:else if project.canEditSpec}
                          <p class="mt-1 text-[11px] text-fg/35">
                            Pipeline 完整且已有 Dockerfile／Kustomize 預覽後可送出。Resource Request 可空。
                          </p>
                          <button
                            type="button"
                            class="mt-2 rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50"
                            disabled={busy || !draft.artifacts}
                            onclick={() => void submitSpec(project.nameSpace, draft.appName)}
                          >
                            送出並開 MR
                          </button>
                        {:else}
                          <p class="mt-1 text-[11px] text-fg/35">此角色不能送出 Spec。</p>
                        {/if}

                        {#if draft.publishedPinSha}
                          <p class="mt-3 font-mono text-[12px] text-fg/75">
                            published SHA <span class="text-fg/90">{draft.publishedPinSha}</span>
                          </p>
                          {#if draft.devJobId}
                            <p class="mt-1 text-[11px] text-fg/45">
                              Dev job：<span class="font-mono">{draft.devJobId}</span>（僅 Dev；無
                              QA/UAT/Prod）
                            </p>
                          {/if}
                          {#if draft.lastDevRunStatus}
                            <p class="mt-1 text-[11px] text-fg/50">
                              上次 Dev 驗證：<span class="font-mono">{draft.lastDevRunStatus}</span>
                              {#if draft.lastDevRunId}
                                · <span class="font-mono">{draft.lastDevRunId}</span>
                              {/if}
                            </p>
                          {/if}
                          {#if draft.runtimeCheckAt}
                            <p class="mt-1 text-[11px] text-fg/50">
                              Runtime Check：{draft.runtimeCheckReady ? 'ready' : 'not ready'}
                              {#if draft.runtimeCheckProbe}
                                · {draft.runtimeCheckProbe}
                              {/if}
                              <span class="text-fg/35">（失敗不改寫 Dev apply 成功）</span>
                            </p>
                          {/if}
                          {#if draft.environmentPins?.length}
                            <ul class="mt-2 space-y-0.5 text-[11px] text-fg/50">
                              {#each draft.environmentPins as pin}
                                <li>
                                  <span class="font-mono text-fg/70">{pin.environment}</span>
                                  · SHA <span class="font-mono">{pin.publishedPinSha}</span>
                                  {#if pin.sourceImage}
                                    · SOURCE_IMAGE <span class="font-mono">{pin.sourceImage}</span>
                                  {/if}
                                </li>
                              {/each}
                            </ul>
                          {/if}
                          {#if project.canRecordBinding}
                            <div class="mt-3 border-t border-fg/[0.04] pt-3">
                              <h5 class="text-[11px] font-medium text-fg/60">放行下一跳</h5>
                              <p class="mt-1 text-[11px] text-fg/35">
                                上一跳須 apply 綠。promote 的 SOURCE_IMAGE 來自上一跳；SHA pin 不隨
                                main HEAD 漂移。
                              </p>
                              <div class="mt-2 flex flex-wrap gap-2">
                                {#each ['qa', 'uat', 'prod'] as hop}
                                  <button
                                    type="button"
                                    class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50"
                                    disabled={busy || !draft.publishedPinSha}
                                    onclick={() =>
                                      void releaseHop(
                                        project.nameSpace,
                                        draft.appName,
                                        hop,
                                        draft.publishedPinSha ?? '',
                                      )}
                                  >
                                    開 {hop}
                                  </button>
                                {/each}
                              </div>
                            </div>
                          {/if}
                          {#if project.canTriggerDevValidate}
                            <button
                              type="button"
                              class="mt-2 rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50"
                              disabled={busy || !draft.devJobId}
                              onclick={() => void runDevValidate(project.nameSpace, draft.appName)}
                            >
                              在 Dev 驗證
                            </button>
                            <p class="mt-1 text-[11px] text-fg/35">
                              使用 pinned SHA（非草稿）。Merge 不會自動跑；成功定義到 kubectl apply。
                            </p>
                          {/if}
                        {:else if draft.mrUrl && data.canManageMembership}
                          <button
                            type="button"
                            class="mt-3 rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50"
                            disabled={busy}
                            onclick={() => void publishDev(project.nameSpace, draft.appName)}
                          >
                            偵測 merge 並建立 Dev job
                          </button>
                          <p class="mt-1 text-[11px] text-fg/35">
                            未 merge 的草稿不能成為 job pin。Dockerfile／PACKAGING_COMMAND 不寫進 job。
                          </p>
                        {/if}
                      </div>
                    </div>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="mt-2 text-[12px] text-fg/35">尚無 Spec 草稿</p>
            {/if}

            {#if project.breakGlassHistory?.length}
              <div class="mt-3 border-t border-fg/[0.04] pt-3">
                <h5 class="text-[11px] font-medium text-fg/60">Break-glass 紀錄</h5>
                <ul class="mt-2 space-y-0.5 text-[11px] text-fg/50">
                  {#each project.breakGlassHistory as g}
                    <li>
                      <span class="font-mono text-fg/70">{g.appName}/{g.hop}/{g.rule}</span>
                      · {g.actor} · {g.reason}
                      <span class="text-fg/35">（非預設路徑）</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if project.canEditSpec}
              {@const form = draftForm(project.nameSpace)}
              <form
                class="mt-3 grid gap-2 sm:grid-cols-2"
                onsubmit={(e) => {
                  e.preventDefault();
                  void saveDraft(project.nameSpace);
                }}
              >
                <label class="block text-[11px] text-fg/40">
                  APP_NAME
                  <input
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[12px] text-fg/90"
                    bind:value={form.appName}
                    placeholder="efactory-ap"
                    required
                  />
                </label>
                <label class="block text-[11px] text-fg/40">
                  GITLAB_URL
                  <input
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[12px] text-fg/90"
                    bind:value={form.gitlabUrl}
                    required
                  />
                </label>
                <label class="block text-[11px] text-fg/40">
                  Promotion Path
                  <select
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                    bind:value={form.promotionPath}
                  >
                    {#each PROMOTION_PATHS as path}
                      <option value={path}>{path}</option>
                    {/each}
                  </select>
                </label>
                <label class="block text-[11px] text-fg/40">
                  template family
                  <select
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 text-[12px] text-fg/90"
                    bind:value={form.templateFamily}
                  >
                    {#each TEMPLATE_FAMILIES as family}
                      <option value={family}>{family}</option>
                    {/each}
                  </select>
                </label>
                <label class="block text-[11px] text-fg/40 sm:col-span-2">
                  PACKAGING_COMMAND
                  <input
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[12px] text-fg/90"
                    bind:value={form.packagingCommand}
                    required
                  />
                </label>
                <label class="block text-[11px] text-fg/40">
                  default branch/tag
                  <input
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[12px] text-fg/90"
                    bind:value={form.defaultRef}
                    required
                  />
                </label>
                <label class="block text-[11px] text-fg/40">
                  K8s namespace（可空，≠ NAME_SPACE）
                  <input
                    class="mt-1 w-full rounded-lg border border-fg/10 bg-input px-2 py-1.5 font-mono text-[12px] text-fg/90"
                    bind:value={form.k8sNamespace}
                    placeholder="optional"
                  />
                </label>
                <p class="sm:col-span-2 text-[11px] text-fg/35">
                  不要用 -dev／-prod 後綴當 APP_NAME。存草稿不會開 GitLab MR，也不是 published pin SHA。
                </p>
                <button
                  type="submit"
                  class="rounded-lg bg-fg/10 px-2.5 py-1.5 text-[12px] font-medium text-fg/80 disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
                  disabled={busy}
                >
                  存草稿
                </button>
              </form>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if data.canManageMembership}
    <form
      class="mt-8 flex flex-wrap items-end gap-2 border-t border-fg/[0.06] pt-6"
      onsubmit={(e) => {
        e.preventDefault();
        void createProject();
      }}
    >
      <label class="block text-[11px] text-fg/40">
        新建 Project（NAME_SPACE）
        <input
          class="mt-1 block min-w-[14rem] rounded-lg border border-fg/10 bg-input px-3 py-2 font-mono text-[13px] text-fg/90"
          placeholder="efactory"
          bind:value={newNameSpace}
          required
        />
      </label>
      <button
        type="submit"
        class="rounded-lg bg-fg/10 px-3 py-2 text-[13px] font-medium text-fg/80 disabled:opacity-50"
        disabled={busy}
      >
        {busy ? '處理中…' : '建立 Project'}
      </button>
    </form>
  {/if}
</div>
