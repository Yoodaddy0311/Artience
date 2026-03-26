/**
 * useMeetingStore — 미팅 상태 관리 (비영속).
 *
 * MeetingManager의 IPC 이벤트를 수신하여 UI 상태를 업데이트한다.
 */

import { create } from 'zustand';
import type { AgentActivity } from '../lib/pty-parser';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MeetingParticipant {
    agentId: string;
    agentName: string;
}

export interface MeetingOpinion {
    agentId: string;
    opinion: string;
    vote: 'approve' | 'hold' | 'revise';
}

export interface MeetingRound {
    roundNumber: number;
    opinions: MeetingOpinion[];
    consensus: 'approved' | 'hold' | 'revision' | 'pending';
}

export interface Meeting {
    id: string;
    topic: string;
    participants: MeetingParticipant[];
    rounds: MeetingRound[];
    status: 'waiting' | 'in_progress' | 'completed' | 'cancelled';
    createdAt: number;
}

export interface PendingMeetingDelegation {
    routedAgentId: string;
    routedAgentName: string;
    taskMessage: string;
    initiatorAgentId?: string | null;
    targetActivity: AgentActivity;
}

// ── Store ──────────────────────────────────────────────────────────────────

interface MeetingState {
    meetings: Meeting[];
    activeMeetingId: string | null;
    pendingDelegations: Record<string, PendingMeetingDelegation>;

    addMeeting: (meeting: Meeting) => void;
    updateMeeting: (meetingId: string, updates: Partial<Meeting>) => void;
    addRound: (meetingId: string, round: MeetingRound) => void;
    addOpinion: (
        meetingId: string,
        roundNumber: number,
        opinion: MeetingOpinion,
    ) => void;
    setConsensus: (
        meetingId: string,
        roundNumber: number,
        consensus: MeetingRound['consensus'],
    ) => void;
    setActiveMeetingId: (id: string | null) => void;
    removeMeeting: (meetingId: string) => void;
    queuePendingDelegation: (
        meetingId: string,
        delegation: PendingMeetingDelegation,
    ) => void;
    clearPendingDelegation: (meetingId: string) => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
    meetings: [],
    activeMeetingId: null,
    pendingDelegations: {},

    addMeeting: (meeting) =>
        set((state) => ({
            meetings: state.meetings.some((entry) => entry.id === meeting.id)
                ? state.meetings.map((entry) =>
                      entry.id === meeting.id ? { ...entry, ...meeting } : entry,
                  )
                : [...state.meetings, meeting],
        })),

    updateMeeting: (meetingId, updates) =>
        set((state) => ({
            meetings: state.meetings.map((m) =>
                m.id === meetingId ? { ...m, ...updates } : m,
            ),
        })),

    addRound: (meetingId, round) =>
        set((state) => ({
            meetings: state.meetings.map((m) =>
                m.id === meetingId ? { ...m, rounds: [...m.rounds, round] } : m,
            ),
        })),

    addOpinion: (meetingId, roundNumber, opinion) =>
        set((state) => ({
            meetings: state.meetings.map((m) => {
                if (m.id !== meetingId) return m;
                return {
                    ...m,
                    rounds: m.rounds.map((r) =>
                        r.roundNumber === roundNumber
                            ? { ...r, opinions: [...r.opinions, opinion] }
                            : r,
                    ),
                };
            }),
        })),

    setConsensus: (meetingId, roundNumber, consensus) =>
        set((state) => ({
            meetings: state.meetings.map((m) => {
                if (m.id !== meetingId) return m;
                return {
                    ...m,
                    rounds: m.rounds.map((r) =>
                        r.roundNumber === roundNumber ? { ...r, consensus } : r,
                    ),
                };
            }),
        })),

    setActiveMeetingId: (id) => set({ activeMeetingId: id }),

    removeMeeting: (meetingId) =>
        set((state) => ({
            meetings: state.meetings.filter((m) => m.id !== meetingId),
            activeMeetingId:
                state.activeMeetingId === meetingId
                    ? null
                    : state.activeMeetingId,
            pendingDelegations: Object.fromEntries(
                Object.entries(state.pendingDelegations).filter(
                    ([id]) => id !== meetingId,
                ),
            ),
        })),

    queuePendingDelegation: (meetingId, delegation) =>
        set((state) => ({
            pendingDelegations: {
                ...state.pendingDelegations,
                [meetingId]: delegation,
            },
        })),

    clearPendingDelegation: (meetingId) =>
        set((state) => ({
            pendingDelegations: Object.fromEntries(
                Object.entries(state.pendingDelegations).filter(
                    ([id]) => id !== meetingId,
                ),
            ),
        })),
}));
