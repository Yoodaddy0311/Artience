# CTO + Agent 아키텍처 설계서: 채팅-PTY 통합 v2

> 작성일: 2026-03-01
> 작성자: architect (팀 team-chat-pty-v2)
> 상태: Implemented (Option D — stream-json 양방향, 2026-03-13 구현 완료)

---

## 1. 유저 비전 요약

```
하단 독바 캐릭터 = CTO (유저의 분신)
  → 자체 터미널 + Claude Code 인터랙티브 세션 보유
  → 채팅 뷰에서 자연어로 대화 가능

화면 캐릭터들 = CTO가 관리하는 Agent(팀원) 25명
  → CTO의 Claude 세션 안에서 /team 기능으로 에이전트에게 작업 지시
  → 또는 각 에이전트가 독립 PTY 세션을 가질 수 있음
```

**핵심 목표**: 하나의 PTY claude 세션(CTO) 안에서 팀원 에이전트들에게 작업을 지시하고, 결과를 채팅 UI로 깔끔하게 표시하는 것.

---

## 2. 현재 아키텍처 분석

### 2.1 현재 데이터 흐름

```
┌──────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                 │
│                                                                    │
│  BottomDock                 TerminalPanel                          │
│  ┌──────────┐              ┌──────────────────────────────┐       │
│  │ Dokba    │──click──→    │ ┌────────┐  ┌────────────┐  │       │
│  │ (raccoon)│              │ │Chat View│  │Terminal View│  │       │
│  └──────────┘              │ │(파싱UI) │  │(raw xterm) │  │       │
│                            │ └───┬────┘  └─────┬──────┘  │       │
│                            │     │             │          │       │
│                            │     └──────┬──────┘          │       │
│                            │            │ feedChatParser() │       │
│                            └────────────┼─────────────────┘       │
│                                         │                         │
│  ─ ─ ─ ─ ─ ─ ─ IPC ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                         │                         │
│  Main Process (Electron)                ▼                         │
│  ┌─────────────────────────────────────────────────┐              │
│  │ terminal:create → pty.spawn(powershell)          │              │
│  │   autoCommand: claude --system-prompt "..."      │              │
│  │                                                   │              │
│  │ terminal:write → pty.write(data)  ← stdin 공유   │              │
│  │ terminal:data  → onData(raw) → Renderer          │              │
│  │                                                   │              │
│  │ ┌───────────────────────────────┐                │              │
│  │ │  AgentManager (미사용 상태)    │                │              │
│  │ │  SDK query() / spawn fallback │                │              │
│  │ │  → chat:send IPC 핸들러       │                │              │
│  │ └───────────────────────────────┘                │              │
│  └─────────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 관련 파일 맵

| 파일                                        | 역할                                              | 라인 수 |
| ------------------------------------------- | ------------------------------------------------- | ------- |
| `electron/main.ts`                          | IPC 핸들러 (terminal/chat/cli/project/studio/job) | 615     |
| `electron/agent-manager.ts`                 | AgentManager 클래스 (SDK + spawn fallback)        | 298     |
| `electron/skill-map.ts`                     | 캐릭터별 스킬 프로필                              | 182     |
| `electron/preload.ts`                       | IPC 브릿지 (dogbaApi)                             | 153     |
| `src/components/terminal/TerminalPanel.tsx` | xterm + ChatView + 파서                           | 574     |
| `src/components/layout/BottomDock.tsx`      | 캐릭터 독 (현재 Dokba 단일)                       | 201     |
| `src/store/useTerminalStore.ts`             | 탭/채팅로그/뷰탭 상태                             | 94      |
| `src/data/agent-personas.ts`                | 26개 에이전트 페르소나 데이터                     | 85      |
| `src/types/platform.ts`                     | AgentProfile (25+CTO), Recipe 타입                | 123     |

### 2.3 현재 방식의 한계점

#### (A) PTY stdout → 채팅 파싱 문제

`TerminalPanel.tsx:216-267`에서 PTY raw 출력을 채팅으로 변환:

```
PTY stdout (raw ANSI) → stripAnsi() → isPromptOrNoise() → feedChatParser() → 500ms idle → flush
```

**문제점:**

1. **ANSI 잔여**: `stripAnsi()`가 모든 시퀀스를 커버하지 못함 (특히 Claude CLI의 Ink UI 컴포넌트)
2. **TUI 노이즈**: Claude CLI의 box drawing (`╭╰│`), 프롬프트 (`❯`), 진행 표시 등이 채팅에 혼입
3. **경계 불명확**: 어디서 assistant 응답이 시작/종료되는지 PTY 스트림으로는 확정 불가
4. **500ms idle flush**: 네트워크 지연으로 중간에 pause가 생기면 하나의 응답이 여러 메시지로 분할됨
5. **tool_call 감지 불가**: PTY에서 도구 사용을 정확히 구분할 방법 없음

#### (B) PTY stdin 공유 문제

`TerminalPanel.tsx:411-432`에서 채팅 입력을 PTY stdin에 직접 쓰기:

```typescript
window.dogbaApi?.terminal?.write(activeTab.id, msg + '\r');
```

**문제점:**

1. **Enter 실행**: `\r` 전송 시 shell/claude 상태에 따라 동작이 달라짐
2. **에코 노이즈**: 입력한 텍스트가 PTY에 에코되어 채팅 파서가 이를 assistant 응답으로 오인
3. **상태 불일치**: Claude가 도구 승인 대기 중인데 새 프롬프트를 보내면 오동작
4. **멀티라인**: 긴 메시지가 shell에서 예기치 않게 분할됨

#### (C) AgentManager 미활용

`agent-manager.ts`의 `chatViaSpawn`은 `--output-format stream-json`을 사용하여 구조화된 출력을 제공:

```typescript
// stream-json 출력:
{ "type": "assistant", "message": { "content": [{ "type": "text", "text": "..." }] } }
{ "type": "content_block_delta", "delta": { "text": "..." } }
{ "type": "result", "result": "..." }
```

이 방식은 완벽한 파싱이 가능하지만, 현재 PTY 공유 방식으로 전환하면서 사용하지 않게 됨.

#### (D) CTO → Agent 지시 메커니즘 부재

- 현재 BottomDock에 Dokba(raccoon) 한 캐릭터만 존재
- 25개 에이전트가 DEFAULT_AGENTS에 정의되어 있지만 터미널/채팅과 연결 안 됨
- CTO가 팀원에게 작업을 지시하는 워크플로우가 없음

---

## 3. 대안 비교

### Option A: PTY stdin 공유 (현재 방식)

```
User Chat Input → terminal:write(msg + '\r') → PTY stdin → Claude CLI
Claude Response  → PTY stdout → stripAnsi() → feedChatParser() → Chat Bubble
```

| 장점                                        | 단점                                               |
| ------------------------------------------- | -------------------------------------------------- |
| 하나의 프로세스만 유지 (리소스 효율적)      | ANSI 파싱 불완전 (Ink UI, spinners, progress bars) |
| 터미널과 채팅이 동일 세션                   | 응답 경계 불명확 (flush 타이밍 의존)               |
| Claude CLI의 모든 인터랙티브 기능 사용 가능 | tool_call/thinking/permission 구분 불가            |
| 세션 자동 유지 (PTY가 살아있는 한)          | 에코 노이즈 문제                                   |
| 사용자가 터미널 직접 조작 가능              | 멀티라인 입력 문제                                 |

**평가**: 터미널 경험은 우수하나 채팅 UX가 열악. ANSI 파싱은 본질적으로 불완전할 수밖에 없음.

### Option B: AgentManager SDK query / spawn (이전 방식)

```
User Chat Input → IPC chat:send-stream → AgentManager.chat()
                → spawn('claude', ['-p', msg, '--output-format', 'stream-json'])
                → JSON 파싱 → chat:stream IPC → Chat Bubble
