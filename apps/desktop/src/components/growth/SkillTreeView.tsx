import React, { useState } from 'react';
import { useGrowthStore } from '../../store/useGrowthStore';
import { DEFAULT_SKILL_TREE } from '../../lib/skill-classifier';
import type { SkillCategory } from '../../types/growth';
import type { SkillNode } from '../../lib/skill-classifier';

const CATEGORY_CONFIG: Record<
    SkillCategory,
    { label: string; color: string; bg: string }
> = {
    frontend: { label: 'Frontend', color: 'text-blue-700', bg: 'bg-blue-50' },
    backend: {
        label: 'Backend',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
    },
    testing: { label: 'Testing', color: 'text-amber-700', bg: 'bg-amber-50' },
    devops: { label: 'DevOps', color: 'text-purple-700', bg: 'bg-purple-50' },
    architecture: {
        label: 'Architecture',
        color: 'text-rose-700',
        bg: 'bg-rose-50',
    },
    communication: {
        label: 'Communication',
        color: 'text-cyan-700',
        bg: 'bg-cyan-50',
    },
};

const CATEGORIES: SkillCategory[] = [
    'frontend',
    'backend',
    'testing',
    'devops',
    'architecture',
    'communication',
];

interface SkillNodeCardProps {
    readonly node: SkillNode;
    readonly level: number;
    readonly exp: number;
    readonly unlocked: boolean;
    readonly prereqsMet: boolean;
    readonly onClick: () => void;
}

const SkillNodeCard: React.FC<SkillNodeCardProps> = ({
    node,
    level,
    exp,
    unlocked,
    prereqsMet,
    onClick,
}) => {
    const maxed = level >= node.maxLevel;
    const expPercent = maxed ? 100 : Math.min((exp / 100) * 100, 100);

    return (
        <button
            onClick={onClick}
            disabled={!prereqsMet && !unlocked}
            className={`w-full text-left p-2.5 rounded-lg border-2 border-black transition-all ${
                unlocked
                    ? 'bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]'
                    : prereqsMet
                      ? 'bg-gray-50 border-dashed cursor-pointer hover:bg-gray-100'
                      : 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
            }`}
            aria-label={`${node.name}, level ${level} of ${node.maxLevel}${!unlocked ? ', locked' : ''}`}
        >
            <div className="flex items-center justify-between gap-1 mb-1">
                <span
                    className={`text-xs font-black truncate ${unlocked ? 'text-black' : 'text-gray-400'}`}
                >
                    {node.name}
                </span>
                {unlocked ? (
                    <span className="text-[10px] font-black text-gray-500 flex-shrink-0">
                        {level}/{node.maxLevel}
                    </span>
                ) : (
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-gray-400 flex-shrink-0"
                    >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                )}
            </div>
            {unlocked && !maxed && (
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-1 bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${expPercent}%` }}
                    />
                </div>
            )}
            {unlocked && maxed && (
                <div className="h-1 bg-yellow-400 rounded-full" />
            )}
        </button>
    );
};

interface SkillDetailModalProps {
    readonly node: SkillNode;
    readonly level: number;
    readonly exp: number;
    readonly unlocked: boolean;
    readonly onClose: () => void;
}

const SkillDetailModal: React.FC<SkillDetailModalProps> = ({
    node,
    level,
    exp,
    unlocked,
    onClose,
}) => {
    const config = CATEGORY_CONFIG[node.category];
    const bonusEntries = Object.entries(node.statBonuses);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`Skill detail: ${node.name}`}
        >
            <div
                className="bg-white border-2 border-black rounded-xl shadow-[6px_6px_0_0_#000] p-5 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border border-black ${config.bg} ${config.color}`}
                        >
                            {config.label}
                        </span>
                        <h3 className="font-black text-lg mt-2">{node.name}</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-md border-2 border-black bg-white hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                        aria-label="Close"
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <p className="text-sm text-gray-600 mb-3">{node.description}</p>

                <div className="space-y-2 mb-3">
                    <div className="flex justify-between text-sm">
                        <span className="font-bold">Level</span>
                        <span className="font-black">
                            {unlocked ? `${level}/${node.maxLevel}` : 'Locked'}
                        </span>
                    </div>
                    {unlocked && level < node.maxLevel && (
                        <div className="flex justify-between text-sm">
                            <span className="font-bold">EXP</span>
                            <span className="font-black">{exp}/100</span>
                        </div>
                    )}
                </div>

                {bonusEntries.length > 0 && (
                    <div className="border-t-2 border-black pt-3">
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1.5">
                            Stat Bonuses (per level)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {bonusEntries.map(([stat, bonus]) => (
                                <span
                                    key={stat}
                                    className="text-xs font-bold px-2 py-0.5 rounded border border-black bg-green-50 text-green-700"
                                >
                                    {stat} +{bonus}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {node.prerequisites.length > 0 && (
                    <div className="border-t-2 border-black pt-3 mt-3">
                        <p className="text-[10px] font-black uppercase text-gray-400 mb-1.5">
                            Prerequisites
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {node.prerequisites.map((preId) => {
                                const preNode = DEFAULT_SKILL_TREE.find(
                                    (n) => n.id === preId,
                                );
                                return (
                                    <span
                                        key={preId}
                                        className="text-xs font-bold px-2 py-0.5 rounded border border-black bg-gray-50"
                                    >
                                        {preNode?.name ?? preId}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface SkillTreeViewProps {
    readonly agentId: string;
}

export const SkillTreeView: React.FC<SkillTreeViewProps> = ({ agentId }) => {
    const profile = useGrowthStore((s) => s.profiles[agentId]);
    const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);

    const skillProgressMap = new Map(
        (profile?.skills ?? []).map((s) => [s.skillId, s]),
    );

    const unlockedIds = new Set((profile?.skills ?? []).map((s) => s.skillId));

    function arePrereqsMet(node: SkillNode): boolean {
        return node.prerequisites.every((preId) => unlockedIds.has(preId));
    }

    const selectedProgress = selectedSkill
        ? skillProgressMap.get(selectedSkill.id)
        : undefined;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {CATEGORIES.map((category) => {
                    const config = CATEGORY_CONFIG[category];
                    const nodes = DEFAULT_SKILL_TREE.filter(
                        (n) => n.category === category,
                    );

                    return (
                        <div key={category}>
                            <h3
                                className={`text-xs font-black uppercase mb-2 px-2 py-1 rounded border-2 border-black ${config.bg} ${config.color}`}
                            >
                                {config.label}
                            </h3>
                            <div className="space-y-2">
                                {nodes.map((node) => {
                                    const progress = skillProgressMap.get(
                                        node.id,
                                    );
                                    const unlocked = unlockedIds.has(node.id);

                                    return (
                                        <div key={node.id}>
                                            {node.prerequisites.length > 0 &&
                                                unlocked && (
                                                    <div className="flex justify-center mb-1">
                                                        <div className="w-0.5 h-3 bg-gray-300" />
                                                    </div>
                                                )}
                                            <SkillNodeCard
                                                node={node}
                                                level={progress?.level ?? 0}
                                                exp={progress?.exp ?? 0}
                                                unlocked={unlocked}
                                                prereqsMet={arePrereqsMet(node)}
                                                onClick={() =>
                                                    setSelectedSkill(node)
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedSkill && (
                <SkillDetailModal
                    node={selectedSkill}
                    level={selectedProgress?.level ?? 0}
                    exp={selectedProgress?.exp ?? 0}
                    unlocked={unlockedIds.has(selectedSkill.id)}
                    onClose={() => setSelectedSkill(null)}
                />
            )}
        </div>
    );
};
