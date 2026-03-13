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
}

export interface AgentSettings {
    model?: 'opus' | 'sonnet' | 'haiku';
    permissionMode?: 'default' | 'plan' | 'bypassPermissions';
    maxTurns?: number;
    provider?: string; // 'claude' | 'codex' | 'gemini' (default: undefined = claude)
}

export type ViewMode = 'terminal' | 'chat';

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
    addParsedEvent: (tabId: string, event: ParsedEvent) => void;
    clearParsedMessages: (tabId: string) => void;

    // 캐릭터별 디렉토리 매핑 (persist)
    characterDirMap: Record<string, string>; // agentId → cwd
    setCharacterDir: (agentId: string, dir: string) => void;

    // 독에 배치된 에이전트 목록 (persist)
    dockAgents: string[]; // agentId[]
    addDockAgent: (agentId: string) => void;
    removeDockAgent: (agentId: string) => void;

    // 에이전트 활동 상태 (AgentTown 시각화용, 메모리 only)
    agentActivity: Record<string, AgentActivity>;
    setAgentActivity: (agentId: string, status: AgentActivity) => void;

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
    teamAddedAgents: string[]; // 팀으로 인해 dock에 추가된 agentId 목록
    setActiveTeamMembers: (members: string[]) => void;
    clearActiveTeam: () => void;

    // 기존 actions
    addTab: (tab: TerminalTab) => void;
    removeTab: (id: string) => void;
    setActiveTab: (id: string | null) => void;
    updateTab: (id: string, patch: Partial<TerminalTab>) => void;
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
            characterDirMap: {},
            dockAgents: ['raccoon'],
            agentActivity: {},
            agentStates: {},
            agentSettings: {},
            inputHistory: {},
            activeTeamMembers: {},
            teamAddedAgents: [],

            setViewMode: (tabId, mode) =>
                set((s) => ({
                    viewMode: { ...s.viewMode, [tabId]: mode },
                })),

            addParsedEvent: (tabId, event) =>
                set((s) => ({
                    parsedMessages: {
                        ...s.parsedMessages,
                        [tabId]: [...(s.parsedMessages[tabId] || []), event],
                    },
                })),

            clearParsedMessages: (tabId) =>
                set((s) => ({
                    parsedMessages: { ...s.parsedMessages, [tabId]: [] },
                })),

            setCharacterDir: (agentId, dir) =>
                set((s) => ({
                    characterDirMap: { ...s.characterDirMap, [agentId]: dir },
                })),

            addDockAgent: (agentId) =>
                set((s) => {
                    const agents = s.dockAgents ?? [];
                    if (agents.includes(agentId)) return s;
                    return { dockAgents: [...agents, agentId] };
                }),

            removeDockAgent: (agentId) =>
                set((s) => ({
                    dockAgents: (s.dockAgents ?? ([] as string[])).filter(
                        (id: string) => id !== agentId,
                    ),
                })),

            setAgentActivity: (agentId, status) =>
                set((s) => {
                    // Bridge: PTY activity → state machine transition
                    const machine = s.agentStates[agentId];
                    let nextStates = s.agentStates;
                    if (machine) {
                        let targetState: AgentState | null = null;
                        if (
                            (status === 'thinking' || status === 'working') &&
                            machine.currentState !== 'working'
                        ) {
                            targetState = 'working';
                        } else if (
                            status === 'success' &&
                            machine.currentState !== 'done'
                        ) {
                            targetState = 'done';
                        } else if (
                            status === 'error' &&
                            machine.currentState !== 'error'
                        ) {
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
                                ...s.agentStates,
                                [agentId]: appendTransition(
                                    machine,
                                    transition,
                                ),
                            };
                        }
                    }
                    return {
                        agentActivity: {
                            ...s.agentActivity,
                            [agentId]: status,
                        },
                        agentStates: nextStates,
                    };
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

            getAvailableAgents: () => {
                const states = useTerminalStore.getState().agentStates;
                return Object.keys(states).filter(
                    (id) => states[id].currentState === 'idle',
                );
            },

            getAgentState: (agentId) => {
                return useTerminalStore.getState().agentStates[agentId];
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
                    const agents = s.dockAgents ?? [];
                    const mapping = resolveTeamMembers(members, agents);
                    const newAgentIds = Object.values(mapping);
                    const toAdd = newAgentIds.filter(
                        (id) => !agents.includes(id),
                    );
                    return {
                        activeTeamMembers: mapping,
                        teamAddedAgents: toAdd,
                        dockAgents: [...agents, ...toAdd],
                    };
                }),

            clearActiveTeam: () =>
                set((s) => ({
                    activeTeamMembers: {},
                    teamAddedAgents: [],
                    dockAgents: (s.dockAgents ?? ([] as string[])).filter(
                        (id: string) => !(s.teamAddedAgents ?? []).includes(id),
                    ),
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
            removeTab: (id) =>
                set((s) => {
                    const newTabs = s.tabs.filter((t) => t.id !== id);
                    const newActive =
                        s.activeTabId === id
                            ? newTabs.length > 0
                                ? newTabs[newTabs.length - 1].id
                                : null
                            : s.activeTabId;
                    return { tabs: newTabs, activeTabId: newActive };
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
                agentSettings: state.agentSettings,
            }),
            merge: (persisted: any, current: TerminalState) => ({
                ...current,
                ...(persisted as Partial<TerminalState>),
                // 영속 데이터가 손상된 경우 기본값으로 폴백
                dockAgents: Array.isArray((persisted as any)?.dockAgents)
                    ? (persisted as any).dockAgents
                    : current.dockAgents,
                characterDirMap:
                    (persisted as any)?.characterDirMap ??
                    current.characterDirMap,
                agentSettings:
                    (persisted as any)?.agentSettings ?? current.agentSettings,
            }),
        },
    ),
);