```

| 장점                               | 단점                                          |
| ---------------------------------- | --------------------------------------------- |
| 완벽히 구조화된 출력 (JSON stream) | 매 호출마다 프로세스 spawn (2-5초 cold start) |
| text/tool_use/result 정확히 구분   | --resume 없으면 컨텍스트 단절                 |
| ANSI 파싱 불필요                   | -p (print) 모드 전용 → 인터랙티브 기능 없음   |
| 세션 ID 기반 resume 가능           | 터미널 뷰와 완전 분리 (별도 UI 필요)          |
| 에러 핸들링 명확                   | 도구 승인 불가 (plan 모드로 제한)             |

**평가**: 채팅 UX는 우수하나, 인터랙티브 세션의 풍부함을 잃음. 비용: 매 호출 ~2-5초 지연.

### Option C: 하이브리드 (PTY는 터미널용, SDK/spawn은 채팅용) -- 권장

```
┌─ 터미널 뷰 ──────────────────────────────────┐
│  PTY (node-pty) → xterm.js (raw 표시)          │
│  사용자가 직접 타이핑, Claude CLI 풀 인터랙션  │
└─────────────────────────────────────────────────┘

┌─ 채팅 뷰 ────────────────────────────────────┐
│  chat:send-stream → spawn('claude', ['-p',    │
│    msg, '--output-format', 'stream-json',     │
│    '--resume', sessionId])                     │
│  → 구조화된 JSON stream → Chat Bubbles        │
└─────────────────────────────────────────────────┘
```

| 장점                         | 단점                             |
| ---------------------------- | -------------------------------- |
| 각 뷰가 최적의 방식으로 동작 | 세션 2개 관리 필요 (PTY + spawn) |
| 채팅: 완벽한 구조화 파싱     | --resume 세션 충돌 가능성        |
| 터미널: 풀 인터랙티브        | 리소스 사용 증가 (2x 프로세스)   |
| ANSI 파싱 문제 완전 해소     | 두 채널 간 상태 동기화 필요      |

**평가**: 이상적이지만 세션 동기화가 복잡. 두 뷰가 같은 Claude 세션을 공유해야 하는데 PTY와 spawn이 세션을 동시에 점유하면 충돌함.

### Option D: claude CLI의 `--output-format stream-json` + `--input-format stream-json` 활용 -- 최적 권장

```
spawn('claude', ['--output-format', 'stream-json',
                  '--input-format', 'stream-json',
                  '--system-prompt-file', promptPath,
                  '--include-partial-messages'])

