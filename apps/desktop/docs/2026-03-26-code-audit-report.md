# Dogba Platform Code Audit Report

> **Date**: 2026-03-26
> **Scope**: Full codebase inspection (98 source files)
> **Team**: backend-auditor (opus), frontend-auditor (opus), types-auditor (opus), build-verifier (opus)
> **Cross-check**: 3 reviewers (sonnet) — circular verification completed
> **Build status**: TypeScript PASS | Vite Build PASS | ESLint 13 errors / 46 warnings

---

## Executive Summary

| Category                         | CRITICAL | HIGH  | MEDIUM |  LOW   |  Total  |
| -------------------------------- | :------: | :---: | :----: | :----: | :-----: |
| Electron Backend (27 files)      |    0     |   1   |   7    |   15   |   23    |
| Frontend Components (47 files)   |    0     |   1   |   12   |   12   |   25    |
| Lib/Store/Types (30 files)       |    0     |   1   |   8    |   14   |   23    |
| Build/Lint/TypeCheck             |    0     |   2   |   11   |   46   |   59    |
| **Total (cross-check adjusted)** |  **0**   | **5** | **38** | **87** | **130** |

**Overall Assessment**: Production-ready codebase with no critical issues. 5 HIGH issues require immediate attention before next release. Code quality is generally high with good patterns.

---

## HIGH Priority Issues (5)

### H-1. chat-session-manager.ts:318 — stdin null check missing

- **Risk**: Runtime crash when stdin is null (process spawned without pipe or already closed)
- **Code**: `session.proc.stdin!.write(input + '\n')` — non-null assertion on nullable
- **Fix**: Add `if (!session.proc.stdin?.writable) return;` before write
- **Cross-check**: APPROVED — confirmed real crash risk

### H-2. LiveDashboard.tsx:91-92 — optional chaining incomplete

- **Risk**: `TypeError: Cannot read properties of undefined` when `taskQueue` or `metrics` is undefined during IPC initialization
- **Code**: `window.dogbaApi?.taskQueue.list()` — `taskQueue` not guarded
- **Fix**: `window.dogbaApi?.taskQueue?.list()` and `window.dogbaApi?.metrics?.topPerformers(5)`
- **Cross-check**: APPROVED — confirmed runtime error in pre-init state

### H-3. AgentTown.tsx:213 — ref update during render (ESLint error)

- **Risk**: Component may not re-render as expected; React 19 strict mode violation
- **Code**: `activeViewRef.current = activeView;` in render body
- **Fix**: Move ref update into `useEffect(() => { activeViewRef.current = activeView; })`
- **Cross-check**: Confirmed by ESLint

### H-4. LevelUpNotification.tsx:37 — ref update during render (ESLint error)

- **Risk**: Same as H-3, callback ref pattern violation
- **Code**: `onCloseRef.current = onClose;` in render body
- **Fix**: Move to `useEffect` or use `useEffectEvent` (React 19)
- **Cross-check**: Confirmed by ESLint

### H-5. VersionHistory.tsx:524 — variable access before declaration (ESLint error)

- **Risk**: ESLint immutability rule violation; `fetchHistory` accessed before `const` declaration
- **Code**: `useEffect(() => { fetchHistory(); }, []);` — `fetchHistory` declared at line 527
- **Fix**: Move `fetchHistory` declaration above the `useEffect`
- **Cross-check**: No runtime error (hoisted via useEffect async), but code smell — downgraded from original HIGH to confirmed code quality issue

---

## MEDIUM Priority Issues (Top 15 — most impactful)

### Backend

| #   | File                    | Line | Issue                                               | Recommendation                               |
| --- | ----------------------- | ---- | --------------------------------------------------- | -------------------------------------------- |
| M-1 | messenger-bridge.ts     | 42   | Tokens stored in plaintext (Discord, Slack)         | Use `electron.safeStorage` before production |
| M-2 | agent-db.ts             | 44   | `seed()` mutates agents object directly             | Create new object with spread operator       |
| M-3 | chat-session-manager.ts | 50   | sessionStore initialized before `app.ready`         | Apply lazy-init pattern                      |
| M-4 | cto-controller.ts       | 36   | `getCTOSystemPrompt()` is dead code (no callers)    | Remove or connect to team session            |
| M-5 | mcp-artience-server.ts  | 257  | FileBridge busy-wait polling (20ms)                 | Use `fs.watch` or longer interval            |
| M-6 | meeting-manager.ts      | 399  | `process.cwd()` used as session cwd                 | Use `getProjectDir()` instead                |
| M-7 | main.ts                 | 997  | `history:read` reads entire file without size limit | Add file size check, read last N bytes       |

### Frontend

