import { create } from 'zustand';
import type { AgentActivity } from '../lib/pty-parser';

export interface AgentTimelineEntry {
    agentId: string;
    activity: AgentActivity;
    startedAt: number;
    endedAt?: number;
    toolName?: string;
    detail?: string;
}

interface TimelineState {
    entries: AgentTimelineEntry[];

    /** Add a new timeline entry when activity changes */
    addEntry: (entry: AgentTimelineEntry) => void;

    /**
     * Close the current open entry for an agent (set endedAt).
     * Called when the agent's activity transitions to a new state.
     */
    closeEntry: (agentId: string, endedAt: number) => void;

    /**
     * Record an activity transition: close the previous entry and open a new one.
     * This is the primary method to call from TerminalPanel's onActivityChange.
     */
    recordTransition: (
        agentId: string,
        activity: AgentActivity,
        toolName?: string,
        detail?: string,
    ) => void;

    /** Clear all entries (e.g., on team disband) */
    clearEntries: () => void;

    /** Clear entries for a specific agent */
    clearAgentEntries: (agentId: string) => void;
}

const MAX_ENTRIES = 500;

export const useTimelineStore = create<TimelineState>()((set) => ({
    entries: [],

    addEntry: (entry) =>
        set((s) => ({
            entries: [...s.entries, entry].slice(-MAX_ENTRIES),
        })),

    closeEntry: (agentId, endedAt) =>
        set((s) => ({
            entries: s.entries.map((e) =>
                e.agentId === agentId && e.endedAt === undefined
                    ? { ...e, endedAt }
                    : e,
            ),
        })),

    recordTransition: (agentId, activity, toolName, detail) =>
        set((s) => {
            const now = Date.now();

            // Close any open entry for this agent
            const updatedEntries = s.entries.map((e) =>
                e.agentId === agentId && e.endedAt === undefined
                    ? { ...e, endedAt: now }
                    : e,
            );

            // Don't create entries for 'idle' if the agent was already idle
            // (avoids flooding the timeline with idle entries)
            const lastEntry = [...updatedEntries]
                .reverse()
                .find((e) => e.agentId === agentId);
            if (activity === 'idle' && lastEntry?.activity === 'idle') {
                return { entries: updatedEntries };
            }

            // Add new entry
            const newEntry: AgentTimelineEntry = {
                agentId,
                activity,
                startedAt: now,
                toolName,
                detail,
            };

            return {
                entries: [...updatedEntries, newEntry].slice(-MAX_ENTRIES),
            };
        }),

    clearEntries: () => set({ entries: [] }),

    clearAgentEntries: (agentId) =>
        set((s) => ({
            entries: s.entries.filter((e) => e.agentId !== agentId),
        })),
}));
