#!/usr/bin/env node

/**
 * @dokba/mcp-server - Artifarm Town MCP Server for Claude Code
 *
 * User configuration (claude_desktop_config.json or .claude.json):
 * {
 *   "mcpServers": {
 *     "dokba": {
 *       "command": "npx",
 *       "args": ["@dokba/mcp-server", "--room", "abc123", "--token", "xxx"]
 *     }
 *   }
 * }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WsBridge } from "./transport/ws-bridge.js";
import { resolveConnectionParams } from "./auto-connect.js";

// Tools
import { registerConnectRoom } from "./tools/connect-room.js";
import { registerReceiveTask } from "./tools/receive-task.js";
import { registerSubmitResult } from "./tools/submit-result.js";
import { registerGetStatus } from "./tools/get-status.js";
import { registerChatAgent } from "./tools/chat-agent.js";
import { registerSyncPlugin } from "./tools/sync-plugin.js";

// Resources
import { registerRoomState } from "./resources/room-state.js";
import { registerTaskQueue } from "./resources/task-queue.js";
import { registerPluginCapabilities } from "./resources/plugin-capabilities.js";

// Plugin integration
import { AgentRegistry } from "./agent-registry.js";
import { syncPlugin } from "./plugin-sync.js";

// Parse CLI args for auto-connect
function parseArgs(): { room?: string; token?: string; server?: string } {
  const args = process.argv.slice(2);
  const result: { room?: string; token?: string; server?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--room" && args[i + 1]) {
      result.room = args[++i];
    } else if (args[i] === "--token" && args[i + 1]) {
      result.token = args[++i];
    } else if (args[i] === "--server" && args[i + 1]) {
      result.server = args[++i];
    }
  }

  return result;
}

async function main() {
  // Shared bridge state
  let bridge: WsBridge | null = null;

  const getBridge = () => bridge;
  const setBridge = (b: WsBridge) => {
    bridge = b;
  };
  const createBridge = (serverUrl: string, room: string, token: string) => {
    return new WsBridge({ serverUrl, room, token });
  };

  // Agent registry for artibot plugin integration
  const agentRegistry = new AgentRegistry();
  const getRegistry = () => agentRegistry;

  // Create MCP server
  const server = new McpServer(
    {
      name: "dokba",
      version: "0.1.0",
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  // Register 6 tools
  registerConnectRoom(server, getBridge, setBridge, createBridge);
  registerReceiveTask(server, getBridge, getRegistry);
  registerSubmitResult(server, getBridge);
  registerGetStatus(server, getBridge);
  registerChatAgent(server, getBridge);
  registerSyncPlugin(server, getRegistry);

  // Register 3 resources
  registerRoomState(server, getBridge);
  registerTaskQueue(server, getBridge);
  registerPluginCapabilities(server, getRegistry);

  // Auto-connect: CLI args > ~/.dokba/config.json > skip
  const cliArgs = parseArgs();
  const connParams = resolveConnectionParams(cliArgs);

  if (connParams) {
    try {
      bridge = createBridge(
        connParams.serverUrl,
        connParams.room,
        connParams.token,
      );
      await bridge.connect();
      const source = cliArgs.room && cliArgs.token ? "CLI args" : "~/.dokba/config.json";
      console.error(
        `[dokba-mcp] Auto-connected to room "${connParams.room}" on ${connParams.serverUrl} (from ${source})`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      console.error(`[dokba-mcp] Auto-connect failed: ${message}`);
      // Continue without connection - tools will report "not connected"
    }
  } else {
    console.error(
      '[dokba-mcp] No connection config found. Use connect-room tool or run "dokba login" first.',
    );
  }

  // Auto-sync artibot plugin (if available)
  const pluginResult = syncPlugin(agentRegistry);
  if (pluginResult.loaded) {
    console.error(
      `[dokba-mcp] Artibot plugin synced: v${pluginResult.version}, ${pluginResult.agentCount} agents (from ${pluginResult.configPath})`,
    );
  } else {
    console.error(
      "[dokba-mcp] Artibot plugin not found — sync-plugin tool available for manual sync",
    );
  }

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[dokba-mcp] MCP server running on stdio");

  // Graceful shutdown
  process.on("SIGINT", () => {
    bridge?.disconnect();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    bridge?.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[dokba-mcp] Fatal error:", err);
  process.exit(1);
});
