/**
 * CLI → MCP migration utility.
 * Reads ~/.dokba/config.json and generates an MCP server configuration
 * file (.mcp.json) that can be used with Claude Desktop or Claude Code.
 */

import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, getConfigPath } from "./config.js";

/** MCP server entry in .mcp.json format. */
interface McpServerEntry {
  command: string;
  args: string[];
}

interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Generate .mcp.json from the current ~/.dokba/config.json.
 *
 * @param outputDir - Directory to write .mcp.json (defaults to cwd).
 * @param overwrite - Allow overwriting existing .mcp.json.
 * @returns Result object with success status and message.
 */
export function migrateToMcp(
  outputDir?: string,
  overwrite = false,
): { success: boolean; message: string; outputPath?: string } {
  const config = loadConfig();

  if (!config.token) {
    return {
      success: false,
      message:
        'No token found in ~/.dokba/config.json. Run "dokba login" first.',
    };
  }

  if (!config.roomCode) {
    return {
      success: false,
      message:
        'No room code found in ~/.dokba/config.json. Run "dokba login --room <code>" first.',
    };
  }

  const targetDir = outputDir ? resolve(outputDir) : process.cwd();
  const outputPath = resolve(targetDir, ".mcp.json");

  // Check for existing file
  if (existsSync(outputPath) && !overwrite) {
    // Merge into existing .mcp.json
    try {
      const existing = JSON.parse(
        readFileSync(outputPath, "utf-8"),
      ) as McpConfig;
      if (existing.mcpServers?.dokba) {
        return {
          success: false,
          message: `${outputPath} already has a "dokba" MCP server entry. Use --force to overwrite.`,
          outputPath,
        };
      }
    } catch {
      return {
        success: false,
        message: `${outputPath} exists but is not valid JSON. Use --force to overwrite.`,
        outputPath,
      };
    }
  }

  // Build MCP server args
  const args = [
    "@dokba/mcp-server",
    "--room",
    config.roomCode,
    "--token",
    config.token,
  ];

  if (config.serverUrl && config.serverUrl !== "http://localhost:8000") {
    args.push("--server", config.serverUrl);
  }

  const mcpEntry: McpServerEntry = {
    command: "npx",
    args,
  };

  // Read existing or create new
  let mcpConfig: McpConfig = { mcpServers: {} };
  if (existsSync(outputPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(outputPath, "utf-8")) as McpConfig;
      if (!mcpConfig.mcpServers) {
        mcpConfig.mcpServers = {};
      }
    } catch {
      // overwrite mode — start fresh
      mcpConfig = { mcpServers: {} };
    }
  }

  mcpConfig.mcpServers.dokba = mcpEntry;

  writeFileSync(outputPath, JSON.stringify(mcpConfig, null, 2) + "\n", "utf-8");

  return {
    success: true,
    message: [
      `MCP config written to ${outputPath}`,
      "",
      "Generated from:",
      `  ${getConfigPath()}`,
      "",
      "MCP server entry:",
      `  command: npx`,
      `  args: ${JSON.stringify(args)}`,
      "",
      "Next steps:",
      "  1. Stop the CLI daemon: dokba stop",
      "  2. Add .mcp.json to your Claude Desktop or Claude Code config",
      "  3. Restart Claude — the MCP server will auto-connect",
    ].join("\n"),
    outputPath,
  };
}
