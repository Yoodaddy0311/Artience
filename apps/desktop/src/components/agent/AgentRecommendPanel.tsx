import React from 'react';
import { DEFAULT_AGENTS } from '../../types/platform';
import { assetPath } from '../../lib/assetPath';

interface AgentRecommendation {
    agentId: string;
    score: number;
    reason: string;
}

interface AgentRecommendPanelProps {
    recommendations: AgentRecommendation[];
    onSelect: (agentId: string) => void;
    onClose: () => void;
}

const AGENT_MAP = new Map(DEFAULT_AGENTS.map((a) => [a.id, a]));

const RecommendCard: React.FC<{
    rec: AgentRecommendation;
    maxScore: number;
    onSelect: (agentId: string) => void;
}> = ({ rec, maxScore, onSelect }) => {
    const agent = AGENT_MAP.get(rec.agentId);
    if (!agent) return null;

    const scorePercent = Math.round((rec.score / maxScore) * 100);

    return (
        <button
            onClick={() => onSelect(rec.agentId)}
            className="flex items-center gap-2.5 px-3 py-2.5 bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all duration-150 cursor-pointer text-left w-full"
        >
            {/* Avatar */}
            <div className="w-10 h-10 border-2 border-black rounded-lg bg-[#E8DAFF] p-0.5 flex items-center justify-center shrink-0">
                <img
                    src={assetPath(agent.sprite)}
                    alt={agent.name}
                    className="w-8 h-8 object-contain"
                    draggable={false}
                />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-black truncate">
                        {agent.name}
                    </span>
                    <span className="text-[9px] font-bold text-gray-500 truncate">
                        {agent.role}
                    </span>
                </div>
                <p className="text-[10px] text-gray-600 leading-tight mt-0.5 line-clamp-2">
                    {rec.reason}
                </p>
                {/* Score bar */}
                <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-black rounded-full transition-all duration-300"
                            style={{ width: `${scorePercent}%` }}
                        />
                    </div>
                    <span className="text-[9px] font-bold text-black tabular-nums">
                        {scorePercent}%
                    </span>
                </div>
            </div>
        </button>
    );
};

const MemoizedRecommendCard = React.memo(RecommendCard);

const AgentRecommendPanel: React.FC<AgentRecommendPanelProps> = ({
    recommendations,
    onSelect,
    onClose,
}) => {
    if (recommendations.length === 0) return null;

    const top3 = recommendations.slice(0, 3);
    const maxScore = Math.max(...top3.map((r) => r.score), 1);

    return (
        <div className="absolute bottom-full left-0 right-0 mb-1 z-40">
            <div className="bg-yellow-50 border-2 border-black rounded-xl shadow-[4px_4px_0_0_#000] p-3">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1.5 bg-yellow-100 text-black text-[10px] font-bold rounded-md px-2 py-1 border border-yellow-300">
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        추천 에이전트
                    </span>
                    <button
                        onClick={onClose}
                        className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-black text-xs font-bold transition-colors"
                        aria-label="추천 패널 닫기"
                    >
                        x
                    </button>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2">
                    {top3.map((rec) => (
                        <MemoizedRecommendCard
                            key={rec.agentId}
                            rec={rec}
                            maxScore={maxScore}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export const MemoizedAgentRecommendPanel = React.memo(AgentRecommendPanel);
