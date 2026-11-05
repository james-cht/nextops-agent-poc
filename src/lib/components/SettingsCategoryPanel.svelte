<script lang="ts">
  import {
    FIELD_EFFECT_LABELS,
    getCategoryById,
    getCategoryFields,
    type SettingsFieldDef,
    type SettingsFieldGroup,
  } from '$lib/sre-settings-registry';
  import { loadMainConfig, saveMainConfig } from '$lib/sre-settings-storage';
  import AdminStepUpModal from '$lib/components/AdminStepUpModal.svelte';

  let { categoryId }: { categoryId: string } = $props();

  const category = $derived(getCategoryById(categoryId)!);

  let formData = $state<Record<string, string>>({});
  let saved = $state(false);
  let saveError = $state<string | null>(null);
  let initialized = $state(false);
  let runtimeNotice = $state<string | null>(null);
  let stepUpOpen = $state(false);

  $effect(() => {
    categoryId;
    initialized = false;
    runtimeNotice = null;
  });

  $effect(() => {
    if (initialized || !category) return;
    const stored = loadMainConfig();
    const next: Record<string, string> = {};
    for (const field of getCategoryFields(category)) {
      next[field.key] = stored[field.key] ?? field.defaultValue;
    }
    formData = next;
    initialized = true;

    if (categoryId === 'sources') {
      void (async () => {
        try {
          const res = await fetch('/api/admin/mysql-proxy');
          if (!res.ok) return;
          const data = (await res.json()) as { enabled?: boolean };
          if (typeof data.enabled === 'boolean') {
            formData = { ...formData, mysql_proxy_enabled: data.enabled ? 'true' : 'false' };
          }
        } catch {
          /* keep default / localStorage */
        }
      })();
    }
  });

  const hasRuntimeFields = $derived(
    category
      ? getCategoryFields(category).some((f) => f.effect === 'runtime')
      : false,
  );

  async function handleSave() {
    saveError = null;
    runtimeNotice = null;
    const merged = { ...loadMainConfig(), ...formData };
    saveMainConfig(merged, categoryId);

    if (categoryId === 'sources' && 'mysql_proxy_enabled' in formData) {
      stepUpOpen = true;
      return;
    }

    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  async function saveMysqlWithPassword(adminPassword: string) {
    const res = await fetch('/api/admin/mysql-proxy', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        enabled: formData.mysql_proxy_enabled === 'true',
        adminPassword,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(
        (err as { error?: string })?.error ||
          `MySQL proxy 設定儲存失敗 (HTTP ${res.status})`,
      );
    }
    const data = await res.json().catch(() => ({}));
    runtimeNotice = (data as { notice?: string }).notice || '一經修改即會生效';
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);
  }

  function toggleCheckbox(name: string) {
    formData[name] = formData[name] === 'true' ? 'false' : 'true';
  }

  function effectBadgeClass(effect: SettingsFieldDef['effect']): string {
    if (effect === 'client') return 'bg-success-bg text-success';
    if (effect === 'runtime') return 'bg-info-bg text-info';
    if (effect === 'demo') return 'bg-warning-bg text-warning';
    return 'bg-fg/10 text-muted';
  }

  function isReadOnly(field: SettingsFieldDef): boolean {
    return field.effect === 'server';
  }
</script>

