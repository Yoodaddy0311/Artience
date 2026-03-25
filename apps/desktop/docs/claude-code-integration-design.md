# Dokba Studio - Claude Code 통합 플랫폼 설계서

> **구현 상태 (2026-03-25)**: Claude Code 200% 활용 체크리스트 ~70% 달성 (14/20).
> Phase 0-2 핵심 기능 전체 완료. 미사용 CLI 플래그: --allowedTools, --verbose, --add-dir, --chrome, --max-budget-usd, --json-schema

> 작성일: 2026-03-01
> 상태: Draft

---

## 1. 현재 상태 분석

### 1.1 현재 아키텍처

```
[Renderer] ──IPC──> [Main Process] ──execFile──> [claude CLI]
                         │
                         ├── terminal:create → spawn('powershell') → stdin.write('claude')
                         ├── chat:send → execFile('claude', ['-p', msg, '--system-prompt', ...])
                         └── cli:auth-status → execFile('claude', ['auth', 'status'])
```

### 1.2 핵심 문제점

| 문제          | 상세                                                                                           | 영향                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| TTY 부재      | `spawn('powershell', [], { stdio: ['pipe','pipe','pipe'] })` → Claude CLI 인터랙티브 모드 불가 | 터미널에서 Claude의 풍부한 UI(색상, 진행바, 도구 승인 등) 사용 불가 |
| 대화 단절     | 매 `chat:send` 마다 새 프로세스 → `execFile('claude', ['-p', ...])`                            | 에이전트가 이전 대화를 기억 못함, 매번 cold start                   |
| 컨텍스트 부재 | `--system-prompt`만 전달, `cwd` 미지정                                                         | 캐릭터가 프로젝트 파일을 못 봄, 실제 코드 작업 불가                 |
| 성능          | 매 호출마다 프로세스 spawn + CLI 초기화 (약 2-5초)                                             | UX 저하, 빠른 대화 불가                                             |

---

## 2. 터미널 통합 개선안

### 2.1 Option A: node-pty 도입 (권장) — P0

**문제**: 현재 `child_process.spawn`은 pipe 모드로 PTY를 제공하지 않아 Claude CLI의 인터랙티브 기능이 제한됨.

**해결**: `node-pty`를 사용하여 실제 가상 터미널 할당.

```typescript
// electron/main.ts — node-pty 기반 터미널
import * as pty from 'node-pty';

const terminals = new Map<string, pty.IPty>();

ipcMain.handle('terminal:create', (_event, cols: number, rows: number) => {
    const id = `term-${++terminalIdCounter}`;
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME || process.env.USERPROFILE || '.',
        env: { ...process.env, CLAUDECODE: undefined } as Record<
            string,
            string
        >,
    });

    terminals.set(id, proc);

    // 500ms 후 claude 자동 실행
    setTimeout(() => proc.write('claude\r'), 500);

    proc.onData((data: string) => {
        mainWindow?.webContents.send('terminal:data', id, data);
    });

    proc.onExit(({ exitCode }) => {
        terminals.delete(id);
        mainWindow?.webContents.send('terminal:exit', id, exitCode);
    });

    return id;
});

ipcMain.on(
    'terminal:resize',
    (_event, id: string, cols: number, rows: number) => {
        terminals.get(id)?.resize(cols, rows);
    },
);
```

**이점**:

- Claude CLI의 전체 인터랙티브 UI 사용 가능 (색상, Ink UI, 도구 승인 프롬프트)
- `resize` 정상 작동
- ANSI escape sequence 완전 지원

**구현 비용**:

- `node-pty`는 native addon → `electron-rebuild` 필요
- `package.json`에 `"node-pty": "^1.0.0"` 추가
- `electron-builder`에 `rebuild` 설정 추가

```json
// package.json 수정
{
    "dependencies": {
        "node-pty": "^1.0.0"
    },
    "build": {
        "npmRebuild": true
    }
}
```

### 2.2 Option B: --dangerously-skip-permissions + pipe (차선)

현재 구조 유지하면서 Claude CLI를 non-interactive 모드로 사용:

```typescript
const proc = spawn('claude', ['--dangerously-skip-permissions'], {
    cwd: projectDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
});
```

**주의**: `--dangerously-skip-permissions`는 보안 위험. 프로덕션에서는 비권장.

### 2.3 권장 경로

**node-pty (Option A)**를 P0으로 진행. 이유:

1. Claude CLI가 TTY를 감지하면 풍부한 UI 제공
2. `resize` 지원으로 xterm.js와 완벽 연동
3. Electron 앱에서 node-pty는 검증된 패턴 (VS Code, Hyper 등)

---

## 3. 캐릭터 채팅 고도화

### 3.1 Phase 1: 세션 기반 Multi-turn 대화 — P0

**핵심**: `@anthropic-ai/claude-agent-sdk`를 사용하여 프로세스를 재사용하고 세션을 유지.

#### 아키텍처 변경

```
[Renderer] ──IPC──> [Main Process] ──Agent SDK──> [Claude Code Runtime]
                         │
                         ├── chat:start(agentName)  → createSession() → sessionId
                         ├── chat:send(sessionId, msg) → session.send() → stream()
                         ├── chat:history(sessionId) → listSessions()
                         └── chat:close(sessionId)  → session.close()
```

#### 구현

```typescript
// electron/agent-sessions.ts
import {
    unstable_v2_createSession,
    unstable_v2_resumeSession,
    type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

interface AgentSession {
    session: any; // SDKSession
    sessionId: string;
    agentName: string;
    createdAt: number;
}

const activeSessions = new Map<string, AgentSession>();

export function createAgentSession(
    agentName: string,
    systemPrompt: string,
    cwd: string,
) {
    const session = unstable_v2_createSession({
        model: 'claude-sonnet-4-6', // 채팅용은 Sonnet으로 비용 최적화
        systemPrompt,
        cwd, // 프로젝트 디렉토리 전달 → 파일 접근 가능
        permissionMode: 'plan', // 코드 수정 전 사용자 승인
        tools: { type: 'preset', preset: 'claude_code' },
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash(git:*)'],
        settingSources: ['project'], // CLAUDE.md 로드
    });

    const key = `${agentName}-${Date.now()}`;
    activeSessions.set(key, {
        session,
        sessionId: session.sessionId,
        agentName,
        createdAt: Date.now(),
    });

    return key;
}

export async function sendMessage(sessionKey: string, message: string) {
    const entry = activeSessions.get(sessionKey);
    if (!entry) throw new Error('Session not found');

    await entry.session.send(message);

    const chunks: string[] = [];
    for await (const msg of entry.session.stream()) {
        if (msg.type === 'assistant') {
            const text = msg.message.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('');
            chunks.push(text);
        }
    }
    return chunks.join('');
}

export function closeSession(sessionKey: string) {
    const entry = activeSessions.get(sessionKey);
    if (entry) {
        entry.session.close();
        activeSessions.delete(sessionKey);
    }
}
```

