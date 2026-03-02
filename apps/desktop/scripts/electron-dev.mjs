/**
 * Cross-platform Electron dev script.
 * 1. Builds electron code with esbuild
 * 2. Purges ALL stale caches (node_modules/.vite + dist/)
 * 3. Kills leftover process on port 5173
 * 4. Starts Vite dev server with --force
 * 5. Waits for Vite to be ready, then launches Electron
 */
import { execSync, spawn } from 'child_process';
import { createConnection } from 'net';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';

const VITE_PORT = 5173;
const VITE_HOST = 'localhost';

// Step 1: Build electron files (synchronous — must finish before anything else)
console.log('[dev] Building electron files...');
execSync(
  'npx esbuild electron/main.ts electron/preload.ts --outdir=dist-electron --platform=node --format=cjs --bundle --external:electron --external:node-pty --external:electron-store --external:@anthropic-ai/claude-agent-sdk',
  { stdio: 'inherit', shell: true }
);

// Step 2: Purge ALL stale caches to prevent deleted files from lingering
console.log('[dev] Purging caches...');
rmSync('node_modules/.vite', { recursive: true, force: true });
rmSync('dist', { recursive: true, force: true });

// Purge Electron's V8 Code Cache, Chromium caches, and stale web storage
// This prevents phantom modules from old builds from being served
const electronDataDir = join(process.env.APPDATA || '', 'Electron');
if (existsSync(electronDataDir)) {
  // 캐시만 삭제 — Local Storage/Session Storage는 Zustand persist 데이터이므로 보존
  const purgeDirs = [
    'Cache', 'Code Cache', 'GPUCache',
    'DawnGraphiteCache', 'DawnWebGPUCache',
    'Service Worker', 'Shared Dictionary', 'SharedStorage',
    'blob_storage', 'DIPS', 'Network',
  ];
  for (const dir of purgeDirs) {
    const p = join(electronDataDir, dir);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  console.log('[dev] Electron data purged (all caches + web storage)');
}

// Step 3: Kill any leftover process on port 5173
try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${VITE_PORT} | findstr LISTENING`, { encoding: 'utf8' }).trim();
    const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
    }
    if (pids.length) console.log(`[dev] Killed stale process(es) on port ${VITE_PORT}: ${pids.join(', ')}`);
  } else {
    execSync(`lsof -ti:${VITE_PORT} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  }
} catch {
  // No process on port — nothing to kill
}

// Step 4: Start Vite dev server with --force to skip cached pre-bundled deps
console.log('[dev] Starting Vite dev server...');
const vite = spawn('npx', ['vite', '--force'], {
  stdio: 'inherit',
  shell: true,
});

// Step 5: Wait for Vite to be ready, then launch Electron
function waitForPort(port, host, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Timed out waiting for ${host}:${port}`));
        return;
      }
      const sock = createConnection({ port, host }, () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', () => {
        setTimeout(tryConnect, 300);
      });
    }
    tryConnect();
  });
}

waitForPort(VITE_PORT, VITE_HOST)
  .then(() => {
    console.log('[dev] Vite ready — launching Electron...');
    const electron = spawn('npx', ['electron', '.'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, VITE_DEV_SERVER_URL: `http://${VITE_HOST}:${VITE_PORT}` },
    });

    electron.on('close', () => {
      vite.kill();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error('[dev]', err.message);
    vite.kill();
    process.exit(1);
  });

// Cleanup on interrupt
process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
process.on('SIGTERM', () => {
  vite.kill();
  process.exit(0);
});
