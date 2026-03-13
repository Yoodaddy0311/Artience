# Artience Desktop -- Multi-Terminal + CTO + Mail Integration Architecture Design

> Date: 2026-03-01
> Project: apps/desktop (Electron + React 19 + Zustand + Pixi.js)

---

## 1. User Vision

- **BottomDock** = Multiple Claude Code terminals (each with its own working directory)
- **AgentTown** = Visual representation of agents working in BottomDock terminals
- **Mail Icon** = Agents deliver reports to CTO (user) upon task completion
- **User** = CTO character

---

## 2. AS-IS vs TO-BE

### AS-IS (Current State)

| Component  | Description                                                   |
| ---------- | ------------------------------------------------------------- |
| BottomDock | 10 character icons (static, no state changes)                 |
| Terminal   | Single global terminal inside RunPanel (auto-launches claude) |
| AgentTown  | Otter wanders + moves to work zone on `onStream`              |
| Mail       | None (button exists but non-functional)                       |
| User Role  | None (observer only)                                          |

### TO-BE (Target State)

| Component  | Description                                                           |
| ---------- | --------------------------------------------------------------------- |
| BottomDock | Per-agent terminal tabs -- click to open/focus corresponding terminal |
| Terminal   | One per agent, each with independent directory + Claude Code session  |
| AgentTown  | Real-time reflection of terminal state                                |
| Mail       | Agent completion report inbox                                         |
| User Role  | CTO character                                                         |

---

## 3. GAP Analysis

| #   | Item                    | Current                                                        | Required                                    | GAP                 |
| --- | ----------------------- | -------------------------------------------------------------- | ------------------------------------------- | ------------------- |
| 1   | BottomDock              | 10 static icons                                                | Multi terminal session tabs + CTO           | Full redesign       |
| 2   | Terminal                | Single PTY (embedded in RunPanel)                              | N independent PTYs, each with different cwd | Multi-instance      |
| 3   | AgentTown <-> Terminal  | No connection                                                  | Terminal state -> character real-time sync  | Event bridge        |
| 4   | Character click -> chat | BottomDock->RightSidebar, AgentTown->InspectorCard (separated) | Unified                                     | Unification needed  |
| 5   | Zone usage              | Only 'work' zone used                                          | Role-based zone routing                     | Zone branching      |
| 6   | Mail/Reports            | Button only                                                    | Agent completion -> auto report -> inbox    | New feature         |
| 7   | CTO Character           | Does not exist                                                 | Fixed at BottomDock left side               | New feature         |
| 8   | tool-use visualization  | IPC exists but unsubscribed                                    | Tool usage -> character animation           | Subscribe & connect |
| 9   | ERROR state             | Animation exists but no trigger                                | Chat failure -> ERROR transition            | Connection needed   |
| 10  | Session management      | closeSession IPC not exposed                                   | Cleanup on app exit                         | Memory leak fix     |

---

## 4. Core Data Models

### TerminalTab (useTerminalStore)

```typescript
interface TerminalTab {
    id: string;
    agentId?: string;
    agentName?: string;
    label: string;
    cwd: string;
    status: 'connecting' | 'connected' | 'exited';
}
```

### MailMessage (useMailStore -- Phase 3)

```typescript
interface MailMessage {
    id: string;
    fromAgentId: string;
    fromAgentName: string;
    subject: string;
    body: string;
    type: 'report' | 'error' | 'question' | 'notification';
    timestamp: number;
    read: boolean;
}
```

### CTO Character (Phase 2)

```typescript
const CTO_PROFILE: AgentProfile = {
    id: 'cto',
    name: 'You',
    role: 'CTO',
    sprite: '/assets/characters/cto-otter.png',
    state: 'IDLE',
    currentJobId: null,
    home: { x: 20, y: 14 },
    pos: { x: 20, y: 14 },
};
```

---

## 5. TO-BE Architecture Diagram

> 2026-03-13 업데이트: Electron Main Process 모듈 목록 현행화 (14개+)

