import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionCookieOptions, sessionCookieSecure } from './session-cookie.ts';

describe('sessionCookieSecure', () => {
  it('is false for plain HTTP production-style access', () => {
    assert.equal(
      sessionCookieSecure({ requestProtocol: 'http:', originEnv: '' }),
      false,
    );
  });

  it('is false when adapter-node defaults url.protocol to https: but ORIGIN is unset', () => {
    assert.equal(
      sessionCookieSecure({ requestProtocol: 'https:', originEnv: '' }),
      false,
    );
  });

  it('is true when X-Forwarded-Proto is https (TLS-terminated proxy)', () => {
    assert.equal(
      sessionCookieSecure({
        requestProtocol: 'http:',
        forwardedProto: 'https',
        originEnv: '',
      }),
      true,
    );
  });

  it('is false when X-Forwarded-Proto is http even if url.protocol is https:', () => {
    assert.equal(
      sessionCookieSecure({
        requestProtocol: 'https:',
        forwardedProto: 'http',
        originEnv: '',
      }),
      false,
    );
  });

  it('is true when ORIGIN env is https://…', () => {
    assert.equal(
      sessionCookieSecure({
        requestProtocol: 'http:',
        originEnv: 'https://nextops.example.com',
      }),
      true,
    );
  });

  it('is false when ORIGIN env is http://… (plain HTTP IP access)', () => {
    assert.equal(
      sessionCookieSecure({
        requestProtocol: 'https:',
        originEnv: 'http://192.0.2.2:3003',
      }),
      false,
    );
  });

  it('ignores NODE_ENV-style assumptions (http stays false)', () => {
    assert.equal(
      sessionCookieSecure({
        requestProtocol: 'http:',
        forwardedProto: 'http',
        originEnv: 'http://192.0.2.2:3003',
      }),
      false,
    );
  });
});

describe('sessionCookieOptions path', () => {
  it('is / when Public Base Path is empty, and the prefix on a shared host', () => {
    assert.equal(sessionCookieOptions({ originEnv: '' }).path, '/');
    assert.equal(
      sessionCookieOptions({ originEnv: '', publicBasePath: '/nextops' }).path,
      '/nextops',
    );
  });
});
