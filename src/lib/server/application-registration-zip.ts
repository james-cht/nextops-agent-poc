import { unzipSync, strFromU8 } from 'fflate';

export type UnpackedFile = { path: string; content: string };

/** Unpack a zip (Uint8Array) into text files for the first commit. Skips directories. */
export function unpackRegistrationZip(bytes: Uint8Array): UnpackedFile[] {
  const entries = unzipSync(bytes);
  const files: UnpackedFile[] = [];
  for (const [rawPath, data] of Object.entries(entries)) {
    if (!rawPath || rawPath.endsWith('/')) continue;
    const path = rawPath.replace(/^\/+/, '');
    if (!path) continue;
    files.push({ path, content: strFromU8(data) });
  }
  return files;
}
