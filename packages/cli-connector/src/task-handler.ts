/**
 * Task handler: receives tasks from server, runs Claude, sends results back.
 *
 * Protocol: All WS messages use @dokba/shared-types TownWsMessage types.
 * Both CHAT_COMMAND (legacy) and TASK_ASSIGN (new) are supported.
 *
 * Migration note (CLI→MCP):
 *   - CLI mode: This handler runs Claude as a subprocess via claude-runner.ts
 *   - MCP mode: Claude handles tasks natively — the MCP server uses
 *     receive-task + submit-result tools instead of this handler.
 *   - Both modes send the same WS message types to the server.
 */

import { type Connector } from "./connector.js";
import { runClaude, type ClaudeRunnerOptions } from "./claude-runner.js";
import type {
  TownWsMessage,
  ChatCommand,
  TaskAssign,
  AgentStateChange,
  TaskResult,
  TaskAssigned,
  TaskProgress,
} from "@dokba/shared-types";

export interface TaskHandlerOptions {
  claudeOptions?: ClaudeRunnerOptions;
}

/**
 * Register task handling on a connector.
 * Listens for CHAT_COMMAND and TASK_ASSIGN messages, executes Claude,
 * and sends results back using the unified protocol.
 */
export function registerTaskHandler(
  connector: Connector,
  options: TaskHandlerOptions = {},
): void {
  connector.onMessage(async (msg: TownWsMessage) => {
    if (msg.type === "CHAT_COMMAND") {
      await handleChatCommand(connector, msg, options);
    }

    if (msg.type === "TASK_ASSIGN") {
      await handleTaskAssign(connector, msg, options);
    }
  });
}

async function handleChatCommand(
  connector: Connector,
  msg: ChatCommand,
  options: TaskHandlerOptions,
): Promise<void> {
  const agent = msg.target_agent ?? "unknown";
  const prompt = msg.text ?? "";
  const taskId = msg.taskId;

  if (!prompt) {
    console.warn("[dokba] Received empty CHAT_COMMAND, ignoring");
    return;
  }

  console.log(`[dokba] Task received for agent "${agent}": ${prompt.slice(0, 80)}...`);

  // Notify server: thinking
  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId: agent,
    state: "THINKING",
  } satisfies AgentStateChange);

  const result = await runClaude(prompt, options.claudeOptions, (progress) => {
    connector.send({
      type: "AGENT_STATE_CHANGE",
      agentId: agent,
      state: progress.state,
    } satisfies AgentStateChange);
  });

  // Send typed result
  connector.send({
    type: "TASK_RESULT",
    agent,
    taskId,
    success: result.success,
    output: result.output,
  } satisfies TaskResult);

  // Also send TASK_ASSIGNED for backward compatibility with existing frontend
  connector.send({
    type: "TASK_ASSIGNED",
    agent,
    taskContent: result.output,
  } satisfies TaskAssigned);

  // Transition: SUCCESS/ERROR → IDLE
  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId: agent,
    state: result.success ? "SUCCESS" : "ERROR",
  } satisfies AgentStateChange);

  setTimeout(() => {
    connector.send({
      type: "AGENT_STATE_CHANGE",
      agentId: agent,
      state: "IDLE",
    } satisfies AgentStateChange);
  }, 2000);

  console.log(
    `[dokba] Task completed (success=${result.success}, exit=${result.exitCode})`,
  );
}

async function handleTaskAssign(
  connector: Connector,
  msg: TaskAssign,
  options: TaskHandlerOptions,
): Promise<void> {
  const { taskId, prompt, agentId } = msg;

  if (!prompt) {
    console.warn("[dokba] Received empty TASK_ASSIGN, ignoring");
    return;
  }

  console.log(`[dokba] Task ${taskId} assigned: ${prompt.slice(0, 80)}...`);

  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId,
    state: "THINKING",
  } satisfies AgentStateChange);

  const result = await runClaude(prompt, options.claudeOptions, (progress) => {
    connector.send({
      type: "TASK_PROGRESS",
      taskId,
      agentId,
      state: progress.state,
      partial: progress.partial,
    } satisfies TaskProgress);
  });

  connector.send({
    type: "TASK_RESULT",
    taskId,
    agentId,
    success: result.success,
    output: result.output,
  } satisfies TaskResult);

  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId,
    state: "IDLE",
  } satisfies AgentStateChange);
}
