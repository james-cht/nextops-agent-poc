<script lang="ts">
  import {
    parseAnswerBlocks,
    parseInline,
    type AnswerBlock,
    type CalloutKind,
  } from '$lib/diagnosis-answer-view';

  let { text = '' }: { text?: string } = $props();

  const blocks = $derived(parseAnswerBlocks(text));

  const calloutClass: Record<CalloutKind, string> = {
    重點: 'focus',
    提示: 'tip',
    風險: 'risk',
    建議: 'advice',
  };
</script>

{#snippet inlineText(value: string)}
  {#each parseInline(value) as part}
    {#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}
  {/each}
{/snippet}

{#snippet renderBlock(block: AnswerBlock)}
  {#if block.type === 'heading'}
    <h4 class="ans-heading">{block.text}</h4>
  {:else if block.type === 'callout'}
    <div class="callout {calloutClass[block.kind]}">
      <span class="callout-icon" aria-hidden="true">
        {#if block.kind === '風險'}
          <svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
          </svg>
        {:else if block.kind === '建議'}
          <svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        {:else if block.kind === '提示'}
          <svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 18v-5.25m0 0a3.75 3.75 0 1 0-3.75-3.75M12 12.75A3.75 3.75 0 1 1 15.75 9M12 21a.375.375 0 1 0 0-.75.375.375 0 0 0 0 .75Z"
            />
          </svg>
        {:else}
          <svg fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11.48 3.5a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L7.49 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557L3.55 10.386a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
            />
          </svg>
        {/if}
      </span>
      <div class="callout-body">
        <span class="callout-kind">{block.kind}</span>
        <span class="callout-text">{@render inlineText(block.text)}</span>
      </div>
    </div>
  {:else if block.type === 'table'}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            {#each block.headers as h}
              <th>{h}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each block.rows as row}
            <tr>
              {#each row as cell}
                <td>{@render inlineText(cell)}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if block.type === 'list'}
    {#if block.ordered}
      <ol>
        {#each block.items as item}
          <li>{@render inlineText(item)}</li>
        {/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item}
          <li>{@render inlineText(item)}</li>
        {/each}
      </ul>
    {/if}
  {:else if block.type === 'code'}
    <pre class="code">{block.text}</pre>
  {:else}
    <p>{@render inlineText(block.text)}</p>
  {/if}
{/snippet}

<div class="answer-view">
  {#each blocks as block}
    {@render renderBlock(block)}
  {/each}
</div>

<style>
  .answer-view {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--theme-fg);
  }
  .ans-heading {
    margin: 6px 0 0;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--theme-fg);
    padding-bottom: 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 80%, transparent);
  }
  p,
  ul,
  ol {
    margin: 0;
  }
  ul,
  ol {
    padding-left: 1.15rem;
  }
  li {
    margin: 2px 0;
  }
  .callout {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    border-radius: 8px;
    padding: 8px 10px;
    border: 1px solid var(--theme-line);
  }
  .callout.focus {
    background: color-mix(in srgb, var(--theme-info) 12%, transparent);
    border-color: color-mix(in srgb, var(--theme-info) 35%, transparent);
  }
  .callout.tip {
    background: color-mix(in srgb, var(--theme-info) 8%, transparent);
  }
  .callout.risk {
    background: color-mix(in srgb, var(--theme-danger) 12%, transparent);
    border-color: color-mix(in srgb, var(--theme-danger) 35%, transparent);
  }
  .callout.advice {
    background: color-mix(in srgb, var(--theme-success, #10b981) 12%, transparent);
    border-color: color-mix(in srgb, var(--theme-success, #10b981) 35%, transparent);
  }
  .callout-icon {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }
  .callout-icon svg {
    width: 16px;
    height: 16px;
    display: block;
  }
  .callout.focus .callout-icon,
  .callout.tip .callout-icon {
    color: var(--theme-info);
  }
  .callout.risk .callout-icon {
    color: var(--theme-danger);
  }
  .callout.advice .callout-icon {
    color: var(--theme-success, #10b981);
  }
  .callout-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .callout-kind {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: none;
    opacity: 0.8;
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--theme-line);
    border-radius: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--theme-line) 70%, transparent);
  }
  th {
    background: color-mix(in srgb, var(--theme-fg) 6%, transparent);
    font-weight: 700;
  }
  tr:last-child td {
    border-bottom: none;
  }
  .code {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--theme-inset);
    border: 1px solid var(--theme-line);
    font-size: 11px;
    overflow-x: auto;
    white-space: pre-wrap;
  }
</style>
