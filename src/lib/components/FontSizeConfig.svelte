<script lang="ts">
  import { categories, getFontSizeConfig, saveFontSizeConfig, resetFontSizeConfig, buildCssVars } from '$lib/font-size-config';
  import type { FontSizeCategory, FontSizeEntry } from '$lib/font-size-config';

  let entries = $state(getFontSizeConfig());

  function getEntry(key: string): FontSizeEntry | undefined {
    return entries.find(e => e.key === key);
  }

  function update(cat: FontSizeCategory, entry: FontSizeEntry, val: string) {
    entry.value = val;
    const map: Record<string, string> = {};
    for (const e of entries) {
      map[e.key] = e.value;
    }
    saveFontSizeConfig(map);

    // Apply immediately to the document
    const root = document.documentElement;
    root.style.setProperty(`--${entry.key}`, val);
  }

  function resetAll() {
    resetFontSizeConfig();
    entries = getFontSizeConfig();
    const map: Record<string, string> = {};
    for (const e of entries) {
      map[e.key] = e.value;
    }
    const vars = buildCssVars(map);
    const root = document.documentElement;
    for (const [key, val] of Object.entries(vars)) {
      root.style.setProperty(key, val);
    }
  }
</script>

<div class="rounded-2xl border border-fg/[0.06] bg-card p-6 shadow-sm">
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h2 class="font-semibold text-fg/90" style="font-size: var(--fs-section-title)">字體大小配置</h2>
      <p class="mt-1 text-muted" style="font-size: var(--fs-subtext)">調整各分類文字大小，變更即時生效並自動儲存</p>
    </div>
    <button
      onclick={resetAll}
      class="rounded-lg border border-fg/10 bg-fg/5 px-3 py-1.5 font-medium text-fg/60 transition-colors hover:bg-fg/10 hover:text-fg/80"
      style="font-size: var(--fs-small)"
    >
      重設預設值
    </button>
  </div>

  <div class="flex flex-col gap-6">
    {#each categories as cat (cat.id)}
      <div class="rounded-xl border border-fg/[0.06] bg-fg/[0.02] p-5">
        <div class="mb-3">
          <h3 class="font-medium text-fg/80" style="font-size: var(--fs-label)">{cat.label}</h3>
          <p class="mt-0.5 text-muted" style="font-size: var(--fs-tiny)">{cat.description}</p>
        </div>
        <div class="flex flex-col gap-4">
          {#each cat.sizes as entry}
            {@const current = getEntry(entry.key)!}
            <div class="flex items-center gap-4">
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <span class="text-fg/70" style="font-size: var(--fs-small)">{current.label}</span>
                  <span class="font-mono text-fg/40" style="font-size: var(--fs-tiny)">{current.value}</span>
                </div>
                <input
                  type="range"
                  min={parseInt(current.min)}
                  max={parseInt(current.max)}
                  step={current.step}
                  value={parseInt(current.value)}
                  oninput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    update(cat, current, `${v}px`);
                  }}
                  class="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-fg/10 outline-none
                    [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
                    [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:shadow-blue-500/30
                    [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                />
              </div>
              <div
                class="flex shrink-0 items-center justify-center rounded-lg border border-fg/[0.06] bg-fg/[0.02] px-3 text-fg/70"
                style="font-size: {current.value}; height: 44px; min-width: 64px;"
              >
                Aa
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  input[type='range']::-moz-range-thumb {
    height: 16px;
    width: 16px;
    appearance: none;
    border-radius: 9999px;
    background: #3b82f6;
    border: none;
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
    cursor: pointer;
    transition: transform 0.15s;
  }
  input[type='range']::-moz-range-thumb:hover {
    transform: scale(1.25);
  }
  input[type='range']::-moz-range-track {
    height: 6px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--theme-fg) 10%, transparent);
  }
</style>
