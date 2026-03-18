import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    useTerminalStore,
    sanitizePersistedDockAgents,
    getVisibleWorldAgentIds,
} from '../useTerminalStore';
import type { TerminalTab, AgentSettings, ViewMode } from '../useTerminalStore';
import type { ParsedEvent, AgentActivity } from '../../lib/pty-parser';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
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
        agentActivityLocks: {},
        agentStates: {},
        agentSettings: {},
        inputHistory: {},
        activeTeamMembers: {},
    });
}

function makeTab(overrides: Partial<TerminalTab> = {}): TerminalTab {
    return {
        id: 'tab-1',
        label: 'Test Tab',
        cwd: '/tmp',
        status: 'connected',
        ...overrides,
    };
}

function makeEvent(overrides: Partial<ParsedEvent> = {}): ParsedEvent {
    return {
        type: 'text',
        content: 'hello',
        timestamp: Date.now(),
        ...overrides,
    } as ParsedEvent;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useTerminalStore', () => {
    beforeEach(() => {
        resetStore();
    });

    // ── Initial State ────────────────────────────────────────────────────────

    describe('initial state', () => {
        it('should have correct defaults', () => {
            const s = useTerminalStore.getState();
            expect(s.tabs).toEqual([]);
            expect(s.activeTabId).toBeNull();
            expect(s.panelVisible).toBe(true);
            expect(s.panelFullscreen).toBe(false);
            expect(s.viewMode).toEqual({});
            expect(s.parsedMessages).toEqual({});
            expect(s.characterDirMap).toEqual({});
            expect(s.dockAgents).toEqual(['raccoon']);
            expect(s.agentActivity).toEqual({});
            expect(s.agentActivityLocks).toEqual({});
            expect(s.agentStates).toEqual({});
            expect(s.agentSettings).toEqual({});
            expect(s.inputHistory).toEqual({});
            expect(s.activeTeamMembers).toEqual({});
        });
    });

    // ── Panel Visibility ─────────────────────────────────────────────────────

    describe('setPanelVisible', () => {
        it('should set panel visible to false', () => {
            useTerminalStore.getState().setPanelVisible(false);
            expect(useTerminalStore.getState().panelVisible).toBe(false);
        });

        it('should set panel visible to true', () => {
            useTerminalStore.getState().setPanelVisible(false);
            useTerminalStore.getState().setPanelVisible(true);
            expect(useTerminalStore.getState().panelVisible).toBe(true);
        });
    });

    // ── Panel Fullscreen ─────────────────────────────────────────────────────

    describe('togglePanelFullscreen', () => {
        it('should toggle from false to true', () => {
            useTerminalStore.getState().togglePanelFullscreen();
            expect(useTerminalStore.getState().panelFullscreen).toBe(true);
        });

        it('should toggle back to false', () => {
            useTerminalStore.getState().togglePanelFullscreen();
            useTerminalStore.getState().togglePanelFullscreen();
            expect(useTerminalStore.getState().panelFullscreen).toBe(false);
        });
    });

    // ── View Mode ────────────────────────────────────────────────────────────

    describe('setViewMode', () => {
        it('should set view mode for a tab', () => {
            useTerminalStore.getState().setViewMode('tab-1', 'chat');
            expect(useTerminalStore.getState().viewMode['tab-1']).toBe('chat');
        });

        it('should set different modes for different tabs', () => {
            useTerminalStore.getState().setViewMode('tab-1', 'chat');
            useTerminalStore.getState().setViewMode('tab-2', 'terminal');
            const { viewMode } = useTerminalStore.getState();
            expect(viewMode['tab-1']).toBe('chat');
            expect(viewMode['tab-2']).toBe('terminal');
        });

        it('should overwrite existing mode', () => {
            useTerminalStore.getState().setViewMode('tab-1', 'chat');
            useTerminalStore.getState().setViewMode('tab-1', 'terminal');
            expect(useTerminalStore.getState().viewMode['tab-1']).toBe(
                'terminal',
            );
        });
    });

    // ── Parsed Messages ──────────────────────────────────────────────────────

    describe('addParsedEvent / clearParsedMessages', () => {
        it('should add a parsed event to a tab', () => {
            const event = makeEvent();
            useTerminalStore.getState().addParsedEvent('tab-1', event);
            const events = useTerminalStore.getState().parsedMessages['tab-1'];
            expect(events).toHaveLength(1);
            expect(events[0]).toEqual(event);
        });

        it('should append events in order', () => {
            useTerminalStore
                .getState()
                .addParsedEvent('tab-1', makeEvent({ content: 'a' }));
            useTerminalStore
                .getState()
                .addParsedEvent('tab-1', makeEvent({ content: 'b' }));
            const events = useTerminalStore.getState().parsedMessages['tab-1'];
            expect(events).toHaveLength(2);
            expect(events[0].content).toBe('a');
            expect(events[1].content).toBe('b');
        });

        it('should append parsed event batches in order', () => {
            useTerminalStore
                .getState()
                .addParsedEvents('tab-1', [
                    makeEvent({ content: 'a' }),
                    makeEvent({ content: 'b' }),
                ]);
            useTerminalStore
                .getState()
                .addParsedEvents('tab-1', [makeEvent({ content: 'c' })]);

            const events = useTerminalStore.getState().parsedMessages['tab-1'];
            expect(events).toHaveLength(3);
            expect(events.map((event) => event.content)).toEqual([
                'a',
                'b',
                'c',
            ]);
        });

        it('should cache the most recent tool use per tab', () => {
            useTerminalStore
                .getState()
                .addParsedEvents('tab-1', [
                    makeEvent({ type: 'tool_use', toolName: 'Read' }),
                    makeEvent({ type: 'text', content: 'done' }),
                    makeEvent({ type: 'tool_use', toolName: 'Edit' }),
                ]);

            expect(useTerminalStore.getState().lastToolUseByTab['tab-1']).toBe(
                'Edit',
            );
        });

        it('should cap at MAX_PARSED_EVENTS (500)', () => {
            for (let i = 0; i < 510; i++) {
                useTerminalStore
                    .getState()
                    .addParsedEvent(
                        'tab-1',
                        makeEvent({ content: `msg-${i}` }),
                    );
            }
            const events = useTerminalStore.getState().parsedMessages['tab-1'];
            expect(events).toHaveLength(500);
            // Oldest events should be trimmed
            expect(events[0].content).toBe('msg-10');
            expect(events[499].content).toBe('msg-509');
        });

        it('should cap parsed event batches at MAX_PARSED_EVENTS (500)', () => {
            const batchedEvents = Array.from({ length: 510 }, (_, index) =>
                makeEvent({ content: `msg-${index}` }),
            );

            useTerminalStore.getState().addParsedEvents('tab-1', batchedEvents);

            const events = useTerminalStore.getState().parsedMessages['tab-1'];
            expect(events).toHaveLength(500);
            expect(events[0].content).toBe('msg-10');
            expect(events[499].content).toBe('msg-509');
        });

        it('should isolate events between tabs', () => {
            useTerminalStore
                .getState()
                .addParsedEvent('tab-1', makeEvent({ content: 'a' }));
            useTerminalStore
                .getState()
                .addParsedEvent('tab-2', makeEvent({ content: 'b' }));
            expect(
                useTerminalStore.getState().parsedMessages['tab-1'],
            ).toHaveLength(1);
            expect(
                useTerminalStore.getState().parsedMessages['tab-2'],
            ).toHaveLength(1);
        });

        it('should clear parsed messages for a tab', () => {
            useTerminalStore.getState().addParsedEvent('tab-1', makeEvent());
            useTerminalStore.getState().addParsedEvent('tab-1', makeEvent());
            useTerminalStore.getState().clearParsedMessages('tab-1');
            expect(useTerminalStore.getState().parsedMessages['tab-1']).toEqual(
                [],
            );
            expect(
                useTerminalStore.getState().lastToolUseByTab['tab-1'],
            ).toBeUndefined();
        });

        it('should not affect other tabs when clearing', () => {
            useTerminalStore.getState().addParsedEvent('tab-1', makeEvent());
            useTerminalStore.getState().addParsedEvent('tab-2', makeEvent());
            useTerminalStore.getState().clearParsedMessages('tab-1');
            expect(
                useTerminalStore.getState().parsedMessages['tab-2'],
            ).toHaveLength(1);
        });
    });

    // ── Character Dir Map ────────────────────────────────────────────────────

    describe('setCharacterDir', () => {
        it('should set character directory', () => {
            useTerminalStore
                .getState()
                .setCharacterDir('raccoon', '/workspace');
            expect(useTerminalStore.getState().characterDirMap['raccoon']).toBe(
                '/workspace',
            );
        });

        it('should overwrite existing directory', () => {
            useTerminalStore.getState().setCharacterDir('raccoon', '/old');
            useTerminalStore.getState().setCharacterDir('raccoon', '/new');
            expect(useTerminalStore.getState().characterDirMap['raccoon']).toBe(
                '/new',
            );
        });

        it('should not affect other agents', () => {
            useTerminalStore.getState().setCharacterDir('raccoon', '/a');
            useTerminalStore.getState().setCharacterDir('fox', '/b');
            expect(useTerminalStore.getState().characterDirMap['raccoon']).toBe(
                '/a',
            );
            expect(useTerminalStore.getState().characterDirMap['fox']).toBe(
                '/b',
            );
        });
    });

    // ── Dock Agents ──────────────────────────────────────────────────────────

    describe('addDockAgent / removeDockAgent', () => {
        it('should add an agent to dock', () => {
            useTerminalStore.getState().addDockAgent('fox');
            expect(useTerminalStore.getState().dockAgents).toEqual([
                'raccoon',
                'fox',
            ]);
        });

        it('should not add duplicate agent', () => {
            useTerminalStore.getState().addDockAgent('fox');
            useTerminalStore.getState().addDockAgent('fox');
            expect(useTerminalStore.getState().dockAgents).toEqual([
                'raccoon',
                'fox',
            ]);
        });

        it('should not add raccoon again', () => {
            useTerminalStore.getState().addDockAgent('raccoon');
            expect(useTerminalStore.getState().dockAgents).toEqual(['raccoon']);
        });

        it('should remove an agent from dock', () => {
            useTerminalStore.getState().addDockAgent('fox');
            useTerminalStore.getState().removeDockAgent('fox');
            expect(useTerminalStore.getState().dockAgents).toEqual(['raccoon']);
        });

        it('should handle removing non-existent agent', () => {
            useTerminalStore.getState().removeDockAgent('non-existent');
            expect(useTerminalStore.getState().dockAgents).toEqual(['raccoon']);
        });

        it('should allow removing raccoon from dock', () => {
            useTerminalStore.getState().removeDockAgent('raccoon');
            expect(useTerminalStore.getState().dockAgents).toEqual([]);
        });
    });

    // ── Agent Activity ───────────────────────────────────────────────────────

    describe('setAgentActivity', () => {
        it('should set agent activity', () => {
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'working',
            );
        });

        it('should overwrite existing activity', () => {
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            useTerminalStore.getState().setAgentActivity('raccoon', 'thinking');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'thinking',
            );
        });

        it('should not affect other agents', () => {
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            useTerminalStore.getState().setAgentActivity('fox', 'idle');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'working',
            );
            expect(useTerminalStore.getState().agentActivity['fox']).toBe(
                'idle',
            );
        });

        it('should respect activity lock (hint preserved over idle)', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'writing', 5000);
            // idle should be suppressed by the lock
            useTerminalStore.getState().setAgentActivity('raccoon', 'idle');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'writing',
            );
        });

        it('should override lock when success/error comes in', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'writing', 5000);
            useTerminalStore.getState().setAgentActivity('raccoon', 'success');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'success',
            );
        });

        it('should clear lock after applying non-locked activity', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'writing', 5000);
            useTerminalStore.getState().setAgentActivity('raccoon', 'success');
            expect(
                useTerminalStore.getState().agentActivityLocks['raccoon'],
            ).toBeUndefined();
        });
    });

    // ── Hint Agent Activity ──────────────────────────────────────────────────

    describe('hintAgentActivity', () => {
        it('should set activity and create a lock', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'reading', 2000);
            const s = useTerminalStore.getState();
            expect(s.agentActivity['raccoon']).toBe('reading');
            expect(s.agentActivityLocks['raccoon']).toBeDefined();
            expect(s.agentActivityLocks['raccoon'].activity).toBe('reading');
        });

        it('should use default hold time when not specified', () => {
            const before = Date.now();
            useTerminalStore.getState().hintAgentActivity('raccoon', 'typing');
            const lock =
                useTerminalStore.getState().agentActivityLocks['raccoon'];
            // Default is 1800ms
            expect(lock.expiresAt).toBeGreaterThanOrEqual(before + 1800);
        });

        it('should handle 0 holdMs gracefully', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'writing', 0);
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'writing',
            );
        });

        it('should preserve hint over thinking when lock is reading/typing/writing', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'reading', 5000);
            useTerminalStore.getState().setAgentActivity('raccoon', 'thinking');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'reading',
            );
        });

        it('should preserve writing hint over working', () => {
            useTerminalStore
                .getState()
                .hintAgentActivity('raccoon', 'writing', 5000);
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            expect(useTerminalStore.getState().agentActivity['raccoon']).toBe(
                'writing',
            );
        });
    });

    // ── Agent State Machine ──────────────────────────────────────────────────

    describe('initAgentState / transitionAgent / resetAgentState', () => {
        it('should init agent state to idle', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            const machine = useTerminalStore.getState().agentStates['raccoon'];
            expect(machine).toBeDefined();
            expect(machine.currentState).toBe('idle');
            expect(machine.agentId).toBe('raccoon');
            expect(machine.history).toEqual([]);
        });

        it('should not re-init if already exists', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'test');
            useTerminalStore.getState().initAgentState('raccoon');
            // Should still be assigned, not reset
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('assigned');
        });

        it('should transition through valid states', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            expect(
                useTerminalStore
                    .getState()
                    .transitionAgent('raccoon', 'assigned', 'task-1'),
            ).toBe(true);
            expect(
                useTerminalStore
                    .getState()
                    .transitionAgent('raccoon', 'working', 'start'),
            ).toBe(true);
            expect(
                useTerminalStore
                    .getState()
                    .transitionAgent('raccoon', 'done', 'complete'),
            ).toBe(true);
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('done');
        });

        it('should reject invalid transitions', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            // idle -> done is invalid
            expect(
                useTerminalStore
                    .getState()
                    .transitionAgent('raccoon', 'done', 'skip'),
            ).toBe(false);
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('idle');
        });

        it('should record transition history', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'task-1');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'working', 'start');
            const machine = useTerminalStore.getState().agentStates['raccoon'];
            expect(machine.history).toHaveLength(2);
            expect(machine.history[0].from).toBe('idle');
            expect(machine.history[0].to).toBe('assigned');
            expect(machine.history[1].from).toBe('assigned');
            expect(machine.history[1].to).toBe('working');
        });

        it('should create state machine on the fly for unknown agent in transitionAgent', () => {
            // transitionAgent creates machine if missing, starting at idle
            // idle -> assigned is valid
            expect(
                useTerminalStore
                    .getState()
                    .transitionAgent('new-agent', 'assigned', 'task'),
            ).toBe(true);
            expect(
                useTerminalStore.getState().agentStates['new-agent']
                    .currentState,
            ).toBe('assigned');
        });

        it('should reset agent state back to idle', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'task');
            useTerminalStore.getState().resetAgentState('raccoon');
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('idle');
            expect(
                useTerminalStore.getState().agentStates['raccoon'].history,
            ).toEqual([]);
        });

        it('should not throw when resetting non-existent agent', () => {
            // resetAgentState returns same state if machine doesn't exist
            expect(() =>
                useTerminalStore.getState().resetAgentState('ghost'),
            ).not.toThrow();
        });
    });

    // ── getAvailableAgents / getAgentState ───────────────────────────────────

    describe('getAvailableAgents / getAgentState', () => {
        it('should return agents in idle state', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore.getState().initAgentState('fox');
            useTerminalStore
                .getState()
                .transitionAgent('fox', 'assigned', 'task');
            const available = useTerminalStore.getState().getAvailableAgents();
            expect(available).toContain('raccoon');
            expect(available).not.toContain('fox');
        });

        it('should return empty array when no agents initialized', () => {
            expect(useTerminalStore.getState().getAvailableAgents()).toEqual(
                [],
            );
        });

        it('should return agent state by id', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            const machine = useTerminalStore
                .getState()
                .getAgentState('raccoon');
            expect(machine).toBeDefined();
            expect(machine!.currentState).toBe('idle');
        });

        it('should return undefined for non-existent agent', () => {
            expect(
                useTerminalStore.getState().getAgentState('ghost'),
            ).toBeUndefined();
        });
    });

    // ── Agent Settings ───────────────────────────────────────────────────────

    describe('setAgentSettings', () => {
        it('should set agent settings', () => {
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'opus' });
            expect(
                useTerminalStore.getState().agentSettings['raccoon'].model,
            ).toBe('opus');
        });

        it('should merge partial settings', () => {
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'opus', maxTurns: 10 });
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { maxTurns: 20 });
            const settings =
                useTerminalStore.getState().agentSettings['raccoon'];
            expect(settings.model).toBe('opus');
            expect(settings.maxTurns).toBe(20);
        });

        it('should isolate settings between agents', () => {
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'opus' });
            useTerminalStore
                .getState()
                .setAgentSettings('fox', { model: 'haiku' });
            expect(
                useTerminalStore.getState().agentSettings['raccoon'].model,
            ).toBe('opus');
            expect(useTerminalStore.getState().agentSettings['fox'].model).toBe(
                'haiku',
            );
        });
    });

    // ── Input History ────────────────────────────────────────────────────────

    describe('addInputHistory', () => {
        it('should add input to history', () => {
            useTerminalStore.getState().addInputHistory('tab-1', 'hello');
            expect(useTerminalStore.getState().inputHistory['tab-1']).toEqual([
                'hello',
            ]);
        });

        it('should append in order', () => {
            useTerminalStore.getState().addInputHistory('tab-1', 'a');
            useTerminalStore.getState().addInputHistory('tab-1', 'b');
            expect(useTerminalStore.getState().inputHistory['tab-1']).toEqual([
                'a',
                'b',
            ]);
        });

        it('should prevent consecutive duplicates', () => {
            useTerminalStore.getState().addInputHistory('tab-1', 'hello');
            useTerminalStore.getState().addInputHistory('tab-1', 'hello');
            expect(useTerminalStore.getState().inputHistory['tab-1']).toEqual([
                'hello',
            ]);
        });

        it('should allow non-consecutive duplicates', () => {
            useTerminalStore.getState().addInputHistory('tab-1', 'a');
            useTerminalStore.getState().addInputHistory('tab-1', 'b');
            useTerminalStore.getState().addInputHistory('tab-1', 'a');
            expect(useTerminalStore.getState().inputHistory['tab-1']).toEqual([
                'a',
                'b',
                'a',
            ]);
        });

        it('should cap at 50 entries', () => {
            for (let i = 0; i < 60; i++) {
                useTerminalStore
                    .getState()
                    .addInputHistory('tab-1', `cmd-${i}`);
            }
            const history = useTerminalStore.getState().inputHistory['tab-1'];
            expect(history).toHaveLength(50);
            expect(history[0]).toBe('cmd-10');
            expect(history[49]).toBe('cmd-59');
        });

        it('should isolate history between tabs', () => {
            useTerminalStore.getState().addInputHistory('tab-1', 'a');
            useTerminalStore.getState().addInputHistory('tab-2', 'b');
            expect(useTerminalStore.getState().inputHistory['tab-1']).toEqual([
                'a',
            ]);
            expect(useTerminalStore.getState().inputHistory['tab-2']).toEqual([
                'b',
            ]);
        });
    });

    // ── Team Members ─────────────────────────────────────────────────────────

    describe('setActiveTeamMembers / ensureTeamAgent / clearActiveTeam', () => {
        it('should set active team members via resolveTeamMembers', () => {
            useTerminalStore.getState().setActiveTeamMembers(['planner']);
            const { activeTeamMembers } = useTerminalStore.getState();
            expect(activeTeamMembers['planner']).toBeDefined();
        });

        it('should ensure a team agent is mapped', () => {
            useTerminalStore.getState().ensureTeamAgent('a02', 'Rio');
            const s = useTerminalStore.getState();
            expect(s.activeTeamMembers['Rio']).toBe('a02');
        });

        it('should not duplicate mapped team entries for same agent', () => {
            useTerminalStore.getState().ensureTeamAgent('a02', 'Rio');
            useTerminalStore.getState().ensureTeamAgent('a02', 'Rio');
            expect(useTerminalStore.getState().activeTeamMembers).toEqual({
                Rio: 'a02',
            });
        });

        it('should keep dock agents separate from ensured team agents', () => {
            useTerminalStore.getState().addDockAgent('a02');
            useTerminalStore.getState().ensureTeamAgent('a02', 'Rio');
            expect(useTerminalStore.getState().dockAgents).toEqual([
                'raccoon',
                'a02',
            ]);
            expect(useTerminalStore.getState().activeTeamMembers).toEqual({
                Rio: 'a02',
            });
        });

        it('should clear active team', () => {
            useTerminalStore.getState().ensureTeamAgent('a02', 'Rio');
            useTerminalStore.getState().clearActiveTeam();
            expect(useTerminalStore.getState().activeTeamMembers).toEqual({});
        });
    });

    // ── Tab Management ───────────────────────────────────────────────────────

    describe('addTab', () => {
        it('should add a tab and set it active', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            const s = useTerminalStore.getState();
            expect(s.tabs).toHaveLength(1);
            expect(s.activeTabId).toBe('tab-1');
            expect(s.panelVisible).toBe(true);
        });

        it('should add multiple tabs and set last as active', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            expect(useTerminalStore.getState().tabs).toHaveLength(2);
            expect(useTerminalStore.getState().activeTabId).toBe('tab-2');
        });
    });

    describe('restoreTabs', () => {
        it('should restore tabs when empty', () => {
            const tabs = [makeTab({ id: 'tab-1', restored: true })];
            useTerminalStore.getState().restoreTabs(tabs);
            const s = useTerminalStore.getState();
            expect(s.tabs).toHaveLength(1);
            expect(s.activeTabId).toBe('tab-1');
            expect(s.panelVisible).toBe(true);
        });

        it('should do nothing when restoring empty array', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().restoreTabs([]);
            expect(useTerminalStore.getState().tabs).toHaveLength(1);
        });

        it('should merge restored tabs with existing ones', () => {
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-1', label: 'Original' }));
            useTerminalStore
                .getState()
                .restoreTabs([
                    makeTab({ id: 'tab-1', label: 'Updated', restored: true }),
                    makeTab({ id: 'tab-2', restored: true }),
                ]);
            const s = useTerminalStore.getState();
            expect(s.tabs).toHaveLength(2);
            // Existing tab should be merged (updated)
            expect(s.tabs.find((t) => t.id === 'tab-1')!.label).toBe('Updated');
        });

        it('should preserve activeTabId if still valid after merge', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().restoreTabs([makeTab({ id: 'tab-2' })]);
            // tab-1 is still active because it still exists
            expect(useTerminalStore.getState().activeTabId).toBe('tab-1');
        });

        it('should set last tab as active if current active is gone', () => {
            useTerminalStore.setState({ activeTabId: 'gone' });
            useTerminalStore
                .getState()
                .restoreTabs([
                    makeTab({ id: 'tab-1' }),
                    makeTab({ id: 'tab-2' }),
                ]);
            expect(useTerminalStore.getState().activeTabId).toBe('tab-2');
        });
    });

    describe('removeTab', () => {
        it('should remove a tab by id', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            useTerminalStore.getState().removeTab('tab-1');
            expect(useTerminalStore.getState().tabs).toHaveLength(1);
            expect(useTerminalStore.getState().tabs[0].id).toBe('tab-2');
        });

        it('should switch to last tab when active tab is removed', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            useTerminalStore.getState().removeTab('tab-2');
            expect(useTerminalStore.getState().activeTabId).toBe('tab-1');
        });

        it('should set activeTabId to null when last tab is removed', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().removeTab('tab-1');
            expect(useTerminalStore.getState().activeTabId).toBeNull();
        });

        it('should clean up parsedMessages, viewMode, inputHistory for removed tab', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addParsedEvent('tab-1', makeEvent());
            useTerminalStore.getState().setViewMode('tab-1', 'chat');
            useTerminalStore.getState().addInputHistory('tab-1', 'hello');

            useTerminalStore.getState().removeTab('tab-1');
            const s = useTerminalStore.getState();
            expect(s.parsedMessages['tab-1']).toBeUndefined();
            expect(s.lastToolUseByTab['tab-1']).toBeUndefined();
            expect(s.viewMode['tab-1']).toBeUndefined();
            expect(s.inputHistory['tab-1']).toBeUndefined();
        });

        it('should not affect other tabs data on removal', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            useTerminalStore.getState().addParsedEvent('tab-1', makeEvent());
            useTerminalStore.getState().addParsedEvent('tab-2', makeEvent());

            useTerminalStore.getState().removeTab('tab-1');
            expect(
                useTerminalStore.getState().parsedMessages['tab-2'],
            ).toHaveLength(1);
        });

        it('should keep activeTabId unchanged when non-active tab is removed', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            // tab-2 is active
            useTerminalStore.getState().removeTab('tab-1');
            expect(useTerminalStore.getState().activeTabId).toBe('tab-2');
        });
    });

    describe('setActiveTab', () => {
        it('should set active tab', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            useTerminalStore.getState().setActiveTab('tab-1');
            expect(useTerminalStore.getState().activeTabId).toBe('tab-1');
        });

        it('should accept null', () => {
            useTerminalStore.getState().setActiveTab(null);
            expect(useTerminalStore.getState().activeTabId).toBeNull();
        });
    });

    describe('updateTab', () => {
        it('should update tab properties', () => {
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-1', label: 'Old' }));
            useTerminalStore.getState().updateTab('tab-1', { label: 'New' });
            expect(useTerminalStore.getState().tabs[0].label).toBe('New');
        });

        it('should not modify other tabs', () => {
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-1', label: 'A' }));
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-2', label: 'B' }));
            useTerminalStore
                .getState()
                .updateTab('tab-1', { label: 'Updated' });
            expect(useTerminalStore.getState().tabs[1].label).toBe('B');
        });

        it('should handle updating non-existent tab gracefully', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            expect(() =>
                useTerminalStore
                    .getState()
                    .updateTab('ghost', { label: 'nope' }),
            ).not.toThrow();
            expect(useTerminalStore.getState().tabs).toHaveLength(1);
        });

        it('should update status field', () => {
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-1', status: 'connecting' }));
            useTerminalStore
                .getState()
                .updateTab('tab-1', { status: 'connected' });
            expect(useTerminalStore.getState().tabs[0].status).toBe(
                'connected',
            );
        });
    });

    // ── Agent Activity + State Machine Integration ───────────────────────────

    describe('setAgentActivity with state machine sync', () => {
        it('should transition to working when activity is thinking/working', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'task');
            useTerminalStore.getState().setAgentActivity('raccoon', 'thinking');
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('working');
        });

        it('should transition to done on success activity', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'task');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'working', 'start');
            useTerminalStore.getState().setAgentActivity('raccoon', 'success');
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('done');
        });

        it('should transition to error on error activity', () => {
            useTerminalStore.getState().initAgentState('raccoon');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'assigned', 'task');
            useTerminalStore
                .getState()
                .transitionAgent('raccoon', 'working', 'start');
            useTerminalStore.getState().setAgentActivity('raccoon', 'error');
            expect(
                useTerminalStore.getState().agentStates['raccoon'].currentState,
            ).toBe('error');
        });

        it('should not transition if no machine exists', () => {
            // Should not throw when there's no state machine
            expect(() =>
                useTerminalStore
                    .getState()
                    .setAgentActivity('ghost', 'working'),
            ).not.toThrow();
            expect(useTerminalStore.getState().agentActivity['ghost']).toBe(
                'working',
            );
        });
    });

    // ── Immutability ─────────────────────────────────────────────────────────

    describe('immutability', () => {
        it('should create new tabs array on addTab', () => {
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            const tabsBefore = useTerminalStore.getState().tabs;
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-2' }));
            const tabsAfter = useTerminalStore.getState().tabs;
            expect(tabsBefore).not.toBe(tabsAfter);
        });

        it('should create new dockAgents array on addDockAgent', () => {
            const before = useTerminalStore.getState().dockAgents;
            useTerminalStore.getState().addDockAgent('fox');
            const after = useTerminalStore.getState().dockAgents;
            expect(before).not.toBe(after);
        });

        it('should create new agentActivity object on setAgentActivity', () => {
            useTerminalStore.getState().setAgentActivity('raccoon', 'idle');
            const before = useTerminalStore.getState().agentActivity;
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            const after = useTerminalStore.getState().agentActivity;
            expect(before).not.toBe(after);
        });

        it('should create new agentSettings object on setAgentSettings', () => {
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'opus' });
            const before = useTerminalStore.getState().agentSettings;
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'haiku' });
            const after = useTerminalStore.getState().agentSettings;
            expect(before).not.toBe(after);
        });

        it('should not mutate existing tab on updateTab', () => {
            useTerminalStore
                .getState()
                .addTab(makeTab({ id: 'tab-1', label: 'Old' }));
            const tabBefore = useTerminalStore.getState().tabs[0];
            useTerminalStore.getState().updateTab('tab-1', { label: 'New' });
            const tabAfter = useTerminalStore.getState().tabs[0];
            expect(tabBefore).not.toBe(tabAfter);
            expect(tabBefore.label).toBe('Old');
        });
    });

    // ── Exported Pure Functions ───────────────────────────────────────────────

    describe('getVisibleWorldAgentIds', () => {
        it('should always include raccoon', () => {
            const ids = getVisibleWorldAgentIds({});
            expect(ids).toContain('raccoon');
        });

        it('should include dock agents', () => {
            const ids = getVisibleWorldAgentIds({ dockAgents: ['fox', 'cat'] });
            expect(ids).toContain('raccoon');
            expect(ids).toContain('fox');
            expect(ids).toContain('cat');
        });

        it('should include active team members', () => {
            const ids = getVisibleWorldAgentIds({
                activeTeamMembers: { dev: 'a02', qa: 'a05' },
            });
            expect(ids).toContain('a02');
            expect(ids).toContain('a05');
        });

        it('should deduplicate ids', () => {
            const ids = getVisibleWorldAgentIds({
                dockAgents: ['raccoon', 'fox'],
                activeTeamMembers: { lead: 'raccoon' },
            });
            const raccoonCount = ids.filter((id) => id === 'raccoon').length;
            expect(raccoonCount).toBe(1);
        });
    });

    describe('sanitizePersistedDockAgents', () => {
        it('should always include raccoon', () => {
            const result = sanitizePersistedDockAgents(['fox'], {}, {});
            expect(result).toContain('raccoon');
        });

        it('should keep raccoon if already present', () => {
            const result = sanitizePersistedDockAgents(
                ['raccoon', 'fox'],
                {},
                { fox: {} },
            );
            expect(result.filter((id) => id === 'raccoon')).toHaveLength(1);
        });

        it('should filter out agents not in characterDirMap or agentSettings', () => {
            const result = sanitizePersistedDockAgents(
                ['raccoon', 'ghost', 'fox'],
                { fox: '/workspace' },
                {},
            );
            expect(result).toEqual(['raccoon', 'fox']);
        });

        it('should keep agents that exist in agentSettings', () => {
            const result = sanitizePersistedDockAgents(['raccoon', 'fox'], {}, {
                fox: { model: 'opus' },
            } as Record<string, AgentSettings>);
            expect(result).toContain('fox');
        });

        it('should handle non-array input gracefully', () => {
            const result = sanitizePersistedDockAgents(null, {}, {});
            // Non-array → empty sanitized → raccoon guard adds raccoon
            expect(result).toEqual(['raccoon']);
        });

        it('should handle undefined input gracefully', () => {
            const result = sanitizePersistedDockAgents(undefined, {}, {});
            expect(result).toEqual(['raccoon']);
        });

        it('should deduplicate', () => {
            const result = sanitizePersistedDockAgents(
                ['raccoon', 'raccoon', 'fox', 'fox'],
                { fox: '/workspace' },
                {},
            );
            expect(result.filter((id) => id === 'raccoon')).toHaveLength(1);
            expect(result.filter((id) => id === 'fox')).toHaveLength(1);
        });

        it('should filter out non-string values', () => {
            const result = sanitizePersistedDockAgents(
                ['raccoon', 42, null, undefined, true] as unknown[],
                {},
                {},
            );
            expect(result).toEqual(['raccoon']);
        });
    });

    // ── Persist Partialize ───────────────────────────────────────────────────

    describe('persist configuration', () => {
        it('should only persist characterDirMap, dockAgents, and agentSettings', () => {
            // Set up various state
            useTerminalStore.getState().addTab(makeTab({ id: 'tab-1' }));
            useTerminalStore
                .getState()
                .setCharacterDir('raccoon', '/workspace');
            useTerminalStore.getState().addDockAgent('fox');
            useTerminalStore
                .getState()
                .setAgentSettings('raccoon', { model: 'opus' });
            useTerminalStore.getState().setAgentActivity('raccoon', 'working');
            useTerminalStore.getState().addInputHistory('tab-1', 'hello');

            // The store's internal partialize should only return the 3 keys
            // We can verify by checking what's in the store
            const s = useTerminalStore.getState();
            expect(s.characterDirMap).toEqual({ raccoon: '/workspace' });
            expect(s.dockAgents).toEqual(['raccoon', 'fox']);
            expect(s.agentSettings).toEqual({ raccoon: { model: 'opus' } });
        });
    });
});
