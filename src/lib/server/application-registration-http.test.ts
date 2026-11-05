import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseRegisterApplicationBody,
  registerFailStatus,
} from './application-registration-http.ts';

describe('Application Registration HTTP contracts', () => {
  it('parses attach and create bodies and maps failure status codes', () => {
    const attach = parseRegisterApplicationBody({
      mode: 'attach',
      name: '結帳',
      gitlabProjectPath: 'shop/billing',
    });
    assert.equal(attach.ok, true);
    if (attach.ok) assert.equal(attach.input.mode, 'attach');

    const create = parseRegisterApplicationBody({
      mode: 'create',
      name: '結帳',
      gitlabProjectPath: 'shop/billing',
      files: [{ path: 'README.md', content: '# hi\n' }],
      advanced: {
        visibility: 'private',
        defaultBranch: 'main',
        commitMessage: 'init',
      },
    });
    assert.equal(create.ok, true);
    if (create.ok) {
      assert.equal(create.input.mode, 'create');
      assert.equal(create.input.files?.length, 1);
      assert.equal(create.input.advanced?.defaultBranch, 'main');
    }

    assert.equal(parseRegisterApplicationBody({ mode: 'attach' }).ok, false);
    assert.equal(registerFailStatus('FORBIDDEN'), 403);
    assert.equal(registerFailStatus('GITLAB_REAUTH'), 401);
    assert.equal(registerFailStatus('CONFLICT'), 409);
  });

  it('accepts zipBase64 for create payloads', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const zipped = zipSync({ 'README.md': strToU8('# from zip\n') });
    const zipBase64 = Buffer.from(zipped).toString('base64');
    const parsed = parseRegisterApplicationBody({
      mode: 'create',
      name: 'z',
      gitlabProjectPath: 'shop/z',
      zipBase64,
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.ok(parsed.input.files?.some((f) => f.path === 'README.md'));
    }
  });
});
