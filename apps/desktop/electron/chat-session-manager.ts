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
    proc: ChildProcess;
    sessionId?: string;         // Claude session ID for --resume
    status: 'idle' | 'busy' | 'closed';
    promptFilePath: string;     // temp file for system prompt
    cwd: string;
    mode: 'stream-json' | 'fallback';
}

export interface StreamEvent {
    type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'result' | 'error';
    content: string;
    toolName?: string;
    toolUseId?: string;
    sessionId?: string;
    partial?: boolean;          // token-by-token partial
}

// ── Session store for --resume persistence ─────────────────────────────────

const sessionStore = new Store({
    name: 'dokba-chat-sessions',
    defaults: {
        sessionIds: {} as Record<string, string>,
    },
});

// ── ChatSessionManager ─────────────────────────────────────────────────────

export class ChatSessionManager extends EventEmitter {
    private sessions = new Map<string, ChatSession>();

    /**
     * Create a long-lived claude process with stream-json I/O.
     * Attempts --input-format stream-json first; if spawn fails,
     * the session remains available for fallback per-message spawns.
     */
    async createSession(agentId: string, agentName: string, cwd: string, extraArgs?: string[]): Promise<string> {
        // Reuse existing live session
        const existing = this.sessions.get(agentId);
        if (existing && existing.status !== 'closed') {
            return agentId;
        }

        const promptPath = this.writeSystemPrompt(agentName);

        // -p is REQUIRED for --output-format/--input-format/--include-partial-messages to work.
        // We send a short init prompt; subsequent messages go via stdin (stream-json).
        const args = [
            '-p', '안녕',
            '--output-format', 'stream-json',
            '--input-format', 'stream-json',
            '--system-prompt-file', promptPath,
            '--include-partial-messages',
            '--verbose',
        ];

        // Append extra CLI args (e.g. --agents for CTO team sessions)
        if (extraArgs && extraArgs.length > 0) {
            args.push(...extraArgs);
        }

        // Resume if we have a saved session ID
        const savedSessionId = this.getSavedSessionId(agentId);
        if (savedSessionId) {
            args.push('--resume', savedSessionId);
            console.log(`[ChatSessionManager] Resuming session ${savedSessionId} for ${agentId}`);
        }

        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        env.FORCE_COLOR = '0';

        try {
            console.log(`[ChatSessionManager] Spawning claude for ${agentId} with args:`, args.filter(a => !a.startsWith('{')).join(' '));
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
                status: 'idle',
                promptFilePath: promptPath,
                cwd,
                mode: 'stream-json',
            };

            // Handle spawn error (e.g. --input-format not supported)
            const spawnError = await this.waitForSpawnOrError(proc);
            if (spawnError) {
                console.warn(`[ChatSessionManager] stream-json spawn failed for ${agentId}:`, spawnError);
                // Create a fallback session placeholder (keep promptPath for fallback use)
                const fallbackSession: ChatSession = {
                    agentId,
                    agentName,
                    proc: null as any,
                    status: 'idle',
                    promptFilePath: promptPath,
                    cwd,
                    mode: 'fallback',
                };
                this.sessions.set(agentId, fallbackSession);
                console.log(`[ChatSessionManager] Fallback mode for ${agentId}`);
                return agentId;
            }

            this.sessions.set(agentId, session);
            this.setupOutputParser(session);

            console.log(`[ChatSessionManager] Session created for ${agentId} (stream-json mode)`);
            return agentId;
        } catch (err: any) {
            console.warn(`[ChatSessionManager] Failed to create session for ${agentId}:`, err.message);
            // Register fallback session
            const fallbackSession: ChatSession = {
                agentId,
                agentName,
                proc: null as any,
                status: 'idle',
                promptFilePath: promptPath,
                cwd,
                mode: 'fallback',
            };
            this.sessions.set(agentId, fallbackSession);
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

        session.status = 'busy';

        if (session.mode === 'stream-json' && session.proc?.stdin?.writable) {
            this.sendViaStreamJson(session, message);
        } else {
            this.sendViaFallback(session, message);
        }
    }

    /**
     * Close and clean up a session.
     */
    closeSession(agentId: string): void {
        const session = this.sessions.get(agentId);
        if (!session) return;

        session.status = 'closed';

        if (session.proc && typeof session.proc.kill === 'function') {
            try { session.proc.kill(); } catch { /* ignore */ }
        }

        this.cleanupPromptFile(session.promptFilePath);
        this.sessions.delete(agentId);
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
        for (const agentId of [...this.sessions.keys()]) {
            this.closeSession(agentId);
        }
    }

    // ── stream-json 양방향 모드 ────────────────────────────────────────────

    private sendViaStreamJson(session: ChatSession, message: string): void {
        const input = JSON.stringify({
            type: 'user',
            message: { content: [{ type: 'text', text: message }] },
        });

        session.proc.stdin!.write(input + '\n');
    }

