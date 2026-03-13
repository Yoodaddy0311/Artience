/**
 * Agent Manager — Claude Agent SDK primary, spawn('claude') fallback.
 *
 * Uses the user's Claude subscription (no API key). The SDK's query() spawns
 * the local `claude` CLI under the hood and streams SDKMessage events.
 *
 * If the SDK import fails at runtime (missing binary, version mismatch, etc.)
 * we fall back to the proven spawn-based approach that already worked.
 */

import { spawn, type ChildProcess } from 'child_process';
import { getSkillById, buildSkillSystemPrompt } from './skill-map';
import { AGENT_PERSONAS, buildSystemPrompt } from '../src/data/agent-personas';

// Re-export for main.ts consumption
export { AGENT_PERSONAS, buildSystemPrompt };

// ── Types ──────────────────────────────────────────────────────────────────

export interface StreamChunk {
    type: 'text' | 'tool_use' | 'result' | 'error';
    content: string;
    sessionId?: string;
}

export interface AgentSession {
    agentName: string;
    sessionId?: string;
    projectDir: string;
    status: 'idle' | 'busy' | 'closed';
    abortController?: AbortController;
}

// ── SDK availability probe ─────────────────────────────────────────────────

let sdkQuery: ((params: { prompt: string; options?: any }) => any) | null =
    null;

async function probeSDK(): Promise<boolean> {
    try {
        // Dynamic import so esbuild doesn't fail if the SDK is missing
        const sdk = await import('@anthropic-ai/claude-agent-sdk');
        if (typeof sdk.query === 'function') {
            sdkQuery = sdk.query;
            console.log('[AgentManager] Agent SDK loaded successfully');
            return true;
        }
    } catch (e: any) {
        console.warn(
            '[AgentManager] Agent SDK unavailable, using spawn fallback:',
            e.message,
        );
    }
    return false;
}

// ── Agent Manager ──────────────────────────────────────────────────────────

class AgentManager {
    private sessions = new Map<string, AgentSession>();
    private sdkAvailable = false;
    private initPromise: Promise<void>;

    constructor() {
        this.initPromise = probeSDK().then((ok) => {
            this.sdkAvailable = ok;
        });
    }

    async ensureReady(): Promise<void> {
        await this.initPromise;
    }

    // ── Session lifecycle ──

    startSession(agentName: string, projectDir: string): AgentSession {
        const existing = this.sessions.get(agentName);
        if (existing && existing.status !== 'closed') {
            existing.projectDir = projectDir;
            return existing;
        }
        const session: AgentSession = {
            agentName,
            projectDir,
            status: 'idle',
        };
        this.sessions.set(agentName, session);
        return session;
    }

    async closeSession(agentName: string): Promise<void> {
        const session = this.sessions.get(agentName);
        if (!session) return;
        session.abortController?.abort();
        session.status = 'closed';
        this.sessions.delete(agentName);
    }

    getSessionStatus(agentName: string): AgentSession | undefined {
        return this.sessions.get(agentName);
    }

    // ── Chat (streaming) ──

    async *chat(
        agentName: string,
        message: string,
        projectDir?: string,
        skillId?: string,
    ): AsyncGenerator<StreamChunk> {
        await this.ensureReady();

        const session = this.startSession(agentName, projectDir || '.');
        session.status = 'busy';
        session.abortController = new AbortController();

        // Resolve skill for enhanced prompt
        const skill = skillId ? getSkillById(agentName, skillId) : undefined;

        try {
            if (this.sdkAvailable && sdkQuery) {
                yield* this.chatViaSDK(session, message, skill);
            } else {
                yield* this.chatViaSpawn(session, message, skill);
            }
        } finally {
            session.status = 'idle';
        }
    }

    // ── SDK path ──

