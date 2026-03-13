import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { DEFAULT_AGENTS } from '../../types/platform';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { AgentState } from '../../types/agent-state';

// ── State badge config ──

const STATE_BADGE: Record<
    AgentState,
    { color: string; bg: string; label: string }
> = {
    idle: { color: '#6B7280', bg: '#F3F4F6', label: 'Idle' },
    assigned: { color: '#D97706', bg: '#FEF3C7', label: 'Assigned' },
    working: { color: '#2563EB', bg: '#DBEAFE', label: 'Working' },
    reviewing: { color: '#7C3AED', bg: '#EDE9FE', label: 'Reviewing' },
    done: { color: '#059669', bg: '#D1FAE5', label: 'Done' },
    error: { color: '#DC2626', bg: '#FEE2E2', label: 'Error' },
};

type ScheduledTaskPriority = 'critical' | 'high' | 'medium' | 'low';

interface ScheduledTaskInfo {
    id: string;
    description: string;
    priority: ScheduledTaskPriority;
    assignedAgent?: string;
    createdAt: number;
    status: 'queued' | 'running' | 'completed' | 'failed';
    result?: string;
}

interface AgentMetricsRecord {
    agentId: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    completionRate: number;
    avgDurationMs: number;
    lastActive: number;
}

const PRIORITY_VARIANT: Record<
    ScheduledTaskPriority,
    'error' | 'warning' | 'info' | 'default'
> = {
    critical: 'error',
    high: 'warning',
    medium: 'info',
    low: 'default',
};

// ── Helpers ──

