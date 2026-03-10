import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Eye, TrendingUp } from 'lucide-react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { useGrowthStore } from '../../store/useGrowthStore';
import { DEFAULT_AGENTS, type AgentProfile } from '../../types/platform';
import type { AgentActivity, ParsedEvent } from '../../lib/pty-parser';
import { assetPath } from '../../lib/assetPath';
import { AgentLevelBadge } from '../growth';
import type { EvolutionStage, SkillCategory } from '../../types/growth';

// ── Status Configuration ──

interface StatusConfig {
    readonly dot: string;
    readonly bg: string;
    readonly label: string;
    readonly pulse: boolean;
}

const STATUS_MAP: Record<AgentActivity, StatusConfig> = {
    idle: { dot: 'bg-gray-400', bg: '', label: '대기', pulse: false },
    thinking: {
        dot: 'bg-yellow-400',
        bg: 'border-yellow-300',
        label: '고민 중',
        pulse: true,
    },
    working: {
        dot: 'bg-blue-500',
        bg: 'border-blue-300',
        label: '작업 중',
        pulse: true,
    },
    success: {
        dot: 'bg-emerald-500',
        bg: 'border-emerald-300',
        label: '성공',
        pulse: false,
    },
    error: {
        dot: 'bg-red-500',
        bg: 'border-red-300',
        label: '오류',
        pulse: false,
    },
    reading: {
        dot: 'bg-blue-400',
        bg: 'border-blue-200',
        label: '읽는 중',
        pulse: true,
    },
    typing: {
        dot: 'bg-orange-400',
        bg: 'border-orange-200',
        label: '입력 중',
        pulse: true,
    },
    writing: {
        dot: 'bg-violet-500',
        bg: 'border-violet-300',
        label: '작성 중',
        pulse: true,
    },
} as const;

// ── Evolution Stage Labels ──

const STAGE_LABELS: Record<EvolutionStage, string> = {
    novice: '초보',
    apprentice: '견습',
    journeyman: '숙련',
    expert: '전문가',
    master: '마스터',
    legendary: '전설',
};

function getTopSkillCategory(
    taskHistory: ReadonlyArray<{ skillCategory: SkillCategory }>,
): string {
    if (taskHistory.length === 0) return '-';
    const counts: Partial<Record<SkillCategory, number>> = {};
    for (const entry of taskHistory) {
        counts[entry.skillCategory] = (counts[entry.skillCategory] ?? 0) + 1;
    }
    let topCategory: SkillCategory | null = null;
    let topCount = 0;
    for (const [cat, count] of Object.entries(counts) as Array<
        [SkillCategory, number]
    >) {
        if (count > topCount) {
            topCount = count;
            topCategory = cat;
        }
    }
    return topCategory ?? '-';
}

// ── Helpers ──

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    return `${minutes}m ${remainSec}s`;
}

function getRecentToolEvents(
    events: ParsedEvent[],
    limit: number,
): ParsedEvent[] {
    const toolEvents = events.filter(
        (e) => e.type === 'tool_use' || e.type === 'tool_result',
    );
    return toolEvents.slice(-limit);
}

function formatToolContent(content: string): string {
    // Truncate long file paths or content
    const trimmed = content.trim();
    if (trimmed.length > 50) {
        return trimmed.slice(0, 47) + '...';
    }
    return trimmed;
}

// ── Agent Activity Card ──

interface AgentCardProps {
    readonly agent: AgentProfile;
    readonly activity: AgentActivity;
    readonly events: ParsedEvent[];
    readonly teamMemberName?: string;
    readonly activityStartTime: number;
}

