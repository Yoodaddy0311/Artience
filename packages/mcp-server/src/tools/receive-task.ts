/**
 * MCP Tool: receive-task
 * Receives the next pending task from the server queue.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerReceiveTask(
  server: McpServer,
  getBridge: () => WsBridge | null,
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

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(task, null, 2),
          },
        ],
      };
    },
  );
}
