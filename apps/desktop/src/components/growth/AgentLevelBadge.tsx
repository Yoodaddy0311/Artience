import React from 'react';
import { useGrowthStore } from '../../store/useGrowthStore';
import type { EvolutionStage } from '../../types/growth';

const STAGE_COLORS: Record<EvolutionStage, string> = {
    novice: '#9ca3af',
    apprentice: '#60a5fa',
    journeyman: '#22c55e',
    expert: '#f59e0b',
    master: '#ef4444',
    legendary: '#a855f7',
};

const SIZE_MAP = {
    sm: { badge: 'text-xs px-1.5 py-0.5', bar: 'h-1', width: 'w-16' },
    md: { badge: 'text-sm px-2 py-1', bar: 'h-1.5', width: 'w-24' },
    lg: { badge: 'text-base px-3 py-1.5', bar: 'h-2', width: 'w-32' },
} as const;

interface AgentLevelBadgeProps {
    readonly agentId: string;
    readonly size?: 'sm' | 'md' | 'lg';
}

export const AgentLevelBadge: React.FC<AgentLevelBadgeProps> = ({
    agentId,
    size = 'md',
}) => {
    const profile = useGrowthStore((s) => s.profiles[agentId]);
    if (!profile) return null;

    const { level, exp, expToNext, evolution } = profile;
    const color = STAGE_COLORS[evolution.stage];
    const sizeConfig = SIZE_MAP[size];
    const expPercent =
        expToNext > 0 ? Math.min((exp / expToNext) * 100, 100) : 100;

    return (
        <div className="inline-flex flex-col items-start gap-0.5">
            <span
                className={`font-black border-2 border-black rounded-md ${sizeConfig.badge}`}
                style={{ backgroundColor: color, color: '#000' }}
            >
                Lv.{level}
            </span>
            <div
                className={`${sizeConfig.width} ${sizeConfig.bar} bg-gray-200 rounded-full border border-black overflow-hidden`}
            >
                <div
                    className={`${sizeConfig.bar} rounded-full transition-all duration-300`}
                    style={{ width: `${expPercent}%`, backgroundColor: color }}
                />
            </div>
        </div>
    );
};
