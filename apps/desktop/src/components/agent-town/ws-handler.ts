import { type AgentState } from '../../types/platform';
import { type ZoneType } from '../../systems/grid-world';
import {
    STATE_LABELS,
    RACCOON_AGENT_ID,
    type LogItem,
    type AgentRuntime,
    showAgentBubble,
    updateAgentStateDot,
} from './agent-runtime';
import {
    type RaccoonRuntime,
    updateRaccoonStateDot,
    showRaccoonBubble,
} from './raccoon-runtime';

// ── WebSocket message handler context ──

export interface WsHandlerContext {
    raccoon: RaccoonRuntime;
    isMounted: boolean;
    agentRuntimeMap: Map<string, AgentRuntime>;
    setRaccoonDisplayState: (state: AgentState) => void;
    setLogs: React.Dispatch<React.SetStateAction<LogItem[]>>;
    pickNewDestination: () => void;
    pickZoneDestination: (zone: ZoneType) => void;
    pickAgentWanderDest: (agent: AgentRuntime) => void;
    pickAgentZoneDest: (agent: AgentRuntime, zone: ZoneType) => void;
}

/** Append a log entry, keeping only the last 20 items. */
function appendLog(
    setLogs: React.Dispatch<React.SetStateAction<LogItem[]>>,
    entry: LogItem,
): void {
    setLogs(prev => [...prev.slice(-19), entry]);
}

/** Handle state change for a non-raccoon agent. */
export function handleAgentStateChange(
    agent: AgentRuntime,
    newState: AgentState,
    pickAgentWanderDest: (agent: AgentRuntime) => void,
    pickAgentZoneDest: (agent: AgentRuntime, zone: ZoneType) => void,
): void {
    agent.state = newState;
    agent.stateAnimTimer = 0;
    updateAgentStateDot(agent, newState);

    if (newState === 'RUNNING') {
        pickAgentZoneDest(agent, 'work');
    } else if (newState === 'THINKING') {
        // Stop and sway
        agent.path = [];
        agent.pauseTimer = 0;
    } else if (newState === 'SUCCESS') {
        agent.path = [];
        agent.pauseTimer = 0;
        agent.stateAnimTimer = 0;
    } else if (newState === 'ERROR') {
        agent.path = [];
        agent.pauseTimer = 0;
        agent.stateAnimTimer = 0;
        agent.errorFlashTimer = 0;
    } else if (newState === 'IDLE' || newState === 'WALK') {
        if (agent.path.length === 0) {
            pickAgentWanderDest(agent);
        }
    }
}

/**
 * Handle a single WebSocket message event.
 * Dispatches to raccoon state changes, agent state changes,
 * task assignment bubbles, job updates, and job log entries.
 */
export function handleWsMessage(
    event: MessageEvent,
    ctx: WsHandlerContext,
): void {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'AGENT_STATE_CHANGE') {
            const newState = data.state as AgentState;

            // ── Handle Raccoon state changes ──
            if (data.agentId === RACCOON_AGENT_ID || data.agentId === 'raccoon') {
                ctx.raccoon.state = newState;
                ctx.raccoon.stateAnimTimer = 0;

                if (ctx.isMounted) {
                    ctx.setRaccoonDisplayState(newState);
                    appendLog(ctx.setLogs, {
                        ts: Date.now(),
                        text: `\uC0C1\uD0DC \uBCC0\uACBD: ${STATE_LABELS[newState]}`,
                        state: newState,
                    });
                }

                updateRaccoonStateDot(ctx.raccoon, newState);

                if (newState === 'RUNNING') {
                    ctx.pickZoneDestination('work');
                } else if (newState === 'THINKING') {
                    ctx.pickZoneDestination('meeting');
                } else if (newState === 'SUCCESS' || newState === 'ERROR') {
                    ctx.raccoon.path = [];
                    ctx.raccoon.pauseTimer = 0;
                    ctx.raccoon.stateAnimTimer = 0;
                } else if (newState === 'IDLE' || newState === 'WALK') {
                    if (ctx.raccoon.path.length === 0) {
                        ctx.pickNewDestination();
                    }
                }
            }

            // ── Handle 25 agent state changes ──
            const agentId = data.agentId as string;
            const agent = ctx.agentRuntimeMap.get(agentId);
            if (agent) {
                handleAgentStateChange(agent, newState, ctx.pickAgentWanderDest, ctx.pickAgentZoneDest);
            }
        }

        if (data.type === 'TASK_ASSIGNED') {
            if (data.agent === 'Raccoon' || data.agent === 'raccoon') {
                if (ctx.isMounted) {
                    appendLog(ctx.setLogs, {
                        ts: Date.now(),
                        text: `\uC791\uC5C5 \uD560\uB2F9: ${data.taskContent.length > 50 ? data.taskContent.slice(0, 50) + '...' : data.taskContent}`,
                        state: ctx.raccoon.state,
                    });
                }
                showRaccoonBubble(ctx.raccoon, data.taskContent || '\uC0C8 \uC791\uC5C5 \uC218\uC2E0');
            }

            // Show speech bubble on matched agent
            const agentName = (data.agent as string || '').toLowerCase();
            const agent = ctx.agentRuntimeMap.get(agentName);
            if (agent) {
                showAgentBubble(agent, data.taskContent || '\uC0C8 \uC791\uC5C5 \uC218\uC2E0');
            }
        }

        if (data.type === 'JOB_UPDATE') {
            // When a job completes, find the assigned agent and update state
            const job = data.job;
            if (job && job.assignedAgentId) {
                const agent = ctx.agentRuntimeMap.get(job.assignedAgentId);
                if (agent) {
                    if (job.state === 'SUCCESS') {
                        handleAgentStateChange(agent, 'SUCCESS', ctx.pickAgentWanderDest, ctx.pickAgentZoneDest);
                    } else if (job.state === 'ERROR') {
                        handleAgentStateChange(agent, 'ERROR', ctx.pickAgentWanderDest, ctx.pickAgentZoneDest);
                    } else if (job.state === 'RUNNING') {
                        handleAgentStateChange(agent, 'RUNNING', ctx.pickAgentWanderDest, ctx.pickAgentZoneDest);
                    }
                }
            }
        }

        if (data.type === 'JOB_LOG') {
            if (ctx.isMounted) {
                appendLog(ctx.setLogs, {
                    ts: data.log?.ts || Date.now(),
                    text: data.log?.text || String(data.text || ''),
                    state: ctx.raccoon.state,
                });
            }
        }
    } catch (e) { /* ignore */ }
}
