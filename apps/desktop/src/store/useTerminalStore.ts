import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParsedEvent, AgentActivity } from '../lib/pty-parser';
import { resolveTeamMembers } from '../lib/team-character-map';
import type { AgentState, AgentStateMachine } from '../types/agent-state';
import {
    isValidTransition,
    createTransition,
    appendTransition,
    createAgentStateMachine,
} from '../types/agent-state';

export interface TerminalTab {
    id: string; // pty ID from main process
    agentId?: string; // 연결된 에이전트 ID
    agentName?: string;
    label: string;
    cwd: string;
    status: 'connecting' | 'connected' | 'exited';
    restored?: boolean;
}

export interface AgentSettings {
    model?: 'opus' | 'sonnet' | 'haiku';
    permissionMode?: 'default' | 'plan' | 'bypassPermissions';
    maxTurns?: number;
    provider?: string; // 'claude' | 'codex' | 'gemini' (default: undefined = claude)
}

export type ViewMode = 'terminal' | 'chat';

interface AgentActivityLock {
    activity: AgentActivity;
    expiresAt: number;
}

function dedupeAgentIds(agentIds: string[]): string[] {
    return Array.from(new Set(agentIds));
}

export function getVisibleWorldAgentIds(state: {
    dockAgents?: string[];
    activeTeamMembers?: Record<string, string>;
}): string[] {
    return dedupeAgentIds([
        'raccoon',
        ...(state.dockAgents ?? []),
        ...Object.values(state.activeTeamMembers ?? {}),
    ]);
}

export function sanitizePersistedDockAgents(
    dockAgents: unknown,
    characterDirMap?: Record<string, string>,
    agentSettings?: Record<string, AgentSettings>,
): string[] {
    const sanitized = Array.isArray(dockAgents)
        ? dedupeAgentIds(
              dockAgents.filter(
                  (agentId): agentId is string =>
                      typeof agentId === 'string' &&
                      (agentId === 'raccoon' ||
                          Boolean(
                              characterDirMap?.[agentId] ||
                              agentSettings?.[agentId],
                          )),
              ),
          )
        : [];

    return sanitized.includes('raccoon')
        ? sanitized
        : ['raccoon', ...sanitized];
}

interface TerminalState {
    tabs: TerminalTab[];
    activeTabId: string | null;

    // 패널 표시/숨기기
    panelVisible: boolean;
    setPanelVisible: (visible: boolean) => void;

    // 패널 전체 화면 (비영속)
    panelFullscreen: boolean;
    togglePanelFullscreen: () => void;

    // 뷰 모드: 탭별 터미널/채팅 전환 (메모리 only)
    viewMode: Record<string, ViewMode>; // tabId → mode
    setViewMode: (tabId: string, mode: ViewMode) => void;

    // PTY 파서 결과 (메모리 only)
    parsedMessages: Record<string, ParsedEvent[]>; // tabId → events
    lastToolUseByTab: Record<string, string | undefined>;
    addParsedEvent: (tabId: string, event: ParsedEvent) => void;
    addParsedEvents: (tabId: string, events: ParsedEvent[]) => void;
    clearParsedMessages: (tabId: string) => void;

    // 캐릭터별 디렉토리 매핑 (persist)
    characterDirMap: Record<string, string>; // agentId → cwd
    setCharacterDir: (agentId: string, dir: string) => void;

    // 독에 배치된 에이전트 목록 (persist)
    dockAgents: string[]; // agentId[]
    pinnedDockAgents: string[];
    addDockAgent: (agentId: string) => void;
    removeDockAgent: (agentId: string) => void;

    // 에이전트 활동 상태 (AgentTown 시각화용, 메모리 only)
    agentActivity: Record<string, AgentActivity>;
    setAgentActivity: (agentId: string, status: AgentActivity) => void;
    agentActivityLocks: Record<string, AgentActivityLock>;
    hintAgentActivity: (
        agentId: string,
        status: AgentActivity,
        holdMs?: number,
    ) => void;

    // 공식 에이전트 상태 머신 (태스크 배정/추적용, 메모리 only)
    agentStates: Record<string, AgentStateMachine>;
    initAgentState: (agentId: string) => void;
    transitionAgent: (
        agentId: string,
        to: AgentState,
        trigger: string,
    ) => boolean;
    getAvailableAgents: () => string[];
    getAgentState: (agentId: string) => AgentStateMachine | undefined;
    resetAgentState: (agentId: string) => void;

    // 캐릭터별 Claude 설정 (persist)
    agentSettings: Record<string, AgentSettings>; // agentId → settings
    setAgentSettings: (
        agentId: string,
        settings: Partial<AgentSettings>,
    ) => void;

    // 입력 히스토리 (비영속, session-only)
    inputHistory: Record<string, string[]>; // tabId → 최근 입력 50개
    addInputHistory: (tabId: string, text: string) => void;

