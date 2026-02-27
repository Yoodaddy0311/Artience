/**
 * Claude CLI subprocess runner.
 * Executes `claude -p` and streams JSON output.
 */

import { spawn, type ChildProcess } from "node:child_process";

export interface ClaudeRunnerOptions {
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeoutMs?: number;
}

export interface ClaudeResult {
  success: boolean;
  output: string;
  exitCode: number | null;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ProgressEvent {
  state: "THINKING" | "CODING" | "DONE" | "ERROR";
  partial?: string;
}

/**
 * Run `claude -p "<prompt>"` as a subprocess and stream results.
 */
export async function runClaude(
  prompt: string,
  options: ClaudeRunnerOptions = {},
  onProgress?: ProgressCallback,
): Promise<ClaudeResult> {
  const { maxTurns = 10, maxBudgetUsd, timeoutMs = 300000 } = options;

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--max-turns",
    String(maxTurns),
  ];

  if (maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(maxBudgetUsd));
  }

  return new Promise((resolve) => {
    let proc: ChildProcess;
    let output = "";
    let timedOut = false;

    try {
      proc = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to spawn claude";
      onProgress?.({ state: "ERROR" });
      resolve({ success: false, output: message, exitCode: null });
      return;
    }

    onProgress?.({ state: "THINKING" });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      onProgress?.({ state: "ERROR" });
    }, timeoutMs);

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;

      // Try to parse streamed JSON lines for progress
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "assistant" && parsed.content) {
            onProgress?.({ state: "CODING", partial: line });
          }
        } catch {
          // Not JSON - append raw text
          onProgress?.({ state: "CODING", partial: line });
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          success: false,
          output: `Timeout after ${timeoutMs}ms\n${output}`,
          exitCode: code,
        });
        return;
      }

      const success = code === 0;
      onProgress?.({ state: success ? "DONE" : "ERROR" });

      resolve({ success, output, exitCode: code });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      onProgress?.({ state: "ERROR" });
      resolve({
        success: false,
        output: `Spawn error: ${err.message}\n${output}`,
        exitCode: null,
      });
    });
  });
}
