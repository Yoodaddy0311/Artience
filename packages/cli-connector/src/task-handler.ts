/**
 * Task handler: receives tasks from server, runs Claude, sends results back.
 */

import { type Connector, type ServerMessage } from "./connector.js";
import { runClaude, type ClaudeRunnerOptions } from "./claude-runner.js";

export interface TaskHandlerOptions {
  claudeOptions?: ClaudeRunnerOptions;
}

/**
 * Register task handling on a connector.
 * Listens for CHAT_COMMAND messages and executes Claude.
 */
export function registerTaskHandler(
  connector: Connector,
  options: TaskHandlerOptions = {},
): void {
  connector.onMessage(async (msg: ServerMessage) => {
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
  msg: ServerMessage,
  options: TaskHandlerOptions,
): Promise<void> {
  const agent = (msg.target_agent as string) ?? "unknown";
  const prompt = (msg.text as string) ?? "";
  const taskId = msg.taskId as string | undefined;

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
  });

  const result = await runClaude(prompt, options.claudeOptions, (progress) => {
    connector.send({
      type: "AGENT_STATE_CHANGE",
      agentId: agent,
      state: progress.state,
    });
  });

  // Send result back
  connector.send({
    type: "TASK_RESULT",
    agent,
    taskId,
    success: result.success,
    output: result.output,
  });

  // Also send as TASK_ASSIGNED for backward compatibility with existing frontend
  connector.send({
    type: "TASK_ASSIGNED",
    agent,
    taskContent: result.output,
  });

  // Return to IDLE
  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId: agent,
    state: result.success ? "SUCCESS" : "ERROR",
  });

  setTimeout(() => {
    connector.send({
      type: "AGENT_STATE_CHANGE",
      agentId: agent,
      state: "IDLE",
    });
  }, 2000);

  console.log(
    `[dokba] Task completed (success=${result.success}, exit=${result.exitCode})`,
  );
}

async function handleTaskAssign(
  connector: Connector,
  msg: ServerMessage,
  options: TaskHandlerOptions,
): Promise<void> {
  const taskId = msg.taskId as string;
  const prompt = (msg.prompt as string) ?? "";
  const agentId = (msg.agentId as string) ?? "unknown";

  if (!prompt) {
    console.warn("[dokba] Received empty TASK_ASSIGN, ignoring");
    return;
  }

  console.log(`[dokba] Task ${taskId} assigned: ${prompt.slice(0, 80)}...`);

  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId,
    state: "THINKING",
  });

  const result = await runClaude(prompt, options.claudeOptions, (progress) => {
    connector.send({
      type: "TASK_PROGRESS",
      taskId,
      agentId,
      state: progress.state,
      partial: progress.partial,
    });
  });

  connector.send({
    type: "TASK_RESULT",
    taskId,
    agentId,
    success: result.success,
    output: result.output,
  });

  connector.send({
    type: "AGENT_STATE_CHANGE",
    agentId,
    state: "IDLE",
  });
}