#### IPC 핸들러 수정

```typescript
// electron/main.ts 에 추가
import {
    createAgentSession,
    sendMessage,
    closeSession,
} from './agent-sessions';

// 세션 생성
ipcMain.handle(
    'chat:start',
    async (_event, agentName: string, projectDir?: string) => {
        const systemPrompt = buildSystemPrompt(agentName);
        const cwd =
            projectDir || process.env.HOME || process.env.USERPROFILE || '.';
        const sessionKey = createAgentSession(agentName, systemPrompt, cwd);
        return { sessionKey };
    },
);

// 메시지 전송 (스트리밍)
ipcMain.handle(
    'chat:send',
    async (event, sessionKey: string, message: string) => {
        try {
            // 스트리밍으로 청크 전달
            const entry = activeSessions.get(sessionKey);
            if (!entry) return { success: false, text: 'Session not found' };

            await entry.session.send(message);

            let fullText = '';
            for await (const msg of entry.session.stream()) {
                if (msg.type === 'assistant') {
                    const text = msg.message.content
                        .filter((b: any) => b.type === 'text')
                        .map((b: any) => b.text)
                        .join('');
                    fullText += text;
                    // 실시간 스트리밍 전달
                    mainWindow?.webContents.send(
                        'chat:stream',
                        sessionKey,
                        text,
                    );
                }
            }

            return { success: true, text: fullText };
        } catch (error: any) {
            return { success: false, text: error.message };
        }
    },
);

// 세션 종료
ipcMain.handle('chat:close', async (_event, sessionKey: string) => {
    closeSession(sessionKey);
    return { success: true };
});
```

#### Preload 수정

```typescript
// electron/preload.ts — chat API 확장
chat: {
    start: (agentName: string, projectDir?: string):
        Promise<{ sessionKey: string }> =>
        ipcRenderer.invoke('chat:start', agentName, projectDir),

    send: (sessionKey: string, message: string):
        Promise<{ success: boolean; text: string }> =>
        ipcRenderer.invoke('chat:send', sessionKey, message),

    close: (sessionKey: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('chat:close', sessionKey),

    onStream: (callback: (sessionKey: string, chunk: string) => void) => {
        const listener = (_e: any, key: string, chunk: string) => callback(key, chunk);
        ipcRenderer.on('chat:stream', listener);
        return () => ipcRenderer.removeListener('chat:stream', listener);
    },
},
```

### 3.2 Phase 2: 프로젝트 컨텍스트 연동 — P1

캐릭터가 실제 프로젝트 파일을 볼 수 있게:

```typescript
const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    systemPrompt: buildSystemPrompt(agentName),
    cwd: '/path/to/user/project', // 핵심: 프로젝트 루트 전달
    settingSources: ['project'], // CLAUDE.md 로드
    tools: { type: 'preset', preset: 'claude_code' },
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash(git:*)'],
});
```

**이점**:

- 캐릭터가 `Read`, `Glob`, `Grep`으로 코드베이스 탐색 가능
- CLAUDE.md의 프로젝트 규칙 자동 적용
- git 상태 확인 가능

#### UI: 프로젝트 디렉토리 선택

```typescript
// 설정 모달 또는 사이드바에 프로젝트 디렉토리 선택 추가
ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: '프로젝트 디렉토리 선택',
    });
    return result.filePaths[0] || null;
});
```

### 3.3 Phase 3: 스트리밍 응답 UI — P1

```typescript
// RightSidebar.tsx — 스트리밍 지원
const [streamingText, setStreamingText] = useState('');

useEffect(() => {
    const chatApi = window.dogbaApi?.chat;
    if (!chatApi) return;

    const unsub = chatApi.onStream((sessionKey, chunk) => {
        if (sessionKey === currentSessionKey) {
            setStreamingText((prev) => prev + chunk);
        }
    });

    return unsub;
}, [currentSessionKey]);
```

---

## 4. 새로운 기능 제안

### 4.1 캐릭터 코드 작업 (Code Agent Mode) — P1

캐릭터가 실제 코드를 수정하고 테스트를 실행하는 기능.

```typescript
// 코드 에이전트 모드 세션 생성
function createCodeAgentSession(agentName: string, projectDir: string) {
    return unstable_v2_createSession({
        model: 'claude-sonnet-4-6',
        systemPrompt: buildCodeAgentPrompt(agentName),
        cwd: projectDir,
        tools: { type: 'preset', preset: 'claude_code' },
        // 코드 수정 도구 허용 (사용자 승인 필요)
        permissionMode: 'default',
        // 파일 체크포인트 활성화 → 되돌리기 가능
        enableFileCheckpointing: true,
        settingSources: ['project'],
    });
}
```

**안전장치**:

- `permissionMode: 'default'` → 파일 수정 전 사용자 승인 필요
- `enableFileCheckpointing: true` → 변경사항 되돌리기 가능
- `canUseTool` 콜백으로 세밀한 권한 제어 가능

```typescript
// 사용자 승인 UI를 Electron 다이얼로그로 표시
canUseTool: async (toolName, input) => {
    if (['Edit', 'Write', 'Bash'].includes(toolName)) {
        const response = await dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['허용', '거부'],
            title: `${agentName} 도구 사용 요청`,
            message: `${agentName}이(가) ${toolName}을 사용하려 합니다:\n${JSON.stringify(input).slice(0, 200)}`,
        });
        return response.response === 0; // 0 = 허용
    }
    return true; // Read, Glob 등은 자동 허용
},
```

### 4.2 멀티 에이전트 협업 (Team Meeting) — P2

여러 캐릭터가 하나의 주제로 순서대로 의견을 제시하는 "팀 회의" 기능.

