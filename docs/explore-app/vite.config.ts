import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const featuresDir = path.resolve(root, '../features');
const MOUNT = '/docs-static/features';

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'application/octet-stream';
}

function sendFeaturesFile(
  reqUrl: string,
  res: import('http').ServerResponse,
  next: () => void
) {
  if (!reqUrl.startsWith(MOUNT)) return next();
  let rel = decodeURIComponent(reqUrl.slice(MOUNT.length).split('?')[0]);
  if (!rel || rel === '/') rel = '/index.html';
  const abs = path.resolve(featuresDir, '.' + rel);
  if (!abs.startsWith(featuresDir) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType(abs));
  fs.createReadStream(abs).pipe(res);
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Serve docs/features at /docs-static/features in dev/preview; copy into dist on build. */
function docsFeaturesStatic(): Plugin {
  return {
    name: 'docs-features-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        sendFeaturesFile(req.url || '', res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        sendFeaturesFile(req.url || '', res, next);
      });
    },
    closeBundle() {
      const out = path.resolve(root, 'dist/docs-static/features');
      copyDir(featuresDir, out);
      console.log(`[docs-features-static] copied features → ${path.relative(root, out)}`);
    }
  };
}

export default defineConfig({
  plugins: [svelte(), docsFeaturesStatic()],
  base: './',
  root,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    port: 5180,
    strictPort: true,
    open: false,
    fs: {
      allow: [path.resolve(root, '..'), path.resolve(root, '../..')]
    }
  }
});
