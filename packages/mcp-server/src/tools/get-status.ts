/**
 * MCP Tool: get-status
 * Retrieves the current state of the Artifarm Town room.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerGetStatus(
  server: McpServer,
  getBridge: () => WsBridge | null,
): void {
  server.tool(
    "get-status",
    "Get the current status of the connected Artifarm Town room",
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

      const status = {
        connected: bridge.isConnected,
        roomState: bridge.roomState,
        pendingTasks: bridge.taskQueue.length,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    },
  );
}
