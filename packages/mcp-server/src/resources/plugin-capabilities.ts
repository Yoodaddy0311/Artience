/**
 * MCP Resource: plugin-capabilities
 * Exposes the artibot plugin version, agent list, and skill mappings.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentRegistry } from "../agent-registry.js";
import { listSkills, matchSkills } from "../skill-injector.js";

export function registerPluginCapabilities(
  server: McpServer,
  getRegistry: () => AgentRegistry,
): void {
  server.resource(
    "plugin-capabilities",
    "dokba://plugin/capabilities",
    {
      description:
        "Artibot plugin capabilities — agents, skills, and job mappings",
      mimeType: "application/json",
    },
    async (uri) => {
      const registry = getRegistry();

      const agents = registry.getAllMappings().map((m) => ({
        name: m.agentName,
        jobId: m.jobId,
        category: m.category,
        tier: m.tier,
      }));

      const skills = listSkills().map((s) => ({
        name: s.name,
        keywords: s.keywords,
      }));

      const capabilities = {
        version: registry.getVersion(),
        agentCount: registry.size,
        skillCount: skills.length,
        agents,
        skills,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(capabilities, null, 2),
          },
        ],
      };
    },
  );
}
