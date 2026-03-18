import React, { useCallback, useMemo } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { DEFAULT_AGENTS } from '../../types/platform';
import type { AgentActivity } from '../../lib/pty-parser';
import { assetPath } from '../../lib/assetPath';

// ── Types ──

interface TeamNode {
    id: string;
    name: string;
    role: string;
    sprite: string;
    activity: AgentActivity;
    isLeader: boolean;
    teamMemberName?: string;
}

interface TeamEdge {
    from: string;
    to: string;
    type: 'delegation' | 'crosscheck';
}

// ── Activity color mapping ──

const ACTIVITY_COLORS: Record<
    AgentActivity,
    { bg: string; border: string; label: string }
> = {
    idle: { bg: '#E5E7EB', border: '#9CA3AF', label: 'Idle' },
    thinking: { bg: '#FDE68A', border: '#F59E0B', label: 'Thinking' },
    working: { bg: '#86EFAC', border: '#22C55E', label: 'Working' },
    needs_input: {
        bg: '#E9D5FF',
        border: '#A855F7',
        label: 'Needs Input',
    },
    success: { bg: '#6EE7B7', border: '#10B981', label: 'Done' },
    error: { bg: '#FCA5A5', border: '#EF4444', label: 'Error' },
    reading: { bg: '#93C5FD', border: '#3B82F6', label: 'Reading' },
    typing: { bg: '#FDBA74', border: '#F97316', label: 'Typing' },
    writing: { bg: '#C4B5FD', border: '#8B5CF6', label: 'Writing' },
};

// Dokba profile (leader, always present)
const DOKBA_PROFILE = {
    id: 'raccoon',
    name: 'Dokba',
    role: 'Leader',
    sprite: '/assets/characters/dokba_profile.png',
};

// ── Component ──

