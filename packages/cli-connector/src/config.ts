/**
 * Shared configuration management.
 * Reads/writes ~/.dokba/config.json for token caching and settings.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DokbaConfig {
  serverUrl: string;
  token: string;
  roomCode: string;
  autoAcceptTasks: boolean;
  requireApproval: boolean;
  maxBudgetPerTask: number;
  allowedJobs: string[];
}

const CONFIG_DIR = join(homedir(), ".dokba");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const PID_PATH = join(CONFIG_DIR, "daemon.pid");

const DEFAULT_CONFIG: DokbaConfig = {
  serverUrl: "http://localhost:8000",
  token: "",
  roomCode: "",
  autoAcceptTasks: true,
  requireApproval: false,
  maxBudgetPerTask: 1.0,
  allowedJobs: [],
};

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load config from ~/.dokba/config.json.
 * Returns default config if file doesn't exist.
 */
export function loadConfig(): DokbaConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // Corrupt config — fall through to default
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save config to ~/.dokba/config.json.
 */
export function saveConfig(config: Partial<DokbaConfig>): DokbaConfig {
  ensureConfigDir();
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/**
 * Check if a valid token is cached.
 */
export function hasToken(): boolean {
  const config = loadConfig();
  return config.token.trim().length > 0;
}

/**
 * Get the config directory path.
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get the config file path.
 */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Write the daemon PID file.
 */
export function writePid(pid: number): void {
  ensureConfigDir();
  writeFileSync(PID_PATH, String(pid), "utf-8");
}

/**
 * Read the daemon PID. Returns null if not running.
 */
export function readPid(): number | null {
  try {
    if (existsSync(PID_PATH)) {
      const pid = parseInt(readFileSync(PID_PATH, "utf-8").trim(), 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Remove the daemon PID file.
 */
export function removePid(): void {
  try {
    if (existsSync(PID_PATH)) {
      unlinkSync(PID_PATH);
    }
  } catch {
    // ignore
  }
}

/**
 * Check if the daemon process is still alive.
 */
export function isDaemonRunning(): boolean {
  const pid = readPid();
  if (pid === null) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist — clean up stale PID
    removePid();
    return false;
  }
}