```typescript
// electron/team-meeting.ts
interface MeetingConfig {
    topic: string;
    participants: string[]; // ['sera', 'rio', 'luna', 'ara']
    projectDir: string;
    rounds: number; // 논의 라운드 수
}

async function* runTeamMeeting(config: MeetingConfig) {
    const { topic, participants, projectDir, rounds } = config;
    const sessions = new Map<string, any>();

    // 각 참가자별 세션 생성
    for (const agent of participants) {
        const session = unstable_v2_createSession({
            model: 'claude-sonnet-4-6',
            systemPrompt: buildMeetingPrompt(agent, participants),
            cwd: projectDir,
            tools: { type: 'preset', preset: 'claude_code' },
            allowedTools: ['Read', 'Glob', 'Grep'],
            settingSources: ['project'],
        });
        sessions.set(agent, session);
    }

    let discussion = `주제: ${topic}\n\n`;

    for (let round = 0; round < rounds; round++) {
        for (const agent of participants) {
            const session = sessions.get(agent)!;
            const prompt =
                round === 0
                    ? `팀 회의 주제: "${topic}". 너의 전문 분야 관점에서 의견을 제시해.`
                    : `지금까지 논의:\n${discussion}\n\n이전 논의를 바탕으로 추가 의견을 제시해.`;

            await session.send(prompt);
            let response = '';
            for await (const msg of session.stream()) {
                if (msg.type === 'assistant') {
                    const text = msg.message.content
                        .filter((b: any) => b.type === 'text')
                        .map((b: any) => b.text)
                        .join('');
                    response += text;
                }
            }

            discussion += `[${agent}] ${response}\n\n`;
            yield { agent, round, response };
        }
    }

    // 세션 정리
    for (const session of sessions.values()) {
        session.close();
    }
}
```

### 4.3 프로젝트 분석 대시보드 — P1

캐릭터가 프로젝트를 분석하여 대시보드에 인사이트를 표시.

```typescript
// 프로젝트 분석 요청 (alex: 데이터 분석 캐릭터)
async function analyzeProject(projectDir: string) {
    const result = await unstable_v2_prompt(
        `이 프로젝트를 분석해줘. 다음 항목을 JSON으로 반환해:
         - fileCount: 파일 수
         - languages: 사용 언어 비율
         - dependencies: 주요 의존성
         - testCoverage: 테스트 파일 비율
         - recentChanges: 최근 git 변경 요약
         - suggestions: 개선 제안 3가지`,
        {
            model: 'claude-sonnet-4-6',
            cwd: projectDir,
            tools: { type: 'preset', preset: 'claude_code' },
            allowedTools: ['Read', 'Glob', 'Grep', 'Bash(git:*)'],
            outputFormat: {
                type: 'json_schema',
                schema: {
                    /* JSON Schema */
                },
            },
            settingSources: ['project'],
        },
    );
    return result;
}
```

### 4.4 커스텀 MCP 서버 연동 — P2

Dokba Studio 자체 MCP 서버를 만들어 캐릭터에게 추가 도구 제공.

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

// Dokba 전용 MCP 도구 정의
const dokbaMcpServer = createSdkMcpServer({
    name: 'dokba-tools',
    version: '1.0.0',
    tools: [
        tool(
            'get_agent_info',
            '에이전트 캐릭터 정보를 가져옵니다',
            { agentName: z.string() },
            async ({ agentName }) => {
                const persona = AGENT_PERSONAS[agentName.toLowerCase()];
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                persona || { error: 'Unknown agent' },
                            ),
                        },
                    ],
                };
            },
        ),
        tool(
            'notify_user',
            '사용자에게 알림을 보냅니다',
            {
                message: z.string(),
                level: z.enum(['info', 'warning', 'error']),
            },
            async ({ message, level }) => {
                mainWindow?.webContents.send('notification', {
                    message,
                    level,
                });
                return {
                    content: [{ type: 'text', text: 'Notification sent' }],
                };
            },
        ),
    ],
});

// 세션에 MCP 서버 연결
const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    mcpServers: {
        'dokba-tools': dokbaMcpServer,
    },
});
```

---

## 5. 기술적 구현 경로

### 5.1 우선순위 매트릭스

| 기능                             | 우선순위 | 난이도 | 의존성                           | 예상 작업량 |
| -------------------------------- | -------- | ------ | -------------------------------- | ----------- |
| Agent SDK 도입 + Multi-turn 채팅 | **P0**   | 중     | `@anthropic-ai/claude-agent-sdk` | 2-3일       |
| 스트리밍 응답 UI                 | **P0**   | 저     | Agent SDK                        | 1일         |
| node-pty 터미널                  | **P0**   | 중     | `node-pty`, `electron-rebuild`   | 1-2일       |
| 프로젝트 컨텍스트 연동           | **P1**   | 저     | Agent SDK, 디렉토리 선택 UI      | 1일         |
| 캐릭터 코드 에이전트             | **P1**   | 고     | Agent SDK, 권한 UI               | 3-4일       |
| 프로젝트 분석 대시보드           | **P1**   | 중     | Agent SDK                        | 2일         |
| 멀티 에이전트 협업               | **P2**   | 고     | Agent SDK, 세션 관리             | 3-5일       |
| 커스텀 MCP 서버                  | **P2**   | 중     | Agent SDK, Zod                   | 2-3일       |

### 5.2 Phase 구현 순서

```
Phase 0 (P0 — 즉시 착수)
├── @anthropic-ai/claude-agent-sdk 설치
├── chat:send → Agent SDK session 기반으로 전환
├── 스트리밍 IPC + Renderer UI
└── node-pty 터미널 교체

Phase 1 (P1 — P0 완료 후)
├── 프로젝트 디렉토리 선택 + cwd 전달
├── 캐릭터 코드 에이전트 모드
├── 권한 승인 UI (dialog)
└── 프로젝트 분석 대시보드

Phase 2 (P2 — 확장)
├── 멀티 에이전트 팀 회의
├── 커스텀 MCP 서버
└── 세션 히스토리 관리 UI
```

### 5.3 패키지 변경

```json
{
    "dependencies": {
        "@anthropic-ai/claude-agent-sdk": "^0.2.37",
        "node-pty": "^1.0.0",
        "zod": "^3.23.0"
    }
}
```

### 5.4 IPC 아키텍처 변경 요약

#### Before (현재)

```
chat:send(agentName, message) → execFile('claude', ['-p', ...]) → text
terminal:create → spawn('powershell') → pipe
```

#### After (목표)

```
chat:start(agentName, projectDir) → createSession() → sessionKey
chat:send(sessionKey, message)    → session.send() + stream() → streaming chunks
chat:close(sessionKey)            → session.close()
chat:stream (event)               → real-time text chunks