    private async *chatViaSDK(
        session: AgentSession,
        message: string,
        skill?: import('./skill-map').ArtibotSkill,
    ): AsyncGenerator<StreamChunk> {
        const basePrompt = buildSystemPrompt(session.agentName);
        const systemPrompt = buildSkillSystemPrompt(basePrompt, skill);

        // CLAUDECODE 환경변수 제거 — 있으면 SDK가 spawn한 claude CLI가 "nested session" 에러로 exit 1
        const env = { ...process.env } as Record<string, string | undefined>;
        delete env.CLAUDECODE;

        const queryOpts: any = {
            systemPrompt,
            cwd: session.projectDir,
            env,
            abortController: session.abortController,
            permissionMode: 'plan' as const, // read-only chat, no tool execution
            tools: [], // disable built-in tools for chat
            maxTurns: 1, // single response
            persistSession: true,
            includePartialMessages: true, // stream token-by-token
            effort: 'low' as const, // fast responses for chat
        };

        // Resume if we have a session ID
        if (session.sessionId) {
            queryOpts.resume = session.sessionId;
        }

        const stream = sdkQuery!({ prompt: message, options: queryOpts });

        let resultText = '';

        for await (const msg of stream) {
            // Capture session ID from any message
            if ('session_id' in msg && msg.session_id) {
                session.sessionId = msg.session_id;
            }

            // Stream partial text (token-by-token)
            if (msg.type === 'stream_event' && msg.event) {
                const evt = msg.event as any;
                if (
                    evt.type === 'content_block_delta' &&
                    evt.delta?.type === 'text_delta'
                ) {
                    yield {
                        type: 'text',
                        content: evt.delta.text,
                        sessionId: session.sessionId,
                    };
                }
            }

            // Full assistant message (contains complete content blocks)
            if (msg.type === 'assistant' && msg.message?.content) {
                for (const block of msg.message.content) {
                    if (block.type === 'text') {
                        resultText = block.text;
                    } else if (block.type === 'tool_use') {
                        yield {
                            type: 'tool_use',
                            content: JSON.stringify({
                                name: block.name,
                                input: block.input,
                            }),
                            sessionId: session.sessionId,
                        };
                    }
                }
            }

            // Result message (final)
            if (msg.type === 'result') {
                const r = msg as any;
                if (r.result) resultText = r.result;
                yield {
                    type: 'result',
                    content: resultText,
                    sessionId: session.sessionId,
                };
            }
        }
    }

    // ── Spawn fallback path ──

    private async *chatViaSpawn(
        session: AgentSession,
        message: string,
        skill?: import('./skill-map').ArtibotSkill,
    ): AsyncGenerator<StreamChunk> {
        console.log(
            '[chatViaSpawn] agentName:',
            session.agentName,
            '| buildSystemPrompt type:',
            typeof buildSystemPrompt,
        );
        const basePrompt = buildSystemPrompt(session.agentName);
        console.log('[chatViaSpawn] basePrompt OK, length:', basePrompt.length);
        const systemPrompt = buildSkillSystemPrompt(basePrompt, skill);
        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        env.FORCE_COLOR = '0';

        const args = [
            '-p',
            message,
            '--output-format',
            'stream-json',
            '--verbose',
        ];

        // --resume 시 system-prompt를 다시 보내면 세션 충돌 가능 → 첫 실행에만 전달
        if (session.sessionId) {
            args.push('--resume', session.sessionId);
        } else {
            args.push('--system-prompt', systemPrompt);
        }

        // Yield chunks from a child process via a promise-wrapped generator
        const chunks: StreamChunk[] = [];
        let resolve: (() => void) | null = null;
        let done = false;

        // shell: true required on Windows to resolve claude.cmd wrapper
        const proc: ChildProcess = spawn('claude', args, {
            env,
            shell: process.platform === 'win32',
            cwd: session.projectDir,
        });

        // Abort support
        const onAbort = () => {
            proc.kill();
        };
        session.abortController?.signal.addEventListener('abort', onAbort, {
            once: true,
        });

        proc.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);

                    if (msg.session_id) {
                        session.sessionId = msg.session_id;
                    }

                    // Assistant message: text + tool_use blocks 한번에 처리
                    if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                            if (block.type === 'text' && block.text) {
                                chunks.push({
                                    type: 'text',
                                    content: block.text,
                                    sessionId: session.sessionId,
                                });
                            } else if (block.type === 'tool_use') {
                                chunks.push({
                                    type: 'tool_use',
                                    content: JSON.stringify({
                                        name: block.name,
                                        input: block.input,
                                    }),
                                    sessionId: session.sessionId,
                                });
                            }
                        }
                    }

                    // Streaming deltas (token-by-token)
                    if (msg.type === 'content_block_delta' && msg.delta?.text) {
                        chunks.push({
                            type: 'text',
                            content: msg.delta.text,
                            sessionId: session.sessionId,
                        });
                    }

                    // Result
                    if (msg.type === 'result') {
                        chunks.push({
                            type: 'result',
                            content: msg.result || '',
                            sessionId: session.sessionId,
                        });
                    }
                } catch {
                    /* skip non-JSON lines */
                }
            }
            resolve?.();
        });

        proc.stderr?.on('data', () => {
            /* ignore progress indicators */
        });

        proc.on('error', (err) => {
            chunks.push({ type: 'error', content: err.message });
            done = true;
            resolve?.();
        });

        proc.on('exit', () => {
            done = true;
            resolve?.();
        });

        // Drain chunks as they arrive
        while (!done || chunks.length > 0) {
            if (chunks.length > 0) {
                yield chunks.shift()!;
            } else if (!done) {
                await new Promise<void>((r) => {
                    resolve = r;
                });
            }
        }

        session.abortController?.signal.removeEventListener('abort', onAbort);
    }
}

// Singleton
export const agentManager = new AgentManager();
