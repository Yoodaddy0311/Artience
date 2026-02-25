import React from 'react';
import { type AgentState } from '../../types/platform';
import { STATE_COLORS_CSS, STATE_LABELS, type LogItem } from './agent-runtime';

// ── Helpers ──

/** Format timestamp for log display. */
function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ── Component ──

interface RaccoonInspectorProps {
    raccoonDisplayState: AgentState;
    logs: LogItem[];
    containerRef: React.RefObject<HTMLDivElement | null>;
    raccoonScreenPosRef: React.RefObject<{ x: number; y: number }>;
    onClose: () => void;
}

export const RaccoonInspector: React.FC<RaccoonInspectorProps> = ({
    raccoonDisplayState,
    logs,
    containerRef,
    raccoonScreenPosRef,
    onClose,
}) => {
    // Calculate inspector card position relative to the container
    const getInspectorStyle = (): React.CSSProperties => {
        const pos = raccoonScreenPosRef.current;
        return {
            position: 'absolute',
            left: `${Math.min(pos.x + 60, (containerRef.current?.clientWidth || 800) - 280)}px`,
            top: `${Math.max(10, pos.y - 120)}px`,
            zIndex: 50,
        };
    };

    const recentLogs = logs.slice(-5);

    return (
        <div
            style={getInspectorStyle()}
            className="w-64 bg-white border-2 border-black shadow-[3px_3px_0_0_#000] select-none"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b-2 border-black bg-amber-50">
                <div className="flex items-center gap-2">
                    <span className="font-black text-sm tracking-tight">Raccoon</span>
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-black"
                        style={{ backgroundColor: STATE_COLORS_CSS[raccoonDisplayState] || STATE_COLORS_CSS.IDLE }}
                    />
                </div>
                <button
                    onClick={onClose}
                    className="w-6 h-6 flex items-center justify-center border-2 border-black bg-white hover:bg-red-100 active:bg-red-200 font-black text-xs leading-none transition-colors"
                >
                    X
                </button>
            </div>

            {/* State */}
            <div className="px-3 py-2 border-b border-gray-200">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{'\uD604\uC7AC \uC0C1\uD0DC'}</div>
                <div className="flex items-center gap-1.5">
                    <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: STATE_COLORS_CSS[raccoonDisplayState] || STATE_COLORS_CSS.IDLE }}
                    />
                    <span className="text-sm font-bold text-gray-800">
                        {STATE_LABELS[raccoonDisplayState]}
                    </span>
                </div>
            </div>

            {/* Recent Logs */}
            <div className="px-3 py-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{'\uCD5C\uADFC \uB85C\uADF8'}</div>
                {recentLogs.length === 0 ? (
                    <div className="text-xs text-gray-300 italic py-1">{'\uB85C\uADF8 \uC5C6\uC74C'}</div>
                ) : (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                        {recentLogs.map((log, i) => (
                            <div key={`${log.ts}-${i}`} className="flex items-start gap-1.5 text-[11px]">
                                <span className="text-gray-400 font-mono shrink-0">{formatTime(log.ts)}</span>
                                <span
                                    className="inline-block w-1.5 h-1.5 rounded-full mt-1 shrink-0"
                                    style={{ backgroundColor: STATE_COLORS_CSS[log.state] || STATE_COLORS_CSS.IDLE }}
                                />
                                <span className="text-gray-600 break-all">{log.text}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