    // 팀원 ↔ 캐릭터 매핑 (비영속)
    activeTeamMembers: Record<string, string>; // teamMemberName → agentId
    setActiveTeamMembers: (members: string[]) => void;
    ensureTeamAgent: (agentId: string, memberName?: string) => void;
    clearActiveTeam: () => void;

    // 기존 actions
    addTab: (tab: TerminalTab) => void;
    restoreTabs: (tabs: TerminalTab[]) => void;
    removeTab: (id: string) => void;
    setActiveTab: (id: string | null) => void;
    updateTab: (id: string, patch: Partial<TerminalTab>) => void;
}

const MAX_PARSED_EVENTS = 500;
const ACTIVITY_HINT_HOLD_MS = 1800;

function applyAgentActivityState(
    state: TerminalState,
    agentId: string,
    status: AgentActivity,
    locks: Record<string, AgentActivityLock>,
): Partial<TerminalState> {
    const machine = state.agentStates[agentId];
    let nextStates = state.agentStates;
    if (machine) {
        let targetState: AgentState | null = null;
        if (
            [
                'thinking',
                'working',
                'needs_input',
                'reading',
                'typing',
                'writing',
            ].includes(status) &&
            machine.currentState !== 'working'
        ) {
            targetState = 'working';
        } else if (status === 'success' && machine.currentState !== 'done') {
            targetState = 'done';
        } else if (status === 'error' && machine.currentState !== 'error') {
            targetState = 'error';
        }
        if (
            targetState &&
            isValidTransition(machine.currentState, targetState)
        ) {
            const transition = createTransition(
                machine.currentState,
                targetState,
                `pty-${status}`,
            );
            nextStates = {
                ...state.agentStates,
                [agentId]: appendTransition(machine, transition),
            };
        }
    }

    return {
        agentActivity: {
            ...state.agentActivity,
            [agentId]: status,
        },
        agentStates: nextStates,
        agentActivityLocks: locks,
    };
}

function shouldPreserveHint(
    lock: AgentActivityLock | undefined,
    incoming: AgentActivity,
): boolean {
    if (!lock) return false;
    if (Date.now() >= lock.expiresAt) return false;
    if (incoming === 'success' || incoming === 'error') return false;
    if (incoming === 'idle') return true;
    if (
        incoming === 'thinking' &&
        ['reading', 'typing', 'writing'].includes(lock.activity)
    ) {
        return true;
    }
    if (incoming === 'working' && lock.activity === 'writing') {
        return true;
    }
    return false;
}

function appendParsedEvents(
    previousEvents: ParsedEvent[],
    nextEvents: ParsedEvent[],
): ParsedEvent[] {
    if (nextEvents.length === 0) return previousEvents;

    const combined = [...previousEvents, ...nextEvents];
    return combined.length <= MAX_PARSED_EVENTS
        ? combined
        : combined.slice(-MAX_PARSED_EVENTS);
}

function extractLatestToolUse(
    previousToolName: string | undefined,
    events: ParsedEvent[],
): string | undefined {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event.type === 'tool_use' && event.toolName) {
            return event.toolName;
        }
    }
    return previousToolName;
}