    // ── fallback: -p + --output-format stream-json (매 호출 spawn) ─────────

    private sendViaFallback(session: ChatSession, message: string): void {
        const basePrompt = buildSystemPrompt(session.agentName);
        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;
        env.FORCE_COLOR = '0';

        const args = [
            '-p', message,
            '--output-format', 'stream-json',
            '--verbose',
        ];

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
                } catch { /* skip non-JSON */ }
            }
        });

        proc.stderr?.on('data', () => { /* ignore progress indicators */ });

        proc.on('error', (err) => {
            this.emit('stream', session.agentId, {
                type: 'error',
                content: err.message,
                sessionId: session.sessionId,
            } as StreamEvent);
            session.status = 'idle';
        });

        proc.on('exit', (code) => {
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const msg = JSON.parse(buffer.trim());
                    this.handleMessage(session, msg);
                } catch { /* skip */ }
            }

            session.status = 'idle';
            this.emit('response:end', session.agentId);

            if (code !== 0 && code !== null) {
                console.warn(`[ChatSessionManager] Fallback process exited with code ${code} for ${session.agentId}`);
            }
        });
    }

    // ── stdout JSON stream parser ──────────────────────────────────────────

    private setupOutputParser(session: ChatSession): void {
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
                } catch { /* skip non-JSON lines */ }
            }
        });

        session.proc.stderr?.on('data', (data: Buffer) => {
            const text = data.toString().trim();
            if (text) {
                console.log(`[ChatSessionManager] stderr(${session.agentId}):`, text.slice(0, 500));
            }
        });

        session.proc.on('error', (err) => {
            console.error(`[ChatSessionManager] Process error for ${session.agentId}:`, err.message);
            session.status = 'closed';
            this.emit('stream', session.agentId, {
                type: 'error',
                content: err.message,
                sessionId: session.sessionId,
            } as StreamEvent);
            this.emit('session:closed', session.agentId, -1);
        });

        session.proc.on('exit', (code) => {
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const msg = JSON.parse(buffer.trim());
                    this.handleMessage(session, msg);
                } catch { /* skip */ }
            }

            // Downgrade to fallback mode instead of closing entirely
            session.mode = 'fallback';
            session.status = 'idle';
            session.proc = null as any;
            this.emit('response:end', session.agentId);

            console.log(`[ChatSessionManager] Process exited for ${session.agentId} (code ${code}), switched to fallback mode`);
        });
    }

    // ── Message handler: parse typed JSON events ───────────────────────────

    private handleMessage(session: ChatSession, msg: any): void {
        // Capture session ID from any message
        if (msg.session_id) {
            session.sessionId = msg.session_id;
            this.saveSessionId(session.agentId, msg.session_id);
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
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
                sessionId: session.sessionId,
            } as StreamEvent);
            return;
        }

        // Final result — marks end of response
        if (msg.type === 'result') {
            session.status = 'idle';
            this.emit('stream', session.agentId, {
                type: 'result',
                content: msg.result || '',
                sessionId: session.sessionId,
            } as StreamEvent);
            this.emit('response:end', session.agentId);
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
        const filePath = path.join(tmpDir, `${agentName.toLowerCase()}-${Date.now()}.txt`);
        fs.writeFileSync(filePath, promptText, 'utf-8');
        return filePath;
    }

    private cleanupPromptFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch { /* ignore */ }
    }

    // ── Helper: session ID persistence ─────────────────────────────────────

    private getSavedSessionId(agentId: string): string | undefined {
        const ids = sessionStore.get('sessionIds') as Record<string, string>;
        return ids[agentId];
    }

    private saveSessionId(agentId: string, sessionId: string): void {
        const ids = sessionStore.get('sessionIds') as Record<string, string>;
        ids[agentId] = sessionId;
        sessionStore.set('sessionIds', ids);
    }

    // ── Helper: wait briefly to detect spawn failure ───────────────────────

    private waitForSpawnOrError(proc: ChildProcess): Promise<string | null> {
        return new Promise((resolve) => {
            let settled = false;

            const onError = (err: Error) => {
                if (!settled) {
                    settled = true;
                    resolve(err.message);
                }
            };

            const onExit = (code: number | null) => {
                if (!settled && code !== null && code !== 0) {
                    settled = true;
                    resolve(`Process exited with code ${code}`);
                }
            };

            proc.on('error', onError);
            proc.on('exit', onExit);

            // If no error within 2s, consider spawn successful
            setTimeout(() => {
                if (!settled) {
                    settled = true;
                    proc.removeListener('error', onError);
                    proc.removeListener('exit', onExit);
                    resolve(null);
                }
            }, 2000);
        });
    }
}
