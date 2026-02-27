#!/usr/bin/env node

/**
 * @dokba/cli - Connect Claude Code to Artifarm Town
 *
 * Usage:
 *   dokba login --token <user-token> [--server <url>] [--room <room-code>]
 *   dokba connect --room <room-code> [--token <user-token>] [--server <url>]
 *   dokba start [--room <room-code>] [--server <url>]
 *   dokba stop
 *   dokba status
 */

import { Command } from "commander";
import { Connector } from "./connector.js";
import { registerTaskHandler } from "./task-handler.js";
import { validateToken, validateRoom } from "./auth.js";
import { loadConfig, saveConfig, getConfigPath } from "./config.js";
import { startDaemon, stopDaemon, getDaemonStatus } from "./daemon.js";
import { migrateToMcp } from "./migrate.js";

const program = new Command();

program
  .name("dokba")
  .description("Connect your Claude Code to Artifarm Town")
  .version("0.1.0");

// ── login ────────────────────────────────────────────
program
  .command("login")
  .description("Save authentication token and connection settings")
  .requiredOption("-t, --token <user-token>", "Authentication token")
  .option("-s, --server <url>", "Artifarm server URL")
  .option("-r, --room <room-code>", "Default room code")
  .option("--max-budget <usd>", "Max budget per task in USD")
  .action((opts) => {
    const updates: Record<string, unknown> = { token: opts.token };

    if (opts.server) updates.serverUrl = opts.server;
    if (opts.room) updates.roomCode = opts.room;
    if (opts.maxBudget)
      updates.maxBudgetPerTask = parseFloat(opts.maxBudget);

    const config = saveConfig(updates);
    console.log("[dokba] Login saved successfully.");
    console.log(`  Config: ${getConfigPath()}`);
    console.log(`  Server: ${config.serverUrl}`);
    console.log(`  Room:   ${config.roomCode || "(not set)"}`);
    console.log(`  Token:  ${config.token.slice(0, 8)}...`);
  });

// ── connect ──────────────────────────────────────────
program
  .command("connect")
  .description("Connect to an Artifarm room and listen for tasks")
  .option("-r, --room <room-code>", "Room code to join")
  .option("-t, --token <user-token>", "Authentication token")
  .option("-s, --server <url>", "Artifarm server URL")
  .option("--max-turns <n>", "Max Claude conversation turns", "10")
  .option("--max-budget <usd>", "Max budget in USD per task")
  .option("--timeout <ms>", "Task timeout in milliseconds", "300000")
  .action(async (opts) => {
    // Merge CLI args with cached config
    const config = loadConfig();
    const token = opts.token ?? config.token;
    const room = opts.room ?? config.roomCode;
    const server = opts.server ?? config.serverUrl;
    const { maxTurns, maxBudget, timeout } = opts;

    // Validate inputs
    if (!token || !validateToken(token)) {
      console.error(
        '[dokba] Error: No valid token. Provide --token or run "dokba login" first.',
      );
      process.exit(1);
    }

    if (!room || !validateRoom(room)) {
      console.error(
        "[dokba] Error: No valid room code. Provide --room or set it via login.",
      );
      process.exit(1);
    }

    const connector = new Connector({
      serverUrl: server,
      room,
      token,
    });

    // Register task handler
    registerTaskHandler(connector, {
      claudeOptions: {
        maxTurns: parseInt(maxTurns, 10),
        maxBudgetUsd: maxBudget
          ? parseFloat(maxBudget)
          : config.maxBudgetPerTask || undefined,
        timeoutMs: parseInt(timeout, 10),
      },
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log("\n[dokba] Disconnecting...");
      connector.disconnect();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Connect
    try {
      await connector.connect();
      console.log(`[dokba] Listening for tasks in room "${room}"...`);
      console.log("[dokba] Press Ctrl+C to disconnect");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      console.error(`[dokba] Failed to connect: ${message}`);
      process.exit(1);
    }
  });

// ── start (daemon) ───────────────────────────────────
program
  .command("start")
  .description("Start the Dokba connector as a background daemon")
  .option("-r, --room <room-code>", "Room code to join")
  .option("-s, --server <url>", "Artifarm server URL")
  .action((opts) => {
    const result = startDaemon({
      room: opts.room,
      server: opts.server,
    });

    if (result.success) {
      console.log(`[dokba] ${result.message}`);
    } else {
      console.error(`[dokba] ${result.message}`);
      process.exit(1);
    }
  });

// ── stop (daemon) ────────────────────────────────────
program
  .command("stop")
  .description("Stop the background Dokba daemon")
  .action(() => {
    const result = stopDaemon();
    if (result.success) {
      console.log(`[dokba] ${result.message}`);
    } else {
      console.error(`[dokba] ${result.message}`);
      process.exit(1);
    }
  });

// ── status ───────────────────────────────────────────
program
  .command("status")
  .description("Show current connection status and configuration")
  .action(() => {
    const { running, pid, config } = getDaemonStatus();

    console.log("[dokba] Status");
    console.log("  ────────────────────────────────");
    console.log(
      `  Daemon:   ${running ? `Running (PID ${pid})` : "Not running"}`,
    );
    console.log(`  Server:   ${config.serverUrl}`);
    console.log(`  Room:     ${config.roomCode || "(not set)"}`);
    console.log(
      `  Token:    ${config.token ? config.token.slice(0, 8) + "..." : "(not set)"}`,
    );
    console.log(`  Budget:   $${config.maxBudgetPerTask}/task`);
    console.log(
      `  Auto-accept: ${config.autoAcceptTasks ? "Yes" : "No"}`,
    );
    console.log(`  Config:   ${getConfigPath()}`);
  });

// ── migrate (CLI → MCP) ─────────────────────────────
program
  .command("migrate")
  .description("Generate .mcp.json from CLI config (CLI → MCP migration)")
  .option("-o, --output <dir>", "Output directory for .mcp.json")
  .option("-f, --force", "Overwrite existing .mcp.json dokba entry")
  .action((opts) => {
    const result = migrateToMcp(opts.output, opts.force ?? false);
    if (result.success) {
      console.log(`[dokba] ${result.message}`);
    } else {
      console.error(`[dokba] ${result.message}`);
      process.exit(1);
    }
  });

program.parse();
