import { useAppStore } from '../store/useAppStore';
import { useTerminalStore, type TerminalTab } from '../store/useTerminalStore';
import { getAgentProfile } from './agent-directory';
import { getProviderCliCommand } from './provider-command';

export async function ensureAgentTerminalTab(
    agentId: string,
): Promise<TerminalTab | null> {
    const agent = getAgentProfile(agentId);
    const api = window.dogbaApi?.terminal;
    if (!agent || !api) return null;

    const terminalStore = useTerminalStore.getState();
    const existingTab = terminalStore.tabs.find(
        (tab) => tab.agentId === agentId,
    );
    if (existingTab) {
        terminalStore.setActiveTab(existingTab.id);
        terminalStore.setPanelVisible(true);
        terminalStore.addDockAgent(agentId);
        terminalStore.initAgentState(agentId);
        return existingTab;
    }

    let cwd =
        terminalStore.characterDirMap[agentId] ||
        terminalStore.tabs.find((tab) => tab.id === terminalStore.activeTabId)
            ?.cwd ||
        useAppStore.getState().appSettings.projectDir;

    if (!cwd) {
        const selected = await window.dogbaApi?.project?.selectDir();
        if (!selected) return null;
        cwd = selected;
        terminalStore.setCharacterDir(agentId, cwd);
    }

    const result = await api.create(80, 24, {
        cwd,
        label: agent.name,
        agentId,
        autoCommand: getProviderCliCommand(
            terminalStore.agentSettings[agentId]?.provider,
        ),
        agentSettings: terminalStore.agentSettings[agentId],
    });

    if (!result?.id) return null;

    const newTab: TerminalTab = {
        id: result.id,
        agentId,
        agentName: agent.name,
        label: agent.name,
        cwd: result.cwd || cwd,
        status: 'connecting',
    };

    terminalStore.addDockAgent(agentId);
    terminalStore.initAgentState(agentId);
    terminalStore.addTab(newTab);
    terminalStore.setPanelVisible(true);

    return newTab;
}