terminal:create → pty.spawn() → TTY
terminal:write  → pty.write()
terminal:resize → pty.resize()  ← 현재 no-op에서 실제 동작으로

project:selectDir → dialog.showOpenDialog()
project:analyze   → unstable_v2_prompt() → JSON
```

### 5.5 모델 전략

| 용도                 | 모델                | 이유                       |
| -------------------- | ------------------- | -------------------------- |
| 일반 캐릭터 채팅     | `claude-sonnet-4-6` | 빠른 응답, 저렴한 비용     |
| 코드 에이전트 모드   | `claude-sonnet-4-6` | 코드 작업 + 비용 효율      |
| 프로젝트 분석        | `claude-sonnet-4-6` | 충분한 품질                |
| 아키텍처 설계 (namu) | `claude-opus-4-6`   | 복잡한 사고 필요 시 선택적 |

### 5.6 비용 관리

```typescript
// 세션별 비용 제한
const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.5, // 세션당 $0.50 제한
    effort: 'medium', // 일반 채팅은 medium effort
});

// 코드 에이전트는 높은 제한
const codeSession = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 2.0,
    effort: 'high',
    maxTurns: 20,
});
```

---

## 6. 리스크 및 고려사항

### 6.1 기술 리스크

| 리스크                          | 영향                   | 완화 방안                                 |
| ------------------------------- | ---------------------- | ----------------------------------------- |
| Agent SDK V2가 unstable preview | API 변경 가능          | V1 query() fallback 준비, 버전 고정       |
| node-pty Windows 빌드           | native addon 호환성    | electron-rebuild, CI에서 사전 검증        |
| 세션 메모리 누수                | 다수 세션 동시 실행 시 | 유휴 세션 자동 정리 (10분), maxTurns 제한 |
| Claude CLI 인증 만료            | 세션 중간 실패         | auth-status 주기적 체크, 재인증 UI        |

### 6.2 V2 SDK unstable 대응

```typescript
// V2 사용 불가 시 V1 fallback
let createSession: typeof unstable_v2_createSession;
try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    createSession = sdk.unstable_v2_createSession;
} catch {
    // V1 query() 기반 wrapper
    createSession = createV1SessionWrapper;
}
```

---

## 7. CLI 방식 대안 (Agent SDK 없이)

Agent SDK 도입이 어려운 경우, CLI만으로도 상당 부분 개선 가능:

### 7.1 세션 유지 (--resume)

```typescript
// 세션 ID 저장 후 재사용
const sessions = new Map<string, string>(); // agentName → sessionId

ipcMain.handle(
    'chat:send',
    async (_event, agentName: string, message: string) => {
        const systemPrompt = buildSystemPrompt(agentName);
        const args = [
            '-p',
            message,
            '--system-prompt',
            systemPrompt,
            '--output-format',
            'json',
        ];

        const existingSessionId = sessions.get(agentName);
        if (existingSessionId) {
            args.push('--resume', existingSessionId);
        }

        const { stdout } = await execFileAsync('claude', args, {
            env: { ...process.env, CLAUDECODE: undefined, FORCE_COLOR: '0' },
            timeout: 60000,
            shell: true,
        });

        const result = JSON.parse(stdout);
        sessions.set(agentName, result.session_id);

        return {
            success: true,
            text: result.result,
            sessionId: result.session_id,
        };
    },
);
```

### 7.2 스트리밍 (--output-format stream-json)

```typescript
ipcMain.handle(
    'chat:send-stream',
    async (_event, agentName: string, message: string) => {
        const systemPrompt = buildSystemPrompt(agentName);
        const args = [
            '-p',
            message,
            '--system-prompt',
            systemPrompt,
            '--output-format',
            'stream-json',
            '--verbose',
        ];

        const proc = spawn('claude', args, {
            env: { ...process.env, CLAUDECODE: undefined, FORCE_COLOR: '0' },
            shell: true,
        });

        let fullText = '';

        proc.stdout?.on('data', (data: Buffer) => {
            const lines = data.toString().split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'assistant' && msg.message?.content) {
                        const text = msg.message.content
                            .filter((b: any) => b.type === 'text')
                            .map((b: any) => b.text)
                            .join('');
                        fullText += text;
                        mainWindow?.webContents.send(
                            'chat:stream',
                            agentName,
                            text,
                        );
                    }
                } catch {
                    /* skip non-JSON lines */
                }
            }
        });

        return new Promise((resolve) => {
            proc.on('exit', () => {
                resolve({ success: true, text: fullText });
            });
        });
    },
);
```

---

## 8. 결론 및 권장 사항

### 즉시 실행 (P0)

1. `@anthropic-ai/claude-agent-sdk` 설치 → V2 createSession 기반 채팅 전환
2. `node-pty` 도입 → 터미널 인터랙티브 지원
3. 스트리밍 IPC → 실시간 응답 UI

### 차기 (P1)

4. 프로젝트 디렉토리 선택 + cwd 전달
5. 캐릭터 코드 에이전트 모드 (Read/Glob/Grep 허용)
6. 프로젝트 분석 대시보드

### 확장 (P2)

7. 멀티 에이전트 팀 회의
8. 커스텀 MCP 도구
9. 세션 히스토리 UI

**핵심 메시지**: `@anthropic-ai/claude-agent-sdk`가 게임 체인저. 현재 `execFile` 호출을 SDK 세션으로 전환하면 multi-turn, 스트리밍, 프로젝트 컨텍스트, 코드 에이전트까지 자연스럽게 확장 가능.

---

## 9. Claude Code 200% 활용 전략 — 공식 기능 기반 확장 로드맵

> 작성일: 2026-03-01
> 목표: Claude Code CLI의 모든 공식 기능을 Artience 플랫폼에 통합하여 **단순 CLI 래퍼를 넘어선 200% 활용** 달성

### 9.1 아키텍처 개요: 듀얼 뷰 + Claude Code 기능 매핑

현재 구현된 **캐릭터 독 + 채팅/터미널 듀얼 뷰** 아키텍처에서 Claude Code의 공식 기능들을 레이어별로 매핑:

```
┌─────────────────────────────────────────────────────────────────┐
│  ARTIENCE PLATFORM                                              │
│                                                                 │
│  Layer 4: 팀 협업 (Agent Teams, 멀티 에이전트)                   │
│  Layer 3: 자동화 (Hooks, Skills, MCP)                            │
│  Layer 2: 세션 관리 (Resume, Worktree, Context)                  │
│  Layer 1: 코어 (PTY + CLI flags + Permission)                    │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐         │
│  │  캐릭터 독바  │   │  채팅 뷰     │   │  터미널 뷰   │         │
│  │  (25 agents) │   │  (파싱 UI)  │   │  (raw xterm) │         │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘         │
│         └──────────────────┼──────────────────┘                  │
│                            ▼                                     │
│              ┌─────────────────────────┐                         │
│              │    단일 PTY 세션 (공유)   │                         │
│              │    claude --system-prompt │                         │
│              └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

