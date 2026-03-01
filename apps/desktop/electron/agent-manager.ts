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

// ── Agent Personas (shared source of truth) ────────────────────────────────

export const AGENT_PERSONAS: Record<string, { role: string; personality: string }> = {
  sera:   { role: 'PM / 총괄', personality: '리더십 있고 전체 프로젝트를 조율하는 PM. 팀원들을 챙기고 일정을 관리해' },
  rio:    { role: '백엔드 개발', personality: '서버와 API에 진심인 백엔드 개발자. 성능과 안정성을 중시해' },
  luna:   { role: '프론트엔드 개발', personality: 'UI/UX에 민감하고 컴포넌트 설계를 좋아하는 프론트 개발자' },
  alex:   { role: '데이터 분석', personality: '데이터에서 인사이트를 찾아내는 분석가. 숫자와 패턴에 강해' },
  ara:    { role: 'QA 테스트', personality: '꼼꼼하게 버그를 잡아내는 테스터. 품질에 타협 없어' },
  miso:   { role: 'DevOps', personality: '배포와 인프라를 책임지는 DevOps. 자동화를 사랑해' },
  hana:   { role: 'UX 디자인', personality: '사용자 경험에 집착하는 디자이너. 직관적인 인터페이스를 만들어' },
  duri:   { role: '보안 감사', personality: '보안 취약점을 찾아내는 감사관. 안전이 최우선이야' },
  bomi:   { role: '기술 문서화', personality: '깔끔한 문서를 쓰는 테크니컬 라이터. 복잡한 걸 쉽게 설명해' },
  toto:   { role: 'DB 관리', personality: '데이터베이스 최적화에 열정적인 DBA. 쿼리 성능에 진심이야' },
  nari:   { role: 'API 설계', personality: 'RESTful API 설계의 달인. 깔끔한 인터페이스를 만들어' },
  ruru:   { role: '인프라 관리', personality: '서버와 네트워크를 관리하는 인프라 엔지니어' },
  somi:   { role: '성능 최적화', personality: '밀리초 단위로 성능을 개선하는 최적화 전문가' },
  choco:  { role: 'CI/CD', personality: '파이프라인 구축의 달인. 빌드와 배포를 자동화해' },
  maru:   { role: '모니터링', personality: '시스템 상태를 실시간으로 감시하는 모니터링 전문가' },
  podo:   { role: '코드 리뷰', personality: '코드 품질에 엄격한 리뷰어. 클린 코드를 추구해' },
  jelly:  { role: '로그 분석', personality: '로그에서 문제의 원인을 찾아내는 분석가' },
  namu:   { role: '아키텍처', personality: '시스템 아키텍처를 설계하는 설계자. 확장성과 유지보수성을 중시해' },
  gomi:   { role: '빌드 관리', personality: '빌드 시스템을 관리하고 최적화하는 전문가' },
  ppuri:  { role: '배포 자동화', personality: '무중단 배포를 구현하는 자동화 전문가' },
  dari:   { role: '이슈 트래킹', personality: '이슈를 체계적으로 관리하고 추적하는 전문가' },
  kongbi: { role: '의존성 관리', personality: '패키지와 의존성을 깔끔하게 관리하는 전문가' },
  baduk:  { role: '마이그레이션', personality: '데이터와 시스템 마이그레이션을 안전하게 수행해' },
  tangi:  { role: '캐싱 전략', personality: '캐싱으로 성능을 극대화하는 전략가' },
  moong:  { role: '에러 핸들링', personality: '에러를 우아하게 처리하는 전문가. 장애 대응에 강해' },
};

export function buildSystemPrompt(agentName: string): string {
  const key = agentName.toLowerCase();
  const persona = AGENT_PERSONAS[key];
  if (!persona) {
    return `너는 ${agentName}이야. 한국어로 대화하고, 친근한 반말체를 사용해.`;
  }
  return `너는 ${agentName}이야. ${persona.role} 담당이고, ${persona.personality}. 한국어로 대화하고, 친근한 반말체를 사용해. 질문에 너의 전문 분야 관점에서 답변해줘. 답변은 간결하게 해줘.`;
}

