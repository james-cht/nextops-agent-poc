#!/usr/bin/env node
/**
 * Login env feedback loop for diagnose.
 * Exit 0 = admin123 login succeeds; exit 1 = fails as expected for broken .env.
 *
 * Usage:
 *   node scripts/diagnose-login-loop.mjs              # use process env / dotenv as vite would
 *   node scripts/diagnose-login-loop.mjs --inject     # inject admin/admin123 into child env
 *   node scripts/diagnose-login-loop.mjs --expect-fail
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.DIAG_PORT || 5199);
const inject = process.argv.includes('--inject');
const expectFail = process.argv.includes('--expect-fail');

function checkEnvReadable() {
  const envPath = path.join(root, '.env');
  const prodPath = path.join(root, '.env.prod');
  let envOk = false;
  let envErr = '';
  try {
    const s = fs.readFileSync(envPath, 'utf8');
    envOk = true;
    console.log(`[loop] .env readable bytes=${s.length}`);
  } catch (e) {
    envErr = `${e.code || ''} ${e.message}`;
    console.log(`[loop] .env NOT readable: ${envErr}`);
  }
  try {
    const s = fs.readFileSync(prodPath, 'utf8');
    const pass = (s.match(/^NEXTOPS_ADMIN_PASS=(.*)$/m) || [])[1] ?? '';
    const user = (s.match(/^NEXTOPS_ADMIN_USER=(.*)$/m) || [])[1] ?? '';
    console.log(
      `[loop] .env.prod readable user=${user} pass_len=${pass.length} is_admin123=${pass === 'admin123'}`,
    );
  } catch (e) {
    console.log(`[loop] .env.prod NOT readable: ${e.message}`);
  }
  return { envOk, envErr };
}

async function waitForHealth(timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function tryLogin() {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const text = await res.text();
  console.log(`[loop] login status=${res.status} body=${text.slice(0, 200)}`);
  return res.status;
}

async function main() {
  const { envOk } = checkEnvReadable();

  const childEnv = { ...process.env, PORT: String(port) };
  // Avoid inheriting a working password when testing broken-.env path
  if (!inject) {
    delete childEnv.NEXTOPS_ADMIN_USER;
    delete childEnv.NEXTOPS_ADMIN_PASS;
  } else {
    childEnv.NEXTOPS_ADMIN_USER = 'admin';
    childEnv.NEXTOPS_ADMIN_PASS = 'admin123';
  }

  console.log(`[loop] starting vite port=${port} inject=${inject}`);
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: root,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let log = '';
  child.stdout.on('data', (d) => {
    log += d.toString();
  });
  child.stderr.on('data', (d) => {
    log += d.toString();
  });

  const killTree = () => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
  };

  try {
    const ready = await waitForHealth();
    if (!ready) {
      console.log('[loop] server failed to become healthy');
      console.log(log.slice(-1500));
      killTree();
      process.exit(2);
    }
    const status = await tryLogin();
    const ok = status === 200;
    console.log(`[loop] env_readable=${envOk} inject=${inject} login_ok=${ok}`);
    killTree();
    await new Promise((r) => setTimeout(r, 500));
    if (expectFail) {
      process.exit(ok ? 1 : 0);
    }
    process.exit(ok ? 0 : 1);
  } catch (e) {
    killTree();
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
