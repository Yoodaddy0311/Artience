/**
 * MCP Tool: receive-task
 * Receives the next pending task from the server queue.
 * Enriches the task with agent recommendation and skill context
 * from the artibot plugin integration.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";
import type { AgentRegistry } from "../agent-registry.js";
import { injectSkillContext } from "../skill-injector.js";

export function registerReceiveTask(
  server: McpServer,
  getBridge: () => WsBridge | null,
  getRegistry?: () => AgentRegistry,
): void {
  server.tool(
    "receive-task",
    "Receive the next pending task from the Artifarm task queue",
    {},
    async () => {
      const bridge = getBridge();
      if (!bridge?.isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not connected. Use connect-room first.",
            },
          ],
          isError: true,
        };
      }

      const task = bridge.taskQueue.shift();
      if (!task) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No pending tasks in queue. Waiting for new tasks from the server.",
            },
          ],
        };
      }

      // Extract prompt text from the task for enrichment
      const promptText =
        (task as Record<string, unknown>).prompt as string ??
        (task as Record<string, unknown>).text as string ??
        (task as Record<string, unknown>).taskContent as string ??
        "";

      // Enrich with agent recommendation and skill context
      const enrichment: Record<string, unknown> = {};

      if (getRegistry && promptText) {
        const registry = getRegistry();
        if (registry.size > 0) {
          const recommendation = registry.recommendJob(promptText);
          if (recommendation) {
            enrichment.recommendedAgent = {
              agentName: recommendation.agentName,
              jobId: recommendation.jobId,
              category: recommendation.category,
              tier: recommendation.tier,
            };
          }
        }
      }

      if (promptText) {
        const skillContexts = injectSkillContext(promptText);
        if (skillContexts.length > 0) {
          enrichment.skillContext = skillContexts;
        }
      }

      const result =
        Object.keys(enrichment).length > 0
          ? { ...task, _enrichment: enrichment }
          : task;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