← 양방향 구조화 스트림 (stdin JSON → stdout JSON)
← 프로세스 1개, 세션 유지, 구조화된 I/O
```

| 장점                                         | 단점                                       |
| -------------------------------------------- | ------------------------------------------ |
| **완벽한 구조화 I/O** (JSON in, JSON out)    | 인터랙티브 TUI 사용 불가                   |
| 프로세스 1개로 세션 유지 (cold start 1회)    | 터미널 뷰에서는 raw xterm 불가             |
| text/tool_use/thinking/result 완벽 분리      | `--input-format stream-json`이 비교적 신규 |
| 토큰별 스트리밍 (--include-partial-messages) | 도구 승인 UI를 직접 구현해야 함            |
| --resume로 세션 복원 가능                    |                                            |
| ANSI 파싱 완전 불필요                        |                                            |

**평가**: 채팅 중심 UX에 최적. 터미널 raw 접근이 필요한 파워유저를 위해 별도 PTY 탭 옵션 유지.

### Option E: Headless PTY + 출력 모드 스위칭

```
PTY 세션 유지 + Claude CLI에 --verbose 모드
PTY stdout을 dual-pipe:
  1. xterm.js (터미널 뷰) → raw 표시
  2. 구조화 파서 (채팅 뷰) → Claude 출력 패턴 매칭

