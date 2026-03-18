import React, { useMemo, useRef, useEffect } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useTimelineStore } from '../../store/useTimelineStore';
import { DEFAULT_AGENTS } from '../../types/platform';
import type { AgentActivity } from '../../lib/pty-parser';

// ── Activity color mapping for timeline bars ──

const BAR_COLORS: Record<AgentActivity, string> = {
    idle: '#D1D5DB',
    thinking: '#FBBF24',
    working: '#34D399',
    needs_input: '#C084FC',
    success: '#10B981',
    error: '#EF4444',
    reading: '#60A5FA',
    typing: '#FB923C',
    writing: '#A78BFA',
};

const BAR_LABELS: Record<AgentActivity, string> = {
    idle: 'Idle',
    thinking: 'Thinking',
    working: 'Working',
    needs_input: 'Needs Input',
    success: 'Done',
    error: 'Error',
    reading: 'Reading',
    typing: 'Typing',
    writing: 'Writing',
};

// ── Component ──

export const TaskTimeline: React.FC = () => {
    const activeTeamMembers = useTerminalStore((s) => s.activeTeamMembers);
    const entries = useTimelineStore((s) => s.entries);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to right on new entries
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [entries]);

    // Determine which agents to show
    const agentIds = useMemo(() => {
        const ids = new Set<string>();
        ids.add('raccoon');

        // From active team
        for (const agentId of Object.values(activeTeamMembers)) {
            ids.add(agentId);
        }

        // From timeline entries themselves
        for (const entry of entries) {
            ids.add(entry.agentId);
        }

        return [...ids];
    }, [activeTeamMembers, entries]);

    // Compute time range
    const { startTime, duration } = useMemo(() => {
        if (entries.length === 0) {
            const now = Date.now();
            return { startTime: now, endTime: now + 60000, duration: 60000 };
        }

        const start = Math.min(...entries.map((e) => e.startedAt));
        const end = Math.max(
            ...entries.map((e) => e.endedAt ?? Date.now()),
            Date.now(),
        );
        const dur = Math.max(end - start, 10000); // minimum 10s range
        return { startTime: start, endTime: end, duration: dur };
    }, [entries]);

    // Group entries by agentId
    const entriesByAgent = useMemo(() => {
        const grouped: Record<string, typeof entries> = {};
        for (const id of agentIds) {
            grouped[id] = entries.filter((e) => e.agentId === id);
        }
        return grouped;
    }, [agentIds, entries]);

    // Agent name resolver
    const getAgentName = (agentId: string): string => {
        if (agentId === 'raccoon') return 'Dokba';
        const profile = DEFAULT_AGENTS.find(
            (a: { id: string }) => a.id === agentId,
        );
        if (profile) return profile.name;
        // Check team member names
        for (const [memberName, id] of Object.entries(activeTeamMembers)) {
            if (id === agentId) return memberName;
        }
        return agentId;
    };

    // Time axis ticks
    const ticks = useMemo(() => {
        const tickCount = Math.min(
            Math.max(Math.floor(duration / 10000), 2),
            12,
        );
        const result: { label: string; pct: number }[] = [];
        for (let i = 0; i <= tickCount; i++) {
            const t = startTime + (duration * i) / tickCount;
            const secs = Math.floor((t - startTime) / 1000);
            const label =
                secs < 60
                    ? `${secs}s`
                    : `${Math.floor(secs / 60)}m${secs % 60}s`;
            result.push({ label, pct: (i / tickCount) * 100 });
        }
        return result;
    }, [startTime, duration]);

    const timelineWidth = Math.max(600, Math.floor(duration / 500)); // 2px per second

    if (entries.length === 0) {
        return (
            <div className="p-4">
                <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-sm text-gray-400 font-bold">
                        Timeline data will appear here
                    </p>
                    <p className="text-xs text-gray-300 mt-1">
                        Agent activity is recorded when terminals are active
                    </p>
                </div>
            </div>
        );
    }

    const rowHeight = 36;
    const labelWidth = 80;

    return (
        <div className="p-3">
            {/* Legend */}
            <div className="flex gap-2 flex-wrap mb-3 p-2 bg-gray-50 rounded-lg border-2 border-black">
                {(Object.entries(BAR_COLORS) as [AgentActivity, string][])
                    .filter(([key]) => key !== 'idle')
                    .map(([key, color]) => (
                        <span
                            key={key}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-700"
                        >
                            <span
                                className="inline-block w-3 h-3 rounded-sm border border-black"
                                style={{ backgroundColor: color }}
                            />
                            {BAR_LABELS[key]}
                        </span>
                    ))}
            </div>

            {/* Timeline */}
            <div className="bg-white rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000] overflow-hidden">
                <div className="flex">
                    {/* Agent labels (fixed) */}
                    <div
                        className="flex-shrink-0 border-r-2 border-black bg-gray-50"
                        style={{ width: labelWidth }}
                    >
                        {/* Time axis header */}
                        <div
                            className="border-b-2 border-black px-2 flex items-center"
                            style={{ height: 24 }}
                        >
                            <span className="text-[9px] font-black text-gray-500 uppercase">
                                Agent
                            </span>
                        </div>
                        {agentIds.map((id) => (
                            <div
                                key={id}
                                className="border-b border-gray-200 px-2 flex items-center"
                                style={{ height: rowHeight }}
                            >
                                <span className="text-[10px] font-bold text-black truncate">
                                    {getAgentName(id)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Scrollable timeline area */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-x-auto overflow-y-hidden"
                    >
                        <div style={{ width: timelineWidth, minWidth: '100%' }}>
                            {/* Time axis */}
                            <div
                                className="border-b-2 border-black relative"
                                style={{ height: 24 }}
                            >
                                {ticks.map((tick, i) => (
                                    <span
                                        key={i}
                                        className="absolute text-[8px] font-bold text-gray-400 -translate-x-1/2"
                                        style={{
                                            left: `${tick.pct}%`,
                                            top: '6px',
                                        }}
                                    >
                                        {tick.label}
                                    </span>
                                ))}
                            </div>

                            {/* Agent rows */}
                            {agentIds.map((id) => {
                                const agentEntries = entriesByAgent[id] ?? [];
                                return (
                                    <div
                                        key={id}
                                        className="border-b border-gray-200 relative"
                                        style={{ height: rowHeight }}
                                    >
                                        {/* Grid lines */}
                                        {ticks.map((tick, i) => (
                                            <div
                                                key={i}
                                                className="absolute top-0 bottom-0 border-l border-gray-100"
                                                style={{ left: `${tick.pct}%` }}
                                            />
                                        ))}

                                        {/* Activity bars */}
                                        {agentEntries.map((entry, i) => {
                                            const entryEnd =
                                                entry.endedAt ?? Date.now();
                                            const left =
                                                ((entry.startedAt - startTime) /
                                                    duration) *
                                                100;
                                            const width =
                                                ((entryEnd - entry.startedAt) /
                                                    duration) *
                                                100;

                                            if (width < 0.1) return null;

                                            return (
                                                <div
                                                    key={i}
                                                    className="absolute top-1 rounded-sm border border-black/20"
                                                    style={{
                                                        left: `${left}%`,
                                                        width: `${Math.max(width, 0.5)}%`,
                                                        height: rowHeight - 8,
                                                        backgroundColor:
                                                            BAR_COLORS[
                                                                entry.activity
                                                            ],
                                                    }}
                                                    title={`${BAR_LABELS[entry.activity]}${entry.toolName ? ` (${entry.toolName})` : ''} - ${Math.round((entryEnd - entry.startedAt) / 1000)}s`}
                                                >
                                                    {width > 3 && (
                                                        <span className="text-[7px] font-bold text-black/70 px-0.5 truncate block leading-[28px]">
                                                            {entry.toolName ??
                                                                BAR_LABELS[
                                                                    entry
                                                                        .activity
                                                                ]}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-2 text-[10px] text-gray-400 flex gap-4">
                <span>Total: {Math.round(duration / 1000)}s</span>
                <span>Entries: {entries.length}</span>
                <span>Agents: {agentIds.length}</span>
            </div>
        </div>
    );
};
