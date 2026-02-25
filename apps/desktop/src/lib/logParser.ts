/**
 * Log parser utilities for client-side log state detection.
 * Uses Recipe.parserRules.keywordToState to match log messages to AgentState.
 */
import type { AgentState } from '../types/platform';

/**
 * Parse a log message against keyword-to-state rules and return the matching state.
 * Matching is case-insensitive. Returns 'IDLE' if no keyword matches.
 */
export function parseLogState(
    message: string,
    rules: Record<string, AgentState>,
): AgentState {
    const lowerMessage = message.toLowerCase();
    for (const [keyword, state] of Object.entries(rules)) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
            return state;
        }
    }
    return 'IDLE';
}

/** Tailwind text-color class map for each AgentState */
const STATE_TEXT_COLORS: Record<AgentState, string> = {
    ERROR: 'text-red-400',
    RUNNING: 'text-blue-400',
    SUCCESS: 'text-green-400',
    THINKING: 'text-purple-400',
    IDLE: 'text-gray-400',
    WALK: 'text-cyan-400',
    NEEDS_INPUT: 'text-yellow-400',
};

/**
 * Return a Tailwind text-color class for the given AgentState.
 * Falls back to 'text-gray-400' for unknown states.
 */
export function getStateColor(state: AgentState): string {
    return STATE_TEXT_COLORS[state] ?? 'text-gray-400';
}
