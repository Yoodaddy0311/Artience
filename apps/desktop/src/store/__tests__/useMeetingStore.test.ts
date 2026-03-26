import { beforeEach, describe, expect, it } from 'vitest';
import { useMeetingStore } from '../useMeetingStore';

function resetMeetingStore() {
    useMeetingStore.setState({
        meetings: [],
        activeMeetingId: null,
        pendingDelegations: {},
    });
}

describe('useMeetingStore', () => {
    beforeEach(() => {
        resetMeetingStore();
    });

    it('adds or updates meetings by id', () => {
        const store = useMeetingStore.getState();

        store.addMeeting({
            id: 'meeting-1',
            topic: 'Kickoff',
            participants: [{ agentId: 'a02', agentName: 'Rio' }],
            rounds: [],
            status: 'waiting',
            createdAt: 1,
        });
        store.addMeeting({
            id: 'meeting-1',
            topic: 'Updated Kickoff',
            participants: [{ agentId: 'a03', agentName: 'Luna' }],
            rounds: [],
            status: 'in_progress',
            createdAt: 2,
        });

        const meetings = useMeetingStore.getState().meetings;
        expect(meetings).toHaveLength(1);
        expect(meetings[0].topic).toBe('Updated Kickoff');
        expect(meetings[0].participants[0].agentId).toBe('a03');
    });

    it('queues and clears pending delegations', () => {
        const store = useMeetingStore.getState();

        store.queuePendingDelegation('meeting-1', {
            routedAgentId: 'a02',
            routedAgentName: 'Rio',
            taskMessage: 'Fix API error',
            initiatorAgentId: 'raccoon',
            targetActivity: 'writing',
        });

        expect(
            useMeetingStore.getState().pendingDelegations['meeting-1'],
        ).toMatchObject({
            routedAgentId: 'a02',
            routedAgentName: 'Rio',
            targetActivity: 'writing',
        });

        store.clearPendingDelegation('meeting-1');
        expect(
            useMeetingStore.getState().pendingDelegations['meeting-1'],
        ).toBeUndefined();
    });
});
