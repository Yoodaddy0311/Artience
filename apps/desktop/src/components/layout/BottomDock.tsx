import React from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';

export const BottomDock: React.FC = () => {
    const { tabs, activeTabId, setActiveTab, removeTab } = useTerminalStore();

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-[90vw]">
            <div className="bg-white px-3 py-3 rounded-lg shadow-[4px_4px_0_0_#000] border-2 border-black flex items-center gap-2">
                {/* Scrollable tab area */}
                <div className="flex items-center gap-3 overflow-x-auto scroll-smooth scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                    {tabs.length === 0 && (
                        <span className="text-sm text-gray-400 font-bold px-4">터미널이 없습니다</span>
                    )}
                    {tabs.map(tab => {
                        const isActive = tab.id === activeTabId;
                        return (
                            <div key={tab.id} className="relative group flex-shrink-0">
                                <button
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-black transition-all ${
                                        isActive
                                            ? 'bg-[#E8DAFF] shadow-[3px_3px_0_0_#000] -translate-y-1'
                                            : 'bg-white shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5'
                                    }`}
                                >
                                    {/* Status dot */}
                                    <span className={`w-2.5 h-2.5 rounded-full border border-black ${
                                        tab.status === 'connected' ? 'bg-green-400'
                                        : tab.status === 'connecting' ? 'bg-yellow-400 animate-pulse'
                                        : 'bg-gray-300'
                                    }`} />
                                    {/* Label */}
                                    <span className="text-xs font-bold text-black whitespace-nowrap max-w-[120px] truncate">
                                        {tab.label}
                                    </span>
                                </button>
                                {/* Close button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        window.dogbaApi?.terminal?.destroy(tab.id);
                                        removeTab(tab.id);
                                    }}
                                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 border border-black rounded-full text-white text-xs font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* New terminal button */}
                <button
                    onClick={async () => {
                        const api = window.dogbaApi?.terminal;
                        if (!api) return;
                        const result = await api.create(80, 24, { label: 'Terminal' });
                        if (result?.id) {
                            useTerminalStore.getState().addTab({
                                id: result.id,
                                label: result.label || 'Terminal',
                                cwd: result.cwd || '',
                                status: 'connecting',
                            });
                        }
                    }}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-[#9DE5DC] hover:bg-[#7dd3c4] hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    aria-label="New terminal"
                >
                    <span className="text-lg font-black text-black">+</span>
                </button>
            </div>
        </div>
    );
};
