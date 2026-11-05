import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  joinPublicPath,
  kitPathsBase,
  kitPathsBaseFromBuildEnv,
  stripPublicBasePath,
  withPublicBasePath,
} from './public-base-path.ts';

describe('Public Base Path', () => {
  it('leaves NextOps paths at host root when the prefix is empty (laptop / dedicated host)', () => {
    assert.equal(kitPathsBase(''), '');
    assert.equal(kitPathsBase('/'), '');
    assert.equal(joinPublicPath('', '/login'), '/login');
    assert.equal(joinPublicPath('', '/'), '/');
    assert.equal(joinPublicPath('', '/api/health'), '/api/health');
  });

  it('puts app-root, login, and health under /nextops on a shared host', () => {
    assert.equal(kitPathsBase('/nextops'), '/nextops');
    assert.equal(kitPathsBase('/nextops/'), '/nextops');
    assert.equal(kitPathsBase('nextops'), '/nextops');
    assert.equal(joinPublicPath('/nextops', '/'), '/nextops/');
    assert.equal(joinPublicPath('/nextops', '/login'), '/nextops/login');
    assert.equal(joinPublicPath('/nextops', '/api/health'), '/nextops/api/health');
  });

  it('strips the shared-host prefix so Session and health still see NextOps paths', () => {
    assert.equal(stripPublicBasePath('/nextops/login', '/nextops'), '/login');
    assert.equal(stripPublicBasePath('/nextops/', '/nextops'), '/');
    assert.equal(stripPublicBasePath('/nextops', '/nextops'), '/');
    assert.equal(stripPublicBasePath('/nextops/api/health', '/nextops'), '/api/health');
    assert.equal(stripPublicBasePath('/login', ''), '/login');
  });

  it('prefixes root-relative hrefs and fetch paths without double-prefixing', () => {
    assert.equal(withPublicBasePath('/login', '/nextops'), '/nextops/login');
    assert.equal(withPublicBasePath('/nextops/login', '/nextops'), '/nextops/login');
    assert.equal(withPublicBasePath('./favicon.png', '/nextops'), './favicon.png');
    assert.equal(withPublicBasePath('https://tmdev.corp.example.com/login', '/nextops'), 'https://tmdev.corp.example.com/login');
    assert.equal(withPublicBasePath('/login', ''), '/login');
  });

  it('bakes /nextops from .env.production when Docker leaves PUBLIC_BASE_PATH empty', () => {
    const dotenv = [
      'ORIGIN=https://tmdev.corp.example.com',
      'PUBLIC_BASE_PATH=/nextops',
      'IMAGE_TAG=deadbeef',
    ].join('\n');
    assert.equal(kitPathsBaseFromBuildEnv({ PUBLIC_BASE_PATH: '' }, dotenv), '/nextops');
    assert.equal(kitPathsBaseFromBuildEnv({}, dotenv), '/nextops');
    assert.equal(
      kitPathsBaseFromBuildEnv({ PUBLIC_BASE_PATH: '/other' }, 'PUBLIC_BASE_PATH=/nextops'),
      '/other',
    );
    assert.equal(kitPathsBaseFromBuildEnv({ PUBLIC_BASE_PATH: '' }, ''), '');
  });
});
