/**
 * MCP Tool: connect-room
 * Connects to an Artifarm room via WebSocket.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerConnectRoom(
  server: McpServer,
  getBridge: () => WsBridge | null,
  setBridge: (bridge: WsBridge) => void,
  createBridge: (serverUrl: string, room: string, token: string) => WsBridge,
): void {
  server.tool(
    "connect-room",
    "Connect to an Artifarm Town room via WebSocket",
    {
      serverUrl: z
        .string()
        .describe("Artifarm server URL (e.g. http://localhost:8000)"),
      room: z.string().describe("Room code to join"),
      token: z.string().describe("Authentication token"),
    },
    async ({ serverUrl, room, token }) => {
      const existing = getBridge();
      if (existing?.isConnected) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Already connected to a room. Disconnect first or use the existing connection.",
            },
          ],
        };
      }

      try {
        const bridge = createBridge(serverUrl, room, token);
        await bridge.connect();
        setBridge(bridge);

        return {
          content: [
            {
              type: "text" as const,
              text: `Connected to room "${room}" on ${serverUrl}. Ready to receive tasks and interact with agents.`,
            },
          ],
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Connection failed";
        return {
          content: [{ type: "text" as const, text: `Failed to connect: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
