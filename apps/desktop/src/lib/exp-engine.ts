import type { AgentStats } from '../types/growth';

/**
 * EXP Calculation Engine for Agent Growth System
 *
 * Formula: baseEXP * complexityMultiplier * streakBonus * teamBonus
 *
 * Base EXP by activity type:
 * - thinking: 5
 * - reading: 3
 * - writing: 8
 * - typing (bash): 6
 * - working (edit): 10
 * - tool_use: 4
 * - success: 20 (bonus for completing a task)
 * - error: 2 (small consolation EXP)
 *
 * Complexity multiplier (1.0 - 3.0):
 * - Based on number of tools used, duration, unique files touched
 *
 * Streak bonus (1.0 - 2.0):
 * - Based on consecutive days active
 *
 * Team bonus (1.0 - 1.5):
 * - Based on number of active team members
 */

export interface ExpCalcInput {
    activity: string;
    toolName?: string;
    duration: number;
    toolsUsedInSession: string[];
    streakDays: number;
    teamSize: number;
    hasError: boolean;
}

export interface ExpCalcResult {
    baseExp: number;
    complexityMultiplier: number;
    streakBonus: number;
    teamBonus: number;
    totalExp: number;
}

const BASE_EXP: Record<string, number> = {
    thinking: 5,
    reading: 3,
    writing: 8,
    typing: 6,
    working: 10,
    success: 20,
    error: 2,
    idle: 0,
};

const TOOL_EXP_BONUS: Record<string, number> = {
    Edit: 3,
    Write: 4,
    Read: 1,
    Bash: 2,
    Grep: 1,
    Glob: 1,
    WebFetch: 2,
    WebSearch: 2,
    TodoWrite: 1,
    Agent: 5,
};

export function calculateExp(input: ExpCalcInput): ExpCalcResult {
    let baseExp = BASE_EXP[input.activity] ?? 3;

    if (input.toolName) {
        baseExp += TOOL_EXP_BONUS[input.toolName] ?? 1;
    }

    const toolDiversity = Math.min(input.toolsUsedInSession.length / 5, 1);
    const durationFactor = Math.min(input.duration / 60000, 1);
    const complexityMultiplier =
        1.0 + toolDiversity * 1.0 + durationFactor * 1.0;

    const streakBonus = Math.min(1.0 + input.streakDays * 0.05, 2.0);

    const teamBonus = Math.min(1.0 + (input.teamSize - 1) * 0.1, 1.5);

    const errorFactor = input.hasError ? 0.5 : 1.0;

    const totalExp = Math.round(
        baseExp * complexityMultiplier * streakBonus * teamBonus * errorFactor,
    );

    return {
        baseExp,
        complexityMultiplier,
        streakBonus,
        teamBonus,
        totalExp: Math.max(1, totalExp),
    };
}

export function calculateStatGains(
    activity: string,
    toolName?: string,
): Partial<AgentStats> {
    const gains: Partial<AgentStats> = {};

    switch (activity) {
        case 'writing':
            gains.coding = 2;
            gains.creativity = 1;
            break;
        case 'reading':
            gains.analysis = 2;
            gains.accuracy = 1;
            break;
        case 'typing':
            gains.speed = 2;
            gains.coding = 1;
            break;
        case 'thinking':
            gains.analysis = 2;
            gains.creativity = 1;
            break;
        case 'working':
            gains.coding = 1;
            gains.speed = 1;
            break;
        case 'success':
            gains.accuracy = 2;
            gains.teamwork = 1;
            break;
    }

    if (toolName) {
        switch (toolName) {
            case 'Edit':
            case 'Write':
                gains.coding = (gains.coding ?? 0) + 1;
                break;
            case 'Bash':
                gains.speed = (gains.speed ?? 0) + 1;
                break;
            case 'Grep':
            case 'Read':
                gains.analysis = (gains.analysis ?? 0) + 1;
                break;
            case 'Agent':
                gains.teamwork = (gains.teamwork ?? 0) + 2;
                break;
        }
    }

    return gains;
}
