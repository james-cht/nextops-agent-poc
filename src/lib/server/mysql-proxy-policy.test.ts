import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveMysqlProxyEnabled } from './mysql-proxy-policy.ts';

describe('resolveMysqlProxyEnabled', () => {
  it('defaults to direct connect when flag is false', () => {
    assert.equal(
      resolveMysqlProxyEnabled({
        flag: false,
        proxyHost: '192.0.2.1',
        proxyPort: '808',
      }),
      false,
    );
  });

  it('requires host and port when flag is true', () => {
    assert.equal(
      resolveMysqlProxyEnabled({ flag: true, proxyHost: '', proxyPort: '808' }),
      false,
    );
    assert.equal(
      resolveMysqlProxyEnabled({ flag: true, proxyHost: '192.0.2.1', proxyPort: '' }),
      false,
    );
  });

  it('enables CONNECT tunnel only when flag and proxy endpoint are set', () => {
    assert.equal(
      resolveMysqlProxyEnabled({
        flag: true,
        proxyHost: '192.0.2.1',
        proxyPort: '808',
      }),
      true,
    );
  });
});
