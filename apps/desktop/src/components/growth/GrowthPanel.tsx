import React, { useState } from 'react';
import { useGrowthStore } from '../../store/useGrowthStore';
import type { EvolutionStage } from '../../types/growth';
import { AgentLevelBadge } from './AgentLevelBadge';
import { StatRadar } from './StatRadar';
import { SkillTreeView } from './SkillTreeView';
import { MemoryLog } from './MemoryLog';

type Tab = 'overview' | 'skills' | 'memories' | 'evolution';

const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'skills', label: 'Skills' },
    { key: 'memories', label: 'Memories' },
    { key: 'evolution', label: 'Evolution' },
];

const STAGE_COLORS: Record<EvolutionStage, string> = {
    novice: '#9ca3af',
    apprentice: '#60a5fa',
    journeyman: '#22c55e',
    expert: '#f59e0b',
    master: '#ef4444',
    legendary: '#a855f7',
};

const STAGE_LABELS: Record<EvolutionStage, string> = {
    novice: 'Novice',
    apprentice: 'Apprentice',
    journeyman: 'Journeyman',
    expert: 'Expert',
    master: 'Master',
    legendary: 'Legendary',
};

interface GrowthPanelProps {
    readonly agentId: string;
}

export const GrowthPanel: React.FC<GrowthPanelProps> = ({ agentId }) => {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const profile = useGrowthStore((s) => s.profiles[agentId]);

    if (!profile) {
        return (
            <div className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0_0_#000] p-6 text-center">
                <p className="text-sm text-gray-400 font-bold">
                    No growth data for this agent
                </p>
            </div>
        );
    }

    const { evolution, stats, taskHistory = [] } = profile;
    const stageColor = STAGE_COLORS[evolution?.stage ?? 'novice'];
    const recentTasks = taskHistory.slice(-10).reverse();

    return (
        <div
            className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0_0_#000] overflow-hidden"
            style={{ fontFamily: "'Pretendard', sans-serif" }}
        >
            {/* Tab bar */}
            <div className="flex border-b-2 border-black">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 px-3 py-2.5 text-xs font-black uppercase tracking-wide transition-all ${
                            activeTab === tab.key
                                ? 'bg-black text-white'
                                : 'bg-white text-black hover:bg-gray-100'
                        } ${tab.key !== 'overview' ? 'border-l-2 border-black' : ''}`}
                        aria-selected={activeTab === tab.key}
                        role="tab"
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="p-4" role="tabpanel">
                {activeTab === 'overview' && (
                    <div className="space-y-4">
                        {/* Level + radar side-by-side */}
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="space-y-2">
                                <AgentLevelBadge agentId={agentId} size="lg" />
                                <p className="text-[10px] font-bold text-gray-400 uppercase">
                                    {STAGE_LABELS[evolution.stage]} Stage
                                </p>
                                <p className="text-xs text-gray-500">
                                    Total EXP:{' '}
                                    {profile.totalExp.toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Streak: {profile.streakDays} days
                                </p>
                            </div>
                            <div className="flex-shrink-0">
                                <StatRadar stats={stats} size={160} />
                            </div>
                        </div>

                        {/* Recent task history */}
                        {recentTasks.length > 0 && (
                            <div>
                                <h3 className="text-xs font-black uppercase text-gray-400 mb-2">
                                    Recent Tasks
                                </h3>
                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                                    {recentTasks.map((task, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs"
                                        >
                                            <span
                                                className={`w-2 h-2 rounded-full flex-shrink-0 ${task.success ? 'bg-emerald-500' : 'bg-red-400'}`}
                                            />
                                            <span className="font-bold text-gray-700 truncate">
                                                {task.taskType}
                                            </span>
                                            <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                                                +{task.expEarned} EXP
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'skills' && <SkillTreeView agentId={agentId} />}

                {activeTab === 'memories' && <MemoryLog agentId={agentId} />}

                {activeTab === 'evolution' && (
                    <div className="space-y-4">
                        {/* Current stage */}
                        <div className="border-2 border-black rounded-lg p-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-2">
                                Current Stage
                            </p>
                            <div className="flex items-center gap-3">
                                <span
                                    className="text-xl font-black px-3 py-1 rounded-lg border-2 border-black"
                                    style={{ backgroundColor: stageColor }}
                                >
                                    {STAGE_LABELS[evolution.stage]}
                                </span>
                                <span className="text-sm font-bold text-gray-500">
                                    Lv.{profile.level}
                                </span>
                            </div>
                        </div>

                        {/* Stage progress */}
                        <div className="border-2 border-black rounded-lg p-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-2">
                                Stage Progress
                            </p>
                            <div className="h-3 bg-gray-200 rounded-full border border-black overflow-hidden mb-1">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${Math.round(evolution.stageProgress * 100)}%`,
                                        backgroundColor: stageColor,
                                    }}
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 font-bold text-right">
                                {Math.round(evolution.stageProgress * 100)}%
                            </p>
                        </div>

                        {/* Specialization */}
                        <div className="border-2 border-black rounded-lg p-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-2">
                                Specialization
                            </p>
                            <p className="text-sm font-black">
                                {evolution.specialization ??
                                    'Not yet specialized'}
                            </p>
                        </div>

                        {/* Unlocked abilities */}
                        <div className="border-2 border-black rounded-lg p-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-2">
                                Unlocked Abilities
                            </p>
                            {(evolution?.unlockedAbilities ?? []).length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {(evolution?.unlockedAbilities ?? []).map(
                                        (ability) => (
                                            <span
                                                key={ability}
                                                className="text-xs font-bold px-2 py-1 rounded-md border-2 border-black bg-green-50 text-green-700"
                                            >
                                                {ability}
                                            </span>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    No abilities unlocked yet
                                </p>
                            )}
                        </div>

                        {/* Evolution timeline */}
                        <div className="border-2 border-black rounded-lg p-4">
                            <p className="text-[10px] font-black uppercase text-gray-400 mb-3">
                                Evolution Path
                            </p>
                            <div className="flex items-center gap-1">
                                {(
                                    Object.keys(
                                        STAGE_LABELS,
                                    ) as EvolutionStage[]
                                ).map((stage, i) => {
                                    const isActive = stage === evolution.stage;
                                    const isPast =
                                        Object.keys(STAGE_LABELS).indexOf(
                                            stage,
                                        ) <
                                        Object.keys(STAGE_LABELS).indexOf(
                                            evolution.stage,
                                        );
                                    return (
                                        <React.Fragment key={stage}>
                                            {i > 0 && (
                                                <div
                                                    className={`flex-1 h-1 rounded ${isPast || isActive ? 'bg-black' : 'bg-gray-200'}`}
                                                />
                                            )}
                                            <div
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[8px] font-black ${
                                                    isActive
                                                        ? 'border-black bg-black text-white'
                                                        : isPast
                                                          ? 'border-black bg-gray-300'
                                                          : 'border-gray-300 bg-white text-gray-300'
                                                }`}
                                                title={STAGE_LABELS[stage]}
                                            >
                                                {i + 1}
                                            </div>
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                            <div className="flex justify-between mt-1">
                                {(
                                    Object.keys(
                                        STAGE_LABELS,
                                    ) as EvolutionStage[]
                                ).map((stage) => (
                                    <span
                                        key={stage}
                                        className="text-[8px] font-bold text-gray-400"
                                    >
                                        {STAGE_LABELS[stage].slice(0, 3)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
