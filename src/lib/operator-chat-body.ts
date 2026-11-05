export type ChatBodyNode = { type: 'text' | 'link'; value: string };

const OPSGPT_PREFIX_RE = /^@opsgpt\b[ \t]*/i;

/** Public Room @OPSGPT prefix or mention chip. Operator DM never uses this to start a turn. */
export function parsePublicOpsgptInvoke(
  body: string,
  mentionChip = false,
): { invoke: boolean; query: string } {
  const trimmed = body.trim();
  const match = trimmed.match(OPSGPT_PREFIX_RE);
  const afterPrefix = match ? trimmed.slice(match[0].length).trim() : trimmed;
  if (mentionChip) {
    return { invoke: true, query: afterPrefix || trimmed };
  }
  if (!match) return { invoke: false, query: trimmed };
  return { invoke: true, query: afterPrefix || trimmed };
}

const LINK_RE = /https?:\/\/[^\s]+|(?:\/(?:[A-Za-z0-9._~!$&'()*+,;=:@%/-]*))/g;

/** Split a human Operator Chat body into text and autolink nodes (http(s) and same-origin paths). */
export function chatBodyNodes(body: string): ChatBodyNode[] {
  const nodes: ChatBodyNode[] = [];
  let last = 0;
  for (const match of body.matchAll(LINK_RE)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index < last) continue;
    if (value.startsWith('/') && (index === 0 || !/[\s(]$/.test(body[index - 1] ?? ' '))) {
      // Require path links to be at start or after whitespace/open-paren so "foo/bar" stays text.
      if (index > 0 && !/[\s(]/.test(body[index - 1] ?? '')) continue;
    }
    if (index > last) nodes.push({ type: 'text', value: body.slice(last, index) });
    nodes.push({ type: 'link', value });
    last = index + value.length;
  }
  if (last < body.length) nodes.push({ type: 'text', value: body.slice(last) });
  if (nodes.length === 0) nodes.push({ type: 'text', value: body });
  return nodes;
}
