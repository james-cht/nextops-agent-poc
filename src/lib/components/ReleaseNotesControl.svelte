<script lang="ts">
  import { goto } from '$app/navigation';
  import type { ReleaseNotesSnapshot } from '$lib/release-notes';
  import ReleaseNotesMarkup from '$lib/components/ReleaseNotesMarkup.svelte';

  let { snapshot }: { snapshot: ReleaseNotesSnapshot } = $props();

  let open = $state(false);
  let unread = $state(snapshot.unread);
  let expandedId = $state<string | null>(null);

  $effect(() => {
    unread = snapshot.unread;
  });

  async function markRead() {
    if (!unread) return;
    unread = false;
    try {
      const res = await fetch('/api/release-notes/read', { method: 'PUT' });
      if (!res.ok) unread = true;
    } catch {
      unread = true;
    }
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    open = !open;
    if (open) void markRead();
  }

  function onWindowClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target?.closest('[data-release-notes-menu]')) open = false;
  }

  function follow(href: string) {
    open = false;
    void goto(href);
  }
</script>

<svelte:window onclick={onWindowClick} />

<div class="relative" data-release-notes-menu>
  <button
    type="button"
    aria-label="更新說明 · {snapshot.runningVersion}"
    title="更新說明 · {snapshot.runningVersion}"
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={toggle}
    class="chrome-control relative px-2"
  >
    <svg aria-hidden="true" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5"
      />
    </svg>
    {#if unread}
      <span
        class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent-signal"
        aria-label="有尚未閱讀的更新說明"
      ></span>
    {/if}
  </button>

  {#if open}
    <div
      role="dialog"
      aria-label="更新說明 · {snapshot.runningVersion}"
      class="absolute right-0 z-[60] mt-1.5 flex w-[22rem] max-w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-lg shadow-black/20"
    >
      <div class="border-b border-line px-3 py-2">
        <p class="text-[11px] font-medium uppercase tracking-wide text-muted-strong">更新說明</p>
        <p class="font-mono text-[12px] text-fg">目前 · {snapshot.runningVersion}</p>
      </div>
      <div class="max-h-[min(24rem,70vh)] overflow-y-auto py-1">
        {#each snapshot.releases as release (release.version)}
          <section class="px-3 py-2">
            <h2 class="mb-1 font-mono text-[11px] font-medium text-muted-strong">
              {release.version}
              {#if release.version === snapshot.runningVersion}
                <span class="ml-1 text-accent-signal">目前</span>
              {/if}
            </h2>
            <ul class="flex flex-col gap-1">
              {#each release.notes as note (note.id)}
                <li>
                  <button
                    type="button"
                    class="w-full rounded-lg px-2 py-1.5 text-left hover:bg-fg/5"
                    aria-expanded={expandedId === note.id}
                    onclick={() => {
                      expandedId = expandedId === note.id ? null : note.id;
                    }}
                  >
                    <span class="block text-[12px] font-medium text-fg">{note.title}</span>
                    <span class="mt-0.5 block text-[11px] text-muted-strong">{note.summary}</span>
                  </button>
                  {#if expandedId === note.id}
                    <div class="mt-1 space-y-2 px-2 pb-2 text-[12px] leading-relaxed text-fg/80">
                      <ReleaseNotesMarkup body={note.detail} onFollow={follow} />
                      {#if note.guidance}
                        <div class="rounded-md border border-line bg-fg/[0.03] px-2 py-1.5">
                          <p class="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-strong">
                            操作引導
                          </p>
                          <ReleaseNotesMarkup body={note.guidance} onFollow={follow} />
                        </div>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  {/if}
</div>
