/**
 * ChatSessionManager — stream-json 양방향 I/O 기반 Claude 채팅 세션 관리.
 *
 * PTY stdout ANSI 파싱 대신 구조화된 JSON stream으로
 * text/tool_use/tool_result/thinking/result를 완벽히 분리한다.
 *
 * Primary:  --output-format stream-json + --input-format stream-json (양방향)
 * Fallback: -p + --output-format stream-json (단방향, 매 호출 spawn)
 */

import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Store from 'electron-store';
import { AGENT_PERSONAS, buildSystemPrompt } from '../src/data/agent-personas';

// Re-export for convenience
export { AGENT_PERSONAS, buildSystemPrompt };

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChatSession {
    agentId: string;
    agentName: string;
    proc: ChildProcess | null;
    sessionId?: string; // Claude session ID for --resume
    sessionKey: string;
    status: 'idle' | 'busy' | 'closed';
    promptFilePath: string; // temp file for system prompt
    cwd: string;
    extraArgs?: string[];
    extraArgsSignature: string;
    mode: 'stream-json' | 'fallback';
    queue: string[];
}

export interface StreamEvent {
    type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'result' | 'error';
    content: string;
    toolName?: string;
    toolUseId?: string;
    sessionId?: string;
    partial?: boolean; // token-by-token partial
}

// ── Session store for --resume persistence ─────────────────────────────────

const sessionStore = new Store({
    name: 'dokba-chat-sessions',
    defaults: {
        sessionIds: {} as Record<string, string>,
    },
});

const SESSION_STARTUP_GRACE_MS = 150;

