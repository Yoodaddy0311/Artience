import React, { useMemo } from 'react';
import { useTerminalStore } from '../../store/useTerminalStore';
import { DEFAULT_AGENTS } from '../../types/platform';
import { AGENT_PERSONAS } from '../../data/agent-personas';
import { assetPath } from '../../lib/assetPath';
import type { AgentState } from '../../types/agent-state';
import type { AgentActivity } from '../../lib/pty-parser';

// ── Status bar colors & labels ──

const STATE_CONFIG: Record<
    AgentState,
    { bar: string; label: string; pulse?: boolean }
> = {
    idle: { bar: 'bg-gray-400', label: 'IDLE' },
    assigned: { bar: 'bg-yellow-400', label: 'ASSIGNED' },
    working: { bar: 'bg-emerald-500', label: 'WORKING', pulse: true },
    reviewing: { bar: 'bg-sky-400', label: 'REVIEWING', pulse: true },
    done: { bar: 'bg-blue-500', label: 'DONE' },
    error: { bar: 'bg-red-500', label: 'ERROR' },
};

const ACTIVITY_TO_LABEL: Partial<Record<AgentActivity, string>> = {
    thinking: 'THINKING',
    working: 'WORKING',
    reading: 'READING',
    typing: 'TYPING',
    writing: 'WRITING',
    needs_input: 'WAITING',
    success: 'DONE',
    error: 'ERROR',
};

function resolveConfig(
    stateMachine: AgentState | undefined,
    activity: AgentActivity | undefined,
) {
    const state = stateMachine ?? 'idle';
    const config = STATE_CONFIG[state];
    // Override label with more specific activity if working
    const label =
        (state === 'working' && activity && ACTIVITY_TO_LABEL[activity]) ||
        config.label;
    return { ...config, label };
}

// ── Agent lookup helpers ──

const agentProfileMap = new Map(DEFAULT_AGENTS.map((a) => [a.id, a]));

function getAgentDisplayInfo(agentId: string) {
    const profile = agentProfileMap.get(agentId);
    const persona = AGENT_PERSONAS[profile?.name?.toLowerCase() ?? ''];
    return {
        name: profile?.name ?? agentId,
        role: persona?.role ?? profile?.role ?? '',
        sprite: profile?.sprite ?? '/assets/characters/dokba_profile.png',
    };
}

// ── Single party member frame ──

const PartyMember: React.FC<{
    agentId: string;
    state: AgentState | undefined;
    activity: AgentActivity | undefined;
}> = React.memo(({ agentId, state, activity }) => {
    const { name, sprite } = getAgentDisplayInfo(agentId);
    const config = resolveConfig(state, activity);

    return (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-[#FFF8E7] border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] transition-all duration-200">
            {/* Avatar */}
            <div className="w-7 h-7 flex-shrink-0 border-2 border-black rounded bg-white overflow-hidden">
                <img
                    src={assetPath(sprite)}
                    alt={name}
                    className="w-full h-full object-cover"
                    draggable={false}
                />
            </div>

            {/* Name + Status bar */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-black text-brown-800 truncate leading-none">
                        {name}
                    </span>
                    <span className="text-[9px] font-bold text-brown-500 leading-none flex-shrink-0">
                        {config.label}
                    </span>
                </div>
                {/* HP-style bar */}
                <div className="mt-0.5 h-[6px] w-full bg-gray-200 border border-black/30 rounded-sm overflow-hidden">
                    <div
                        className={`h-full rounded-sm transition-all duration-500 ${config.bar} ${config.pulse ? 'animate-pulse' : ''}`}
                        style={{ width: '100%' }}
                    />
                </div>
            </div>
        </div>
    );
});

PartyMember.displayName = 'PartyMember';

// ── Party Frame (WoW-style) ──

const MAX_VISIBLE = 10;

export const PartyFrame: React.FC = () => {
    const agentStates = useTerminalStore((s) => s.agentStates);
    const agentActivity = useTerminalStore((s) => s.agentActivity);

    // Show only agents with non-idle state (active party members)
    const visibleAgents = useMemo(
        () =>
            Object.entries(agentStates)
                .filter(
                    ([id, sm]) =>
                        id !== 'raccoon' && sm.currentState !== 'idle',
                )
                .map(([id]) => id)
                .slice(0, MAX_VISIBLE),
        [agentStates],
    );

    if (visibleAgents.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 w-[220px] max-h-[440px] overflow-y-auto scrollbar-thin">
            {visibleAgents.map((agentId) => (
                <PartyMember
                    key={agentId}
                    agentId={agentId}
                    state={agentStates[agentId]?.currentState}
                    activity={agentActivity[agentId]}
                />
            ))}
        </div>
    );
};
