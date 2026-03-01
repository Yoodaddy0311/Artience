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

| Component | Description |
|-----------|-------------|
| BottomDock | 10 character icons (static, no state changes) |
| Terminal | Single global terminal inside RunPanel (auto-launches claude) |
| AgentTown | Otter wanders + moves to work zone on `onStream` |
| Mail | None (button exists but non-functional) |
| User Role | None (observer only) |

### TO-BE (Target State)

| Component | Description |
|-----------|-------------|
| BottomDock | Per-agent terminal tabs -- click to open/focus corresponding terminal |
| Terminal | One per agent, each with independent directory + Claude Code session |
| AgentTown | Real-time reflection of terminal state |
| Mail | Agent completion report inbox |
| User Role | CTO character |

---

## 3. GAP Analysis

| # | Item | Current | Required | GAP |
|---|------|---------|----------|-----|
| 1 | BottomDock | 10 static icons | Multi terminal session tabs + CTO | Full redesign |
| 2 | Terminal | Single PTY (embedded in RunPanel) | N independent PTYs, each with different cwd | Multi-instance |
| 3 | AgentTown <-> Terminal | No connection | Terminal state -> character real-time sync | Event bridge |
| 4 | Character click -> chat | BottomDock->RightSidebar, AgentTown->InspectorCard (separated) | Unified | Unification needed |
| 5 | Zone usage | Only 'work' zone used | Role-based zone routing | Zone branching |
| 6 | Mail/Reports | Button only | Agent completion -> auto report -> inbox | New feature |
| 7 | CTO Character | Does not exist | Fixed at BottomDock left side | New feature |
| 8 | tool-use visualization | IPC exists but unsubscribed | Tool usage -> character animation | Subscribe & connect |
| 9 | ERROR state | Animation exists but no trigger | Chat failure -> ERROR transition | Connection needed |
| 10 | Session management | closeSession IPC not exposed | Cleanup on app exit | Memory leak fix |

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

```
+--------------------------------------------------------------+
|                        Electron Main Process                  |
|  +--------------+  +--------------+  +-------------------+   |
|  | TerminalMgr  |  | AgentManager |  |   ReportManager   |   |
|  | (Multi PTY)  |  | (Chat/SDK)   |  |  (Mail/Summary)   |   |
|  +------+-------+  +------+-------+  +--------+----------+   |
|         | IPC             | IPC                | IPC          |
+---------+-----------------+--------------------+--------------+
          |                 |                    |
+---------+-----------------+--------------------+--------------+
|         v                 v                    v   Renderer   |
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

---

## 6. IPC Channel Reference (Before/After)

| Channel | Direction | Before | After |
|---------|-----------|--------|-------|
| `terminal:create` | R -> M | `(cols, rows) -> id` | `(cols, rows, options?) -> {id, label, cwd}` |
| `terminal:list` | R -> M | N/A | `() -> TerminalInfo[]` |
| `terminal:write` | R -> M | No change | No change |
| `terminal:resize` | R -> M | No change | No change |
| `terminal:destroy` | R -> M | No change | No change |
| `terminal:data` | M -> R | No change | No change |
| `terminal:exit` | M -> R | No change | No change |

**Key changes:**
- `terminal:create` gains an optional `options` parameter (`{ agentId?, label?, cwd?, autoCommand? }`)
- `terminal:list` is a new IPC channel for querying active terminal sessions

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

| Step | Task |
|------|------|
| 1 | Create `useTerminalStore.ts` |
| 2 | Extend `terminal:create` IPC with options parameter |
| 3 | Add `terminal:list` IPC channel |
| 4 | Refactor `TerminalPanel` for multi-tab support |
| 5 | Update `BottomDock` for terminal tab switching |
| 6 | Implement `MainLayout` top-bottom split |

### Phase 2: State Visualization

| Step | Task |
|------|------|
| 7 | Unify `highlightedAgentId` + `selectedAgentId` |
| 8 | Sync AgentTown PIXI with store |
| 9 | Subscribe to tool-use events for character feedback |
| 10 | Add CTO character |

### Phase 3: Mailbox

| Step | Task |
|------|------|
| 11 | Create `useMailStore.ts` |
| 12 | Implement auto report generation |
| 13 | Build `MailInbox.tsx` UI |

---

## 9. Technical Constraints and Solutions

| Constraint | Solution |
|------------|----------|
| Multiple PTY memory usage | Limit tabs (max 8) + immediate release on destroy |
| Multiple xterm DOM performance | `display:none` (keep DOM, skip rendering) |
| `terminal:create` backward compatibility | `options` parameter is optional |
| `autoCommand` security | Protected by `contextIsolation` |

---

## 10. BROKEN/STUB Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| `job:stop` -- AbortController not connected | BROKEN | Set AC on record in `job:run` |
| `job:getArtifacts` -- not exposed in preload | BROKEN | Add to preload |
| `studio:getDiff/rollback` -- stub | STUB | Implement in P2 |
| `closeSession` IPC not exposed | GAP | Add to preload + main |
| NDJSON buffer boundary | BUG | Buffer in spawn path |
| `handleImport/Export` TODO | STUB | Connect file IPC |
| `WsMessage` type remnants | CLEANUP | Delete |

---

## 11. Deprecation/Removal Targets

| Component | Action | Timeline |
|-----------|--------|----------|
| RightSidebar chat | Convert to MailSidebar | Phase 3 |
| RunPanel Terminal tab | Remove (move to main layout) | Phase 1 |
| AssetInbox | Convert to MailInbox | Phase 3 |
| `agent-runtime.ts` legacy | Merge into otter-runtime | Phase 2 |
