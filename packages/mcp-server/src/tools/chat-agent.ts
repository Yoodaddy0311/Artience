/**
 * MCP Tool: chat-agent
 * Sends a chat message to an agent in the Artifarm Town.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WsBridge } from "../transport/ws-bridge.js";

export function registerChatAgent(
  server: McpServer,
  getBridge: () => WsBridge | null,
): void {
  server.tool(
    "chat-agent",
    "Send a chat message to an agent in the Artifarm Town",
    {
      agentId: z.string().describe("Target agent ID (e.g. a01, a02)"),
      agentName: z
        .string()
        .optional()
        .describe("Agent display name (e.g. Sera, Luna)"),
      agentRole: z
        .string()
        .optional()
        .describe("Agent role (e.g. developer, designer)"),
      content: z.string().describe("Chat message content"),
    },
    async ({ agentId, agentName, agentRole, content }) => {
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

      // Send CHAT_MESSAGE (compatible with ws.py protocol)
      bridge.send({
        type: "CHAT_MESSAGE",
        agentId,
        agentName: agentName ?? agentId,
        agentRole: agentRole ?? "",
        content,
      });

      // Wait for CHAT_RESPONSE
      try {
        const response = await bridge.waitForMessage(
          (msg) =>
            msg.type === "CHAT_RESPONSE" && msg.agentId === agentId,
          15000,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `[${agentName ?? agentId}]: ${response.content as string}`,
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Message sent to ${agentName ?? agentId}, but no response received within timeout.`,
            },
          ],
        };
      }
    },
  );
}