function resolveAgentName(agentId: string): string {
    if (agentId === 'raccoon') return 'Dokba';
    const profile = DEFAULT_AGENTS.find((a) => a.id === agentId);
    return profile?.name ?? agentId;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}m ${rem}s`;
}

function formatElapsed(since: number): string {
    return formatDuration(Date.now() - since);
}

// ── Tab type ──

type DashboardTab = 'queued' | 'running' | 'completed';

// ── Component ──

export const LiveDashboard: React.FC = () => {
    const agentStates = useTerminalStore((s) => s.agentStates);

    const [taskData, setTaskData] = useState<{
        queued: ScheduledTaskInfo[];
        running: ScheduledTaskInfo[];
        completed: ScheduledTaskInfo[];
    }>({ queued: [], running: [], completed: [] });

    const [topPerformers, setTopPerformers] = useState<AgentMetricsRecord[]>(
        [],
    );
    const [activeTab, setActiveTab] = useState<DashboardTab>('queued');
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchData = useCallback(async () => {
        try {
            const [tasks, performers] = await Promise.all([
                window.dogbaApi?.taskQueue.list(),
                window.dogbaApi?.metrics.topPerformers(5),
            ]);
            if (tasks) setTaskData(tasks);
            if (performers) setTopPerformers(performers);
        } catch {
            // IPC may not be available in dev mode
        }
    }, []);

    useEffect(() => {
        fetchData();
        intervalRef.current = setInterval(fetchData, 5000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchData]);

    // ── Section 1: Agent State Overview ──

    const stateEntries = Object.entries(agentStates);
    const stateCounts: Record<AgentState, number> = {
        idle: 0,
        assigned: 0,
        working: 0,
        reviewing: 0,
        done: 0,
        error: 0,
    };
    for (const [, machine] of stateEntries) {
        stateCounts[machine.currentState]++;
    }
    const totalAgents = stateEntries.length;

    // ── Section 2: Task Queue ──

    const tabTasks: ScheduledTaskInfo[] = taskData[activeTab] ?? [];
    const tabCounts = {
        queued: taskData.queued.length,
        running: taskData.running.length,
        completed: taskData.completed.length,
    };

    return (
        <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto">
            {/* ── Agent State Overview ── */}
            <Card title="Agent Status">
                {totalAgents === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                        No agents initialized yet
                    </p>
                ) : (
                    <>
                        {/* Count summary bar */}
                        <div className="flex gap-1.5 flex-wrap mb-3">
                            {(
                                Object.entries(stateCounts) as [
                                    AgentState,
                                    number,
                                ][]
                            )
                                .filter(([, count]) => count > 0)
                                .map(([state, count]) => (
                                    <span
                                        key={state}
                                        className="text-[10px] font-bold px-2 py-0.5 rounded border border-black"
                                        style={{
                                            backgroundColor:
                                                STATE_BADGE[state].bg,
                                            color: STATE_BADGE[state].color,
                                        }}
                                    >
                                        {STATE_BADGE[state].label} {count}
                                    </span>
                                ))}
                        </div>

                        {/* Agent list */}
                        <div className="grid grid-cols-2 gap-1.5">
                            {stateEntries.map(([agentId, machine]) => {
                                const badge = STATE_BADGE[machine.currentState];
                                return (
                                    <div
                                        key={agentId}
                                        className="flex items-center gap-2 px-2 py-1 rounded border border-gray-200 bg-gray-50"
                                    >
                                        <span
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{
                                                backgroundColor: badge.color,
                                            }}
                                            aria-label={badge.label}
                                        />
                                        <span className="text-[11px] font-bold text-black truncate">
                                            {resolveAgentName(agentId)}
                                        </span>
                                        <span
                                            className="text-[9px] font-bold ml-auto flex-shrink-0 px-1 rounded"
                                            style={{
                                                backgroundColor: badge.bg,
                                                color: badge.color,
                                            }}
                                        >
                                            {badge.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </Card>

            {/* ── Task Queue ── */}
            <Card title="Task Queue">
                {/* Tab buttons */}
                <div
                    className="flex gap-1 mb-3"
                    role="tablist"
                    aria-label="Task queue tabs"
                >
                    {(['queued', 'running', 'completed'] as DashboardTab[]).map(
                        (tab) => (
                            <button
                                key={tab}
                                role="tab"
                                aria-selected={activeTab === tab}
                                onClick={() => setActiveTab(tab)}
                                className={`text-[11px] font-bold px-2.5 py-1 rounded border-2 border-black transition-colors ${
                                    activeTab === tab
                                        ? 'bg-black text-white'
                                        : 'bg-white text-black hover:bg-gray-100'
                                }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)} (
                                {tabCounts[tab]})
                            </button>
                        ),
                    )}
                </div>

                {/* Task list */}
                {tabTasks.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                        No {activeTab} tasks
                    </p>
                ) : (
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {tabTasks.map((task) => (
                            <div
                                key={task.id}
                                className="flex items-start gap-2 px-2 py-1.5 rounded border border-gray-200 bg-gray-50"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-black truncate">
                                        {task.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <Badge
                                            variant={
                                                PRIORITY_VARIANT[task.priority]
                                            }
                                            size="sm"
                                        >
                                            {task.priority}
                                        </Badge>
                                        {task.assignedAgent && (
                                            <span className="text-[9px] text-gray-500">
                                                {resolveAgentName(
                                                    task.assignedAgent,
                                                )}
                                            </span>
                                        )}
                                        <span className="text-[9px] text-gray-400 ml-auto">
                                            {formatElapsed(task.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ── Performance Leaderboard ── */}
            <Card title="Top Performers">
                {topPerformers.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                        No performance data yet
                    </p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {topPerformers.map((agent, idx) => {
                            const pct = Math.round(agent.completionRate * 100);
                            return (
                                <div
                                    key={agent.agentId}
                                    className="flex items-center gap-2"
                                >
                                    <span className="text-[11px] font-black text-gray-400 w-4 text-right">
                                        {idx + 1}
                                    </span>
                                    <span className="text-[11px] font-bold text-black w-16 truncate">
                                        {resolveAgentName(agent.agentId)}
                                    </span>
                                    {/* Progress bar */}
                                    <div className="flex-1 h-3 bg-gray-200 rounded border border-black overflow-hidden">
                                        <div
                                            className="h-full bg-green-400 transition-all duration-300"
                                            style={{ width: `${pct}%` }}
                                            role="progressbar"
                                            aria-valuenow={pct}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-label={`${resolveAgentName(agent.agentId)} completion rate`}
                                        />
                                    </div>
                                    <span className="text-[10px] font-bold text-black w-8 text-right">
                                        {pct}%
                                    </span>
                                    <div className="text-[9px] text-gray-500 w-20 text-right">
                                        <span>
                                            {formatDuration(
                                                agent.avgDurationMs,
                                            )}{' '}
                                            avg
                                        </span>
                                        <span className="ml-1">
                                            ({agent.totalTasks})
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
};
