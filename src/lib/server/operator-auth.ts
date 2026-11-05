import type {
  LocalSettingsStore,
  OperatorSessionRecord,
} from './local-settings-store.ts';

export type PasswordLoginResult =
  | { ok: true; session: OperatorSessionRecord }
  | { ok: false; code: 'UNAUTHORIZED' | 'LOCKED' };

export async function attemptPasswordLogin(
  store: LocalSettingsStore,
  opts: {
    username: string;
    password: string;
    clientIp: string;
    userAgent?: string | null;
    now?: Date;
    totpCode?: string;
  },
): Promise<PasswordLoginResult> {
  const username = String(opts.username ?? '').trim();
  const password = String(opts.password ?? '');
  const now = opts.now;
  if (!username || !password) {
    return { ok: false, code: 'UNAUTHORIZED' };
  }

  if (store.isLoginLocked(username, now)) {
    store.appendLoginEvent({
      username,
      outcome: 'lockout',
      clientIp: opts.clientIp,
      at: now,
    });
    return { ok: false, code: 'LOCKED' };
  }

  const ok = await store.verifyOperatorPassword(username, password);
  if (!ok) {
    store.appendLoginEvent({
      username,
      outcome: 'failure',
      clientIp: opts.clientIp,
      at: now,
    });
    return { ok: false, code: 'UNAUTHORIZED' };
  }

  const account = store.getOperatorAccount(username);
  if (account?.secondFactorEnrolled) {
    if (!store.verifySecondFactor({ username, code: opts.totpCode ?? '', now })) {
      store.appendLoginEvent({
        username,
        outcome: 'failure',
        clientIp: opts.clientIp,
        at: now,
      });
      return { ok: false, code: 'UNAUTHORIZED' };
    }
  }

  const session = store.createSession({
    username,
    clientIp: opts.clientIp,
    userAgent: opts.userAgent,
    now,
  });
  store.appendLoginEvent({
    username,
    outcome: 'success',
    clientIp: opts.clientIp,
    at: now,
  });
  return { ok: true, session };
}