Claude CLI에 /output-format 슬래시 커맨드로 모드 전환
```

| 장점                    | 단점                                       |
| ----------------------- | ------------------------------------------ |
| 단일 프로세스           | /output-format이 CLI에서 지원하는지 불확실 |
| 터미널과 채팅 동시 사용 | 여전히 ANSI 파싱에 의존                    |
| 기존 구조 유지          | 모드 전환 시 상태 혼란 가능                |

**평가**: 현실적이지 않음. Claude CLI가 런타임 출력 모드 전환을 지원하지 않음.

---

## 4. 최종 권장 아키텍처: Option D (stream-json 양방향) + PTY 보조

### 4.1 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                    │
│                                                                       │
│  BottomDock (Multi-Agent)            TerminalPanel (Dual View)        │
│  ┌──────┬──────┬─────┐              ┌──────────────────────────┐     │
│  │Dokba │ Sera │ Rio │...           │ ┌──────────┐ ┌────────┐ │     │
│  │(CTO) │(PM)  │(BE) │             │ │ Chat View │ │Terminal│ │     │
│  └──┬───┴──┬───┴──┬──┘             │ │(구조화)  │ │ View   │ │     │
│     │      │      │                 │ └────┬─────┘ └───┬────┘ │     │
│     │      │      │                 │      │           │      │     │
│     └──────┴──────┘                 │      │    (옵션) │      │     │
│            │ click                   │      │           │      │     │
│            ▼                         └──────┼───────────┼──────┘     │
│                                             │           │            │
│  ─ ─ ─ ─ ─ ─ ─ ─ IPC ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ┼─ ─ ─ ─ ─  │
│                                             │           │            │
│  Main Process                               │           │            │
│  ┌──────────────────────────────────────────┼───────────┼──────────┐ │
│  │                                          ▼           ▼          │ │
│  │  ┌─── ChatSessionManager ───────────────────┐ ┌─── PTY ────┐  │ │
│  │  │ spawn('claude', [                         │ │ pty.spawn  │  │ │
│  │  │   '--output-format', 'stream-json',       │ │ (powershell│  │ │
│  │  │   '--input-format', 'stream-json',        │ │  + claude) │  │ │
│  │  │   '--system-prompt-file', path,            │ │            │  │ │
│  │  │   '--include-partial-messages',            │ │ 터미널 전용 │  │ │
│  │  │   '--permission-mode', mode ])             │ │ (raw xterm)│  │ │
│  │  │                                           │ │            │  │ │
│  │  │ stdin: JSON messages ──→                  │ └────────────┘  │ │
│  │  │ stdout: JSON stream  ←──                  │                 │ │
│  │  │                                           │                 │ │
│  │  │ Sessions: Map<agentId, ChatSession>       │                 │ │
│  │  └───────────────────────────────────────────┘                 │ │
│  │                                                                 │ │
│  │  ┌─── CTO Agent Controller ─────────────────────┐             │ │
│  │  │ CTO 세션에서 --agents 플래그로 팀원 정의       │             │ │
│  │  │ 또는 /team 슬래시 커맨드로 팀 작업 시작        │             │ │
│  │  │                                               │             │ │
│  │  │ CTO → "Rio에게 API 구현 시켜줘"               │             │ │
│  │  │ → Claude가 내부적으로 Rio 서브에이전트 spawn   │             │ │
│  │  │ → 결과를 JSON stream으로 리포트               │             │ │
│  │  └───────────────────────────────────────────────┘             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 핵심 설계 결정

| 결정                           | 근거                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| **채팅 = stream-json 양방향**  | ANSI 파싱 문제를 근본적으로 해결. 구조화된 I/O로 text/tool_use/thinking 완벽 분리 |
| **터미널 = 별도 PTY (옵션)**   | 파워유저를 위한 raw 터미널 접근 유지. 채팅과 독립                                 |
| **CTO = --agents 플래그**      | Claude CLI의 공식 Agent Teams 기능 활용. 별도 구현 불필요                         |
| **에이전트별 독립 세션**       | 각 캐릭터가 자체 claude 프로세스. 충돌 없음, 병렬 작업 가능                       |
| **PTY는 CTO/일반 터미널 전용** | 채팅 뷰를 사용하는 에이전트는 stream-json, 터미널만 쓰는 경우 PTY                 |

---

## 5. 상세 설계

### 5.1 ChatSessionManager (신규 모듈)

```typescript
// electron/chat-session-manager.ts

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface ChatSession {
    agentId: string;
    agentName: string;
    proc: ChildProcess;
    sessionId?: string; // Claude session ID for --resume
    status: 'idle' | 'busy' | 'closed';
    promptFilePath: string; // temp file for system prompt
}

interface StreamEvent {
    type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'result' | 'error';
    content: string;
    toolName?: string;
    sessionId?: string;
    partial?: boolean; // token-by-token partial
}

class ChatSessionManager extends EventEmitter {
    private sessions = new Map<string, ChatSession>();

