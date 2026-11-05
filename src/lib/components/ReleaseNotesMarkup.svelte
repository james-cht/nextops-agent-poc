<script lang="ts">
  import { parseReleaseMarkup, type ReleaseMarkupInline } from '$lib/release-notes';

  let {
    body,
    onFollow,
  }: {
    body: string;
    onFollow: (href: string) => void;
  } = $props();

  const blocks = $derived(parseReleaseMarkup(body));

  function follow(e: MouseEvent, href: string) {
    e.preventDefault();
    onFollow(href);
  }
</script>

{#snippet inlines(nodes: ReleaseMarkupInline[])}
  {#each nodes as node, j (`n-${j}`)}
    {#if node.type === 'link'}
      <a
        href={node.href}
        class="text-accent-signal underline-offset-2 hover:underline"
        onclick={(e) => follow(e, node.href)}>{node.label}</a>
    {:else}{node.value}{/if}
  {/each}
{/snippet}

<div class="space-y-2">
  {#each blocks as block, i (`b-${i}`)}
    {#if block.type === 'paragraph'}
      <p>{@render inlines(block.children)}</p>
    {:else}
      <ul class="list-disc space-y-0.5 pl-4">
        {#each block.items as item, k (`i-${i}-${k}`)}
          <li>{@render inlines(item)}</li>
        {/each}
      </ul>
    {/if}
  {/each}
</div>
