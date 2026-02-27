/**
 * MCP Tool: sync-plugin
 * Manually synchronize the artibot plugin's agent/skill registry.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AgentRegistry } from "../agent-registry.js";
import { syncPlugin, getSearchPaths } from "../plugin-sync.js";

export function registerSyncPlugin(
  server: McpServer,
  getRegistry: () => AgentRegistry,
): void {
  server.tool(
    "sync-plugin",
    "Sync artibot plugin agent/skill registry with Dokba Town job system",
    {
      configPath: z
        .string()
        .optional()
        .describe(
          "Explicit path to artibot.config.json (auto-detected if omitted)",
        ),
    },
    async ({ configPath }) => {
      const registry = getRegistry();
      const result = syncPlugin(registry, configPath);

      if (!result.loaded) {
        const searchPaths = getSearchPaths();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  status: "not_found",
                  message:
                    "artibot.config.json not found. Searched in:",
                  searchPaths,
                  hint: "Provide configPath or install the artibot plugin.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      // Build summary of all mappings
      const mappings = registry.getAllMappings().map((m) => ({
        agent: m.agentName,
        job: m.jobId,
        category: m.category,
        tier: m.tier,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "synced",
                version: result.version,
                configPath: result.configPath,
                agentCount: result.agentCount,
                mappings,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
