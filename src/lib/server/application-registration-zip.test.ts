import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { unpackRegistrationZip } from './application-registration-zip.ts';

describe('Application Registration zip unpack', () => {
  it('unpacks text files from a zip for the first commit', () => {
    const zipped = zipSync({
      'README.md': strToU8('# hi\n'),
      'src/main.ts': strToU8('export {}\n'),
    });
    const files = unpackRegistrationZip(zipped);
    assert.equal(files.length, 2);
    assert.ok(files.some((f) => f.path === 'README.md' && f.content.includes('# hi')));
    assert.ok(files.some((f) => f.path === 'src/main.ts'));
  });
});