function normalizeSessionCwd(cwd: string): string {
    const normalized = path.resolve(cwd);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function serializeExtraArgs(extraArgs?: string[]): string {
    return JSON.stringify(extraArgs ?? []);
}

export function buildChatSessionKey(
    agentId: string,
    cwd: string,
    extraArgs?: string[],
): string {
    return [
        agentId,
        normalizeSessionCwd(cwd),
        serializeExtraArgs(extraArgs),
    ].join('::');
}

// ── ChatSessionManager ─────────────────────────────────────────────────────

export class ChatSessionManager extends EventEmitter {
    private sessions = new Map<string, ChatSession>();

    /**
     * Create a long-lived claude process with stream-json I/O.
     * Attempts --input-format stream-json first; if spawn fails,
     * the session remains available for fallback per-message spawns.
     */
    async createSession(
        agentId: string,
        agentName: string,
        cwd: string,
        extraArgs?: string[],
    ): Promise<string> {
        const sessionKey = buildChatSessionKey(agentId, cwd, extraArgs);
        const extraArgsSignature = serializeExtraArgs(extraArgs);

        // Reuse existing live session
        const existing = this.sessions.get(agentId);
        if (existing && existing.status !== 'closed') {
            if (existing.sessionKey === sessionKey) {
                return agentId;
            }

            this.closeSession(agentId);
        }

        const existingScoped = this.sessions.get(sessionKey);
        if (existingScoped && existingScoped.status !== 'closed') {
            return agentId;
        }

        const promptPath = this.writeSystemPrompt(agentName);

        // -p is REQUIRED for --output-format/--input-format/--include-partial-messages to work.
        // We send a short init prompt; subsequent messages go via stdin (stream-json).
        const args = [
            '-p',
            '안녕',
            '--output-format',
            'stream-json',
            '--input-format',
            'stream-json',
            '--system-prompt-file',
            promptPath,
            '--include-partial-messages',
            '--verbose',
        ];

        // Append extra CLI args (e.g. --agents for CTO team sessions)
        if (extraArgs && extraArgs.length > 0) {
            args.push(...extraArgs);
        }

        // Resume if we have a saved session ID
        const savedSessionId = this.getSavedSessionId(sessionKey);
        if (savedSessionId) {
            args.push('--resume', savedSessionId);
            console.log(
                `[ChatSessionManager] Resuming session ${savedSessionId} for ${agentId} (${sessionKey})`,
            );
        }

        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        env.FORCE_COLOR = '0';

        try {
            console.log(
                `[ChatSessionManager] Spawning claude for ${agentId} with args:`,
                args.filter((a) => !a.startsWith('{')).join(' '),
            );
            const proc = spawn('claude', args, {
                cwd,
                env,
                shell: true,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const session: ChatSession = {
                agentId,
                agentName,
                proc,
                sessionKey,
                status: 'idle',
                promptFilePath: promptPath,
                cwd,
                extraArgs: extraArgs ? [...extraArgs] : undefined,
                extraArgsSignature,
                mode: 'stream-json',
                queue: [],
            };

            // Handle spawn error (e.g. --input-format not supported)
            const spawnError = await this.waitForSpawnOrError(
                proc,
                SESSION_STARTUP_GRACE_MS,
            );
            if (spawnError) {
                console.warn(
                    `[ChatSessionManager] stream-json spawn failed for ${agentId}:`,
                    spawnError,
                );
                // Create a fallback session placeholder (keep promptPath for fallback use)
                const fallbackSession: ChatSession = {
                    agentId,
                    agentName,
                    proc: null,
                    sessionKey,
                    status: 'idle',
                    promptFilePath: promptPath,
                    cwd,
                    extraArgs: extraArgs ? [...extraArgs] : undefined,
                    extraArgsSignature,
                    mode: 'fallback',
                    queue: [],
                };
                this.registerSession(fallbackSession);
                console.log(
                    `[ChatSessionManager] Fallback mode for ${agentId}`,
                );
                return agentId;
            }

            this.registerSession(session);
            this.setupOutputParser(session);

            console.log(
                `[ChatSessionManager] Session created for ${agentId} (stream-json mode)`,
            );
            return agentId;
        } catch (err: any) {
            console.warn(
                `[ChatSessionManager] Failed to create session for ${agentId}:`,
                err.message,
            );
            // Register fallback session
            const fallbackSession: ChatSession = {
                agentId,
                agentName,
                proc: null,
                sessionKey,
                status: 'idle',
                promptFilePath: promptPath,
                cwd,
                extraArgs: extraArgs ? [...extraArgs] : undefined,
                extraArgsSignature,
                mode: 'fallback',
                queue: [],
            };
            this.registerSession(fallbackSession);
            return agentId;
        }
    }

    /**
     * Send a user message to the claude process.
     * stream-json mode: write JSON to stdin.
     * fallback mode: spawn a new -p process per message.
     */
    sendMessage(agentId: string, message: string): void {
        const session = this.sessions.get(agentId);
        if (!session || session.status === 'closed') {
            this.emit('stream', agentId, {
                type: 'error',
                content: 'No active session. Create a session first.',
            } as StreamEvent);
            return;
        }

        session.queue.push(message);
        this.drainSessionQueue(session);
    }

    /**
     * Close and clean up a session.
     */
    closeSession(agentId: string): void {
        const session = this.sessions.get(agentId);
        if (!session) return;

        session.status = 'closed';
        session.queue = [];

        if (session.proc && typeof session.proc.kill === 'function') {
            try {
                session.proc.kill();
            } catch {
                /* ignore */
            }
        }

        this.cleanupPromptFile(session.promptFilePath);
        this.unregisterSession(session);
        this.emit('session:closed', agentId, 0);

        console.log(`[ChatSessionManager] Session closed for ${agentId}`);
    }

    /**
     * Get session info.
     */
    getSession(agentId: string): ChatSession | undefined {
        return this.sessions.get(agentId);
    }

    /**
     * Check if a session exists and is alive.
     */
    hasActiveSession(agentId: string): boolean {
        const s = this.sessions.get(agentId);
        return !!s && s.status !== 'closed';
    }

    /**
     * Close all sessions (app shutdown).
     */
    closeAll(): void {
        const uniqueAgentIds = new Set(
            [...this.sessions.values()].map((session) => session.agentId),
        );
        for (const agentId of uniqueAgentIds) {
            this.closeSession(agentId);
        }
    }

    // ── stream-json 양방향 모드 ────────────────────────────────────────────

    private sendViaStreamJson(session: ChatSession, message: string): void {
        const input = JSON.stringify({
            type: 'user',
            message: { content: [{ type: 'text', text: message }] },
        });

        if (!session.proc?.stdin?.writable) return;
        session.proc.stdin.write(input + '\n');
    }

    // ── fallback: -p + --output-format stream-json (매 호출 spawn) ─────────

    private sendViaFallback(session: ChatSession, message: string): void {
        const basePrompt = buildSystemPrompt(session.agentName);
        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        env.FORCE_COLOR = '0';

        const args = [
            '-p',
            message,
            '--output-format',
            'stream-json',
            '--verbose',
        ];

        if (session.extraArgs && session.extraArgs.length > 0) {
            args.push(...session.extraArgs);
        }

        // --resume: reuse session context if available
        if (session.sessionId) {
            args.push('--resume', session.sessionId);
        } else {
            args.push('--system-prompt', basePrompt);
        }

        const proc = spawn('claude', args, {
            cwd: session.cwd,
            env,
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let buffer = '';

        proc.stdout?.on('data', (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    this.handleMessage(session, msg);
                } catch {
                    /* skip non-JSON */
                }
            }
        });

        proc.stderr?.on('data', () => {
            /* ignore progress indicators */
        });

        proc.on('error', (err) => {
            this.emit('stream', session.agentId, {
                type: 'error',
                content: err.message,
                sessionId: session.sessionId,
            } as StreamEvent);
            this.finishResponse(session);
        });

        proc.on('exit', (code) => {
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const msg = JSON.parse(buffer.trim());
                    this.handleMessage(session, msg);
                } catch {
                    /* skip */
                }
            }

            this.emit('response:end', session.agentId);
            this.finishResponse(session, false);

            if (code !== 0 && code !== null) {
                console.warn(
                    `[ChatSessionManager] Fallback process exited with code ${code} for ${session.agentId}`,
                );
            }
        });
    }

    // ── stdout JSON stream parser ──────────────────────────────────────────

    private setupOutputParser(session: ChatSession): void {
        if (!session.proc) return;
        let buffer = '';

        session.proc.stdout?.on('data', (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line in buffer

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const msg = JSON.parse(line);
                    this.handleMessage(session, msg);
                } catch {
                    /* skip non-JSON lines */
                }
            }
        });

        session.proc!.stderr?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                console.log(
                    `[ChatSessionManager] stderr(${session.agentId}):`,
                    text.slice(0, 500),
                );
            }
        });

        session.proc!.on('error', (err) => {
            console.error(
                `[ChatSessionManager] Process error for ${session.agentId}:`,
                err.message,
            );
            this.emit('stream', session.agentId, {
                type: 'error',
                content: err.message,
                sessionId: session.sessionId,
            } as StreamEvent);
            session.mode = 'fallback';
            session.proc = null;
            this.finishResponse(session);
        });

        session.proc!.on('exit', (code) => {
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const msg = JSON.parse(buffer.trim());
                    this.handleMessage(session, msg);
                } catch {
                    /* skip */
                }
            }

            // Downgrade to fallback mode instead of closing entirely
            session.mode = 'fallback';
            session.proc = null;
            this.cleanupPromptFile(session.promptFilePath);
            this.emit('response:end', session.agentId);
            this.finishResponse(session, false);

            console.log(
                `[ChatSessionManager] Process exited for ${session.agentId} (code ${code}), switched to fallback mode`,
            );
        });
    }

    // ── Message handler: parse typed JSON events ───────────────────────────

    private handleMessage(session: ChatSession, msg: any): void {
        // Capture session ID from any message
        if (msg.session_id) {
            session.sessionId = msg.session_id;
            this.saveSessionId(session.sessionKey, msg.session_id);
        }

        // Token-by-token streaming delta
        if (msg.type === 'content_block_delta') {
            if (msg.delta?.type === 'thinking_delta' && msg.delta?.thinking) {
                this.emit('stream', session.agentId, {
                    type: 'thinking',
                    content: msg.delta.thinking,
                    sessionId: session.sessionId,
                    partial: true,
                } as StreamEvent);
            } else if (msg.delta?.text) {
                this.emit('stream', session.agentId, {
                    type: 'text',
                    content: msg.delta.text,
                    sessionId: session.sessionId,
                    partial: true,
                } as StreamEvent);
            }
            return;
        }

        // Full assistant message (contains complete content blocks)
        if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
                if (block.type === 'text') {
                    this.emit('stream', session.agentId, {
                        type: 'text',
                        content: block.text,
                        sessionId: session.sessionId,
                    } as StreamEvent);
                } else if (block.type === 'tool_use') {
                    this.emit('stream', session.agentId, {
                        type: 'tool_use',
                        content: JSON.stringify(block.input),
                        toolName: block.name,
                        toolUseId: block.id,
                        sessionId: session.sessionId,
                    } as StreamEvent);
                } else if (block.type === 'thinking') {
                    this.emit('stream', session.agentId, {
                        type: 'thinking',
                        content: block.thinking || '',
                        sessionId: session.sessionId,
                    } as StreamEvent);
                }
            }
            return;
        }

        // Tool result
        if (msg.type === 'tool_result') {
            this.emit('stream', session.agentId, {
                type: 'tool_result',
                content:
                    typeof msg.content === 'string'
                        ? msg.content
                        : JSON.stringify(msg.content || ''),
                sessionId: session.sessionId,
            } as StreamEvent);
            return;
        }

        // Final result — marks end of response
        if (msg.type === 'result') {
            this.emit('stream', session.agentId, {
                type: 'result',
                content: msg.result || '',
                sessionId: session.sessionId,
            } as StreamEvent);
            this.emit('response:end', session.agentId);
            this.finishResponse(session, false);
            return;
        }
    }

    // ── Helper: write system prompt to temp file ───────────────────────────

    private writeSystemPrompt(agentName: string): string {
        const promptText = buildSystemPrompt(agentName);
        const tmpDir = path.join(os.tmpdir(), 'dokba-prompts');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const filePath = path.join(
            tmpDir,
            `${agentName.toLowerCase()}-${Date.now()}.txt`,
        );
        fs.writeFileSync(filePath, promptText, 'utf-8');
        return filePath;
    }

    private cleanupPromptFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch {
            /* ignore */
        }
    }

    // ── Helper: session ID persistence ─────────────────────────────────────

    private getSavedSessionId(sessionKey: string): string | undefined {
        const ids = sessionStore.get('sessionIds') as Record<string, string>;
        return ids[sessionKey];
    }

    private saveSessionId(sessionKey: string, sessionId: string): void {
        const ids = sessionStore.get('sessionIds') as Record<string, string>;
        ids[sessionKey] = sessionId;
        sessionStore.set('sessionIds', ids);
    }

    private registerSession(session: ChatSession): void {
        this.sessions.set(session.agentId, session);
        this.sessions.set(session.sessionKey, session);
    }

    private unregisterSession(session: ChatSession): void {
        const mappedByAgent = this.sessions.get(session.agentId);
        if (mappedByAgent === session) {
            this.sessions.delete(session.agentId);
        }

        const mappedByKey = this.sessions.get(session.sessionKey);
        if (mappedByKey === session) {
            this.sessions.delete(session.sessionKey);
        }
    }

    private drainSessionQueue(session: ChatSession): void {
        if (session.status !== 'idle' || session.queue.length === 0) {
            return;
        }

        const nextMessage = session.queue.shift();
        if (!nextMessage) return;

        session.status = 'busy';

        if (session.mode === 'stream-json' && session.proc?.stdin?.writable) {
            this.sendViaStreamJson(session, nextMessage);
        } else {
            this.sendViaFallback(session, nextMessage);
        }
    }

    private finishResponse(
        session: ChatSession,
        emitEnd = true,
        emitClosed = false,
    ): void {
        if (session.status === 'closed') {
            return;
        }

        session.status = 'idle';

        if (emitEnd) {
            this.emit('response:end', session.agentId);
        }

        if (emitClosed) {
            this.emit('session:closed', session.agentId, -1);
        }

        this.drainSessionQueue(session);
    }

    // ── Helper: wait briefly to detect spawn failure ───────────────────────

    private waitForSpawnOrError(
        proc: ChildProcess,
        graceMs: number,
    ): Promise<string | null> {
        return new Promise((resolve) => {
            let settled = false;
            let startupTimer: ReturnType<typeof setTimeout> | null = null;

            const cleanup = () => {
                proc.removeListener('error', onError);
                proc.removeListener('exit', onExit);
                proc.removeListener('spawn', onSpawn);
                if (startupTimer) {
                    clearTimeout(startupTimer);
                    startupTimer = null;
                }
            };

            const finish = (result: string | null) => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(result);
            };

            const onError = (err: Error) => {
                finish(err.message);
            };

            const onExit = (
                code: number | null,
                signal: NodeJS.Signals | null,
            ) => {
                const reason =
                    code !== null
                        ? `Process exited with code ${code}`
                        : `Process exited with signal ${signal ?? 'unknown'}`;
                finish(reason);
            };

            const onSpawn = () => {
                if (startupTimer) {
                    clearTimeout(startupTimer);
                }

                startupTimer = setTimeout(() => {
                    if (proc.exitCode != null || proc.killed) {
                        const exitReason =
                            proc.exitCode != null
                                ? `Process exited with code ${proc.exitCode}`
                                : 'Process exited during startup';
                        finish(exitReason);
                        return;
                    }

                    finish(null);
                }, graceMs);
            };

            proc.once('error', onError);
            proc.once('exit', onExit);
            proc.once('spawn', onSpawn);

            if (proc.pid) {
                onSpawn();
            }
        });
    }
}