    /**
     * Create a long-lived claude process with stream-json I/O.
     * Process stays alive for the duration of the session.
     */
    async createSession(
        agentId: string,
        agentName: string,
        cwd: string,
    ): Promise<string> {
        if (this.sessions.has(agentId)) {
            return agentId; // reuse existing
        }

        const promptPath = this.writeSystemPrompt(agentName);

        const args = [
            '--output-format',
            'stream-json',
            '--input-format',
            'stream-json',
            '--system-prompt-file',
            promptPath,
            '--include-partial-messages',
            '--permission-mode',
            this.getPermissionMode(agentName),
            '--verbose',
        ];

        // Resume if we have a saved session ID
        const savedSessionId = this.getSavedSessionId(agentId);
        if (savedSessionId) {
            args.push('--resume', savedSessionId);
        }

        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        env.FORCE_COLOR = '0';

        const proc = spawn('claude', args, {
            cwd,
            env,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        const session: ChatSession = {
            agentId,
            agentName,
            proc,
            status: 'idle',
            promptFilePath: promptPath,
        };

        this.sessions.set(agentId, session);
        this.setupOutputParser(session);

        return agentId;
    }

    /**
     * Send a user message as JSON to the claude process stdin.
     */
    sendMessage(agentId: string, message: string): void {
        const session = this.sessions.get(agentId);
        if (!session || session.status === 'closed') return;

        session.status = 'busy';

        // stream-json input format: write JSON to stdin
        const input = JSON.stringify({
            type: 'user',
            message: { content: [{ type: 'text', text: message }] },
        });

        session.proc.stdin?.write(input + '\n');
    }

    /**
     * Parse stdout JSON stream and emit typed events.
     */
    private setupOutputParser(session: ChatSession): void {
        let buffer = '';

        session.proc.stdout?.on('data', (data: Buffer) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line

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

        session.proc.stderr?.on('data', () => {
            /* ignore */
        });

        session.proc.on('exit', (code) => {
            session.status = 'closed';
            this.emit('session:closed', session.agentId, code);
        });
    }

    private handleMessage(session: ChatSession, msg: any): void {
        // Capture session ID
        if (msg.session_id) {
            session.sessionId = msg.session_id;
            this.saveSessionId(session.agentId, msg.session_id);
        }

        // Token-by-token streaming
        if (msg.type === 'content_block_delta' && msg.delta?.text) {
            this.emit('stream', session.agentId, {
                type: 'text',
                content: msg.delta.text,
                sessionId: session.sessionId,
                partial: true,
            } as StreamEvent);
        }

        // Full assistant message
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
                        sessionId: session.sessionId,
                    } as StreamEvent);
                }
            }
        }

        // Tool result
        if (msg.type === 'tool_result') {
            this.emit('stream', session.agentId, {
                type: 'tool_result',
                content: msg.content || '',
                sessionId: session.sessionId,
            } as StreamEvent);
        }

        // Final result
        if (msg.type === 'result') {
            session.status = 'idle';
            this.emit('stream', session.agentId, {
                type: 'result',
                content: msg.result || '',
                sessionId: session.sessionId,
            } as StreamEvent);
            this.emit('response:end', session.agentId);
        }
    }

    // ... helper methods: writeSystemPrompt, getPermissionMode,
    //     getSavedSessionId, saveSessionId, closeSession
}
```

### 5.2 CTO → Agent 메시지 전달 메커니즘

#### 방법 1: Claude CLI `--agents` 플래그 (권장 -- Phase 1)

CTO의 claude 세션에 `--agents` JSON을 전달하여 팀원을 서브에이전트로 등록:

```typescript
// CTO 세션 생성 시
const agentsJson = {
    rio: {
        description: '백엔드 개발자 Rio. 서버, API, 데이터베이스 전문.',
        prompt: buildSystemPrompt('Rio'),
        model: 'sonnet',
    },
    luna: {
        description: '프론트엔드 개발자 Luna. React, UI/UX 전문.',
        prompt: buildSystemPrompt('Luna'),
        model: 'sonnet',
    },
    ara: {
        description: 'QA 테스터 Ara. 테스트 작성, 버그 탐지 전문.',
        prompt: buildSystemPrompt('Ara'),
        model: 'sonnet',
    },
    // ... 나머지 에이전트
};

const ctoArgs = [
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--system-prompt-file',
    ctpPromptPath,
    '--agents',
    JSON.stringify(agentsJson),
    '--include-partial-messages',
];
```

**CTO 시스템 프롬프트**:

```
너는 Dokba, 이 프로젝트의 CTO야. 팀원들에게 작업을 지시하고 결과를 관리해.
사용 가능한 팀원: Rio (백엔드), Luna (프론트), Ara (QA), ...
유저가 "Rio에게 API 만들어달라고 해"라고 하면, 적절한 지시를 만들어서 Rio에게 전달해.
각 팀원의 작업 결과를 유저에게 보고해.
```

**유저 → CTO → Agent 흐름**:

```
User: "Rio에게 유저 인증 API 만들어달라고 해"
  ↓
CTO (Claude): Rio 서브에이전트에게 지시 (내부적으로 spawn)
  ↓
Rio Agent: 코드 작업 수행 → 결과 리포트
  ↓
CTO: "Rio가 작업을 완료했어. /api/auth/login, /api/auth/signup 엔드포인트를 만들었고..."
  ↓
User에게 결과 표시 (구조화된 ChatView)
```

#### 방법 2: 독립 세션 + 메일 시스템 (Phase 2)

각 에이전트가 독립 ChatSession을 보유하고, CTO가 메일을 통해 지시:

```
CTO 세션 → "Rio에게 이 작업 전달해"
  → ChatSessionManager.sendMessage('rio', taskContent)
  → Rio 세션에서 독립 작업 수행
  → 결과를 mail:new-report IPC로 CTO에게 보고
