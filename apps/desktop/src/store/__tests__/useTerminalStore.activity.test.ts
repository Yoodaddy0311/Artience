import { beforeEach, describe, expect, it } from 'vitest';
import { useTerminalStore } from '../useTerminalStore';

describe('useTerminalStore activity dedupe', () => {
    beforeEach(() => {
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
    });

    it('does not churn state when the same activity is applied twice', () => {
        const store = useTerminalStore.getState();
        store.setAgentActivity('a02', 'typing');

        const firstActivityMap = useTerminalStore.getState().agentActivity;

        store.setAgentActivity('a02', 'typing');

        expect(useTerminalStore.getState().agentActivity).toBe(
            firstActivityMap,
        );
    });
});
