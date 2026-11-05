#!/usr/bin/env node
/**
 * Capture feature-guide screenshots from a running NextOps instance.
 *
 * Requires (when run):
 *   STAGING_URL       — base URL, e.g. http://localhost:5173 or https://staging.example.com
 *   NEXTOPS_ADMIN_PASS — dashboard password (username defaults to admin)
 *
 * Optional:
 *   NEXTOPS_ADMIN_USER — override login username (default: admin)
 *
 * Skips with exit 0 when STAGING_URL is unset or @playwright/test is not installed.
 * After first install: npx playwright install chromium
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../docs/features/screenshots');

/** @type {{ file: string; path: string; auth?: boolean }[]} */
const ROUTES = [
  { file: 'login.png', path: '/login' },
  { file: 'dashboard.png', path: '/', auth: true },
  { file: 'site-detail.png', path: '/sites/%E9%BE%8D%E8%8F%AF-%E7%94%9F%E7%94%A2', auth: true },
  { file: 'logs.png', path: '/logs', auth: true },
  { file: 'alerts.png', path: '/alerts', auth: true },
  { file: 'ai-diagnosis.png', path: '/ai', auth: true },
  { file: 'admin.png', path: '/admin', auth: true },
  { file: 'diagnosis.png', path: '/admin/diagnosis', auth: true },
];

function skip(message) {
  console.log(message);
  process.exit(0);
}

async function loadChromium() {
  try {
    const { chromium } = await import('@playwright/test');
    return chromium;
  } catch {
    skip(
      '@playwright/test is not installed.\n' +
        'Install: npm install -D @playwright/test && npx playwright install chromium'
    );
  }
}

async function login(page, baseUrl, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 });
}

async function main() {
  const baseUrl = process.env.STAGING_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    skip(
      'Skipping screenshot capture: STAGING_URL is not set.\n' +
        'Example: STAGING_URL=http://localhost:5173 NEXTOPS_ADMIN_PASS=secret npm run docs:screenshots'
    );
  }

  const password = process.env.NEXTOPS_ADMIN_PASS;
  if (!password) {
    skip(
      'Skipping screenshot capture: NEXTOPS_ADMIN_PASS is not set.\n' +
        'Authenticated routes require the dashboard password.'
    );
  }

  const username = process.env.NEXTOPS_ADMIN_USER ?? 'admin';
  const chromium = await loadChromium();

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'zh-TW',
  });
  const page = await context.newPage();

  let loggedIn = false;

  for (const route of ROUTES) {
    if (route.auth && !loggedIn) {
      await login(page, baseUrl, username, password);
      loggedIn = true;
    }

    await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1_500);

    const outPath = join(OUT_DIR, route.file);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Wrote ${route.file}`);
  }

  await browser.close();
  console.log(`Done — ${ROUTES.length} screenshots in docs/features/screenshots/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
