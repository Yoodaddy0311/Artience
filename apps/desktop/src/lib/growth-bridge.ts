/**
 * Growth Bridge: connects PTY activity events to the AGI Growth System.
 *
 * Called from AgentTown.tsx whenever agentActivity changes.
 * Translates activity transitions into EXP gains, skill unlocks,
 * memories, and task records.
 */

import type { SkillCategory } from '../types/growth';
import type { AgentActivity, ParsedEvent } from './pty-parser';
import { calculateExp } from './exp-engine';
import { classifyDominantSkill, DEFAULT_SKILL_TREE } from './skill-classifier';
import { useGrowthStore } from '../store/useGrowthStore';

// ── Types ──

export interface GrowthEvent {
    type: 'exp_gained' | 'level_up' | 'skill_unlocked' | 'memory_added';
    agentId: string;
    details: Record<string, unknown>;
}

// ── Helpers ──

const SKILL_UNLOCK_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;
const MS_PER_DAY = 86_400_000;

function extractToolEvents(
    events: ReadonlyArray<ParsedEvent>,
): Array<{ toolName: string; content?: string }> {
    return events
        .filter(
            (e): e is ParsedEvent & { toolName: string } =>
                e.type === 'tool_use' && e.toolName != null,
        )
        .map((e) => ({ toolName: e.toolName, content: e.content }));
}

function extractUniqueToolNames(events: ReadonlyArray<ParsedEvent>): string[] {
    const names = new Set<string>();
    for (const e of events) {
        if (e.type === 'tool_use' && e.toolName) {
            names.add(e.toolName);
        }
    }
    return [...names];
}

function getLastToolName(
    events: ReadonlyArray<ParsedEvent>,
): string | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        if (e.type === 'tool_use' && e.toolName) {
            return e.toolName;
        }
    }
    return undefined;
}

function getSessionDuration(events: ReadonlyArray<ParsedEvent>): number {
    if (events.length < 2) return 0;
    return events[events.length - 1].timestamp - events[0].timestamp;
}

function getStreakDays(lastActiveAt: number): number {
    if (lastActiveAt === 0) return 1;
    const diffDays = Math.floor((Date.now() - lastActiveAt) / MS_PER_DAY);
    return diffDays <= 1 ? Math.max(1, diffDays + 1) : 0;
}

function getNextSkillToUnlock(
    category: SkillCategory,
    unlockedSkillIds: ReadonlyArray<string>,
): string | undefined {
    const candidates = DEFAULT_SKILL_TREE.filter(
        (node) =>
            node.category === category &&
            !unlockedSkillIds.includes(node.id) &&
            node.prerequisites.every((pre) => unlockedSkillIds.includes(pre)),
    );
    return candidates[0]?.id;
}

// ── Main Bridge Function ──

/**
 * Process an activity change for an agent and update growth system.
 * Called from AgentTown.tsx whenever agentActivity changes.
 */
export function processActivityChange(
    agentId: string,
    activity: AgentActivity,
    _prevActivity: AgentActivity | undefined,
    events: ParsedEvent[],
    teamSize: number,
): GrowthEvent[] {
    if (activity === 'idle') return [];

    const store = useGrowthStore.getState();
    const growthEvents: GrowthEvent[] = [];

    // Snapshot level before changes
    const profileBefore = store.getOrCreateProfile(agentId);
    const levelBefore = profileBefore.level;
    const streakDays = getStreakDays(profileBefore.lastActiveAt);

    // Session context
    const toolsUsedInSession = extractUniqueToolNames(events);
    const lastToolName = getLastToolName(events);
    const duration = getSessionDuration(events);

    // Calculate EXP
    const expResult = calculateExp({
        activity,
        toolName: lastToolName,
        duration,
        toolsUsedInSession,
        streakDays,
        teamSize,
        hasError: activity === 'error',
    });

    // Classify dominant skill
    const toolEvents = extractToolEvents(events);
    const skillCategory =
        toolEvents.length > 0 ? classifyDominantSkill(toolEvents) : 'backend';

    // Add EXP
    store.addExp(
        agentId,
        expResult.totalExp,
        activity,
        toolsUsedInSession,
        skillCategory,
    );

    growthEvents.push({
        type: 'exp_gained',
        agentId,
        details: {
            amount: expResult.totalExp,
            activity,
            skillCategory,
            toolsUsed: toolsUsedInSession,
        },
    });

    // Record task on success or error
    if (activity === 'success' || activity === 'error') {
        store.recordTask(agentId, {
            taskType: activity,
            toolsUsed: toolsUsedInSession,
            expEarned: expResult.totalExp,
            skillCategory,
            duration,
            success: activity === 'success',
        });
    }

    // Add memories on significant events
    if (activity === 'success') {
        const toolSummary =
            toolsUsedInSession.length > 0
                ? toolsUsedInSession.join(', ')
                : 'unknown tools';
        store.addMemory(agentId, {
            type: 'lesson',
            content: `Completed task using ${toolSummary}`,
            context: skillCategory,
            importance: 0.6,
        });
        growthEvents.push({
            type: 'memory_added',
            agentId,
            details: { memoryType: 'lesson', trigger: 'success' },
        });
    } else if (activity === 'error') {
        const lastError = [...events].reverse().find((e) => e.type === 'error');
        const errorContent = lastError?.content ?? 'Unknown error';
        store.addMemory(agentId, {
            type: 'lesson',
            content: `Encountered error: ${errorContent}`,
            context: skillCategory,
            importance: 0.8,
        });
        growthEvents.push({
            type: 'memory_added',
            agentId,
            details: { memoryType: 'lesson', trigger: 'error' },
        });
    }

    // Detect level-up
    const profileAfter = useGrowthStore.getState().getOrCreateProfile(agentId);
    const levelAfter = profileAfter.level;

    if (levelAfter > levelBefore) {
        // Push to notification queue for LevelUpNotification UI
        store.pushLevelUp(agentId, levelAfter, agentId);

        growthEvents.push({
            type: 'level_up',
            agentId,
            details: {
                previousLevel: levelBefore,
                newLevel: levelAfter,
            },
        });

        // Auto-unlock skills at threshold levels
        const unlockedIds = profileAfter.skills.map((s) => s.skillId);
        for (const threshold of SKILL_UNLOCK_LEVELS) {
            if (levelAfter >= threshold && levelBefore < threshold) {
                const skillId = getNextSkillToUnlock(
                    skillCategory,
                    unlockedIds,
                );
                if (skillId) {
                    store.unlockSkill(agentId, skillId);
                    unlockedIds.push(skillId);
                    growthEvents.push({
                        type: 'skill_unlocked',
                        agentId,
                        details: { skillId, atLevel: threshold },
                    });
                }
            }
        }
    }

    return growthEvents;
}
