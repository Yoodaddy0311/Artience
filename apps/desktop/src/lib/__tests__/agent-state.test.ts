import { describe, it, expect, vi } from 'vitest';
import {
    isValidTransition,
    createTransition,
    createAgentStateMachine,
    appendTransition,
    VALID_TRANSITIONS,
    type AgentState,
} from '../../types/agent-state';

describe('isValidTransition', () => {
    it('allows idle → assigned', () => {
        expect(isValidTransition('idle', 'assigned')).toBe(true);
    });

    it('allows working → done', () => {
        expect(isValidTransition('working', 'done')).toBe(true);
    });

    it('allows error → idle', () => {
        expect(isValidTransition('error', 'idle')).toBe(true);
    });

    it('rejects idle → working (must go through assigned)', () => {
        expect(isValidTransition('idle', 'working')).toBe(false);
    });

    it('rejects done → working', () => {
        expect(isValidTransition('done', 'working')).toBe(false);
    });

    it('rejects same-state transitions', () => {
        expect(isValidTransition('idle', 'idle')).toBe(false);
    });

    it('covers all defined states', () => {
        const states: AgentState[] = [
            'idle',
            'assigned',
            'working',
            'reviewing',
            'done',
            'error',
        ];
        for (const s of states) {
            expect(VALID_TRANSITIONS[s]).toBeDefined();
        }
    });
});

describe('createTransition', () => {
    it('creates transition with correct fields', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        const t = createTransition('idle', 'assigned', 'task-assigned');
        expect(t.from).toBe('idle');
        expect(t.to).toBe('assigned');
        expect(t.trigger).toBe('task-assigned');
        expect(t.timestamp).toBe(now);

        vi.useRealTimers();
    });
});

describe('createAgentStateMachine', () => {
    it('creates machine with idle state and empty history', () => {
        const m = createAgentStateMachine('agent-1');
        expect(m.agentId).toBe('agent-1');
        expect(m.currentState).toBe('idle');
        expect(m.history).toEqual([]);
        expect(m.taskId).toBeUndefined();
        expect(m.assignedAt).toBeUndefined();
    });
});

describe('appendTransition', () => {
    it('updates currentState to transition target', () => {
        const m = createAgentStateMachine('agent-1');
        const t = createTransition('idle', 'assigned', 'new-task');
        const updated = appendTransition(m, t);

        expect(updated.currentState).toBe('assigned');
        expect(updated.history).toHaveLength(1);
    });

    it('sets assignedAt when transitioning to assigned', () => {
        const m = createAgentStateMachine('agent-1');
        const t = createTransition('idle', 'assigned', 'task');
        const updated = appendTransition(m, t);

        expect(updated.assignedAt).toBe(t.timestamp);
        expect(updated.startedAt).toBeUndefined();
        expect(updated.completedAt).toBeUndefined();
    });

    it('sets startedAt when transitioning to working', () => {
        let m = createAgentStateMachine('agent-1');
        m = appendTransition(m, createTransition('idle', 'assigned', 'a'));
        const t = createTransition('assigned', 'working', 'start');
        const updated = appendTransition(m, t);

        expect(updated.startedAt).toBe(t.timestamp);
    });

    it('sets completedAt when transitioning to done', () => {
        let m = createAgentStateMachine('agent-1');
        m = appendTransition(m, createTransition('idle', 'assigned', 'a'));
        m = appendTransition(m, createTransition('assigned', 'working', 'b'));
        const t = createTransition('working', 'done', 'finish');
        const updated = appendTransition(m, t);

        expect(updated.completedAt).toBe(t.timestamp);
    });

    it('clears timestamps when transitioning to idle', () => {
        let m = createAgentStateMachine('agent-1');
        m = appendTransition(m, createTransition('idle', 'assigned', 'a'));
        m = appendTransition(m, createTransition('assigned', 'working', 'b'));
        m = appendTransition(m, createTransition('working', 'done', 'c'));
        const updated = appendTransition(
            m,
            createTransition('done', 'idle', 'reset'),
        );

        expect(updated.assignedAt).toBeUndefined();
        expect(updated.startedAt).toBeUndefined();
        expect(updated.completedAt).toBeUndefined();
        expect(updated.taskId).toBeUndefined();
    });

    it('caps history at MAX_HISTORY (20)', () => {
        let m = createAgentStateMachine('agent-1');
        // Build up > 20 transitions by cycling idle→assigned→working→done→idle
        for (let i = 0; i < 6; i++) {
            m = appendTransition(
                m,
                createTransition('idle', 'assigned', `a${i}`),
            );
            m = appendTransition(
                m,
                createTransition('assigned', 'working', `w${i}`),
            );
            m = appendTransition(
                m,
                createTransition('working', 'done', `d${i}`),
            );
            m = appendTransition(m, createTransition('done', 'idle', `r${i}`));
        }
        // 6 * 4 = 24 transitions total, should be capped at 20
        expect(m.history.length).toBeLessThanOrEqual(20);
    });

    it('does not mutate original machine', () => {
        const m = createAgentStateMachine('agent-1');
        const t = createTransition('idle', 'assigned', 'task');
        appendTransition(m, t);

        expect(m.currentState).toBe('idle');
        expect(m.history).toHaveLength(0);
    });
});