---

### 9.2 Layer 1: CLI 플래그 완전 활용

#### 9.2.1 시스템 프롬프트 파일 기반 관리

**현재**: `--system-prompt "인라인 텍스트"` (이스케이프 문제, 길이 제한)
**개선**: `--system-prompt-file` + `--append-system-prompt` 조합

```typescript
// electron/agent-manager.ts 개선
function buildAutoCommand(agent: AgentProfile, cwd: string): string {
    // 에이전트별 프롬프트 파일 생성 (임시)
    const promptPath = path.join(os.tmpdir(), `artience-${agent.id}.md`);
    fs.writeFileSync(promptPath, buildSystemPrompt(agent.name));

    const flags = [
        'claude',
        `--system-prompt-file "${promptPath}"`,
        '--verbose', // 풍부한 출력 (채팅 파서 정확도 향상)
    ].join(' ');

    return flags;
}
```

#### 9.2.2 Permission Mode별 캐릭터 프로필

각 캐릭터의 역할에 맞는 권한 모드 자동 설정:

| 캐릭터           | Permission Mode | 이유                                  |
| ---------------- | --------------- | ------------------------------------- |
| Sera (PM)        | `plan`          | 분석/계획만, 코드 수정 안 함          |
| Rio (백엔드)     | `acceptEdits`   | 파일 수정 자동 승인, 실행은 승인 필요 |
| Luna (프론트)    | `acceptEdits`   | 파일 수정 자동 승인                   |
| Ara (QA)         | `plan`          | 코드 읽기만, 테스트 실행은 별도 승인  |
| Duri (보안)      | `plan`          | 보안 감사는 읽기만                    |
| Podo (코드 리뷰) | `plan`          | 리뷰는 읽기만                         |
| 나머지           | `default`       | 매번 승인                             |

```typescript
// src/data/agent-personas.ts 확장
export const AGENT_PERMISSION_MODES: Record<string, string> = {
    sera: 'plan',
    rio: 'acceptEdits',
    luna: 'acceptEdits',
    ara: 'plan',
    duri: 'plan',
    podo: 'plan',
    // 기본값: 'default'
};
```

#### 9.2.3 모델 최적화 전략

```typescript
// 캐릭터별 모델 자동 선택
export const AGENT_MODEL_MAP: Record<string, string> = {
    namu: 'opus', // 아키텍처 → 복잡한 사고 필요
    sera: 'opus', // PM → 종합적 판단 필요
    podo: 'sonnet', // 코드 리뷰 → 빠른 응답
    // 기본값: 'sonnet' (비용 효율)
};

function buildAutoCommand(agent: AgentProfile, cwd: string): string {
    const model = AGENT_MODEL_MAP[agent.id.replace('a', '')] || 'sonnet';
    return `claude --model ${model} --system-prompt-file "${promptPath}"`;
}
```

#### 9.2.4 도구 제한 (캐릭터별 allowedTools)

```typescript
export const AGENT_ALLOWED_TOOLS: Record<string, string[]> = {
    sera: ['Read', 'Glob', 'Grep'], // PM: 읽기만
    rio: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'], // 백엔드: 모든 도구
    luna: ['Read', 'Edit', 'Write', 'Glob', 'Grep'], // 프론트: Bash 제외
    ara: ['Read', 'Glob', 'Grep', 'Bash(npm run test *)'], // QA: 테스트만 실행
    duri: ['Read', 'Glob', 'Grep'], // 보안: 읽기만
    podo: ['Read', 'Glob', 'Grep'], // 리뷰: 읽기만
    miso: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'], // DevOps: 모든 도구
    toto: ['Read', 'Glob', 'Grep', 'Bash(psql *)'], // DBA: DB만
};

// autoCommand에 적용
function buildAutoCommand(agent: AgentProfile, cwd: string): string {
    const tools = AGENT_ALLOWED_TOOLS[agent.name.toLowerCase()];
    const toolsFlag = tools ? `--allowedTools "${tools.join(',')}"` : '';
    return `claude ${toolsFlag} ...`;
}
```

#### 9.2.5 비용 제한

```typescript
// 세션당 예산 제한 (--max-budget-usd는 print 모드 전용이므로,
// 인터랙티브 모드에서는 CLAUDE.md로 관리)
// .claude/CLAUDE.md에 비용 관련 지침 추가
```

---

### 9.3 Layer 2: 세션 관리 고도화

#### 9.3.1 세션 자동 복원 (--resume)

캐릭터 재클릭 시 이전 세션을 자동 복원:

```typescript
// useTerminalStore에 sessionId 저장
interface TerminalTab {
    id: string;
    agentId?: string;
    agentName?: string;
    label: string;
    cwd: string;
    status: 'connecting' | 'connected' | 'exited';
    claudeSessionId?: string; // NEW: Claude Code session ID
}

// 세션 복원 시 --resume 사용
function buildAutoCommand(
    agent: AgentProfile,
    cwd: string,
    sessionId?: string,
): string {
    const flags = ['claude', `--system-prompt-file "${promptPath}"`];
    if (sessionId) {
        flags.push(`--resume "${sessionId}"`);
    }
    return flags.join(' ');
}
```

**세션 ID 캡처 방법**: PTY stdout에서 JSON 파싱 또는 `~/.claude/projects/` 디렉토리 모니터링

#### 9.3.2 Git Worktree 격리 (각 캐릭터별 브랜치)

```
캐릭터 독에서 Sera 클릭 → feature/sera-work 브랜치 자동 생성
Rio 클릭 → feature/rio-work 브랜치 자동 생성
→ 각 캐릭터가 독립적인 git worktree에서 작업
→ 충돌 없이 병렬 개발
```

