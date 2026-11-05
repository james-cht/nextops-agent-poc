<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { publicHref } from '$lib/kit-public-href';

  let { data } = $props();

  let formOpen = $state(false);
  let mode = $state<'attach' | 'create'>('attach');
  let advanced = $state(false);
  let name = $state('');
  let gitlabProjectPath = $state('');
  let visibility = $state<'private' | 'internal' | 'public'>('private');
  let defaultBranch = $state('main');
  let description = $state('');
  let gitignoreTemplate = $state('');
  let commitMessage = $state('Initial commit from NextOps');
  let files = $state<Array<{ path: string; content: string }>>([]);
  let zipBase64 = $state<string | null>(null);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  async function readFileEntries(list: FileList | null) {
    zipBase64 = null;
    if (!list || list.length === 0) {
      files = [];
      return;
    }
    const next: Array<{ path: string; content: string }> = [];
    for (const file of Array.from(list)) {
      const rel =
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const path = rel.includes('/') ? rel.replace(/^[^/]+\//, '') : rel;
      const content = await file.text();
      next.push({ path: path || file.name, content });
    }
    files = next;
  }

  async function readZip(list: FileList | null) {
    files = [];
    if (!list || list.length === 0) {
      zipBase64 = null;
      return;
    }
    const buf = await list[0].arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    zipBase64 = btoa(binary);
  }

  async function submit() {
    saving = true;
    error = null;
    message = null;
    try {
      const body: Record<string, unknown> = {
        mode,
        name,
        gitlabProjectPath,
      };
      if (mode === 'create') {
        if (zipBase64) body.zipBase64 = zipBase64;
        else body.files = files;
        if (advanced) {
          body.advanced = {
            visibility,
            defaultBranch,
            description,
            gitignoreTemplate,
            commitMessage,
          };
        }
      }
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (payload.gitlabReauth) {
          error = '需要重新授權 GitLab Access（Session 仍有效）';
          return;
        }
        error = payload.error || payload.message || `HTTP ${res.status}`;
        return;
      }
      message = mode === 'attach' ? '已掛上 Application' : '已建立 Application';
      formOpen = false;
      name = '';
      gitlabProjectPath = '';
      files = [];
      zipBase64 = null;
      await invalidateAll();
    } catch {
      error = '登記失敗';
    } finally {
      saving = false;
    }
  }

  async function unregister(appName: string) {
    if (!confirm(`確定從目錄移除「${appName}」？不會刪除 GitLab Project。`)) return;
    error = null;
    message = null;
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(appName)}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = payload.error || payload.message || `HTTP ${res.status}`;
        return;
      }
      message = '已從目錄移除 Application';
      await invalidateAll();
    } catch {
      error = '解除登記失敗';
    }
  }
</script>

