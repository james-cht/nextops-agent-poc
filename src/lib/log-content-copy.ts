/** Log Content Copy helpers (Smart Logging). */

export const MESSAGE_COPY_PATHS = ['message', 'message_log', 'log'] as const;

export function isMessageFieldPath(path: string): boolean {
  return (MESSAGE_COPY_PATHS as readonly string[]).includes(path);
}

export function formatFieldTableForCopy(
  fields: readonly { path: string; value: string | number | boolean | null }[],
): string {
  return fields.map((row) => `${row.path}: ${row.value === null ? 'null' : String(row.value)}`).join('\n');
}

export function formatJsonForCopy(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Selected families first (save order), then unselected in search/filter order. */
export function orderCatalogFamilies(
  selected: readonly string[],
  families: readonly string[],
): string[] {
  const selectedSet = new Set(selected);
  const topUnique: string[] = [];
  const seen = new Set<string>();
  for (const s of selected) {
    if (seen.has(s)) continue;
    seen.add(s);
    topUnique.push(s);
  }
  const rest = families.filter((f) => !selectedSet.has(f));
  return [...topUnique, ...rest];
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text ?? '';
  if (!value) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