{#if category}
  <div class="rounded-2xl border border-fg/[0.06] bg-card p-6">
    <div class="mb-6">
      <h2 class="text-[15px] font-semibold tracking-tight text-fg">{category.title}</h2>
      <p class="mt-1 text-[13px] text-muted">{category.description}</p>
    </div>

    {#if category.groups}
      {#each category.groups as group (group.label)}
        {@render fieldGroup(group)}
      {/each}
    {:else if category.fields}
      <div class="flex flex-col gap-2.5">
        {#each category.fields as field (field.key)}
          {@render fieldInput(field)}
        {/each}
      </div>
    {/if}

    {#if hasRuntimeFields}
      <p class="mt-4 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[12px] text-warning">
        Runtime Setting 一經修改即會生效。儲存時會跳出 Platform Owner 密碼確認（step-up）。
      </p>
    {/if}

    <button
      onclick={handleSave}
      class="mt-6 w-full rounded-lg bg-teal-600 px-4 py-2.5 text-[13px] font-semibold tracking-wide text-white transition-all hover:bg-teal-500 active:scale-[0.98]"
    >
      {saved ? '✓ 已儲存' : '儲存配置'}
    </button>

    {#if runtimeNotice}
      <p class="mt-2 text-center text-[11px] text-emerald-400">{runtimeNotice}</p>
    {/if}

    {#if saveError}
      <p class="mt-2 text-center text-[11px] text-red-400">{saveError}</p>
    {/if}

    <p class="mt-3 text-center text-[12px] text-muted">
      客戶端/執行期欄位儲存後立即套用 · 僅供參考欄位不影響伺服器連線
    </p>
  </div>
{/if}

<AdminStepUpModal
  bind:open={stepUpOpen}
  title="確認後套用 MySQL proxy"
  confirmLabel="確認並套用"
  onConfirm={async (adminPassword) => {
    try {
      await saveMysqlWithPassword(adminPassword);
    } catch (e) {
      saveError = e instanceof Error ? e.message : '儲存失敗';
      throw e;
    }
  }}
/>

{#snippet fieldGroup(group: SettingsFieldGroup)}
  <div class="mb-5 border-b border-fg/5 pb-5 last:mb-4 last:border-b-0 last:pb-0">
    <div class="mb-3 flex items-center gap-2.5">
      <span
        class="rounded-md px-2.5 py-0.5 font-mono text-[10px] font-bold text-white"
        style="background: {group.badgeColor}"
      >
        {group.badge}
      </span>
      <span class="text-[13px] font-medium text-fg/80">{group.label}</span>
    </div>
    <div class="flex flex-col gap-2.5">
      {#each group.fields as field (field.key)}
        {@render fieldInput(field)}
      {/each}
    </div>
  </div>
{/snippet}

{#snippet fieldInput(field: SettingsFieldDef)}
  {@const effectMeta = FIELD_EFFECT_LABELS[field.effect]}
  {@const readonly = isReadOnly(field)}
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between gap-2">
      <label for={field.key} class="font-mono text-[11px] font-medium uppercase tracking-[0.4px] text-muted-strong">
        {field.label}
      </label>
      <span
        class="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide {effectBadgeClass(field.effect)}"
        title={effectMeta.hint}
      >
        {effectMeta.text}
      </span>
    </div>

    {#if field.type === 'checkbox'}
      <label
        for={field.key}
        class="flex cursor-pointer items-center gap-3 rounded-lg border border-fg/[0.06] bg-page px-3 py-2.5 transition-colors hover:border-fg/20 {readonly
          ? 'opacity-60'
          : ''}"
      >
        <input
          id={field.key}
          type="checkbox"
          checked={formData[field.key] === 'true'}
          disabled={readonly}
          onchange={() => toggleCheckbox(field.key)}
          class="h-4 w-4 cursor-pointer appearance-none rounded border border-fg/30 bg-transparent checked:border-teal-500 checked:bg-teal-600 transition-colors disabled:cursor-not-allowed"
        />
        <span class="font-mono text-[11px] font-medium uppercase tracking-[0.5px] text-fg/60">
          {field.placeholder || field.key}
        </span>
      </label>
    {:else if field.type === 'select' && field.options}
      <select
        id={field.key}
        bind:value={formData[field.key]}
        disabled={readonly}
        class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none transition-colors focus:border-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {#each field.options as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>
    {:else}
      <input
        id={field.key}
        type={field.type ?? 'text'}
        bind:value={formData[field.key]}
        placeholder={field.placeholder}
        readonly={readonly}
        class="rounded-lg border border-fg/[0.06] bg-page px-3 py-2 font-mono text-[13px] text-fg/80 outline-none transition-colors placeholder:text-fg/20 focus:border-blue-500/40 read-only:cursor-not-allowed read-only:opacity-60"
      />
    {/if}
  </div>
{/snippet}
