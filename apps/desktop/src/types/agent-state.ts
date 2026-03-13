export type AgentState =
    | 'idle'
    | 'assigned'
    | 'working'
    | 'reviewing'
    | 'done'
    | 'error';

export interface AgentStateTransition {
    from: AgentState;
    to: AgentState;
    trigger: string;
    timestamp: number;
}

export interface AgentStateMachine {
    agentId: string;
    currentState: AgentState;
    history: AgentStateTransition[];
    taskId?: string;
    assignedAt?: number;
    startedAt?: number;
    completedAt?: number;
}

/** Allowed state transitions */
export const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
    idle: ['assigned'],
    assigned: ['working', 'idle'],
    working: ['reviewing', 'done', 'error'],
    reviewing: ['done', 'error', 'working'],
    done: ['idle'],
    error: ['idle', 'assigned'],
};

const MAX_HISTORY = 20;

export function isValidTransition(from: AgentState, to: AgentState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createTransition(
    from: AgentState,
    to: AgentState,
    trigger: string,
): AgentStateTransition {
    return { from, to, trigger, timestamp: Date.now() };
}

export function createAgentStateMachine(agentId: string): AgentStateMachine {
    return {
        agentId,
        currentState: 'idle',
        history: [],
    };
}

export function appendTransition(
    machine: AgentStateMachine,
    transition: AgentStateTransition,
): AgentStateMachine {
    const history = [...machine.history, transition].slice(-MAX_HISTORY);
    const timestamps: Partial<
        Pick<AgentStateMachine, 'assignedAt' | 'startedAt' | 'completedAt'>
    > = {};

    if (transition.to === 'assigned') {
        timestamps.assignedAt = transition.timestamp;
        timestamps.startedAt = undefined;
        timestamps.completedAt = undefined;
    } else if (transition.to === 'working') {
        timestamps.startedAt = machine.startedAt ?? transition.timestamp;
    } else if (transition.to === 'done') {
        timestamps.completedAt = transition.timestamp;
    } else if (transition.to === 'idle') {
        timestamps.assignedAt = undefined;
        timestamps.startedAt = undefined;
        timestamps.completedAt = undefined;
    }

    return {
        ...machine,
        ...timestamps,
        currentState: transition.to,
        history,
        taskId: transition.to === 'idle' ? undefined : machine.taskId,
    };
}