```

#### 방법 3: `.claude/agents/` 커스텀 에이전트 (Phase 3)

프로젝트 디렉토리에 에이전트 정의 파일 배치:

```yaml
# .claude/agents/rio-backend.md
---
name: rio
description: 백엔드 개발자 Rio - API, 서버, DB 전문
tools: Read, Edit, Write, Bash, Glob, Grep
model: sonnet
permissionMode: acceptEdits
---
너는 Rio, 백엔드 개발자야. 서버와 API에 진심이고, 성능과 안정성을 중시해.
한국어로 응답하고, 친근한 반말체를 사용해.
```

이 파일이 존재하면 CTO가 `@rio` 멘션으로 자동 호출.

### 5.3 IPC 채널 재설계

#### 현재 IPC (유지)

| 채널               | 방향   | 용도                      |
| ------------------ | ------ | ------------------------- |
| `terminal:create`  | invoke | PTY 생성 (터미널 뷰 전용) |
| `terminal:write`   | send   | PTY stdin 쓰기            |
| `terminal:data`    | event  | PTY stdout 이벤트         |
| `terminal:resize`  | send   | PTY 크기 조절             |
| `terminal:destroy` | send   | PTY 종료                  |
| `terminal:exit`    | event  | PTY 종료 이벤트           |

#### 신규 IPC (추가)

| 채널                  | 방향   | 용도                                      |
| --------------------- | ------ | ----------------------------------------- |
| `chat:create-session` | invoke | stream-json 채팅 세션 생성                |
| `chat:send-message`   | invoke | 채팅 메시지 전송 (JSON stdin)             |
| `chat:close-session`  | invoke | 채팅 세션 종료                            |
| `chat:stream-event`   | event  | 구조화된 스트림 이벤트 (text/tool/result) |
| `chat:session-closed` | event  | 세션 종료 이벤트                          |
| `chat:response-end`   | event  | 응답 완료 이벤트                          |
| `agent:create-team`   | invoke | CTO 팀 세션 생성 (--agents)               |
| `agent:delegate-task` | invoke | CTO → Agent 작업 위임                     |
| `agent:task-result`   | event  | Agent → CTO 작업 결과                     |

### 5.4 Renderer 변경

#### TerminalPanel 리팩토링

```
현재:
  feedChatParser(rawPtyData) → stripAnsi → flush → chatBubble (불완전)

제안:
  chat:stream-event IPC 리스너 → 타입별 ChatBubble 렌더링 (완벽)
```

ChatView가 더 이상 PTY stdout을 파싱하지 않음. 대신 `chat:stream-event` IPC에서 구조화된 이벤트를 수신:

```typescript
// TerminalPanel.tsx 변경 개요
useEffect(() => {
    const unsub = window.dogbaApi?.chat?.onStreamEvent((agentId, event) => {
        switch (event.type) {
            case 'text':
                if (event.partial) {
                    setStreamingText((s) => ({
                        ...s,
                        [agentId]: (s[agentId] || '') + event.content,
                    }));
                } else {
                    addChatMessage(agentId, {
                        sender: 'assistant',
                        text: event.content,
                        ts: Date.now(),
                    });
                }
                break;
            case 'tool_use':
                addChatMessage(agentId, {
                    sender: 'assistant',
                    text: event.content,
                    ts: Date.now(),
                    type: 'tool_use',
                    toolName: event.toolName,
                });
                break;
            case 'result':
                flushStreamingText(agentId);
                setIsTyping((s) => ({ ...s, [agentId]: false }));
                break;
        }
    });
    return () => unsub?.();
}, []);
```

#### BottomDock 확장 (멀티 캐릭터)

현재 Dokba 단일 → 유저가 선택한 캐릭터들을 독에 배치:

```typescript
// BottomDock.tsx 변경 개요
const DOCK_AGENTS = [
    {
        id: 'raccoon',
        name: 'Dokba',
        role: 'CTO / AI 어시스턴트',
        sprite: '...',
        isCto: true,
    },
    // 유저가 에이전트타운에서 "독에 추가"한 캐릭터들
];

