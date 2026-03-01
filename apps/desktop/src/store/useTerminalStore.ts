import { create } from 'zustand';

export interface TerminalTab {
    id: string;          // pty ID from main process
    agentId?: string;    // 연결된 에이전트 ID
    agentName?: string;
    label: string;
    cwd: string;
    status: 'connecting' | 'connected' | 'exited';
}

interface TerminalState {
    tabs: TerminalTab[];
    activeTabId: string | null;
    addTab: (tab: TerminalTab) => void;
    removeTab: (id: string) => void;
    setActiveTab: (id: string | null) => void;
    updateTab: (id: string, patch: Partial<TerminalTab>) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
    tabs: [],
    activeTabId: null,
    addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
    removeTab: (id) => set((s) => {
        const newTabs = s.tabs.filter(t => t.id !== id);
        const newActive = s.activeTabId === id
            ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
            : s.activeTabId;
        return { tabs: newTabs, activeTabId: newActive };
    }),
    setActiveTab: (id) => set({ activeTabId: id }),
    updateTab: (id, patch) => set((s) => ({
        tabs: s.tabs.map(t => t.id === id ? { ...t, ...patch } : t),
    })),
}));