const AgentCard: React.FC<AgentCardProps> = ({
    agent,
    activity,
    events,
    teamMemberName,
    activityStartTime,
}) => {
    const config = STATUS_MAP[activity];
    const [elapsed, setElapsed] = useState(0);

    // Update elapsed timer for active states
    useEffect(() => {
        if (!config.pulse || activityStartTime === 0) {
            setElapsed(0);
            return;
        }

        const tick = () => setElapsed(Date.now() - activityStartTime);
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [config.pulse, activityStartTime]);

    const recentTools = getRecentToolEvents(events, 3);
    const currentTool =
        recentTools.length > 0 ? recentTools[recentTools.length - 1] : null;

    return (
        <div
            className={`rounded-xl border-2 border-black bg-white shadow-[3px_3px_0_0_#000] transition-all ${
                config.bg ? `${config.bg} border-l-4` : ''
            }`}
        >
            {/* Header: Avatar + Name + Status */}
            <div className="flex items-center gap-3 p-3 pb-0">
                <img
                    src={assetPath(agent.sprite)}
                    alt={agent.name}
                    className="w-10 h-10 rounded-lg bg-gray-100 object-contain border-2 border-black flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-black truncate">
                            {agent.name}
                        </span>
                        {teamMemberName && (
                            <span className="text-[10px] font-bold text-gray-400 truncate">
                                ({teamMemberName})
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-500 block truncate">
                        {agent.role}
                    </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {config.pulse && elapsed > 0 && (
                        <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                            {formatDuration(elapsed)}
                        </span>
                    )}
                    <span className="relative flex h-3 w-3">
                        {config.pulse && (
                            <span
                                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.dot}`}
                            />
                        )}
                        <span
                            className={`relative inline-flex rounded-full h-3 w-3 ${config.dot}`}
                        />
                    </span>
                </div>
            </div>

            {/* Divider */}
            <div className="mx-3 my-2 border-t border-gray-200" />

            {/* Activity Info */}
            <div className="px-3 pb-3 space-y-1.5">
                {/* Current activity */}
                {currentTool ? (
                    <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-black text-gray-400 uppercase w-8 flex-shrink-0 pt-0.5">
                            Now
                        </span>
                        <span className="text-xs text-black font-mono truncate">
                            {currentTool.toolName && (
                                <span className="font-bold text-blue-600">
                                    {currentTool.toolName}{' '}
                                </span>
                            )}
                            {formatToolContent(currentTool.content)}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-gray-400 uppercase w-8 flex-shrink-0">
                            Now
                        </span>
                        <span className="text-xs text-gray-400 italic">
                            {config.label}
                        </span>
                    </div>
                )}

                {/* Recent history (up to 2 older events) */}
                {recentTools.slice(0, -1).map((evt, idx) => (
                    <div
                        key={idx}
                        className="flex items-start gap-1.5 opacity-60"
                    >
                        <span className="text-[10px] text-gray-300 w-8 flex-shrink-0 pt-0.5">
                            {idx === 0 && recentTools.length > 2 ? '...' : ''}
                        </span>
                        <span className="text-[11px] text-gray-500 font-mono truncate">
                            {evt.toolName && (
                                <span className="font-semibold">
                                    {evt.toolName}{' '}
                                </span>
                            )}
                            {formatToolContent(evt.content)}
                        </span>
                    </div>
                ))}

                {/* Status label badge */}
                <div className="flex items-center justify-end pt-1">
                    <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md border border-black ${
                            activity === 'idle'
                                ? 'bg-gray-100 text-gray-500'
                                : activity === 'error'
                                  ? 'bg-red-100 text-red-700'
                                  : activity === 'success'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-blue-50 text-blue-700'
                        }`}
                    >
                        {config.label}
                    </span>
                </div>
            </div>
        </div>
    );
};

// ── Activity Dashboard ──

interface ActivityDashboardProps {
    readonly onClose: () => void;
}

export const ActivityDashboard: React.FC<ActivityDashboardProps> = ({
    onClose,
}) => {
    const agentActivity = useTerminalStore((s) => s.agentActivity);
    const activeTeamMembers = useTerminalStore((s) => s.activeTeamMembers);
    const parsedMessages = useTerminalStore((s) => s.parsedMessages);
    const tabs = useTerminalStore((s) => s.tabs);
    const growthProfiles = useGrowthStore((s) => s.profiles);

    // Track when each agent's activity status last changed
    const activityTimestamps = useRef<Record<string, number>>({});
    const prevActivity = useRef<Record<string, AgentActivity>>({});

    useEffect(() => {
        const now = Date.now();
        for (const [agentId, status] of Object.entries(agentActivity)) {
            if (prevActivity.current[agentId] !== status) {
                activityTimestamps.current[agentId] = now;
                prevActivity.current[agentId] = status;
            }
        }
    }, [agentActivity]);

    // Build the list of agents to display:
    // All DEFAULT_AGENTS that have activity or active team mapping, fallback to all
    const displayAgents: Array<{
        agent: AgentProfile;
        teamMemberName?: string;
        tabId?: string;
    }> = [];

    // Reverse team member mapping: agentId -> teamMemberName
    const agentToTeamName: Record<string, string> = {};
    for (const [memberName, agentId] of Object.entries(activeTeamMembers)) {
        agentToTeamName[agentId] = memberName;
    }

    // Map agentId -> tabId for event lookup
    const agentToTabId: Record<string, string> = {};
    for (const tab of tabs) {
        if (tab.agentId) {
            agentToTabId[tab.agentId] = tab.id;
        }
    }

    // Add default agents that have activity or team mapping
    for (const agent of DEFAULT_AGENTS) {
        const hasActivity = agentActivity[agent.id] !== undefined;
        const hasTeamMapping = agentToTeamName[agent.id] !== undefined;
        if (hasActivity || hasTeamMapping) {
            displayAgents.push({
                agent,
                teamMemberName: agentToTeamName[agent.id],
                tabId: agentToTabId[agent.id],
            });
        }
    }

    // If no agents have activity, show all default agents as idle
    if (displayAgents.length === 0) {
        for (const agent of DEFAULT_AGENTS) {
            displayAgents.push({ agent });
        }
    }

    // Status summary counts
    const statusCounts = displayAgents.reduce(
        (acc, { agent }) => {
            const status = agentActivity[agent.id] ?? 'idle';
            acc[status] = (acc[status] ?? 0) + 1;
            return acc;
        },
        {} as Record<string, number>,
    );

    // Growth section: agents with growth profiles
    const agentNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const agent of DEFAULT_AGENTS) {
            map[agent.id] = agent.name;
        }
        return map;
    }, []);

    const growthEntries = useMemo(
        () =>
            Object.entries(growthProfiles).filter(
                ([, profile]) => profile != null,
            ),
        [growthProfiles],
    );

    return (
        <div
            className="w-full max-w-md h-full bg-white border-l-4 border-black shadow-[-6px_0_0_0_#000] flex flex-col z-20 transition-all absolute right-0 top-0"
            style={{ fontFamily: "'Pretendard', sans-serif" }}
            role="region"
            aria-label="Agent Activity Dashboard"
        >
            {/* Header */}
            <div className="p-4 border-b-2 border-black flex justify-between items-center bg-[#9DE5DC]">
                <h2 className="font-black text-lg text-black flex items-center gap-1.5">
                    <Eye className="w-5 h-5 inline-block" strokeWidth={2.5} />
                    Activity Dashboard
                </h2>
                <button
                    onClick={onClose}
                    aria-label="Close activity dashboard"
                    className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Status Summary Bar */}
            <div className="px-4 py-3 border-b-2 border-black bg-gray-50">
                <div className="flex gap-2 flex-wrap">
                    {Object.entries(statusCounts).map(([status, count]) => {
                        const cfg =
                            STATUS_MAP[status as AgentActivity] ??
                            STATUS_MAP.idle;
                        return (
                            <span
                                key={status}
                                className={`text-[11px] font-black px-2 py-1 rounded-md border border-black flex items-center gap-1.5 ${
                                    status === 'idle'
                                        ? 'bg-gray-100 text-gray-600'
                                        : status === 'error'
                                          ? 'bg-red-100 text-red-700'
                                          : status === 'success'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-blue-50 text-blue-700'
                                }`}
                            >
                                <span
                                    className={`inline-block w-2 h-2 rounded-full ${cfg.dot}`}
                                />
                                {cfg.label} {count}
                            </span>
                        );
                    })}
                    <span className="text-[11px] font-bold text-gray-400 flex items-center">
                        Total {displayAgents.length}
                    </span>
                </div>
            </div>

            {/* Agent Cards */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {displayAgents.map(({ agent, teamMemberName, tabId }) => {
                    const status = agentActivity[agent.id] ?? 'idle';
                    const events = tabId ? (parsedMessages[tabId] ?? []) : [];
                    const startTime = activityTimestamps.current[agent.id] ?? 0;

                    return (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            activity={status}
                            events={events}
                            teamMemberName={teamMemberName}
                            activityStartTime={startTime}
                        />
                    );
                })}

                {displayAgents.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                        <Activity
                            className="w-10 h-10 mx-auto text-gray-300 mb-2"
                            strokeWidth={2}
                        />
                        <p className="text-sm text-gray-400 font-bold">
                            활성 에이전트가 없습니다
                        </p>
                        <p className="text-xs text-gray-300 mt-1">
                            터미널에서 에이전트를 실행하면 여기에 표시됩니다
                        </p>
                    </div>
                )}

                {/* Growth Status Section */}
                {growthEntries.length > 0 && (
                    <div className="border-2 border-black rounded-lg shadow-[4px_4px_0_0_#000] overflow-hidden">
                        <div className="bg-[#FFD93D] px-3 py-2 border-b-2 border-black flex items-center gap-1.5">
                            <TrendingUp className="w-4 h-4" strokeWidth={2.5} />
                            <span className="font-black text-sm text-black">
                                성장 현황
                            </span>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-2 bg-gray-50">
                            {growthEntries.map(([agentId, profile]) => (
                                <div
                                    key={agentId}
                                    className="border-2 border-black rounded-lg p-3 bg-white shadow-[2px_2px_0_0_#000]"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <AgentLevelBadge
                                            agentId={agentId}
                                            size="sm"
                                        />
                                        <span className="font-bold text-sm truncate">
                                            {agentNameMap[agentId] ?? agentId}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-600 space-y-1">
                                        <div>
                                            총 EXP:{' '}
                                            {profile.totalExp.toLocaleString()}
                                        </div>
                                        <div>
                                            진화:{' '}
                                            {STAGE_LABELS[
                                                profile.evolution.stage
                                            ] ?? profile.evolution.stage}
                                        </div>
                                        <div>
                                            기억:{' '}
                                            {(profile.memories ?? []).length}개
                                        </div>
                                        <div>
                                            스킬:{' '}
                                            {(profile.skills ?? []).length}개
                                            해금
                                        </div>
                                        <div>
                                            주특기:{' '}
                                            {getTopSkillCategory(
                                                profile.taskHistory ?? [],
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