// ── SDK availability probe ─────────────────────────────────────────────────

let sdkQuery: ((params: { prompt: string; options?: any }) => any) | null = null;

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
    console.warn('[AgentManager] Agent SDK unavailable, using spawn fallback:', e.message);
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

  async *chat(agentName: string, message: string, projectDir?: string, skillId?: string): AsyncGenerator<StreamChunk> {
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

  private async *chatViaSDK(session: AgentSession, message: string, skill?: import('./skill-map').ArtibotSkill): AsyncGenerator<StreamChunk> {
    const basePrompt = buildSystemPrompt(session.agentName);
    const systemPrompt = buildSkillSystemPrompt(basePrompt, skill);

    const queryOpts: any = {
      systemPrompt,
      cwd: session.projectDir,
      abortController: session.abortController,
      permissionMode: 'plan' as const,      // read-only chat, no tool execution
      tools: [],                             // disable built-in tools for chat
      maxTurns: 1,                           // single response
      persistSession: true,
      includePartialMessages: true,          // stream token-by-token
      effort: 'low' as const,               // fast responses for chat
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
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield { type: 'text', content: evt.delta.text, sessionId: session.sessionId };
        }
      }

      // Full assistant message (contains complete content blocks)
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            resultText = block.text;
          } else if (block.type === 'tool_use') {
            yield { type: 'tool_use', content: JSON.stringify({ name: block.name, input: block.input }), sessionId: session.sessionId };
          }
        }
      }

      // Result message (final)
      if (msg.type === 'result') {
        const r = msg as any;
        if (r.result) resultText = r.result;
        yield { type: 'result', content: resultText, sessionId: session.sessionId };
      }
    }
  }

  // ── Spawn fallback path ──

  private async *chatViaSpawn(session: AgentSession, message: string, skill?: import('./skill-map').ArtibotSkill): AsyncGenerator<StreamChunk> {
    const basePrompt = buildSystemPrompt(session.agentName);
    const systemPrompt = buildSkillSystemPrompt(basePrompt, skill);
    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;
    env.FORCE_COLOR = '0';

    const args = [
      '-p', message,
      '--system-prompt', systemPrompt,
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (session.sessionId) {
      args.push('--resume', session.sessionId);
    }

    // Yield chunks from a child process via a promise-wrapped generator
    const chunks: StreamChunk[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const proc: ChildProcess = spawn('claude', args, { env, shell: true, cwd: session.projectDir });

    // Abort support
    const onAbort = () => { proc.kill(); };
    session.abortController?.signal.addEventListener('abort', onAbort, { once: true });

    proc.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);

          if (msg.session_id) {
            session.sessionId = msg.session_id;
          }

          // Assistant text
          if (msg.type === 'assistant' && msg.message?.content) {
            const text = msg.message.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('');
            if (text) {
              chunks.push({ type: 'text', content: text, sessionId: session.sessionId });
            }
          }

          // Streaming deltas
          if (msg.type === 'content_block_delta' && msg.delta?.text) {
            chunks.push({ type: 'text', content: msg.delta.text, sessionId: session.sessionId });
          }

          // Tool use
          if (msg.type === 'assistant' && msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === 'tool_use') {
                chunks.push({ type: 'tool_use', content: JSON.stringify({ name: block.name, input: block.input }), sessionId: session.sessionId });
              }
            }
          }

          // Result
          if (msg.type === 'result') {
            chunks.push({ type: 'result', content: msg.result || '', sessionId: session.sessionId });
          }
        } catch { /* skip non-JSON lines */ }
      }
      resolve?.();
    });

    proc.stderr?.on('data', () => { /* ignore progress indicators */ });

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
        await new Promise<void>((r) => { resolve = r; });
      }
    }

    session.abortController?.signal.removeEventListener('abort', onAbort);
  }
}

// Singleton
export const agentManager = new AgentManager();