```
+--------------------------------------------------------------+
|                        Electron Main Process                  |
|                                                               |
|  채팅/세션 관련                                               |
|  +-----------------------+  +---------------------------+    |
|  | ChatSessionManager    |  | CTO Controller            |    |
|  | (stream-json 양방향)  |  | (--agents 서브에이전트)   |    |
|  +-----------+-----------+  +-------------+-------------+    |
|              |                             |                  |
|  에이전트/스킬 관련                                           |
|  +-----------------------+  +---------------------------+    |
|  | AgentManager          |  | ArtibotRegistry           |    |
|  | (SDK + spawn fallback)|  | (26개 에이전트 레지스트리)|    |
|  +-----------------------+  +---------------------------+    |
|  +-----------------------+  +---------------------------+    |
|  | AgentRecommender      |  | SkillManager              |    |
|  | (태스크 기반 추천)    |  | (스킬 설치/삭제/마켓)    |    |
|  +-----------------------+  +---------------------------+    |
|  +-----------------------+                                    |
|  | SkillCatalog          |                                    |
|  | (10개 외부 스킬 목록) |                                    |
|  +-----------------------+                                    |
|                                                               |
|  인프라/환경 관련                                             |
|  +-----------------------+  +---------------------------+    |
|  | HooksManager          |  | WorktreeManager           |    |
|  | (settings.json 관리)  |  | (Git worktree 격리)       |    |
|  +-----------------------+  +---------------------------+    |
|  +-----------------------+  +---------------------------+    |
|  | McpArtienceServer     |  | ReportManager (계획)      |    |
|  | (4개 도구+FileBridge) |  | (Mail/Summary)            |    |
|  +-----------+-----------+  +-------------+-------------+    |
|              |                             |                  |
|  미래 계획 (Phase 2/3)                                        |
|  +-----------------------+  +---------------------------+    |
|  | MeetingManager        |  | MessengerBridge           |    |
|  | (멀티에이전트 합의)   |  | (Discord/Slack 연동)      |    |
|  +-----------------------+  +---------------------------+    |
|  +-----------------------+  +---------------------------+    |
|  | ProviderRegistry      |  | AgentDB                   |    |
|  | (멀티 CLI 추상화)     |  | (SQLite 동적 관리)        |    |
|  +-----------------------+  +---------------------------+    |
|  +-----------------------+                                    |
|  | WorkflowPackManager   |                                    |
|  | (dev/report/etc 팩)   |                                    |
|  +-----------------------+                                    |
|                                                               |
|         | IPC (75+개 핸들러, 21개 API 그룹)                  |
+---------+-----------------------------------------------------+
          |
+---------+-----------------------------------------------------+
|         v                                         Renderer    |
|  +---------------------------------------------------------+  |
|  |                    useTerminalStore                      |  |
|  |  tabs: TerminalTab[], activeTabId: string | null         |  |
|  +----+-------------------------------------------+--------+  |
|  +----v------------------+  +----------------+  +--v--------+  |
|  |   BottomDock v2       |  |   AgentTown    |  | Mail Inbox|  |
|  | [CTO][T1][T2][+]     |  | character=term |  | report    |  |
|  +---+-------------------+  +-------+--------+  +-----+-----+  |
|      |                              |                  |        |
|  +---v-------------------------------------------------------------+  |
|  |              Terminal Viewport (bottom split)                    |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

### Electron 모듈 목록 (14개 구현 완료 + 7개 계획)

| 모듈                | 파일                               | 설명                                         | 상태         |
| ------------------- | ---------------------------------- | -------------------------------------------- | ------------ |
| ChatSessionManager  | `electron/chat-session-manager.ts` | stream-json 양방향 채팅 세션 관리 (CTO 전용) | 구현 완료    |
| CTO Controller      | `electron/cto-controller.ts`       | DI 패턴, --agents 서브에이전트 위임          | 구현 완료    |
| AgentManager        | `electron/agent-manager.ts`        | SDK query / spawn fallback (CTO 대안)        | 구현 완료    |
| ArtibotRegistry     | `electron/artibot-registry.ts`     | 26개 에이전트 등록 및 조회 레지스트리        | 구현 완료    |
| AgentRecommender    | `electron/agent-recommender.ts`    | 태스크 키워드 기반 에이전트 자동 추천        | 구현 완료    |
| SkillManager        | `electron/skill-manager.ts`        | 스킬 설치/삭제 + 마켓플레이스 검색           | 구현 완료    |
| SkillCatalog        | `electron/skill-catalog.ts`        | 10개 외부 스킬 카탈로그 (한/영 태그)         | 구현 완료    |
| HooksManager        | `electron/hooks-manager.ts`        | .claude/settings.json + CLAUDE.md 자동 생성  | 구현 완료    |
| WorktreeManager     | `electron/worktree-manager.ts`     | 에이전트별 Git worktree 격리                 | 구현 완료    |
| McpArtienceServer   | `electron/mcp-artience-server.ts`  | MCP 도구 4개 + FileBridge                    | 구현 완료    |
| SkillMap            | `electron/skill-map.ts`            | 캐릭터별 스킬 프로필 매핑                    | 구현 완료    |
| MeetingManager      | `electron/meeting-manager.ts`      | 멀티 에이전트 합의 로직                      | Phase 2 계획 |
| MessengerBridge     | `electron/messenger-bridge.ts`     | Discord/Slack 외부 메신저 연동               | Phase 3 계획 |
| ProviderRegistry    | `electron/provider-registry.ts`    | 멀티 CLI 프로바이더 추상화 레이어            | Phase 2 계획 |
| ReportGenerator     | `electron/report-generator.ts`     | 구조화된 MD 리포트 자동 생성                 | Phase 2 계획 |
| WorkflowPackManager | `electron/workflow-pack.ts`        | 프로젝트 유형별 워크플로 팩                  | Phase 2 계획 |
| AgentDB             | `electron/agent-db.ts`             | SQLite 기반 에이전트 동적 관리               | Phase 3 계획 |

---

## 6. IPC Channel Reference (Before/After)

> 2026-03-13 업데이트: 실제 구현 기준 75+개 IPC 핸들러, 21개 API 그룹으로 갱신

| Channel            | Direction | Before               | After                                        |
| ------------------ | --------- | -------------------- | -------------------------------------------- |
| `terminal:create`  | R -> M    | `(cols, rows) -> id` | `(cols, rows, options?) -> {id, label, cwd}` |
| `terminal:list`    | R -> M    | N/A                  | `() -> TerminalInfo[]`                       |
| `terminal:write`   | R -> M    | No change            | No change                                    |
| `terminal:resize`  | R -> M    | No change            | No change                                    |
| `terminal:destroy` | R -> M    | No change            | No change                                    |
| `terminal:data`    | M -> R    | No change            | No change                                    |
| `terminal:exit`    | M -> R    | No change            | No change                                    |

**Key changes:**

- `terminal:create` gains an optional `options` parameter (`{ agentId?, label?, cwd?, autoCommand? }`)
- `terminal:list` is a new IPC channel for querying active terminal sessions

**현재 IPC 규모 (2026-03-13 기준):**

총 **75+개 IPC 핸들러**, **21개 API 그룹** (preload.ts 기준):

- terminal(5), chat(6), cli(2), project(3), file(4), studio(5), job(7), agent(3), skill(6), worktree(3), hooks(3), mail(2), 기타
- 신규 추가: `agent:recommend`, `skill:search/install/uninstall`, `mail:getGitDiff` 등

---

## 7. Sequence Diagram

```
[User]          [BottomDock]     [Electron Main]   [AgentTown]
  |-- click agent -->|              |                |
  |              |-- openTerminal -->|                |
  |              |   (agentId, dir) |                |
  |              |              |-- pty.spawn -----  |
  |              |              |   cd {dir}         |
  |              |              |   claude           |
  |              |<-- {id,label,cwd} |                |
  |<-- show terminal --|              |                |
  |== input ========>|== write ===>|                |
  |              |              |-- agent-status -->|
  |              |              |   (thinking)     |-- character moves
  |<== output ======|<== data ====|                |
  |              |              |-- stream-end --->|-- SUCCESS