export const TeamOrchestrationView: React.FC = () => {
    const activeTeamMembers = useTerminalStore((s) => s.activeTeamMembers);
    // Serialize agentActivity to avoid re-renders from new object references
    const agentActivityKey = useTerminalStore(
        useCallback(
            (s: { agentActivity: Record<string, AgentActivity> }) =>
                Object.entries(s.agentActivity)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(','),
            [],
        ),
    );

    const { nodes, edges } = useMemo(() => {
        const agentActivity = useTerminalStore.getState().agentActivity;
        const teamNodes: TeamNode[] = [];
        const teamEdges: TeamEdge[] = [];

        // Leader node (Dokba)
        teamNodes.push({
            ...DOKBA_PROFILE,
            activity: agentActivity['raccoon'] ?? 'idle',
            isLeader: true,
        });

        // Team members from activeTeamMembers mapping
        const memberEntries = Object.entries(activeTeamMembers);

        if (memberEntries.length > 0) {
            for (const [memberName, agentId] of memberEntries) {
                if (agentId === 'raccoon') continue;
                const profile = DEFAULT_AGENTS.find(
                    (a: { id: string }) => a.id === agentId,
                );
                const name = profile?.name ?? memberName;
                const role = profile?.role ?? memberName;
                const sprite =
                    profile?.sprite ?? '/assets/characters/dokba_profile.png';

                teamNodes.push({
                    id: agentId,
                    name,
                    role,
                    sprite,
                    activity: agentActivity[agentId] ?? 'idle',
                    isLeader: false,
                    teamMemberName: memberName,
                });

                // Leader -> member delegation edge
                teamEdges.push({
                    from: 'raccoon',
                    to: agentId,
                    type: 'delegation',
                });
            }

            // Crosscheck edges between members (pairwise for adjacent members)
            const memberIds = memberEntries
                .map(([, id]) => id)
                .filter((id) => id !== 'raccoon');
            for (let i = 0; i < memberIds.length - 1; i++) {
                teamEdges.push({
                    from: memberIds[i],
                    to: memberIds[i + 1],
                    type: 'crosscheck',
                });
            }
        } else {
            // No active team -- show default agents with idle state
            for (const agent of DEFAULT_AGENTS) {
                teamNodes.push({
                    id: agent.id,
                    name: agent.name,
                    role: agent.role,
                    sprite: agent.sprite,
                    activity: agentActivity[agent.id] ?? 'idle',
                    isLeader: false,
                });
            }
        }

        return { nodes: teamNodes, edges: teamEdges };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTeamMembers, agentActivityKey]);

    const hasTeam = Object.keys(activeTeamMembers).length > 0;
    const memberNodes = nodes.filter((n) => !n.isLeader);
    // Layout: center leader, circular member placement
    const svgWidth = 360;
    const svgHeight = 280;
    const centerX = svgWidth / 2;
    const centerY = svgHeight / 2;
    const radius = 100;

    // Stable dependency: use node IDs string instead of memberNodes array reference
    const memberNodeIds = memberNodes.map((n) => n.id).join(',');

    const nodePositions = useMemo(() => {
        const positions: Record<string, { x: number; y: number }> = {};
        positions['raccoon'] = { x: centerX, y: centerY };

        const ids = memberNodeIds.split(',').filter(Boolean);
        ids.forEach((id, i) => {
            const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
            positions[id] = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle),
            };
        });

        return positions;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [memberNodeIds]);

    return (
        <div className="p-3">
            {/* Status summary */}
            <div className="flex gap-2 flex-wrap mb-3 p-2 bg-gray-50 rounded-lg border-2 border-black">
                {hasTeam ? (
                    <span className="text-xs font-bold px-2 py-1 rounded-md border border-black bg-green-100 text-green-800 shadow-[1px_1px_0_0_#000]">
                        Team Active ({memberNodes.length} members)
                    </span>
                ) : (
                    <span className="text-xs font-bold px-2 py-1 rounded-md border border-black bg-gray-100 text-gray-600 shadow-[1px_1px_0_0_#000]">
                        No Active Team
                    </span>
                )}
                {Object.values(ACTIVITY_COLORS).filter((_, i) => {
                    const keys = Object.keys(
                        ACTIVITY_COLORS,
                    ) as AgentActivity[];
                    return nodes.some((n) => n.activity === keys[i]);
                }).length > 0 && (
                    <>
                        {(
                            Object.entries(ACTIVITY_COLORS) as [
                                AgentActivity,
                                (typeof ACTIVITY_COLORS)[AgentActivity],
                            ][]
                        )
                            .filter(([key]) =>
                                nodes.some((n) => n.activity === key),
                            )
                            .map(([key, val]) => {
                                const count = nodes.filter(
                                    (n) => n.activity === key,
                                ).length;
                                return (
                                    <span
                                        key={key}
                                        className="text-xs font-bold px-2 py-1 rounded-md border border-black shadow-[1px_1px_0_0_#000]"
                                        style={{
                                            backgroundColor: val.bg,
                                            color: '#1F2937',
                                        }}
                                    >
                                        {val.label} {count}
                                    </span>
                                );
                            })}
                    </>
                )}
            </div>

            {/* SVG Orchestration Map */}
            <div className="bg-white rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000] overflow-hidden">
                <svg
                    viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                    className="w-full"
                    style={{ height: 'auto', maxHeight: '280px' }}
                    role="img"
                    aria-label="Team orchestration visualization"
                >
                    <defs>
                        <marker
                            id="arrowhead"
                            markerWidth="8"
                            markerHeight="6"
                            refX="8"
                            refY="3"
                            orient="auto"
                        >
                            <polygon points="0 0, 8 3, 0 6" fill="#374151" />
                        </marker>
                        <marker
                            id="arrowhead-dashed"
                            markerWidth="6"
                            markerHeight="5"
                            refX="6"
                            refY="2.5"
                            orient="auto"
                        >
                            <polygon points="0 0, 6 2.5, 0 5" fill="#9CA3AF" />
                        </marker>
                    </defs>

                    {/* Edges */}
                    {edges.map((edge, i) => {
                        const from = nodePositions[edge.from];
                        const to = nodePositions[edge.to];
                        if (!from || !to) return null;

                        // Shorten line to not overlap node circles
                        const dx = to.x - from.x;
                        const dy = to.y - from.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist === 0) return null;
                        const nodeRadius = 24;
                        const ux = dx / dist;
                        const uy = dy / dist;
                        const x1 = from.x + ux * nodeRadius;
                        const y1 = from.y + uy * nodeRadius;
                        const x2 = to.x - ux * nodeRadius;
                        const y2 = to.y - uy * nodeRadius;

                        if (edge.type === 'delegation') {
                            return (
                                <line
                                    key={`edge-${i}`}
                                    x1={x1}
                                    y1={y1}
                                    x2={x2}
                                    y2={y2}
                                    stroke="#374151"
                                    strokeWidth="2"
                                    markerEnd="url(#arrowhead)"
                                />
                            );
                        }

                        return (
                            <line
                                key={`edge-${i}`}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke="#9CA3AF"
                                strokeWidth="1.5"
                                strokeDasharray="5,3"
                                markerEnd="url(#arrowhead-dashed)"
                            />
                        );
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => {
                        const pos = nodePositions[node.id];
                        if (!pos) return null;
                        const color = ACTIVITY_COLORS[node.activity];
                        const circleRadius = node.isLeader ? 28 : 22;

                        return (
                            <g key={node.id}>
                                {/* Activity ring */}
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={circleRadius + 3}
                                    fill="none"
                                    stroke={color.border}
                                    strokeWidth="3"
                                    className={
                                        node.activity === 'thinking' ||
                                        node.activity === 'working'
                                            ? 'animate-pulse'
                                            : ''
                                    }
                                />
                                {/* Background circle */}
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={circleRadius}
                                    fill={color.bg}
                                    stroke="#000"
                                    strokeWidth="2"
                                />
                                {/* Avatar image */}
                                <clipPath id={`clip-${node.id}`}>
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={circleRadius - 3}
                                    />
                                </clipPath>
                                <image
                                    href={assetPath(node.sprite)}
                                    x={pos.x - circleRadius + 3}
                                    y={pos.y - circleRadius + 3}
                                    width={(circleRadius - 3) * 2}
                                    height={(circleRadius - 3) * 2}
                                    clipPath={`url(#clip-${node.id})`}
                                    preserveAspectRatio="xMidYMid slice"
                                />
                                {/* Name label */}
                                <text
                                    x={pos.x}
                                    y={pos.y + circleRadius + 14}
                                    textAnchor="middle"
                                    className="fill-black text-[10px] font-bold"
                                    style={{
                                        fontFamily: "'Pretendard', sans-serif",
                                    }}
                                >
                                    {node.name}
                                </text>
                                {/* Role / team member name */}
                                <text
                                    x={pos.x}
                                    y={pos.y + circleRadius + 25}
                                    textAnchor="middle"
                                    className="fill-gray-500 text-[8px]"
                                    style={{
                                        fontFamily: "'Pretendard', sans-serif",
                                    }}
                                >
                                    {node.teamMemberName ?? node.role}
                                </text>
                                {/* Activity badge */}
                                <rect
                                    x={pos.x - 16}
                                    y={pos.y - circleRadius - 14}
                                    width="32"
                                    height="12"
                                    rx="4"
                                    fill={color.bg}
                                    stroke={color.border}
                                    strokeWidth="1"
                                />
                                <text
                                    x={pos.x}
                                    y={pos.y - circleRadius - 5}
                                    textAnchor="middle"
                                    className="text-[7px] font-bold fill-gray-800"
                                    style={{
                                        fontFamily: "'Pretendard', sans-serif",
                                    }}
                                >
                                    {color.label}
                                </text>
                                {/* Leader crown indicator */}
                                {node.isLeader && (
                                    <text
                                        x={pos.x}
                                        y={pos.y - circleRadius - 18}
                                        textAnchor="middle"
                                        className="text-[14px]"
                                    >
                                        *
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            {/* Legend */}
            <div className="mt-3 flex gap-3 items-center text-[10px] text-gray-500">
                <span className="flex items-center gap-1">
                    <svg width="20" height="8">
                        <line
                            x1="0"
                            y1="4"
                            x2="16"
                            y2="4"
                            stroke="#374151"
                            strokeWidth="2"
                        />
                        <polygon points="14 1, 20 4, 14 7" fill="#374151" />
                    </svg>
                    Delegation
                </span>
                <span className="flex items-center gap-1">
                    <svg width="20" height="8">
                        <line
                            x1="0"
                            y1="4"
                            x2="16"
                            y2="4"
                            stroke="#9CA3AF"
                            strokeWidth="1.5"
                            strokeDasharray="3,2"
                        />
                    </svg>
                    Cross-check
                </span>
            </div>
        </div>
    );
};