<div class="mx-auto max-w-3xl px-4 py-8 lg:px-6">
  <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="text-[15px] font-semibold tracking-tight text-fg/90">{data.empty.title}</h2>
      <p class="mt-2 text-[13px] leading-relaxed text-fg/55">{data.empty.body}</p>
    </div>
    {#if data.empty.showRegister}
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white"
        onclick={() => {
          formOpen = !formOpen;
          error = null;
          message = null;
        }}
      >
        {formOpen ? '取消' : '應用登記'}
      </button>
    {/if}
  </div>

  {#if message}
    <p class="mb-3 text-[12px] text-fg/70">{message}</p>
  {/if}
  {#if error}
    <p class="mb-3 text-[12px] text-danger">
      {error}
      {#if error.includes('GitLab Access')}
        <a class="ml-2 underline" href={publicHref('/api/auth/gitlab/authorize')}>連接 GitLab</a>
      {/if}
    </p>
  {/if}

  {#if formOpen && data.empty.showRegister}
    <form
      class="mb-6 space-y-3 rounded-xl border border-fg/10 bg-elevated/40 p-4"
      onsubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div class="flex flex-wrap gap-4 text-[13px]">
        <label class="inline-flex items-center gap-2 text-fg/70">
          <input type="radio" bind:group={mode} value="attach" />
          掛上既有 GitLab Project
        </label>
        <label class="inline-flex items-center gap-2 text-fg/70">
          <input type="radio" bind:group={mode} value="create" />
          新建 GitLab Project
        </label>
        <label class="ml-auto inline-flex items-center gap-2 text-fg/55">
          <input type="checkbox" bind:checked={advanced} />
          進階
        </label>
      </div>

      <input
        class="w-full rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
        placeholder="Application 名稱"
        bind:value={name}
        required
      />
      <input
        class="w-full rounded-lg border border-fg/10 bg-input px-3 py-2 font-mono text-[13px] text-fg/90"
        placeholder="GitLab Project path（例如 shop/billing-web）"
        bind:value={gitlabProjectPath}
        required
      />

      {#if mode === 'create'}
        <div class="space-y-2">
          <label class="block text-[12px] text-fg/50">來源資料夾（第一個 commit）</label>
          <input
            type="file"
            multiple
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory
            class="block w-full text-[12px] text-fg/60"
            onchange={(e) => void readFileEntries((e.currentTarget as HTMLInputElement).files)}
          />
          <label class="block text-[12px] text-fg/50">或上傳 zip</label>
          <input
            type="file"
            accept=".zip,application/zip"
            class="block w-full text-[12px] text-fg/60"
            onchange={(e) => void readZip((e.currentTarget as HTMLInputElement).files)}
          />
          <p class="text-[11px] text-fg/40">
            {#if zipBase64}
              已選 zip。
            {:else}
              已選 {files.length} 個檔案。
            {/if}
            不會在 NextOps 留下檔案樹；只寫一次 first commit。
          </p>
        </div>
      {/if}

      {#if advanced && mode === 'create'}
        <div class="grid gap-2 sm:grid-cols-2">
          <select
            class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
            bind:value={visibility}
          >
            <option value="private">private</option>
            <option value="internal">internal</option>
            <option value="public">public</option>
          </select>
          <input
            class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
            placeholder="default branch"
            bind:value={defaultBranch}
          />
          <input
            class="sm:col-span-2 rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
            placeholder="description"
            bind:value={description}
          />
          <input
            class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
            placeholder=".gitignore template（例如 Node）"
            bind:value={gitignoreTemplate}
          />
          <input
            class="rounded-lg border border-fg/10 bg-input px-3 py-2 text-[13px] text-fg/90"
            placeholder="first-commit message"
            bind:value={commitMessage}
          />
        </div>
      {/if}

      <button
        type="submit"
        class="rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        disabled={saving}
      >
        {saving ? '登記中…' : '確認登記'}
      </button>
    </form>
  {/if}

  {#if data.applications.length > 0}
    <ul class="divide-y divide-fg/10 rounded-xl border border-fg/10 bg-elevated/40">
      {#each data.applications as app (app.name)}
        <li class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div class="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span class="text-[14px] font-medium text-fg/85">{app.name}</span>
            <span class="font-mono text-[12px] text-fg/50">{app.gitlabProjectPath}</span>
          </div>
          {#if data.empty.showUnregister}
            <button
              type="button"
              class="shrink-0 rounded-lg border border-fg/15 px-2.5 py-1 text-[12px] text-fg/60 hover:bg-fg/5"
              onclick={() => void unregister(app.name)}
            >
              解除登記
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div
      class="rounded-xl border border-dashed border-fg/15 bg-elevated/30 px-4 py-10 text-center text-[13px] text-fg/40"
    >
      目前沒有 Application。
      {#if !data.empty.showRegister}
        <span class="mt-2 block text-[12px] text-fg/30">此角色沒有寫入控制項。</span>
      {/if}
    </div>
  {/if}
</div>
