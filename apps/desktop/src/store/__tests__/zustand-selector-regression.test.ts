import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    sanitizePersistedDockAgents,
    useTerminalStore,
} from '../useTerminalStore';
import { useGrowthStore } from '../useGrowthStore';

/**
 * Regression tests for "Maximum update depth exceeded" fix.
 *
 * Root cause: Zustand selectors returning new object references on every
 * store mutation caused infinite re-render loops. The fix uses:
 *   - Selective scalar subscriptions (BottomDock)
 *   - Serialized string selectors (ActivityDashboard)
 *   - Stable useMemo dependencies (TeamOrchestrationView)
 *   - useCallback selectors reading specific profile keys (MainLayout)
 */

function resetTerminalStore() {
    useTerminalStore.setState({
        tabs: [],
        activeTabId: null,
        panelVisible: true,
        panelFullscreen: false,
        viewMode: {},
        parsedMessages: {},
        lastToolUseByTab: {},
        characterDirMap: {},
        dockAgents: ['raccoon'],
        pinnedDockAgents: ['raccoon'],
        agentActivity: {},
        agentStates: {},
        agentSettings: {},
        inputHistory: {},
        activeTeamMembers: {},
    });
}

describe('Zustand selector stability (infinite loop regression)', () => {
    beforeEach(() => {
        resetTerminalStore();
    });

    describe('BottomDock: selective subscriptions', () => {
        it('should not trigger selector when unrelated state changes', () => {
            // Selector for tabs should be stable when parsedMessages change
            const tabsSelector = (s: { tabs: unknown[] }) => s.tabs;
            const before = tabsSelector(useTerminalStore.getState());

            // Mutate parsedMessages (high-frequency churn)
            useTerminalStore.getState().addParsedEvent('tab-1', {
                type: 'text',
                content: 'hello',
                timestamp: Date.now(),
            });

            const after = tabsSelector(useTerminalStore.getState());
            // tabs array reference should be the same since tabs didn't change
            expect(before).toBe(after);
        });

        it('should not trigger agentActivity selector for unrelated agents', () => {
            const raccoonSelector = (s: {
                agentActivity: Record<string, string>;
            }) => s.agentActivity['raccoon'];

            useTerminalStore.getState().setAgentActivity('raccoon', 'idle');
            const before = raccoonSelector(useTerminalStore.getState());

            // Mutating a different agent's activity should not affect raccoon selector value
            useTerminalStore.getState().setAgentActivity('fox', 'working');
            const after = raccoonSelector(useTerminalStore.getState());

            expect(before).toBe(after);
        });
    });

    describe('ActivityDashboard: serialized string selectors', () => {
        it('should produce stable serialized key when activity is unchanged', () => {
            const serialize = (s: { agentActivity: Record<string, string> }) =>
                Object.entries(s.agentActivity)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(',');

            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            const key1 = serialize(useTerminalStore.getState());

            // Setting same value should produce identical serialized key
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            const key2 = serialize(useTerminalStore.getState());

            expect(key1).toBe(key2);
        });

        it('should change serialized key when activity actually changes', () => {
            const serialize = (s: { agentActivity: Record<string, string> }) =>
                Object.entries(s.agentActivity)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(',');

            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            const key1 = serialize(useTerminalStore.getState());

            useTerminalStore.getState().setAgentActivity('raccoon', 'success');
            const key2 = serialize(useTerminalStore.getState());

            expect(key1).not.toBe(key2);
        });
    });

    describe('TeamOrchestrationView: stable useMemo deps', () => {
        it('should produce stable memberNodeIds when team is unchanged', () => {
            // Simulates the memberNodeIds pattern used in TeamOrchestrationView
            useTerminalStore
                .getState()
                .setActiveTeamMembers([
                    'frontend-developer',
                    'backend-developer',
                ]);

            const state1 = useTerminalStore.getState();
            const members1 = Object.entries(state1.activeTeamMembers);
            const ids1 = members1
                .map(([, id]) => id)
                .filter((id) => id !== 'raccoon')
                .join(',');

            // Mutating unrelated state (e.g. agentActivity) should not change memberNodeIds
            useTerminalStore.getState().setAgentActivity('raccoon', 'thinking');

            const state2 = useTerminalStore.getState();
            const members2 = Object.entries(state2.activeTeamMembers);
            const ids2 = members2
                .map(([, id]) => id)
                .filter((id) => id !== 'raccoon')
                .join(',');

            expect(ids1).toBe(ids2);
        });

        it('should preserve team membership across team refreshes without adding dock entries', () => {
            const store = useTerminalStore.getState();

            store.ensureTeamAgent('a03', 'Luna');
            store.setActiveTeamMembers(['frontend-developer']);

            const state = useTerminalStore.getState();
            expect(state.activeTeamMembers['frontend-developer']).toBe('a03');
            expect(state.dockAgents).toEqual(['raccoon']);
            expect(state.pinnedDockAgents).toEqual(['raccoon']);
        });

        it('should add a delegated team agent without duplicating team entries', () => {
            const store = useTerminalStore.getState();

            store.ensureTeamAgent('a02', 'Rio');
            store.ensureTeamAgent('a02', 'Rio');

            const state = useTerminalStore.getState();
            expect(state.activeTeamMembers.Rio).toBe('a02');
            expect(state.dockAgents).toEqual(['raccoon']);
            expect(state.pinnedDockAgents).toEqual(['raccoon']);
        });

        it('should keep dock agents separate when the team changes', () => {
            const store = useTerminalStore.getState();

            store.addDockAgent('a04');
            store.ensureTeamAgent('a02', 'Rio');
            store.ensureTeamAgent('a03', 'Luna');
            store.setActiveTeamMembers(['planner']);

            const state = useTerminalStore.getState();
            expect(Object.values(state.activeTeamMembers)).toEqual(['a01']);
            expect(state.dockAgents).toEqual(['raccoon', 'a04']);
            expect(state.pinnedDockAgents).toEqual(['raccoon', 'a04']);
            expect(state.dockAgents).not.toContain('a02');
            expect(state.dockAgents).not.toContain('a03');
            expect(state.dockAgents).not.toContain('a01');
        });

        it('should drop legacy team-only dock agents during persistence merge', () => {
            expect(
                sanitizePersistedDockAgents(
                    ['raccoon', 'a02', 'a03', 'a04'],
                    { a04: '/workspace/project' },
                    {},
                ),
            ).toEqual(['raccoon', 'a04']);
        });

        it('should preserve explicit pinned dock agents without legacy heuristics', () => {
            const store = useTerminalStore.getState();

            store.addDockAgent('a07');

            const state = useTerminalStore.getState();
            expect(state.dockAgents).toEqual(['raccoon', 'a07']);
            expect(state.pinnedDockAgents).toEqual(['raccoon', 'a07']);
        });
    });

    describe('MainLayout: useCallback selector for specific profile', () => {
        it('should read only the specific agent profile without subscribing to all', () => {
            const agentId = 'raccoon';

            // Add growth profile
            useGrowthStore
                .getState()
                .addExp(agentId, 100, 'test-task', [], 'frontend');

            const selectorForAgent = (s: {
                profiles: Record<
                    string,
                    { evolution: { stage: string } } | undefined
                >;
            }) => s.profiles[agentId]?.evolution.stage;

            const stage1 = selectorForAgent(useGrowthStore.getState());

            // Mutating a DIFFERENT agent's profile should not change this selector's output
            useGrowthStore
                .getState()
                .addExp('fox', 50, 'test-task', [], 'frontend');

            const stage2 = selectorForAgent(useGrowthStore.getState());
            expect(stage1).toBe(stage2);
        });
    });

    describe('High-frequency mutation stress test', () => {
        it('should handle rapid parsedMessages mutations without growing unbounded', () => {
            const tabId = 'stress-tab';

            // Simulate rapid PTY output (500+ events)
            for (let i = 0; i < 600; i++) {
                useTerminalStore.getState().addParsedEvent(tabId, {
                    type: 'text',
                    content: `msg-${i}`,
                    timestamp: Date.now(),
                });
            }

            const events =
                useTerminalStore.getState().parsedMessages[tabId] ?? [];
            // MAX_PARSED_EVENTS = 500 in useTerminalStore
            expect(events.length).toBeLessThanOrEqual(500);
        });

        it('should not create new tabs reference when only agentActivity changes', () => {
            useTerminalStore.setState({
                tabs: [
                    {
                        id: 'tab1',
                        agentId: 'raccoon',
                        label: 'Dokba',
                        cwd: '/tmp',
                        status: 'connected',
                    },
                ],
            });

            const tabsBefore = useTerminalStore.getState().tabs;

            // Rapid activity changes (simulating PTY churn)
            for (let i = 0; i < 50; i++) {
                useTerminalStore
                    .getState()
                    .setAgentActivity(
                        'raccoon',
                        i % 2 === 0 ? 'working' : 'thinking',
                    );
            }

            const tabsAfter = useTerminalStore.getState().tabs;
            // tabs reference must remain stable since no tab mutation occurred
            expect(tabsBefore).toBe(tabsAfter);
        });
    });
});
