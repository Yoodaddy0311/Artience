import React, { useMemo, useState } from 'react';
import { useGrowthStore } from '../../store/useGrowthStore';
import type { MemoryType } from '../../types/growth';

const MEMORY_TYPE_CONFIG: Record<
    MemoryType,
    { label: string; color: string; bg: string }
> = {
    pattern: { label: 'Pattern', color: 'text-blue-700', bg: 'bg-blue-50' },
    preference: {
        label: 'Preference',
        color: 'text-purple-700',
        bg: 'bg-purple-50',
    },
    lesson: { label: 'Lesson', color: 'text-amber-700', bg: 'bg-amber-50' },
    shortcut: {
        label: 'Shortcut',
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
    },
    relationship: {
        label: 'Relationship',
        color: 'text-rose-700',
        bg: 'bg-rose-50',
    },
};

const ALL_TYPES: MemoryType[] = [
    'pattern',
    'preference',
    'lesson',
    'shortcut',
    'relationship',
];

function getImportanceDot(importance: number): string {
    if (importance >= 0.8) return 'bg-red-500';
    if (importance >= 0.5) return 'bg-amber-400';
    return 'bg-gray-300';
}

function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
}

interface MemoryLogProps {
    readonly agentId: string;
}

export const MemoryLog: React.FC<MemoryLogProps> = ({ agentId }) => {
    const profile = useGrowthStore((s) => s.profiles[agentId]);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all');

    const memories = useMemo(() => {
        const items = profile?.memories ?? [];
        return [...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .filter((m) => {
                if (typeFilter !== 'all' && m.type !== typeFilter) return false;
                if (
                    search &&
                    !(m.content ?? '')
                        .toLowerCase()
                        .includes(search.toLowerCase()) &&
                    !(m.context ?? '')
                        .toLowerCase()
                        .includes(search.toLowerCase())
                ) {
                    return false;
                }
                return true;
            });
    }, [profile?.memories, search, typeFilter]);

    return (
        <div className="space-y-3">
            {/* Search and filter */}
            <div className="flex flex-col sm:flex-row gap-2">
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search memories..."
                    className="flex-1 px-3 py-2 text-sm border-2 border-black rounded-lg bg-white font-bold placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                    aria-label="Search memories"
                />
                <div className="flex gap-1 flex-wrap">
                    <button
                        onClick={() => setTypeFilter('all')}
                        className={`text-[10px] font-black px-2 py-1 rounded border-2 border-black transition-all ${
                            typeFilter === 'all'
                                ? 'bg-black text-white'
                                : 'bg-white text-black hover:bg-gray-100'
                        }`}
                    >
                        All
                    </button>
                    {ALL_TYPES.map((type) => {
                        const config = MEMORY_TYPE_CONFIG[type];
                        return (
                            <button
                                key={type}
                                onClick={() => setTypeFilter(type)}
                                className={`text-[10px] font-black px-2 py-1 rounded border-2 border-black transition-all ${
                                    typeFilter === type
                                        ? 'bg-black text-white'
                                        : `${config.bg} ${config.color} hover:opacity-80`
                                }`}
                            >
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Memory list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {memories.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <p className="text-sm text-gray-400 font-bold">
                            No memories found
                        </p>
                    </div>
                )}

                {memories.map((memory) => {
                    const config = MEMORY_TYPE_CONFIG[memory.type];
                    return (
                        <div
                            key={memory.id}
                            className="p-3 border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000]"
                        >
                            <div className="flex items-start gap-2">
                                {/* Importance dot */}
                                <span
                                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 border border-black ${getImportanceDot(memory.importance)}`}
                                    title={`Importance: ${Math.round(memory.importance * 100)}%`}
                                />

                                <div className="flex-1 min-w-0">
                                    {/* Header: type badge + timestamp */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className={`text-[10px] font-black px-1.5 py-0.5 rounded border border-black ${config.bg} ${config.color}`}
                                        >
                                            {config.label}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-bold">
                                            {formatTimestamp(memory.createdAt)}
                                        </span>
                                        <span className="text-[10px] text-gray-300 font-bold ml-auto">
                                            x{memory.accessCount}
                                        </span>
                                    </div>

                                    {/* Content */}
                                    <p className="text-xs text-black font-medium leading-relaxed">
                                        {memory.content}
                                    </p>

                                    {/* Context */}
                                    {memory.context && (
                                        <p className="text-[10px] text-gray-400 mt-1 truncate">
                                            {memory.context}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
