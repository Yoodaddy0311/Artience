/**
 * MCP Tool: submit-result
 * Submits a task result back to the Artifarm server.
 *
 * Protocol: Uses @dokba/shared-types message types.
 * Sends TASK_RESULT + TASK_ASSIGNED (compat) + AGENT_STATE_CHANGE.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";
import type {
  TaskResult,
  TaskAssigned,
  AgentStateChange,
} from "@dokba/shared-types";

export function registerSubmitResult(
  server: McpServer,
  getBridge: () => WsBridge | null,
): void {
  server.tool(
    "submit-result",
    "Submit a task result to the Artifarm server",
    {
      taskId: z.string().optional().describe("Task ID (if applicable)"),
      agentId: z.string().describe("Agent ID submitting the result"),
      content: z.string().describe("Result content to submit"),
      success: z
        .boolean()
        .default(true)
        .describe("Whether the task completed successfully"),
    },
    async ({ taskId, agentId, content, success }) => {
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

      // Send typed task result
      const sent = bridge.send({
        type: "TASK_RESULT",
        taskId,
        agentId,
        success,
        output: content,
      } satisfies TaskResult);

      // TASK_ASSIGNED for frontend backward compatibility
      bridge.send({
        type: "TASK_ASSIGNED",
        agent: agentId,
        taskContent: content,
      } satisfies TaskAssigned);

      // Update agent state
      bridge.send({
        type: "AGENT_STATE_CHANGE",
        agentId,
        state: success ? "SUCCESS" : "ERROR",
      } satisfies AgentStateChange);

      // Return to idle after delay
      setTimeout(() => {
        bridge.send({
          type: "AGENT_STATE_CHANGE",
          agentId,
          state: "IDLE",
        } satisfies AgentStateChange);
      }, 2000);

      if (sent) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Result submitted successfully for agent "${agentId}".${taskId ? ` Task ID: ${taskId}` : ""}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: "Failed to send result. Connection may be lost.",
          },
        ],
        isError: true,
      };
    },
  );
}
