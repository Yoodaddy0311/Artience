/**
 * Background daemon mode for Dokba CLI.
 * Manages start/stop via PID file at ~/.dokba/daemon.pid.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  loadConfig,
  writePid,
  readPid,
  removePid,
  isDaemonRunning,
} from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Start the dokba connector as a background daemon.
 */
export function startDaemon(opts?: {
  room?: string;
  server?: string;
}): { success: boolean; message: string; pid?: number } {
  if (isDaemonRunning()) {
    const pid = readPid()!;
    return {
      success: false,
      message: `Daemon already running (PID ${pid}). Use "dokba stop" first.`,
      pid,
    };
  }

  const config = loadConfig();
  const room = opts?.room ?? config.roomCode;
  const server = opts?.server ?? config.serverUrl;
  const token = config.token;

  if (!token) {
    return {
      success: false,
      message: 'No token found. Run "dokba login" first.',
    };
  }

  if (!room) {
    return {
      success: false,
      message: "No room code. Provide --room or set it via config.",
    };
  }

  // Spawn detached process running "dokba connect"
  const entrypoint = join(__dirname, "index.js");
  const args = [
    entrypoint,
    "connect",
    "--room",
    room,
    "--token",
    token,
    "--server",
    server,
  ];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
  });

  if (!child.pid) {
    return {
      success: false,
      message: "Failed to spawn daemon process.",
    };
  }

  child.unref();
  writePid(child.pid);

  return {
    success: true,
    message: `Daemon started (PID ${child.pid}). Room: ${room}, Server: ${server}`,
    pid: child.pid,
  };
}

/**
 * Stop the running daemon.
 */
export function stopDaemon(): { success: boolean; message: string } {
  const pid = readPid();

  if (pid === null || !isDaemonRunning()) {
    removePid();
    return {
      success: false,
      message: "No daemon is running.",
    };
  }

  try {
    process.kill(pid, "SIGTERM");
    removePid();
    return {
      success: true,
      message: `Daemon stopped (PID ${pid}).`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to stop daemon";
    removePid();
    return {
      success: false,
      message: `Failed to stop daemon (PID ${pid}): ${message}`,
    };
  }
}

/**
 * Get daemon status.
 */
export function getDaemonStatus(): {
  running: boolean;
  pid: number | null;
  config: ReturnType<typeof loadConfig>;
} {
  const running = isDaemonRunning();
  const pid = running ? readPid() : null;
  const config = loadConfig();
  return { running, pid, config };
}
