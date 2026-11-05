/**
 * Feedback loop: feature-guide iframe URL resolution under Vite.
 * Pass = /docs-static/features/index.html returns real feature guide HTML (not explore SPA).
 */
import http from 'node:http';

const PORT = Number(process.env.EXPLORE_PORT || 5180);
const BASE = `http://127.0.0.1:${PORT}`;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get(BASE + urlPath, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            contentType: res.headers['content-type'] || '',
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      })
      .on('error', reject);
  });
}

function classify(body) {
  const isExploreSpa =
    body.includes('id="app"') ||
    body.includes('/src/main.ts') ||
    (body.includes('文件探索中心') && body.includes('vite/client'));
  const isFeatureGuide =
    body.includes('NextOps 功能導覽') &&
    body.includes('styles.css') &&
    body.includes('nav-model');
  return { isExploreSpa, isFeatureGuide };
}

const paths = [
  '/docs-static/features/index.html',
  '/docs-static/features/styles.css',
  '/docs-static/features/dify-chatflow-setup.html',
  '/features/index.html', // legacy wrong path — still SPA; documented
  '/data/corpus.json'
];

for (const p of paths) {
  try {
    const r = await get(p);
    const c = classify(r.body);
    console.log(
      JSON.stringify({
        path: p,
        status: r.status,
        contentType: r.contentType.split(';')[0],
        ...c,
        head: r.body.slice(0, 100).replace(/\s+/g, ' ')
      })
    );
  } catch (e) {
    console.log(JSON.stringify({ path: p, error: e.message }));
    console.log('LOOP_FAIL server_unreachable');
    process.exit(2);
  }
}

const features = await get('/docs-static/features/index.html');
const css = await get('/docs-static/features/styles.css');
const c = classify(features.body);

if (features.status !== 200 || !c.isFeatureGuide || c.isExploreSpa) {
  console.log('LOOP_FAIL iframe_target_is_spa_not_feature_guide');
  process.exit(1);
}
if (css.status !== 200 || !(css.contentType.includes('css') || css.body.includes('{'))) {
  console.log('LOOP_FAIL feature_styles_missing');
  process.exit(1);
}

console.log('LOOP_PASS feature_guide_served');
process.exit(0);
