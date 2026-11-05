export type NormalizeOperatorDisplayNameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const MAX_LEN = 64;

export function normalizeOperatorDisplayName(raw: string): NormalizeOperatorDisplayNameResult {
  const value = raw.trim();
  if (!value) return { ok: false, error: 'Operator Display Name is required' };
  if (value.length > MAX_LEN) {
    return { ok: false, error: `Operator Display Name must be at most ${MAX_LEN} characters` };
  }
  if (value.toLowerCase() === 'opsgpt') {
    return { ok: false, error: 'Operator Display Name must not be OPSGPT' };
  }
  return { ok: true, value };
}

export function operatorVisibleName(opts: {
  displayName: string | null | undefined;
  username: string;
}): string {
  const name = (opts.displayName ?? '').trim();
  if (name) return name;
  return opts.username.trim();
}

export function chatRoomVisibleTitle(opts: {
  kind: 'public' | 'operator_dm' | 'opsgpt_dm';
  title: string;
  accounts: Array<{ username: string; displayName?: string | null }>;
}): string {
  if (opts.kind !== 'operator_dm') return opts.title;
  const key = opts.title.trim();
  if (!key || key === 'DM') return opts.title;
  const account = opts.accounts.find((a) => a.username === key);
  return operatorVisibleName({ displayName: account?.displayName, username: key });
}
