/**
 * Plugin Sync — discovers and loads artibot plugin configuration.
 *
 * Searches for artibot.config.json in known locations:
 *   1. Project-local: .agent/artibot.config.json
 *   2. User-global: ~/.claude/plugins/artibot/artibot.config.json
 *
 * When the config changes (version bump), the agent registry is refreshed.
 */

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AgentRegistry, type ArtibotConfig } from "./agent-registry.js";

/** Paths to search for artibot.config.json, in priority order. */
const SEARCH_PATHS = [
  // Project-local (.agent/ directory)
  join(process.cwd(), ".agent", "artibot.config.json"),
  // User-global (claude plugins)
  join(homedir(), ".claude", "plugins", "artibot", "artibot.config.json"),
];

export interface PluginSyncResult {
  loaded: boolean;
  version: string | null;
  configPath: string | null;
  agentCount: number;
}

/**
 * Find artibot.config.json in known locations.
 */
export function findArtibotConfig(): string | null {
  for (const searchPath of SEARCH_PATHS) {
    try {
      if (existsSync(searchPath)) {
        return realpathSync(searchPath);
      }
    } catch {
      // Permission error or symlink issue — skip
    }
  }
  return null;
}

/**
 * Load artibot config from a specific path.
 */
export function loadArtibotConfig(configPath: string): ArtibotConfig | null {
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as ArtibotConfig;

    // Validate minimum required fields
    if (!parsed.version || !parsed.agents?.modelPolicy || !parsed.agents?.taskBased) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Sync artibot plugin config into the agent registry.
 * Returns sync result with metadata about what was loaded.
 */
export function syncPlugin(
  registry: AgentRegistry,
  explicitPath?: string,
): PluginSyncResult {
  const configPath = explicitPath ?? findArtibotConfig();

  if (!configPath) {
    return {
      loaded: false,
      version: null,
      configPath: null,
      agentCount: 0,
    };
  }

  const config = loadArtibotConfig(configPath);
  if (!config) {
    return {
      loaded: false,
      version: null,
      configPath,
      agentCount: 0,
    };
  }

  // Check if re-sync is needed (version changed)
  const currentVersion = registry.getVersion();
  if (currentVersion === config.version && registry.size > 0) {
    return {
      loaded: true,
      version: config.version,
      configPath,
      agentCount: registry.size,
    };
  }

  // Load into registry
  registry.load(config);

  return {
    loaded: true,
    version: config.version,
    configPath,
    agentCount: registry.size,
  };
}

/**
 * Get the list of search paths used for config discovery.
 */
export function getSearchPaths(): string[] {
  return [...SEARCH_PATHS];
}
