import React, { useRef, useEffect, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../store/useTerminalStore';

// Status indicator colors
const STATUS_DOT: Record<string, string> = {
    connecting: 'bg-yellow-400',
    connected: 'bg-green-400',
    exited: 'bg-red-400',
};

export const TerminalPanel: React.FC = () => {
    const { tabs, activeTabId, addTab, removeTab, setActiveTab, updateTab } = useTerminalStore();

    // xterm instance map: Map<terminalId, { terminal, fitAddon }>
    const xtermMapRef = useRef<Map<string, { terminal: Terminal; fitAddon: FitAddon }>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);

    // Create a new terminal tab via IPC
    const handleAddTab = useCallback(async () => {
        const api = window.dogbaApi?.terminal;
        if (!api) return;

        // Create a temporary xterm to get default cols/rows
        const cols = 80;
        const rows = 24;

        try {
            const result = await api.create(cols, rows, { label: 'Terminal' });
            addTab({
                id: result.id,
                label: result.label,
                cwd: result.cwd,
                status: 'connecting',
            });
        } catch (e) {
            if (import.meta.env.DEV) console.error('Failed to create terminal:', e);
        }
    }, [addTab]);

    // Close a terminal tab
    const handleCloseTab = useCallback((id: string) => {
        const api = window.dogbaApi?.terminal;
        if (api) api.destroy(id);

        const entry = xtermMapRef.current.get(id);
        if (entry) {
            entry.terminal.dispose();
            xtermMapRef.current.delete(id);
        }

        removeTab(id);
    }, [removeTab]);

    // IPC listeners (global -- route by id)
    useEffect(() => {
        const api = window.dogbaApi?.terminal;
        if (!api) return;

        const unsubData = api.onData((id: string, data: string) => {
            const entry = xtermMapRef.current.get(id);
            if (entry) entry.terminal.write(data);
        });

        const unsubExit = api.onExit((id: string, _exitCode: number) => {
            updateTab(id, { status: 'exited' });
        });

        return () => {
            unsubData();
            unsubExit();
        };
    }, [updateTab]);

    // Create xterm instances for new tabs, dispose removed ones
    useEffect(() => {
        for (const tab of tabs) {
            if (xtermMapRef.current.has(tab.id)) continue;

            const terminal = new Terminal({
                theme: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc' },
                fontFamily: '"Cascadia Code", "Fira Code", monospace',
                fontSize: 14,
                cursorBlink: true,
                allowProposedApi: true,
            });
            const fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);

            // Terminal input -> PTY write
            terminal.onData((data) => {
                window.dogbaApi?.terminal?.write(tab.id, data);
            });

            // Handle resize -> PTY resize
            terminal.onResize(({ cols, rows }) => {
                window.dogbaApi?.terminal?.resize(tab.id, cols, rows);
            });

            xtermMapRef.current.set(tab.id, { terminal, fitAddon });
        }

        // Cleanup instances for removed tabs
        const tabIds = new Set(tabs.map(t => t.id));
        for (const [id, entry] of xtermMapRef.current) {
            if (!tabIds.has(id)) {
                entry.terminal.dispose();
                xtermMapRef.current.delete(id);
            }
        }
    }, [tabs]);

    // Ref callback to mount xterm into DOM (runs once per element)
    const mountTerminal = useCallback((id: string, el: HTMLDivElement | null) => {
        if (!el) return;
        const entry = xtermMapRef.current.get(id);
        if (!entry) return;
        if (el.querySelector('.xterm')) return; // already mounted
        entry.terminal.open(el);
        entry.fitAddon.fit();
        updateTab(id, { status: 'connected' });
    }, [updateTab]);

    // Re-fit active tab when it changes
    useEffect(() => {
        if (!activeTabId) return;
        const entry = xtermMapRef.current.get(activeTabId);
        if (entry) {
            requestAnimationFrame(() => entry.fitAddon.fit());
        }
    }, [activeTabId]);

    // ResizeObserver for container
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => {
            if (activeTabId) {
                const entry = xtermMapRef.current.get(activeTabId);
                if (entry) entry.fitAddon.fit();
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [activeTabId]);

    // Empty state
    if (tabs.length === 0) {
        return (
            <div className="w-full h-full bg-[#1e1e2e] flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-400 text-sm font-bold mb-3">터미널이 없습니다</p>
                    <button
                        onClick={handleAddTab}
                        className="px-4 py-2 bg-[#E8DAFF] text-black text-xs font-black border-2 border-black shadow-[2px_2px_0_0_#000] rounded-lg hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                        + 새 터미널
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full flex flex-col bg-[#1e1e2e]">
            {/* Tab Bar */}
            <div className="flex items-center bg-[#181825] border-b border-[#313244] min-h-[32px] overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border-r border-[#313244] transition-colors shrink-0 ${
                            tab.id === activeTabId
                                ? 'bg-[#1e1e2e] text-[#cdd6f4] border-b-2 border-b-[#E8DAFF]'
                                : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2e]/50'
                        }`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[tab.status] || 'bg-gray-500'}`} />
                        <span className="max-w-[120px] truncate">{tab.label}</span>
                        <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                            className="ml-1 w-4 h-4 flex items-center justify-center rounded hover:bg-[#313244] text-[#6c7086] hover:text-[#f38ba8] transition-colors"
                        >
                            x
                        </span>
                    </button>
                ))}
                <button
                    onClick={handleAddTab}
                    className="px-2.5 py-1.5 text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2e]/50 text-sm font-bold transition-colors shrink-0"
                    title="새 터미널"
                >
                    +
                </button>
            </div>

            {/* Terminal Viewport */}
            <div className="flex-1 relative">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        ref={(el) => mountTerminal(tab.id, el)}
                        className="absolute inset-0"
                        style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
                    />
                ))}
            </div>
        </div>
    );
};