```

---

## 8. Implementation Roadmap

### Phase 1: Multi-Terminal Foundation (Current)

| Step | Task                                                |
| ---- | --------------------------------------------------- |
| 1    | Create `useTerminalStore.ts`                        |
| 2    | Extend `terminal:create` IPC with options parameter |
| 3    | Add `terminal:list` IPC channel                     |
| 4    | Refactor `TerminalPanel` for multi-tab support      |
| 5    | Update `BottomDock` for terminal tab switching      |
| 6    | Implement `MainLayout` top-bottom split             |

### Phase 2: State Visualization

| Step | Task                                                |
| ---- | --------------------------------------------------- |
| 7    | Unify `highlightedAgentId` + `selectedAgentId`      |
| 8    | Sync AgentTown PIXI with store                      |
| 9    | Subscribe to tool-use events for character feedback |
| 10   | Add CTO character                                   |

### Phase 3: Mailbox

| Step | Task                             |
| ---- | -------------------------------- |
| 11   | Create `useMailStore.ts`         |
| 12   | Implement auto report generation |
| 13   | Build `MailInbox.tsx` UI         |

---

## 9. Technical Constraints and Solutions

| Constraint                               | Solution                                          |
| ---------------------------------------- | ------------------------------------------------- |
| Multiple PTY memory usage                | Limit tabs (max 8) + immediate release on destroy |
| Multiple xterm DOM performance           | `display:none` (keep DOM, skip rendering)         |
| `terminal:create` backward compatibility | `options` parameter is optional                   |
| `autoCommand` security                   | Protected by `contextIsolation`                   |

---

## 10. BROKEN/STUB Issues

| Issue                                        | Severity | Fix                           |
| -------------------------------------------- | -------- | ----------------------------- |
| `job:stop` -- AbortController not connected  | BROKEN   | Set AC on record in `job:run` |
| `job:getArtifacts` -- not exposed in preload | BROKEN   | Add to preload                |
| `studio:getDiff/rollback` -- stub            | STUB     | Implement in P2               |
| `closeSession` IPC not exposed               | GAP      | Add to preload + main         |
| NDJSON buffer boundary                       | BUG      | Buffer in spawn path          |
| `handleImport/Export` TODO                   | STUB     | Connect file IPC              |
| `WsMessage` type remnants                    | CLEANUP  | Delete                        |

---

## 11. Deprecation/Removal Targets

| Component                 | Action                       | Timeline |
| ------------------------- | ---------------------------- | -------- |
| RightSidebar chat         | Convert to MailSidebar       | Phase 3  |
| RunPanel Terminal tab     | Remove (move to main layout) | Phase 1  |
| AssetInbox                | Convert to MailInbox         | Phase 3  |
| `agent-runtime.ts` legacy | Merge into otter-runtime     | Phase 2  |