| #    | File                | Line    | Issue                                          | Recommendation                                 |
| ---- | ------------------- | ------- | ---------------------------------------------- | ---------------------------------------------- |
| M-8  | LiveDashboard.tsx   | 101     | 5s polling continues when tab is inactive      | Add `document.visibilityState` check           |
| M-9  | AssetsPanel.tsx     | 173     | `window.confirm()` breaks UI consistency       | Use `ConfirmDialog` component (already exists) |
| M-10 | StudioDecorator.tsx | 24-47   | `any` type used 4 times                        | Define proper asset/error interfaces           |
| M-11 | MainLayout.tsx      | 344-362 | Import/Export via IPC — TODO stubs             | Implement when IPC ready                       |
| M-12 | MeetingView.tsx     | 88      | `animate-pulse` on large area — distracting UX | Apply to specific indicator only               |

### Lib/Store/Types

| #    | File                | Line | Issue                                             | Recommendation                             |
| ---- | ------------------- | ---- | ------------------------------------------------- | ------------------------------------------ |
| M-13 | useAppStore.ts      | 262  | Production `console.log` left in code             | Remove or guard with `import.meta.env.DEV` |
| M-14 | useMailStore.ts     | 135  | `MailStatus` → `MailAction['type']` type mismatch | Change param type to `MailAction['type']`  |
| M-15 | useTerminalStore.ts | 381  | `delete nextLocks[agentId]` — object mutation     | Use destructuring to remove key            |

---

## ESLint Summary (59 problems)

### Errors (13)

| Rule              | Count | Files                                                       | Severity                |
| ----------------- | :---: | ----------------------------------------------------------- | ----------------------- |
| react-hooks/refs  |   2   | AgentTown.tsx, LevelUpNotification.tsx                      | HIGH                    |
| no-control-regex  |   7   | HistoryModal, MailReportView, pty-parser (intentional ANSI) | MEDIUM (false positive) |
| no-useless-escape |   4   | TerminalPanel.tsx, pty-parser.ts                            | LOW                     |

### Warnings (46)

| Rule                                 | Count | Action                                            |
| ------------------------------------ | :---: | ------------------------------------------------- |
| @typescript-eslint/no-explicit-any   |  17   | Gradual type improvement                          |
| react-hooks/set-state-in-effect      |   6   | Refactor to derived state or event handlers       |
| react-hooks/purity                   |   4   | Extract `Date.now()`/`Math.random()` to refs      |
| @typescript-eslint/no-unused-vars    |   5   | Remove unused imports/variables                   |
| react-hooks/exhaustive-deps          |   2   | Add missing deps or document intentional omission |
| react-hooks/immutability             |   1   | Fix declaration order                             |
| react-refresh/only-export-components |   1   | Separate constants to own file                    |

---

## Build Health

| Metric        | Value                           | Status    |
| ------------- | ------------------------------- | --------- |
| TypeScript    | 0 errors                        | PASS      |
| Vite Build    | 18.70s, 32 chunks               | PASS      |
| Bundle Size   | ~896KB (253KB gzip)             | OK        |
| Largest Chunk | vendor-pixi: 556KB (162KB gzip) | Monitor   |
| ESLint        | 13 errors, 46 warnings          | NEEDS FIX |

---

## TODO/Stub Inventory

### From CLAUDE.md (known)

| File           | TODO              | Status |
| -------------- | ----------------- | ------ |
| MainLayout.tsx | Studio apply      | Stub   |
| MainLayout.tsx | Project import    | Stub   |
| MainLayout.tsx | Project export    | Stub   |
| AssetInbox.tsx | File copy via IPC | Stub   |
| RunPanel.tsx   | File download     | Stub   |

### Additional TODOs found in audit

| File                 | Line | TODO                                                 |
| -------------------- | ---- | ---------------------------------------------------- |
| cto-controller.ts    | 36   | `getCTOSystemPrompt()` dead code — remove or connect |
| provider-registry.ts | 28   | `checkAuth` only checks `--version`, not actual auth |
| report-generator.ts  | 77   | Mermaid node IDs overflow at 26+ files               |

---

## Recommendations (Priority Order)

### Immediate (Before Next Release)

1. Fix H-1 through H-5 (5 HIGH issues)
2. Remove production `console.log` statements (M-13, plus scattered others)
3. Add `electron.safeStorage` for token storage (M-1)

### Short-term (1-2 Sprints)

4. Fix all 13 ESLint errors
5. Resolve `any` types (17 instances)
6. Replace `window.confirm()` with ConfirmDialog (M-9)
7. Add tab visibility check to polling (M-8)

### Long-term (Backlog)

8. Improve A\* performance with Map-based lookup (if grid scales)
9. Implement remaining TODO stubs (import/export/file copy)
10. Add test coverage for electron/ managers (currently untested)

---

## Cross-check Results

| Reviewer         | Target           | Verdict                              | Adjustments                                |
| ---------------- | ---------------- | ------------------------------------ | ------------------------------------------ |
| checker-backend  | backend-auditor  | APPROVE (2/3), REQUEST_CHANGES (1/3) | CTO dead code description clarified        |
| checker-frontend | frontend-auditor | APPROVE (2/3), REQUEST_CHANGES (1/3) | VersionHistory severity downgraded         |
| checker-types    | types-auditor    | APPROVE (3/3)                        | useTerminalStore downgraded — runtime safe |

---

_Generated by Artibot Team Code Audit | 2026-03-26_