```typescript
// 캐릭터 최초 클릭 시 worktree 자동 생성
async function createAgentWorktree(
    agentId: string,
    cwd: string,
): Promise<string> {
    const branchName = `agent/${agentId}`;
    const worktreePath = path.join(cwd, `.claude/worktrees/${agentId}`);

    await exec(`git worktree add -b ${branchName} ${worktreePath} HEAD`, {
        cwd,
    });

    return worktreePath;
}

// autoCommand에 적용
function buildAutoCommand(agent: AgentProfile, worktreePath: string): string {
    return `cd "${worktreePath}" && claude --system-prompt-file "${promptPath}"`;
}
```

#### 9.3.3 CLAUDE.md 자동 생성/관리

프로젝트 디렉토리에 `.claude/CLAUDE.md`를 자동 생성하여 캐릭터의 행동 규범 설정:

```typescript
// 최초 디렉토리 선택 시 자동 생성
async function ensureClaudeMd(cwd: string, agent: AgentProfile): Promise<void> {
    const claudeDir = path.join(cwd, '.claude');
    const claudeMdPath = path.join(claudeDir, 'CLAUDE.md');

    if (fs.existsSync(claudeMdPath)) return;

    await fs.promises.mkdir(claudeDir, { recursive: true });
    await fs.promises.writeFile(
        claudeMdPath,
        `
# Artience Project Configuration

## Agent Rules
- 모든 코드 변경은 한국어 주석 포함
- 커밋 메시지는 Conventional Commits 형식
- 테스트 없이 코드 수정 금지

## Build Commands
- \`npm run dev\` — 개발 서버 시작
- \`npm run build\` — 프로덕션 빌드
- \`npm run test\` — 테스트 실행

## Architecture
[프로젝트 구조는 에이전트가 자동 분석하여 채움]
`,
    );
}
```

#### 9.3.4 Context 관리 최적화

```typescript
// .claude/settings.json에 자동 컴팩션 설정
{
    "env": {
        "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "80"  // 80%에서 자동 컴팩션
    }
}
```

---

### 9.4 Layer 3: 자동화 — Hooks, Skills, MCP

#### 9.4.1 Hooks 시스템 통합

Artience 전용 Hooks를 `.claude/settings.json`에 설정하여 자동화:

```json
{
    "hooks": {
        "PostToolUse": [
            {
                "matcher": "Edit|Write",
                "hooks": [
                    {
                        "type": "command",
                        "command": "prettier --write $(echo $TOOL_INPUT | jq -r '.file_path' 2>/dev/null || echo '')"
                    }
                ]
            }
        ],
        "SessionStart": [
            {
                "matcher": "compact",
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo '중요: 이 프로젝트는 Artience 플랫폼에서 관리됩니다. 한국어로 응답하세요.'"
                    }
                ]
            }
        ],
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo '{\"event\":\"agent_stop\",\"ts\":'$(date +%s)'}' >> ~/.artience/activity.jsonl"
                    }
                ]
            }
        ],
        "TaskCompleted": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "echo '{\"event\":\"task_done\",\"ts\":'$(date +%s)'}' >> ~/.artience/activity.jsonl"
                    }
                ]
            }
        ]
    }
}
```

**Artience에서 활용 가능한 Hook 시나리오:**

| Hook Event                 | 용도              | Artience 통합                    |
| -------------------------- | ----------------- | -------------------------------- |
| `PostToolUse(Edit\|Write)` | 코드 자동 포맷팅  | prettier/eslint 자동 실행        |
| `PostToolUse(Bash)`        | 실행 결과 로깅    | activity log에 기록              |
| `SessionStart(compact)`    | 컨텍스트 복원     | 프로젝트 규칙 재주입             |
| `Stop`                     | 작업 완료 알림    | 캐릭터 상태 IDLE 복귀, 메일 전송 |
| `TaskCompleted`            | 작업 완료 추적    | 대시보드 업데이트                |
| `PreToolUse(Bash)`         | 위험 명령 차단    | `rm -rf`, `drop table` 등 차단   |
| `SubagentStart`            | 서브에이전트 추적 | AgentTown 시각화 연동            |
| `SubagentStop`             | 서브에이전트 완료 | 캐릭터 상태 업데이트             |

#### 9.4.2 Custom Skills (캐릭터별 슬래시 커맨드)

프로젝트 `.claude/skills/`에 Artience 전용 스킬 배치:

```
.claude/skills/
├── code-review/
│   └── SKILL.md          # /code-review → Podo가 자동 리뷰
├── run-tests/
│   └── SKILL.md          # /run-tests → Ara가 테스트 실행
├── analyze-performance/
│   └── SKILL.md          # /analyze-performance → Somi가 성능 분석
├── deploy-check/
│   └── SKILL.md          # /deploy-check → Miso가 배포 체크
└── security-audit/
    └── SKILL.md          # /security-audit → Duri가 보안 감사
```

**예시: `/code-review` 스킬**

```yaml
---
name: code-review
description: 코드 리뷰 수행 — 최근 변경사항을 분석하고 개선점 제안
argument-hint: "[file-or-dir]"
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash
---

# 코드 리뷰

## 현재 변경사항
!`git diff --stat HEAD~3`

## 최근 커밋
!`git log --oneline -5`

## 지시사항
$ARGUMENTS가 지정되면 해당 파일/디렉토리를 리뷰하고,
지정되지 않으면 최근 3개 커밋의 변경사항을 리뷰해.

리뷰 항목:
1. 코드 품질 (가독성, 유지보수성)
2. 버그 가능성
3. 성능 이슈
4. 보안 취약점
5. 테스트 커버리지
```

#### 9.4.3 커스텀 MCP 서버 — Artience 도구 확장

```typescript
// electron/mcp-artience-server.ts
// Artience 전용 MCP 서버 → Claude에게 추가 도구 제공