export const useTerminalStore = create<TerminalState>()(
    persist(
        (set) => ({
            tabs: [],
            activeTabId: null,
            panelVisible: true,
            setPanelVisible: (visible) => set({ panelVisible: visible }),
            panelFullscreen: false,
            togglePanelFullscreen: () =>
                set((s) => ({ panelFullscreen: !s.panelFullscreen })),
            viewMode: {},
            parsedMessages: {},
            lastToolUseByTab: {},
            characterDirMap: {},
            dockAgents: ['raccoon'],
            pinnedDockAgents: ['raccoon'],
            agentActivity: {},
            agentActivityLocks: {},
            agentStates: {},
            agentSettings: {},
            inputHistory: {},
            activeTeamMembers: {},

            setViewMode: (tabId, mode) =>
                set((s) => ({
                    viewMode: { ...s.viewMode, [tabId]: mode },
                })),

            addParsedEvent: (tabId, event) =>
                set((s) => {
                    const prev = s.parsedMessages[tabId] || [];
                    const next = appendParsedEvents(prev, [event]);
                    return {
                        parsedMessages: {
                            ...s.parsedMessages,
                            [tabId]: next,
                        },
                        lastToolUseByTab: {
                            ...s.lastToolUseByTab,
                            [tabId]: extractLatestToolUse(
                                s.lastToolUseByTab[tabId],
                                [event],
                            ),
                        },
                    };
                }),

            addParsedEvents: (tabId, events) =>
                set((s) => {
                    const prev = s.parsedMessages[tabId] || [];
                    const next = appendParsedEvents(prev, events);
                    return {
                        parsedMessages: {
                            ...s.parsedMessages,
                            [tabId]: next,
                        },
                        lastToolUseByTab: {
                            ...s.lastToolUseByTab,
                            [tabId]: extractLatestToolUse(
                                s.lastToolUseByTab[tabId],
                                events,
                            ),
                        },
                    };
                }),

            clearParsedMessages: (tabId) =>
                set((s) => {
                    const { [tabId]: _lastTool, ...lastToolUseByTab } =
                        s.lastToolUseByTab;
                    return {
                        parsedMessages: { ...s.parsedMessages, [tabId]: [] },
                        lastToolUseByTab,
                    };
                }),

            setCharacterDir: (agentId, dir) =>
                set((s) => ({
                    characterDirMap: { ...s.characterDirMap, [agentId]: dir },
                })),

            addDockAgent: (agentId) =>
                set((s) => {
                    const agents = s.dockAgents ?? [];
                    const pinnedDockAgents = s.pinnedDockAgents ?? [];
                    if (
                        agents.includes(agentId) &&
                        pinnedDockAgents.includes(agentId)
                    ) {
                        return s;
                    }
                    return {
                        dockAgents: agents.includes(agentId)
                            ? agents
                            : [...agents, agentId],
                        pinnedDockAgents: pinnedDockAgents.includes(agentId)
                            ? pinnedDockAgents
                            : [...pinnedDockAgents, agentId],
                    };
                }),

            removeDockAgent: (agentId) =>
                set((s) => ({
                    dockAgents: (s.dockAgents ?? ([] as string[])).filter(
                        (id: string) => id !== agentId,
                    ),
                    pinnedDockAgents: (
                        s.pinnedDockAgents ?? ([] as string[])
                    ).filter((id: string) => id !== agentId),
                })),

            setAgentActivity: (agentId, status) =>
                set((s) => {
                    if (s.agentActivity[agentId] === status) {
                        return s;
                    }

                    const activeLock = s.agentActivityLocks[agentId];
                    if (shouldPreserveHint(activeLock, status)) {
                        return s;
                    }

                    const nextLocks = { ...s.agentActivityLocks };
                    if (activeLock) {
                        delete nextLocks[agentId];
                    }

                    return applyAgentActivityState(
                        s,
                        agentId,
                        status,
                        nextLocks,
                    );
                }),

            hintAgentActivity: (
                agentId,
                status,
                holdMs = ACTIVITY_HINT_HOLD_MS,
            ) =>
                set((s) => {
                    const nextLocks = {
                        ...s.agentActivityLocks,
                        [agentId]: {
                            activity: status,
                            expiresAt: Date.now() + Math.max(0, holdMs),
                        },
                    };
                    return applyAgentActivityState(
                        s,
                        agentId,
                        status,
                        nextLocks,
                    );
                }),

            initAgentState: (agentId) =>
                set((s) => {
                    if (s.agentStates[agentId]) return s;
                    return {
                        agentStates: {
                            ...s.agentStates,
                            [agentId]: createAgentStateMachine(agentId),
                        },
                    };
                }),

            transitionAgent: (agentId, to, trigger) => {
                let success = false;
                set((s) => {
                    const machine =
                        s.agentStates[agentId] ??
                        createAgentStateMachine(agentId);
                    if (!isValidTransition(machine.currentState, to)) {
                        success = false;
                        return s;
                    }
                    const transition = createTransition(
                        machine.currentState,
                        to,
                        trigger,
                    );
                    success = true;
                    return {
                        agentStates: {
                            ...s.agentStates,
                            [agentId]: appendTransition(machine, transition),
                        },
                    };
                });
                return success;
            },

            getAvailableAgents: (): string[] => {
                const states = (
                    useTerminalStore as unknown as {
                        getState: () => TerminalState;
                    }
                ).getState().agentStates;
                return Object.keys(states).filter(
                    (id) => states[id].currentState === 'idle',
                );
            },

            getAgentState: (agentId): AgentStateMachine | undefined => {
                return (
                    useTerminalStore as unknown as {
                        getState: () => TerminalState;
                    }
                ).getState().agentStates[agentId];
            },

            resetAgentState: (agentId) =>
                set((s) => {
                    const machine = s.agentStates[agentId];
                    if (!machine) return s;
                    return {
                        agentStates: {
                            ...s.agentStates,
                            [agentId]: createAgentStateMachine(agentId),
                        },
                    };
                }),

            addInputHistory: (tabId, text) =>
                set((s) => {
                    const prev = s.inputHistory[tabId] || [];
                    // 연속 중복 방지
                    if (prev.length > 0 && prev[prev.length - 1] === text)
                        return s;
                    const next = [...prev, text].slice(-50);
                    return {
                        inputHistory: { ...s.inputHistory, [tabId]: next },
                    };
                }),

            setActiveTeamMembers: (members) =>
                set((s) => {
                    const mapping = resolveTeamMembers(
                        members,
                        s.dockAgents ?? [],
                    );
                    return {
                        activeTeamMembers: mapping,
                    };
                }),

            ensureTeamAgent: (agentId, memberName) =>
                set((s) => {
                    const existingEntry = Object.entries(
                        s.activeTeamMembers,
                    ).find(([, id]) => id === agentId)?.[0];
                    const teamKey = existingEntry ?? memberName ?? agentId;

                    return {
                        activeTeamMembers: {
                            ...s.activeTeamMembers,
                            [teamKey]: agentId,
                        },
                    };
                }),

            clearActiveTeam: () =>
                set(() => ({
                    activeTeamMembers: {},
                })),

            setAgentSettings: (agentId, settings) =>
                set((s) => ({
                    agentSettings: {
                        ...s.agentSettings,
                        [agentId]: { ...s.agentSettings[agentId], ...settings },
                    },
                })),

            addTab: (tab) =>
                set((s) => ({
                    tabs: [...s.tabs, tab],
                    activeTabId: tab.id,
                    panelVisible: true,
                })),
            restoreTabs: (tabs) =>
                set((s) => {
                    if (tabs.length === 0) return s;

                    const merged = [...s.tabs];
                    for (const tab of tabs) {
                        const existingIndex = merged.findIndex(
                            (entry) => entry.id === tab.id,
                        );
                        if (existingIndex >= 0) {
                            merged[existingIndex] = {
                                ...merged[existingIndex],
                                ...tab,
                            };
                        } else {
                            merged.push(tab);
                        }
                    }

                    const hasActive =
                        s.activeTabId !== null &&
                        merged.some((tab) => tab.id === s.activeTabId);

                    return {
                        tabs: merged,
                        activeTabId: hasActive
                            ? s.activeTabId
                            : (merged[merged.length - 1]?.id ?? null),
                        panelVisible: true,
                    };
                }),
            removeTab: (id) =>
                set((s) => {
                    const newTabs = s.tabs.filter((t) => t.id !== id);
                    const newActive =
                        s.activeTabId === id
                            ? newTabs.length > 0
                                ? newTabs[newTabs.length - 1].id
                                : null
                            : s.activeTabId;
                    // Clean up in-memory data for the removed tab to prevent leaks
                    const { [id]: _pm, ...parsedMessages } = s.parsedMessages;
                    const { [id]: _lt, ...lastToolUseByTab } =
                        s.lastToolUseByTab;
                    const { [id]: _vm, ...viewMode } = s.viewMode;
                    const { [id]: _ih, ...inputHistory } = s.inputHistory;
                    return {
                        tabs: newTabs,
                        activeTabId: newActive,
                        parsedMessages,
                        lastToolUseByTab,
                        viewMode,
                        inputHistory,
                    };
                }),
            setActiveTab: (id) => set({ activeTabId: id }),
            updateTab: (id, patch) =>
                set((s) => ({
                    tabs: s.tabs.map((t) =>
                        t.id === id ? { ...t, ...patch } : t,
                    ),
                })),
        }),
        {
            name: 'terminal-store',
            partialize: (state) => ({
                characterDirMap: state.characterDirMap,
                dockAgents: state.dockAgents,
                pinnedDockAgents: state.pinnedDockAgents,
                agentSettings: state.agentSettings,
            }),
            merge: (
                persisted: unknown,
                current: TerminalState,
            ): TerminalState => {
                const p = persisted as Partial<TerminalState> | undefined;
                if (!p) return current;
                // Only pick partialized keys — never spread raw persisted to avoid
                // overwriting action functions or non-persisted state with stale values.
                const persistedCharacterDirMap =
                    p.characterDirMap ?? current.characterDirMap;
                const persistedAgentSettings =
                    p.agentSettings ?? current.agentSettings;
                const normalizedPinnedDockAgents = Array.isArray(
                    p.pinnedDockAgents,
                )
                    ? dedupeAgentIds(
                          p.pinnedDockAgents.filter(
                              (agentId): agentId is string =>
                                  typeof agentId === 'string',
                          ),
                      )
                    : sanitizePersistedDockAgents(
                          p.dockAgents,
                          persistedCharacterDirMap,
                          persistedAgentSettings,
                      );
                const persistedPinnedDockAgents =
                    normalizedPinnedDockAgents.includes('raccoon')
                        ? normalizedPinnedDockAgents
                        : ['raccoon', ...normalizedPinnedDockAgents];
                return {
                    ...current,
                    dockAgents: persistedPinnedDockAgents,
                    pinnedDockAgents: persistedPinnedDockAgents,
                    characterDirMap: persistedCharacterDirMap,
                    agentSettings: persistedAgentSettings,
                };
            },
        },
    ),
);
