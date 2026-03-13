/**
 * Feedback Loop — calculates learning feedback from task outcomes.
 *
 * Pure function: no side effects, no state. Called from Electron main
 * process via IPC to compute EXP gains and behavioral recommendations.
 */

export interface FeedbackEvent {
    agentId: string;
    taskId: string;
    outcome: 'success' | 'failure';
    durationMs: number;
    skillsUsed?: string[];
}

export interface FeedbackResult {
    agentId: string;
    expGained: number;
    skillExpGained: Record<string, number>;
    recommendations: string[];
    timestamp: number;
}

const BASE_EXP_SUCCESS = 100;
const BASE_EXP_FAILURE = 10;
const SPEED_BONUS_MAX = 50;
const SPEED_BASELINE_MS = 300_000; // 5 minutes
const SKILL_EXP_PER_USE = 30;

/**
 * Calculate speed bonus: faster completion (under 5 min) yields up to +50 EXP.
 * Clamped to [0, SPEED_BONUS_MAX].
 */
function calcSpeedBonus(durationMs: number): number {
    if (durationMs >= SPEED_BASELINE_MS) return 0;
    const ratio = (SPEED_BASELINE_MS - durationMs) / SPEED_BASELINE_MS;
    return Math.round(ratio * SPEED_BONUS_MAX);
}

export function calculateFeedback(event: FeedbackEvent): FeedbackResult {
    const { agentId, outcome, durationMs, skillsUsed } = event;

    // EXP calculation
    const baseExp = outcome === 'success' ? BASE_EXP_SUCCESS : BASE_EXP_FAILURE;
    const speedBonus = outcome === 'success' ? calcSpeedBonus(durationMs) : 0;
    const expGained = baseExp + speedBonus;

    // Skill EXP distribution
    const skillExpGained: Record<string, number> = {};
    if (skillsUsed) {
        for (const skillId of skillsUsed) {
            skillExpGained[skillId] = SKILL_EXP_PER_USE;
        }
    }

    return {
        agentId,
        expGained,
        skillExpGained,
        recommendations: [],
        timestamp: Date.now(),
    };
}

/**
 * Generate behavioral recommendations based on feedback history.
 * Mutates nothing — returns a new array of recommendation strings.
 */
export function generateRecommendations(
    history: FeedbackResult[],
    latestEvent: FeedbackEvent,
): string[] {
    const recommendations: string[] = [];

    // Check consecutive failures (latest first)
    const recentByAgent = history.filter(
        (r) => r.agentId === latestEvent.agentId,
    );
    // history is ordered newest-first; count trailing failures
    let consecutiveFailures = latestEvent.outcome === 'failure' ? 1 : 0;
    if (consecutiveFailures > 0) {
        for (const r of recentByAgent) {
            // r.expGained === BASE_EXP_FAILURE means failure
            if (r.expGained <= BASE_EXP_FAILURE) {
                consecutiveFailures++;
            } else {
                break;
            }
        }
    }
    if (consecutiveFailures >= 3) {
        recommendations.push('태스크 난이도 하향 조정 권장');
    }

    // Check if speed is improving (at least 3 past records)
    if (recentByAgent.length >= 3) {
        const durations = recentByAgent.slice(0, 3).map((_, i) => {
            // We don't store durationMs in FeedbackResult, but we can
            // infer from speedBonus: expGained - base = speedBonus
            // However we don't have outcome. Use a simpler heuristic:
            // if each successive result has higher expGained, speed is improving
            return recentByAgent[i].expGained;
        });
        const improving =
            durations[0] < durations[1] && durations[1] < durations[2];
        if (improving && latestEvent.outcome === 'success') {
            recommendations.push('숙련도 향상 중 — 난이도 상향 가능');
        }
    }

    // Check for skill specialization (cumulative skill EXP >= 150)
    const skillTotals: Record<string, number> = {};
    for (const r of recentByAgent) {
        for (const [skillId, exp] of Object.entries(r.skillExpGained)) {
            skillTotals[skillId] = (skillTotals[skillId] || 0) + exp;
        }
    }
    // Add current event's skills
    if (latestEvent.skillsUsed) {
        for (const s of latestEvent.skillsUsed) {
            skillTotals[s] = (skillTotals[s] || 0) + SKILL_EXP_PER_USE;
        }
    }
    for (const [skillId, total] of Object.entries(skillTotals)) {
        if (total >= 150) {
            recommendations.push(
                `${skillId} 스킬 전문가 — 관련 태스크 우선 배정`,
            );
        }
    }

    return recommendations;
}