// .mcp.json에 등록
{
    "mcpServers": {
        "artience": {
            "type": "stdio",
            "command": "node",
            "args": ["electron/mcp-artience-server.js"],
            "env": {}
        }
    }
}
```

**제공할 MCP 도구:**

| 도구                    | 설명                     | 예시                           |
| ----------------------- | ------------------------ | ------------------------------ |
| `artience_notify`       | 사용자에게 알림 전송     | "빌드 완료!" 토스트            |
| `artience_agent_status` | 다른 에이전트 상태 조회  | "Rio는 지금 뭐 하고 있어?"     |
| `artience_send_mail`    | 에이전트간 메일 전송     | Sera → Rio "API 스펙 확인해줘" |
| `artience_project_info` | 프로젝트 메타정보 조회   | 파일 수, 의존성, git 상태      |
| `artience_create_task`  | 태스크 생성              | "이 버그 Rio한테 할당해"       |
| `artience_dashboard`    | 대시보드 데이터 업데이트 | 프로젝트 분석 결과 전시        |

#### 9.4.4 Custom Subagents — 에이전트 전문화

`.claude/agents/` 디렉토리에 커스텀 서브에이전트 정의:

```yaml
# .claude/agents/code-reviewer.md
---
name: code-reviewer
description: 코드 리뷰 전문 에이전트 — Podo의 서브에이전트로 동작
tools: Read, Grep, Glob
model: sonnet
permissionMode: plan
memory: project
skills:
    - code-review
---
너는 코드 리뷰 전문가야. 코드 품질, 보안, 성능 관점에서 리뷰해.
항상 한국어로 응답하고, 구체적인 코드 라인을 인용해.
```

```yaml
# .claude/agents/test-runner.md
---
name: test-runner
description: 테스트 실행 및 분석 — Ara의 서브에이전트
tools: Read, Grep, Glob, Bash
model: haiku
permissionMode: default
---
테스트를 실행하고 결과를 분석해. 실패한 테스트의 원인을 파악해.
```

---

### 9.5 Layer 4: 팀 협업 — Agent Teams

#### 9.5.1 Agent Teams 활성화

```json
// .claude/settings.json
{
    "env": {
        "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
    },
    "teammateMode": "in-process"
}
```

#### 9.5.2 캐릭터 팀 회의 구현

독바에서 **여러 캐릭터 선택 → "팀 회의" 시작** 기능:

```
[독바: Sera(선택) + Rio(선택) + Luna(선택)]
         ↓ "팀 회의" 버튼
[PTY에서 Claude Agent Teams 자동 시작]
         ↓
Team Lead: Sera (PM)
Teammates: Rio (백엔드), Luna (프론트)
         ↓
주제 입력: "이 프로젝트의 API 설계 리뷰해줘"
         ↓
[각 캐릭터가 순서대로 전문 관점에서 의견 제시]
```

```typescript
// 팀 회의 autoCommand
function buildTeamMeetingCommand(
    leader: AgentProfile,
    members: AgentProfile[],
    cwd: string,
    topic: string,
): string {
    const agents = members.reduce(
        (acc, m) => {
            acc[m.name.toLowerCase()] = {
                description: `${m.name} - ${m.role}`,
                prompt: buildSystemPrompt(m.name),
                tools: AGENT_ALLOWED_TOOLS[m.name.toLowerCase()] || [
                    'Read',
                    'Glob',
                    'Grep',
                ],
                model: AGENT_MODEL_MAP[m.name.toLowerCase()] || 'sonnet',
            };
            return acc;
        },
        {} as Record<string, any>,
    );

    return [
        'claude',
        `--system-prompt "${buildSystemPrompt(leader.name)}"`,
        `--agents '${JSON.stringify(agents)}'`,
        '--permission-mode plan',
    ].join(' ');
}
```

#### 9.5.3 병렬 작업 분배

```
시나리오: "풀스택 기능 구현"
├── Rio (백엔드): API 엔드포인트 구현
├── Luna (프론트): UI 컴포넌트 구현
├── Ara (QA): 테스트 작성
└── Podo (리뷰): 완료 후 리뷰

→ 각각 독립된 git worktree에서 병렬 작업
→ 완료 후 자동 merge
```

---

### 9.6 UX 향상 — 채팅 뷰 고도화

#### 9.6.1 PTY 출력 구조화 파싱

Claude Code CLI의 출력 패턴을 인식하여 채팅 버블 고도화:

```typescript
// src/lib/pty-parser.ts
interface ParsedChunk {
    type:
        | 'user_prompt'
        | 'assistant_text'
        | 'tool_use'
        | 'tool_result'
        | 'thinking'
        | 'permission_request'
        | 'error'
        | 'raw';
    content: string;
    toolName?: string;
    toolInput?: string;
}

function parsePtyOutput(raw: string): ParsedChunk[] {
    const clean = stripAnsi(raw);
    const chunks: ParsedChunk[] = [];

    // Claude Code CLI 패턴 매칭
    if (clean.includes('❯') || clean.match(/^\s*>\s/m)) {
        chunks.push({ type: 'user_prompt', content: clean });
    } else if (clean.includes('⏺ ') || clean.includes('● ')) {
        // 도구 사용 표시
        const toolMatch = clean.match(/(Read|Edit|Write|Bash|Glob|Grep)\s*\(/);
        chunks.push({
            type: 'tool_use',
            content: clean,
            toolName: toolMatch?.[1],
        });
    } else if (clean.includes('Allow?') || clean.includes('허용')) {
        chunks.push({ type: 'permission_request', content: clean });
    } else if (clean.includes('Error') || clean.includes('에러')) {
        chunks.push({ type: 'error', content: clean });
    } else {
        chunks.push({ type: 'assistant_text', content: clean });
    }

    return chunks;
}
```

#### 9.6.2 채팅 버블 타입별 스타일링

```tsx
// 도구 사용 → 접을 수 있는 블록
{
    chunk.type === 'tool_use' && (
        <details className="bg-[#313244] rounded p-2 text-xs">
            <summary className="text-[#89b4fa] cursor-pointer">
                🔧 {chunk.toolName}
            </summary>
            <pre className="text-[#a6adc8] mt-1 whitespace-pre-wrap">
                {chunk.content}
            </pre>
        </details>
    );
}

// 권한 요청 → 강조 버블 + 승인/거부 버튼
{
    chunk.type === 'permission_request' && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-3">
            <p className="text-yellow-300 text-sm">{chunk.content}</p>
            <div className="flex gap-2 mt-2">
                <button onClick={() => sendToTerminal('y\n')}>허용</button>
                <button onClick={() => sendToTerminal('n\n')}>거부</button>
            </div>
        </div>
    );
}
```

#### 9.6.3 스마트 입력 — 슬래시 커맨드 자동완성

채팅 입력창에서 `/` 입력 시 사용 가능한 Claude Code 슬래시 커맨드 자동완성:

```typescript
const SLASH_COMMANDS = [
    { cmd: '/compact', desc: '컨텍스트 압축' },
    { cmd: '/checkpoint', desc: '상태 저장' },
    { cmd: '/clear', desc: '세션 초기화' },
    { cmd: '/code-review', desc: '코드 리뷰 (Podo)' },
    { cmd: '/run-tests', desc: '테스트 실행 (Ara)' },
    { cmd: '/deploy-check', desc: '배포 체크 (Miso)' },
    { cmd: '/security-audit', desc: '보안 감사 (Duri)' },
    // ... 커스텀 스킬들
];
```

---

### 9.7 운영 효율화

#### 9.7.1 프로젝트별 설정 자동 생성

캐릭터가 프로젝트 디렉토리에 최초 진입 시 자동으로 `.claude/` 디렉토리 구조 생성:

```
.claude/
├── CLAUDE.md              # 프로젝트 규칙 (자동 생성, 사용자 편집 가능)
├── settings.json          # 프로젝트 설정 (hooks, permissions)
├── settings.local.json    # 로컬 개인 설정 (.gitignore)
├── skills/                # 프로젝트 전용 스킬
│   ├── code-review/
│   ├── run-tests/
│   └── security-audit/
├── agents/                # 커스텀 서브에이전트
│   ├── code-reviewer.md
│   └── test-runner.md
└── rules/                 # 경로별 규칙
    ├── frontend.md        # src/components/** 규칙
    ├── backend.md         # src/api/** 규칙
    └── tests.md           # **/*.test.* 규칙
