import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  clearDifyCredentialOverride,
  envValuesFromProcess,
  getEffectiveDifyCredentials,
  getEnvDifyCredentials,
  setDifyCredentialOverride,
  _resetDifyCredentialsStoreForTests,
} from './dify-credentials.ts';

const dirs: string[] = [];

afterEach(() => {
  _resetDifyCredentialsStoreForTests();
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nextops-dify-creds-'));
  dirs.push(d);
  return d;
}

describe('envValuesFromProcess', () => {
  it('maps Tool Endpoint Token from NEXTOPS_DIFY_TOKEN without Dify Chat Credentials', () => {
    const values = envValuesFromProcess({ NEXTOPS_DIFY_TOKEN: 'tok-only' });
    assert.equal(values.toolToken, 'tok-only');
    assert.equal(values.baseUrl, '');
    assert.equal(values.apiKey, '');
  });

  it('ignores leftover DIFY_BASE_URL and DIFY_API_KEY env', () => {
    const values = envValuesFromProcess({
      DIFY_BASE_URL: 'https://dify.example/v1',
      DIFY_API_KEY: 'app-leftover',
      NEXTOPS_DIFY_TOKEN: 'tok',
    });
    assert.equal(values.toolToken, 'tok');
    assert.equal(values.apiKey, '');
    assert.equal(values.baseUrl, '');
  });
});

describe('dify credentials store', () => {
  it('reads env when no override file', () => {
    const dataDir = tmpDir();
    const snap = getEffectiveDifyCredentials({
      dataDir,
      env: {
        baseUrl: 'https://env.example/v1',
        apiKey: 'app-env',
        toolToken: 'tok-env',
      },
    });
    assert.equal(snap.source, 'env');
    assert.equal(snap.toolToken, 'tok-env');
  });

  it('still yields Tool Endpoint Token when leftover Dify chat env is present', () => {
    const dataDir = tmpDir();
    const snap = getEffectiveDifyCredentials({
      dataDir,
      env: envValuesFromProcess({
        DIFY_BASE_URL: 'https://dify.example/v1',
        DIFY_API_KEY: 'app-leftover',
        NEXTOPS_DIFY_TOKEN: 'tok-live',
      }),
    });
    assert.equal(snap.toolToken, 'tok-live');
    assert.equal(snap.source, 'env');
  });

  it('persists override and prefers it over env', () => {
    const dataDir = tmpDir();
    const env = {
      baseUrl: 'https://env.example/v1',
      apiKey: 'app-env',
      toolToken: 'tok-env',
    };
    setDifyCredentialOverride(
      {
        baseUrl: 'https://ovr.example/v1',
        apiKey: 'app-ovr',
        toolToken: 'tok-ovr',
      },
      { dataDir },
    );
    const snap = getEffectiveDifyCredentials({ dataDir, env });
    assert.equal(snap.source, 'override');
    assert.equal(snap.apiKey, 'app-ovr');
    assert.ok(fs.existsSync(path.join(dataDir, 'nextops.sqlite')));
  });

  it('clear restores env source', () => {
    const dataDir = tmpDir();
    const env = {
      baseUrl: 'https://env.example/v1',
      apiKey: 'app-env',
      toolToken: 'tok-env',
    };
    setDifyCredentialOverride(
      { baseUrl: 'https://ovr.example/v1', apiKey: 'x', toolToken: 'y' },
      { dataDir },
    );
    clearDifyCredentialOverride({ dataDir });
    const snap = getEffectiveDifyCredentials({ dataDir, env });
    assert.equal(snap.source, 'env');
    assert.deepEqual(getEnvDifyCredentials(env), {
      baseUrl: env.baseUrl,
      apiKey: env.apiKey,
      toolToken: env.toolToken,
    });
  });
});
