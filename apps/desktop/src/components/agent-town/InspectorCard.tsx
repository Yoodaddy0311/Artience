import React from 'react';
import { X } from 'lucide-react';
import { type AgentProfile, type AgentState } from '../../types/platform';
import { STATE_COLORS_CSS, STATE_LABELS } from './agent-runtime';

const STATE_BG: Record<AgentState, string> = {
    IDLE: 'bg-gray-100',
    WALK: 'bg-blue-100',
    THINKING: 'bg-yellow-100',
    RUNNING: 'bg-green-100',
    SUCCESS: 'bg-emerald-100',
    ERROR: 'bg-red-100',
    NEEDS_INPUT: 'bg-purple-100',
};

interface InspectorCardProps {
    agent: AgentProfile;
    onClose: () => void;
}

export const InspectorCard: React.FC<InspectorCardProps> = ({ agent, onClose }) => {
    return (
        <div className="absolute top-6 left-6 z-30 w-72 bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] overflow-hidden select-none pointer-events-auto animate-in fade-in slide-in-from-left-2 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-black bg-[#FFD100]">
                <img
                    src={agent.sprite}
                    alt={agent.name}
                    className="w-12 h-12 rounded-xl border-2 border-black bg-white object-contain shadow-[2px_2px_0_0_#000]"
                />
                <div className="flex-1 min-w-0">
                    <h3 className="font-black text-base text-black truncate">{agent.name}</h3>
                    <p className="text-xs font-bold text-gray-700 truncate">{agent.role}</p>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                    <X className="w-4 h-4" strokeWidth={3} />
                </button>
            </div>

            {/* State Badge */}
            <div className="px-4 py-3 border-b border-gray-200">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">현재 상태</div>
                <div className="flex items-center gap-2">
                    <span
                        className="w-3 h-3 rounded-full border-2 border-black"
                        style={{ backgroundColor: STATE_COLORS_CSS[agent.state] || STATE_COLORS_CSS.IDLE }}
                    />
                    <span className={`text-sm font-black px-2.5 py-1 rounded-md border-2 border-black ${STATE_BG[agent.state]} shadow-[1px_1px_0_0_#000]`}>
                        {STATE_LABELS[agent.state]}
                    </span>
                </div>
            </div>

            {/* Agent Details */}
            <div className="px-4 py-3 space-y-2">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider">에이전트 정보</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-[9px] font-bold text-gray-400 uppercase">ID</div>
                        <div className="text-xs font-black text-black mt-0.5">{agent.id}</div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-[9px] font-bold text-gray-400 uppercase">홈 위치</div>
                        <div className="text-xs font-black text-black mt-0.5">({agent.home.x}, {agent.home.y})</div>
                    </div>
                </div>
                {agent.currentJobId && (
                    <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-[9px] font-bold text-blue-400 uppercase">현재 작업</div>
                        <div className="text-xs font-black text-blue-700 mt-0.5">{agent.currentJobId}</div>
                    </div>
                )}
            </div>
        </div>
    );
};
