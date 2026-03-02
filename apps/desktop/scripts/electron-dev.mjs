/**
 * Cross-platform Electron dev script.
 * 1. Builds electron code with esbuild
 * 2. Starts Vite dev server
 * 3. Waits for Vite to be ready on port 5173
 * 4. Launches Electron
 */
import { execSync, spawn } from 'child_process';
import { createConnection } from 'net';

const VITE_PORT = 5173;
const VITE_HOST = '127.0.0.1';

// Step 1: Build electron files (synchronous — must finish before anything else)
console.log('[dev] Building electron files...');
execSync(
  'esbuild electron/main.ts electron/preload.ts --outdir=dist-electron --platform=node --format=cjs --bundle --external:electron --external:node-pty --external:electron-store --external:@anthropic-ai/claude-agent-sdk',
  { stdio: 'inherit' }
);

// Step 2: Start Vite dev server
console.log('[dev] Starting Vite dev server...');
const vite = spawn('npx', ['vite'], {
  stdio: 'inherit',
  shell: true,
});

// Step 3: Wait for Vite to be ready, then launch Electron
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
