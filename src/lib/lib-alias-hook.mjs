import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const libRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function withTs(specifier) {
  if (specifier.endsWith('.ts') || specifier.endsWith('.js') || specifier.endsWith('.mjs') || specifier.endsWith('.json')) {
    return specifier;
  }
  const asTs = `${specifier}.ts`;
  return existsSync(fileURLToPath(asTs)) ? asTs : specifier;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '$lib' || specifier.startsWith('$lib/')) {
    const rel = specifier === '$lib' ? '' : specifier.slice('$lib/'.length);
    const fileUrl = pathToFileURL(path.join(libRoot, rel)).href;
    return nextResolve(withTs(fileUrl), context);
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
}