// CTO 캐릭터 클릭 → stream-json 세션 생성 (--agents 포함)
// 일반 에이전트 클릭 → 독립 stream-json 세션 생성
```

### 5.5 ChatMessage 타입 확장

```typescript
// useTerminalStore.ts
export interface ChatMessage {
    sender: 'user' | 'assistant' | 'system';
    text: string;
    ts: number;
    type?:
        | 'message'
        | 'tool_use'
        | 'tool_result'
        | 'thinking'
        | 'error'
        | 'status';
    toolName?: string;
    toolInput?: string;
    agentFrom?: string; // 서브에이전트 이름 (팀 작업 시)
    collapsed?: boolean; // tool_use 접힘 여부
}
```

---

## 6. 비교표: 현재 vs 제안

| 항목                  | 현재 (PTY stdin 공유)     | 제안 (stream-json 양방향)     |
| --------------------- | ------------------------- | ----------------------------- |
| **채팅 파싱**         | ANSI strip → 불완전       | JSON stream → 완벽            |
| **응답 경계**         | 500ms idle flush (불확실) | `result` 이벤트 (확정)        |
| **tool_call 표시**    | regex 패턴 매칭 (부정확)  | `tool_use` 타입 (정확)        |
| **thinking 표시**     | 불가                      | `thinking` 타입으로 구분 가능 |
| **에코 노이즈**       | 있음 (입력 에코)          | 없음 (구조화 I/O)             |
| **멀티라인 입력**     | shell 의존 (문제 있음)    | JSON으로 안전 전달            |
| **세션 유지**         | PTY 프로세스 생존 동안    | --resume + session ID         |
| **인터랙티브 터미널** | 완전 지원                 | 별도 PTY 탭으로 분리          |
| **CTO→Agent 지시**    | 불가                      | --agents 플래그 활용          |
| **리소스**            | PTY 1개                   | claude 프로세스 1개/에이전트  |
| **에러 핸들링**       | 터미널 출력 관찰만        | error 타입 이벤트             |
| **permission 처리**   | 터미널에서 수동 y/n       | UI 버튼으로 JSON 응답         |
| **코드 변경**         | 대규모 (파서 재작성)      | 대규모 (세션 매니저 신규)     |

---

## 7. 구현 로드맵

### Phase 1: stream-json 채팅 기반 전환 (핵심)

1. **ChatSessionManager 구현** (`electron/chat-session-manager.ts`)
    - spawn claude with `--output-format stream-json --input-format stream-json`
    - JSON stdout 파서
    - 세션 라이프사이클 관리

2. **IPC 채널 추가** (`electron/main.ts`)
    - `chat:create-session`, `chat:send-message`, `chat:close-session`
    - `chat:stream-event` 이벤트 발송

3. **Preload 확장** (`electron/preload.ts`)
    - `chat.createSession()`, `chat.sendMessage()`, `chat.onStreamEvent()`

4. **ChatView 리팩토링** (`src/components/terminal/TerminalPanel.tsx`)
    - feedChatParser 제거
    - chat:stream-event IPC 리스너로 교체
    - tool_use 블록 렌더링 개선

5. **BottomDock 채팅 플로우 변경** (`src/components/layout/BottomDock.tsx`)
    - 캐릭터 클릭 → chat:create-session IPC 호출
    - PTY 생성은 "터미널 뷰" 전환 시에만

### Phase 2: CTO + Agent Teams

6. **CTO 전용 세션** (`electron/cto-controller.ts`)
    - --agents 플래그로 팀원 등록
    - 유저 메시지를 CTO에게 전달 → CTO가 팀원에게 위임

7. **BottomDock 멀티 캐릭터**
    - 에이전트타운에서 독에 추가/제거 기능
    - 각 캐릭터별 독립 세션 or CTO 경유 선택

8. **에이전트 활동 시각화**
    - `agent:task-result` → 에이전트타운 캐릭터 상태 변경
    - THINKING → WORK ZONE → SUCCESS 애니메이션

### Phase 3: 고도화

9. **Permission UI**
    - tool_use 이벤트 시 승인/거부 버튼 표시
    - JSON stdin으로 승인 응답 전달

10. **세션 복원**
    - sessionId를 electron-store에 저장
    - 앱 재시작 시 --resume로 자동 복원

11. **캐릭터별 Claude 설정**
    - permission-mode, model, allowedTools 캐릭터별 적용
    - `.claude/agents/` 디렉토리 자동 생성

---

## 8. CTO/Agent 상호작용 시나리오

### 시나리오 1: 단순 채팅 (개별 에이전트)

```
User → [BottomDock: Dokba 클릭]
  → chat:create-session(raccoon, 'Dokba', projectDir)
  → claude process spawned with stream-json
  → ChatView 표시

User: "이 프로젝트 구조 설명해줘"
  → chat:send-message(raccoon, "이 프로젝트 구조 설명해줘")
  → claude stdin: {"type":"user","message":{"content":[{"type":"text","text":"이 프로젝트 구조 설명해줘"}]}}
  → stdout stream:
      {"type":"content_block_delta","delta":{"text":"이 프로젝트는..."}}
      {"type":"content_block_delta","delta":{"text":"React + Electron..."}}
      ...
      {"type":"result","result":"이 프로젝트는 React + Electron 기반의..."}
  → ChatView: 토큰별 스트리밍 표시
```

### 시나리오 2: CTO → Agent 작업 위임

```
User → [BottomDock: Dokba (CTO) 활성]

