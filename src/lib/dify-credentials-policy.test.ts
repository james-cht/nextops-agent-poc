import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeDifyCredentialPatch,
  resolveDifyCredentials,
} from './dify-credentials-policy.ts';

describe('resolveDifyCredentials', () => {
  const env = {
    baseUrl: 'https://env.example/v1',
    apiKey: 'app-env',
    toolToken: 'tok-env',
  };

  it('uses env when no override', () => {
    assert.deepEqual(resolveDifyCredentials({ env, override: null }), {
      ...env,
      source: 'env',
    });
  });

  it('prefers override when present', () => {
    const override = {
      baseUrl: 'https://ovr.example/v1',
      apiKey: 'app-ovr',
      toolToken: 'tok-ovr',
    };
    assert.deepEqual(resolveDifyCredentials({ env, override }), {
      ...override,
      source: 'override',
    });
  });
});

describe('mergeDifyCredentialPatch', () => {
  const current = {
    baseUrl: 'https://cur.example/v1',
    apiKey: 'app-cur',
    toolToken: 'tok-cur',
  };

  it('keeps secrets when patch secrets are blank', () => {
    assert.deepEqual(
      mergeDifyCredentialPatch(current, {
        baseUrl: 'https://new.example/v1',
        apiKey: '',
        toolToken: '   ',
      }),
      {
        baseUrl: 'https://new.example/v1',
        apiKey: 'app-cur',
        toolToken: 'tok-cur',
      },
    );
  });

  it('replaces secrets when non-empty', () => {
    assert.deepEqual(
      mergeDifyCredentialPatch(current, {
        baseUrl: current.baseUrl,
        apiKey: 'app-new',
        toolToken: 'tok-new',
      }),
      {
        baseUrl: current.baseUrl,
        apiKey: 'app-new',
        toolToken: 'tok-new',
      },
    );
  });
});
