/**
 * Auto-connect for MCP server.
 * Reads cached config from ~/.dokba/config.json to auto-connect on startup.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CachedConfig {
  serverUrl: string;
  token: string;
  roomCode: string;
  autoAcceptTasks: boolean;
  requireApproval: boolean;
  maxBudgetPerTask: number;
  allowedJobs: string[];
}

const CONFIG_PATH = join(homedir(), ".dokba", "config.json");

/**
 * Load shared config from ~/.dokba/config.json.
 * Returns null if no config file exists or it's invalid.
 */
export function loadSharedConfig(): CachedConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CachedConfig;
    if (!parsed.token || !parsed.roomCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Determine auto-connect parameters.
 * Priority: CLI args > shared config > defaults.
 */
export function resolveConnectionParams(cliArgs: {
  room?: string;
  token?: string;
  server?: string;
}): { serverUrl: string; room: string; token: string } | null {
  // CLI args take priority
  if (cliArgs.room && cliArgs.token) {
    return {
      serverUrl: cliArgs.server ?? "http://localhost:8000",
      room: cliArgs.room,
      token: cliArgs.token,
    };
  }

  // Fall back to shared config
  const cached = loadSharedConfig();
  if (cached) {
    return {
      serverUrl: cliArgs.server ?? cached.serverUrl,
      room: cliArgs.room ?? cached.roomCode,
      token: cliArgs.token ?? cached.token,
    };
  }

  return null;
}
