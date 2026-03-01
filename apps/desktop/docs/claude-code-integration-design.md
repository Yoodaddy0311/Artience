# Dokba Studio - Claude Code 통합 플랫폼 설계서

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

| 문제 | 상세 | 영향 |
|------|------|------|
| TTY 부재 | `spawn('powershell', [], { stdio: ['pipe','pipe','pipe'] })` → Claude CLI 인터랙티브 모드 불가 | 터미널에서 Claude의 풍부한 UI(색상, 진행바, 도구 승인 등) 사용 불가 |
| 대화 단절 | 매 `chat:send` 마다 새 프로세스 → `execFile('claude', ['-p', ...])` | 에이전트가 이전 대화를 기억 못함, 매번 cold start |
| 컨텍스트 부재 | `--system-prompt`만 전달, `cwd` 미지정 | 캐릭터가 프로젝트 파일을 못 봄, 실제 코드 작업 불가 |
| 성능 | 매 호출마다 프로세스 spawn + CLI 초기화 (약 2-5초) | UX 저하, 빠른 대화 불가 |

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
        env: { ...process.env, CLAUDECODE: undefined } as Record<string, string>,
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

ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    terminals.get(id)?.resize(cols, rows);
});
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
    type SDKMessage
} from '@anthropic-ai/claude-agent-sdk';

interface AgentSession {
    session: any; // SDKSession
    sessionId: string;
    agentName: string;
    createdAt: number;
}

const activeSessions = new Map<string, AgentSession>();

export function createAgentSession(agentName: string, systemPrompt: string, cwd: string) {
    const session = unstable_v2_createSession({
        model: 'claude-sonnet-4-6',  // 채팅용은 Sonnet으로 비용 최적화
        systemPrompt,
        cwd,                         // 프로젝트 디렉토리 전달 → 파일 접근 가능
        permissionMode: 'plan',      // 코드 수정 전 사용자 승인
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
import { createAgentSession, sendMessage, closeSession } from './agent-sessions';

// 세션 생성
ipcMain.handle('chat:start', async (_event, agentName: string, projectDir?: string) => {
    const systemPrompt = buildSystemPrompt(agentName);
    const cwd = projectDir || process.env.HOME || process.env.USERPROFILE || '.';
    const sessionKey = createAgentSession(agentName, systemPrompt, cwd);
    return { sessionKey };
});

// 메시지 전송 (스트리밍)
ipcMain.handle('chat:send', async (event, sessionKey: string, message: string) => {
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
                mainWindow?.webContents.send('chat:stream', sessionKey, text);
            }
        }

        return { success: true, text: fullText };
    } catch (error: any) {
        return { success: false, text: error.message };
    }
});

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
    cwd: '/path/to/user/project',        // 핵심: 프로젝트 루트 전달
    settingSources: ['project'],           // CLAUDE.md 로드
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
            setStreamingText(prev => prev + chunk);
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
    participants: string[];  // ['sera', 'rio', 'luna', 'ara']
    projectDir: string;
    rounds: number;          // 논의 라운드 수
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
            const prompt = round === 0
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
                schema: { /* JSON Schema */ }
            },
            settingSources: ['project'],
        }
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
                    content: [{
                        type: 'text',
                        text: JSON.stringify(persona || { error: 'Unknown agent' }),
                    }],
                };
            }
        ),
        tool(
            'notify_user',
            '사용자에게 알림을 보냅니다',
            { message: z.string(), level: z.enum(['info', 'warning', 'error']) },
            async ({ message, level }) => {
                mainWindow?.webContents.send('notification', { message, level });
                return { content: [{ type: 'text', text: 'Notification sent' }] };
            }
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

| 기능 | 우선순위 | 난이도 | 의존성 | 예상 작업량 |
|------|----------|--------|--------|-------------|
| Agent SDK 도입 + Multi-turn 채팅 | **P0** | 중 | `@anthropic-ai/claude-agent-sdk` | 2-3일 |
| 스트리밍 응답 UI | **P0** | 저 | Agent SDK | 1일 |
| node-pty 터미널 | **P0** | 중 | `node-pty`, `electron-rebuild` | 1-2일 |
| 프로젝트 컨텍스트 연동 | **P1** | 저 | Agent SDK, 디렉토리 선택 UI | 1일 |
| 캐릭터 코드 에이전트 | **P1** | 고 | Agent SDK, 권한 UI | 3-4일 |
| 프로젝트 분석 대시보드 | **P1** | 중 | Agent SDK | 2일 |
| 멀티 에이전트 협업 | **P2** | 고 | Agent SDK, 세션 관리 | 3-5일 |
| 커스텀 MCP 서버 | **P2** | 중 | Agent SDK, Zod | 2-3일 |

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

| 용도 | 모델 | 이유 |
|------|------|------|
| 일반 캐릭터 채팅 | `claude-sonnet-4-6` | 빠른 응답, 저렴한 비용 |
| 코드 에이전트 모드 | `claude-sonnet-4-6` | 코드 작업 + 비용 효율 |
| 프로젝트 분석 | `claude-sonnet-4-6` | 충분한 품질 |
| 아키텍처 설계 (namu) | `claude-opus-4-6` | 복잡한 사고 필요 시 선택적 |

### 5.6 비용 관리

```typescript
// 세션별 비용 제한
const session = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 0.50,  // 세션당 $0.50 제한
    effort: 'medium',     // 일반 채팅은 medium effort
});

// 코드 에이전트는 높은 제한
const codeSession = unstable_v2_createSession({
    model: 'claude-sonnet-4-6',
    maxBudgetUsd: 2.00,
    effort: 'high',
    maxTurns: 20,
});
```

---

## 6. 리스크 및 고려사항

### 6.1 기술 리스크

| 리스크 | 영향 | 완화 방안 |
|--------|------|-----------|
| Agent SDK V2가 unstable preview | API 변경 가능 | V1 query() fallback 준비, 버전 고정 |
| node-pty Windows 빌드 | native addon 호환성 | electron-rebuild, CI에서 사전 검증 |
| 세션 메모리 누수 | 다수 세션 동시 실행 시 | 유휴 세션 자동 정리 (10분), maxTurns 제한 |
| Claude CLI 인증 만료 | 세션 중간 실패 | auth-status 주기적 체크, 재인증 UI |

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

ipcMain.handle('chat:send', async (_event, agentName: string, message: string) => {
    const systemPrompt = buildSystemPrompt(agentName);
    const args = ['-p', message, '--system-prompt', systemPrompt, '--output-format', 'json'];

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

    return { success: true, text: result.result, sessionId: result.session_id };
});
```

### 7.2 스트리밍 (--output-format stream-json)

```typescript
ipcMain.handle('chat:send-stream', async (_event, agentName: string, message: string) => {
    const systemPrompt = buildSystemPrompt(agentName);
    const args = [
        '-p', message,
        '--system-prompt', systemPrompt,
        '--output-format', 'stream-json',
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
                    mainWindow?.webContents.send('chat:stream', agentName, text);
                }
            } catch { /* skip non-JSON lines */ }
        }
    });

    return new Promise((resolve) => {
        proc.on('exit', () => {
            resolve({ success: true, text: fullText });
        });
    });
});
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