```

#### 9.7.2 캐릭터 활동 대시보드

Hooks의 `Stop`, `TaskCompleted` 이벤트를 수집하여 대시보드 표시:

```typescript
// electron/activity-tracker.ts
// ~/.artience/activity.jsonl 파일 모니터링 → IPC로 Renderer에 전달

interface ActivityEntry {
    event: 'agent_start' | 'agent_stop' | 'task_done' | 'tool_used';
    agentId: string;
    ts: number;
    details?: Record<string, unknown>;
}

// Renderer에서 AgentTown 캐릭터 상태에 반영
// - 작업 중: THINKING 상태 + 말풍선
// - 도구 사용: WORK ZONE 이동
// - 완료: SUCCESS 상태 + 복귀
```

#### 9.7.3 세션 히스토리 관리

```typescript
// ~/.claude/projects/{projectPath}/ 디렉토리에서 세션 목록 조회
async function listSessions(projectDir: string): Promise<SessionInfo[]> {
    const projectHash = hashPath(projectDir);
    const sessionsDir = path.join(
        os.homedir(),
        '.claude',
        'projects',
        projectHash,
    );

    if (!fs.existsSync(sessionsDir)) return [];

    const entries = await fs.promises.readdir(sessionsDir);
    return entries
        .filter((e) => e.endsWith('.jsonl'))
        .map((e) => ({
            id: e.replace('.jsonl', ''),
            // JSONL 첫 줄에서 메타데이터 추출
        }));
}
```

---

### 9.8 구현 우선순위 (확장 전략)

| Phase          | 기능                          | 난이도 | 효과              |
| -------------- | ----------------------------- | ------ | ----------------- |
| **E1** (즉시)  | Permission Mode 캐릭터별 적용 | 저     | 안전성 대폭 향상  |
| **E1** (즉시)  | allowedTools 캐릭터별 제한    | 저     | 역할 기반 보안    |
| **E1** (즉시)  | CLAUDE.md 자동 생성           | 저     | UX 향상           |
| **E2** (1주)   | 세션 자동 복원 (--resume)     | 중     | 컨텍스트 유지     |
| **E2** (1주)   | Hooks 자동 설정               | 중     | 코드 품질 자동화  |
| **E2** (1주)   | 채팅 파서 고도화              | 중     | 채팅 UX 대폭 향상 |
| **E3** (2주)   | Custom Skills 배포            | 중     | 전문화된 자동화   |
| **E3** (2주)   | Custom Subagents              | 중     | 에이전트 전문화   |
| **E3** (2주)   | 슬래시 커맨드 자동완성        | 저     | UX 향상           |
| **E4** (1개월) | Git Worktree 격리             | 고     | 병렬 작업         |
| **E4** (1개월) | MCP 서버 통합                 | 고     | 도구 확장         |
| **E4** (1개월) | Agent Teams                   | 고     | 팀 협업           |
| **E5** (장기)  | 활동 대시보드                 | 중     | 가시성            |
| **E5** (장기)  | 세션 히스토리 UI              | 중     | 관리 편의         |

---

### 9.9 200% 활용 체크리스트

Claude Code 공식 기능 대비 Artience 활용 현황:

| 기능                   | 상태      | 활용 방법                  |
| ---------------------- | --------- | -------------------------- |
| `--system-prompt`      | ✅ 구현됨 | 캐릭터별 페르소나 적용     |
| `--system-prompt-file` | 🔲 미구현 | 긴 프롬프트 파일 기반 관리 |
| `--permission-mode`    | 🔲 미구현 | 캐릭터별 권한 모드         |
| `--allowedTools`       | 🔲 미구현 | 역할 기반 도구 제한        |
| `--model`              | 🔲 미구현 | 캐릭터별 모델 최적화       |
| `--resume`             | 🔲 미구현 | 세션 자동 복원             |
| `--verbose`            | 🔲 미구현 | 채팅 파서 정확도 향상      |
| `--add-dir`            | 🔲 미구현 | 멀티 디렉토리 작업         |
| Hooks                  | 🔲 미구현 | 자동 포맷팅/로깅/알림      |
| Skills                 | 🔲 미구현 | 캐릭터별 슬래시 커맨드     |
| Subagents              | 🔲 미구현 | 전문화된 하위 에이전트     |
| Agent Teams            | 🔲 미구현 | 팀 회의/병렬 작업          |
| MCP Servers            | 🔲 미구현 | Artience 전용 도구         |
| CLAUDE.md              | 🔲 미구현 | 프로젝트 규칙 자동 설정    |
| Worktrees              | 🔲 미구현 | 캐릭터별 브랜치 격리       |
| `--chrome`             | 🔲 미구현 | 웹 자동화/테스트           |
| Context compaction     | 🔲 미구현 | 자동 컨텍스트 관리         |
| `--output-format json` | 🔲 미구현 | 구조화된 응답 파싱         |
| `--json-schema`        | 🔲 미구현 | 분석 결과 구조화           |
| `--max-budget-usd`     | 🔲 미구현 | 비용 제한                  |

**현재 활용률: ~10% → 목표: 90%+**
