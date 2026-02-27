/**
 * MCP Resource: task-queue
 * Exposes the pending task queue as a readable resource.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerTaskQueue(
  server: McpServer,
  getBridge: () => WsBridge | null,
): void {
  server.resource(
    "task-queue",
    "dokba://room/tasks",
    {
      description: "Pending tasks waiting to be processed",
      mimeType: "application/json",
    },
    async (uri) => {
      const bridge = getBridge();

      const tasks = bridge?.isConnected
        ? bridge.taskQueue
        : [];

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              { count: tasks.length, tasks },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