User: "Rio에게 유저 인증 API 만들어달라고 해"
  → chat:send-message(raccoon, "Rio에게 유저 인증 API 만들어달라고 해")
  → CTO Claude: --agents에 등록된 rio 서브에이전트 호출
  → stdout stream:
      {"type":"content_block_delta","delta":{"text":"Rio에게 작업 지시합니다..."}}
      {"type":"subagent","name":"rio","status":"started"}
      ... (Rio가 작업 수행)
      {"type":"subagent","name":"rio","status":"completed","result":"..."}
      {"type":"result","result":"Rio가 작업을 완료했어! ..."}
  → ChatView: CTO 메시지 + Rio 작업 결과 표시
  → AgentTown: Rio 캐릭터 THINKING → WORK ZONE → SUCCESS
```

### 시나리오 3: 팀 회의

```
User → [BottomDock: Sera (PM) 선택 + Rio + Luna 멀티선택]
  → agent:create-team(sera, [rio, luna], topic)
  → Sera 세션 with --agents {rio, luna}

User: "이 프로젝트의 API 설계 리뷰해줘"
  → Sera(PM): "Rio, Luna, API 설계 관련 각자 전문 분야에서 의견 줘"
  → Rio: "백엔드 관점에서... REST 엔드포인트 구조가..."
  → Luna: "프론트 관점에서... API 응답 형식이 컴포넌트에 맞게..."
  → Sera: "종합하면... 다음 액션 아이템은..."
  → ChatView: 각 에이전트의 아바타 + 발언 순서대로 표시
```

---

## 9. 위험 요소 및 대안

### 9.1 기술 리스크

| 리스크                              | 영향도 | 확률 | 완화 방안                                                                |
| ----------------------------------- | ------ | ---- | ------------------------------------------------------------------------ |
| `--input-format stream-json` 불안정 | 높음   | 중   | `-p` + `--output-format stream-json`로 fallback (현재 AgentManager 방식) |
| claude 프로세스 메모리 누수         | 중     | 중   | 유휴 10분 후 자동 종료 + --resume으로 복원                               |
| --agents 플래그 제한                | 중     | 중   | 독립 세션 방식(방법 2)으로 대체                                          |
| Windows에서 stdin JSON 인코딩       | 중     | 낮   | UTF-8 BOM 명시, shell:false 유지                                         |
| 다수 claude 프로세스 동시 실행      | 높음   | 중   | 동시 세션 제한 (3-5개), LRU 세션 관리                                    |
| Claude CLI 버전 호환성              | 높음   | 낮   | 버전 체크 + 최소 버전 요구                                               |

### 9.2 Fallback 전략

```
1차: --output-format stream-json + --input-format stream-json (최적)
  ↓ 실패 시
2차: -p + --output-format stream-json (현재 AgentManager.chatViaSpawn)
  ↓ 실패 시
3차: PTY stdin 공유 (현재 방식, 최후의 수단)
```

### 9.3 마이그레이션 전략

기존 코드를 유지하면서 점진적 전환:

1. ChatSessionManager를 신규 모듈로 추가 (기존 코드 수정 없음)
2. ChatView에 `source: 'pty' | 'stream-json'` 분기 추가
3. BottomDock에서 캐릭터별 세션 방식 선택 (초기에는 feature flag)
4. stream-json이 안정화되면 PTY 파싱 코드 제거

---

## 10. 결론

### 핵심 결정사항

1. **채팅은 `--output-format stream-json + --input-format stream-json`으로 전환한다.**
    - ANSI 파싱 문제를 근본적으로 해결
    - text/tool_use/result 완벽 구분
    - 토큰별 스트리밍 유지

2. **터미널은 별도 PTY로 분리한다.**
    - 파워유저용 raw 터미널 접근 유지
    - 채팅과 독립적으로 동작

3. **CTO → Agent는 Claude CLI `--agents` 플래그를 활용한다.**
    - Anthropic 공식 기능 활용, 자체 구현 최소화
    - 서브에이전트 spawn/결과 수집을 Claude가 처리

4. **기존 AgentManager는 fallback으로 유지한다.**
    - stream-json 양방향이 불안정할 경우 `-p + stream-json` 방식으로 fallback

### 우선순위

```
P0 (즉시): ChatSessionManager + stream-json 채팅 → ANSI/TUI 문제 해결
P1 (1주): CTO + --agents 팀 워크플로우
P2 (2주): 멀티 캐릭터 독 + 에이전트 활동 시각화
P3 (4주): Permission UI + 세션 복원 + 캐릭터별 설정
```
