/**
 * MCP Resource: room-state
 * Exposes the real-time room state as a readable resource.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerRoomState(
  server: McpServer,
  getBridge: () => WsBridge | null,
): void {
  server.resource(
    "room-state",
    "dokba://room/state",
    {
      description: "Current state of the connected Artifarm Town room",
      mimeType: "application/json",
    },
    async (uri) => {
      const bridge = getBridge();

      const state = bridge?.isConnected
        ? bridge.roomState
        : { connected: false, message: "Not connected to any room" };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    },
  );
}
