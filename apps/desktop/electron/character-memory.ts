import Store from 'electron-store';
import { AGENT_PERSONAS } from '../src/data/agent-personas';
import { agentDB } from './agent-db';
import type {
    AgentMemoryStoreSchema,
    CoreMemory,
    DailyLog,
    DailyTaskEntry,
    DailyInteraction,
    DailyError,
    DeepKnowledge,
    SkillKnowledge,
    PreferenceEntry,
    MemoryContextPacket,
} from '../src/types/character-memory';
import { MEMORY_LIMITS } from '../src/types/character-memory';

// ── Helpers (pure, exported for testing) ────────────────────────

/** 오늘 날짜를 YYYY-MM-DD로 반환 */
export function formatDateISO(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** 빈 CoreMemory 생성 (agent-db / agent-personas 참조) */
export function createDefaultCoreMemory(agentId: string): CoreMemory {
    const record = agentDB.get(agentId);
    const persona = AGENT_PERSONAS[agentId];

    return {
        agentId,
        identity:
            `${record?.name ?? agentId} — ${record?.role ?? persona?.role ?? '역할 미정'}. ${persona?.personality ?? ''}`.trim(),
        userFeedback: [],
        strengths: [],
        weaknesses: [],
        activeGoals: [],
        userPreferences: [],
        topRelationships: [],
        recentAchievements: [],
        notes: '',
        updatedAt: Date.now(),
    };
}

/** 빈 DeepKnowledge 생성 */
export function createDefaultKnowledge(agentId: string): DeepKnowledge {
    return {
        agentId,
        updatedAt: Date.now(),
        skills: [],
        preferences: [],
        relationships: [],
        projects: [],
        expertise: [],
    };
}

/** 빈 DailyLog 생성 */
export function createEmptyDailyLog(agentId: string, date: string): DailyLog {
    return {
        agentId,
        date,
        createdAt: Date.now(),
        tasks: [],
        interactions: [],
        learnings: [],
        errors: [],
        daySummary: '',
        metricsSnapshot: {
            tasksCompleted: 0,
            tasksFailed: 0,
            avgDurationMs: 0,
            expGained: 0,
        },
    };
}

/** 기본 Store 스키마 */
export function createDefaultSchema(agentId: string): AgentMemoryStoreSchema {
    return {
        schemaVersion: 1,
        core: createDefaultCoreMemory(agentId),
        dailyLogs: {},
        knowledge: createDefaultKnowledge(agentId),
        meta: {
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            version: 1,
        },
    };
}

/** CoreMemory → 마크다운 변환 (~100줄 이내) */
export function coreToMarkdown(core: CoreMemory): string {
    const lines: string[] = [];

    lines.push(`# ${core.identity.split('—')[0]?.trim() ?? core.agentId}`);
    lines.push('');
    lines.push('## Identity');
    lines.push('');
    lines.push(core.identity);
    lines.push('');

    if (core.strengths.length > 0) {
        lines.push('## Strengths');
        lines.push('');
        for (const s of core.strengths) lines.push(`- ${s}`);
        lines.push('');
    }

    if (core.weaknesses.length > 0) {
        lines.push('## Weaknesses');
        lines.push('');
        for (const w of core.weaknesses) lines.push(`- ${w}`);
        lines.push('');
    }

    if (core.activeGoals.length > 0) {
        lines.push('## Active Goals');
        lines.push('');
        for (const g of core.activeGoals) lines.push(`- ${g}`);
        lines.push('');
    }

    if (core.userPreferences.length > 0) {
        lines.push('## User Preferences');
        lines.push('');
        for (const p of core.userPreferences) lines.push(`- ${p}`);
        lines.push('');
    }

    if (core.topRelationships.length > 0) {
        lines.push('## Key Relationships');
        lines.push('');
        for (const r of core.topRelationships) {
            lines.push(`- ${r.agentId}: ${r.summary}`);
        }
        lines.push('');
    }

    if (core.recentAchievements.length > 0) {
        lines.push('## Recent Achievements');
        lines.push('');
        for (const a of core.recentAchievements) lines.push(`- ${a}`);
        lines.push('');
    }

    if (core.userFeedback.length > 0) {
        lines.push('## User Feedback');
        lines.push('');
        for (const f of core.userFeedback) lines.push(`- ${f}`);
        lines.push('');
    }

    if (core.notes) {
        lines.push('## Notes');
        lines.push('');
        lines.push(core.notes);
        lines.push('');
    }

    return lines.join('\n');
}

/** DailyLog → 마크다운 요약 */
export function dailyLogToMarkdown(log: DailyLog): string {
    const lines: string[] = [];
    lines.push(`### ${log.date}`);
    lines.push('');

    if (log.daySummary) {
        lines.push(log.daySummary);
        lines.push('');
    }

    if (log.tasks.length > 0) {
        lines.push('**Tasks:**');
        for (const t of log.tasks) {
            const icon =
                t.status === 'success'
                    ? '[O]'
                    : t.status === 'failure'
                      ? '[X]'
                      : '[-]';
            lines.push(`- ${icon} ${t.description}`);
        }
        lines.push('');
    }

    if (log.learnings.length > 0) {
        lines.push('**Learnings:**');
        for (const l of log.learnings) lines.push(`- ${l}`);
        lines.push('');
    }

    if (log.errors.length > 0) {
        lines.push('**Errors:**');
        for (const e of log.errors) {
            lines.push(
                `- ${e.errorType}: ${e.message}${e.resolution ? ` (resolved: ${e.resolution})` : ''}`,
            );
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Tier 3 키워드 검색 — 모든 텍스트 필드에서 매칭 */
export function searchKnowledgeByKeyword(
    knowledge: DeepKnowledge,
    query: string,
): string[] {
    const q = query.toLowerCase();
    const results: string[] = [];

    for (const skill of knowledge.skills) {
        if (
            skill.skillName.toLowerCase().includes(q) ||
            skill.skillId.toLowerCase().includes(q) ||
            skill.lessons.some((l) => l.toLowerCase().includes(q))
        ) {
            results.push(
                `[Skill] ${skill.skillName} (proficiency: ${skill.proficiency}, used: ${skill.usageCount}x)`,
            );
        }
    }

    for (const pref of knowledge.preferences) {
        if (
            pref.key.toLowerCase().includes(q) ||
            pref.value.toLowerCase().includes(q)
        ) {
            results.push(`[Preference] ${pref.key}: ${pref.value}`);
        }
    }

    for (const rel of knowledge.relationships) {
        if (
            rel.withAgentId.toLowerCase().includes(q) ||
            rel.impressions.some((i) => i.toLowerCase().includes(q))
        ) {
            results.push(
                `[Relationship] ${rel.withAgentId} (interactions: ${rel.totalInteractions})`,
            );
        }
    }

    for (const proj of knowledge.projects) {
        if (
            proj.projectName.toLowerCase().includes(q) ||
            proj.knowledge.some((k) => k.toLowerCase().includes(q))
        ) {
            results.push(`[Project] ${proj.projectName}: ${proj.myRole}`);
        }
    }

    for (const exp of knowledge.expertise) {
        if (
            exp.domain.toLowerCase().includes(q) ||
            exp.patterns.some((p) => p.toLowerCase().includes(q))
        ) {
            results.push(`[Expertise] ${exp.domain} (${exp.level})`);
        }
    }

    return results;
}

/**
 * DailyLog에서 반복 패턴을 추출하여 Tier 3 knowledge를 업데이트한다.
 * 7일 초과 로그 정리 전에 호출.
 */
export function extractToTier3(log: DailyLog, knowledge: DeepKnowledge): void {
    // 1. 사용된 스킬 → skills 숙련도 업데이트
    for (const task of log.tasks) {
        for (const skillId of task.skillsUsed) {
            upsertSkillKnowledge(knowledge, skillId, task);
        }
    }

    // 2. 상호작용 → relationships 업데이트
    for (const interaction of log.interactions) {
        upsertRelationship(knowledge, interaction);
    }

    // 3. 에러 + 해결 → expertise patterns
    for (const error of log.errors) {
        if (error.resolution) {
            addExpertisePattern(knowledge, error);
        }
    }

    knowledge.updatedAt = Date.now();
}

/** 스킬 지식 upsert */
export function upsertSkillKnowledge(
    knowledge: DeepKnowledge,
    skillId: string,
    task: DailyTaskEntry,
): void {
    let skill = knowledge.skills.find((s) => s.skillId === skillId);
    if (!skill) {
        skill = {
            skillId,
            skillName: skillId,
            proficiency: 0,
            usageCount: 0,
            lastUsed: 0,
            lessons: [],
            commonPairings: [],
        };
        knowledge.skills.push(skill);
    }

    skill.usageCount++;
    skill.lastUsed = task.completedAt ?? task.startedAt;

    // 성공 시 숙련도 증가, 실패 시 감소
    if (task.status === 'success') {
        skill.proficiency = Math.min(100, skill.proficiency + 2);
    } else if (task.status === 'failure') {
        skill.proficiency = Math.max(0, skill.proficiency - 1);
    }

    // 함께 사용된 다른 스킬 기록
    for (const pairing of task.skillsUsed) {
        if (pairing !== skillId && !skill.commonPairings.includes(pairing)) {
            skill.commonPairings.push(pairing);
        }
    }

    // 용량 제한
    if (knowledge.skills.length > MEMORY_LIMITS.MAX_SKILLS) {
        // 가장 오래되고 적게 사용된 스킬 제거
        knowledge.skills.sort((a, b) => b.lastUsed - a.lastUsed);
        knowledge.skills = knowledge.skills.slice(0, MEMORY_LIMITS.MAX_SKILLS);
    }
}

/** 관계 지식 upsert */
export function upsertRelationship(
    knowledge: DeepKnowledge,
    interaction: DailyInteraction,
): void {
    let rel = knowledge.relationships.find(
        (r) => r.withAgentId === interaction.withAgentId,
    );
    if (!rel) {
        rel = {
            withAgentId: interaction.withAgentId,
            totalInteractions: 0,
            lastInteraction: 0,
            collaborationHistory: [],
            impressions: [],
        };
        knowledge.relationships.push(rel);
    }

    rel.totalInteractions++;
    rel.lastInteraction = interaction.timestamp;

    // 용량 제한
    if (knowledge.relationships.length > MEMORY_LIMITS.MAX_RELATIONSHIPS) {
        knowledge.relationships.sort(
            (a, b) => b.totalInteractions - a.totalInteractions,
        );
        knowledge.relationships = knowledge.relationships.slice(
            0,
            MEMORY_LIMITS.MAX_RELATIONSHIPS,
        );
    }
}

/** 에러 해결 → expertise 패턴 추가 */
export function addExpertisePattern(
    knowledge: DeepKnowledge,
    error: DailyError,
): void {
    let exp = knowledge.expertise.find((e) => e.domain === error.errorType);
    if (!exp) {
        exp = {
            domain: error.errorType,
            level: 'beginner',
            patterns: [],
            taskCount: 0,
            updatedAt: Date.now(),
        };
        knowledge.expertise.push(exp);
    }

    const pattern = `${error.message} → ${error.resolution}`;
    if (!exp.patterns.includes(pattern)) {
        exp.patterns.push(pattern);
    }
    exp.taskCount++;
    exp.updatedAt = Date.now();

    // 레벨 자동 조정
    if (exp.taskCount >= 20) exp.level = 'expert';
    else if (exp.taskCount >= 10) exp.level = 'advanced';
    else if (exp.taskCount >= 5) exp.level = 'intermediate';

    // 용량 제한
    if (knowledge.expertise.length > MEMORY_LIMITS.MAX_EXPERTISE) {
        knowledge.expertise.sort((a, b) => b.updatedAt - a.updatedAt);
        knowledge.expertise = knowledge.expertise.slice(
            0,
            MEMORY_LIMITS.MAX_EXPERTISE,
        );
    }
}

/**
 * 승격 로직: 최근 DailyLog들을 분석하여 CoreMemory에 반영할 항목을 반환한다.
 * 실제 Core 수정은 호출자가 수행.
 */
export function derivePromotions(
    logs: DailyLog[],
    knowledge: DeepKnowledge,
): {
    strengths: string[];
    weaknesses: string[];
    achievements: string[];
    relationships: { agentId: string; summary: string }[];
} {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const achievements: string[] = [];
    const relationships: { agentId: string; summary: string }[] = [];

    if (logs.length === 0) {
        return { strengths, weaknesses, achievements, relationships };
    }

    // ── 연속 스킬 사용 → strengths ──
    const skillDayMap = new Map<string, Set<string>>();
    for (const log of logs) {
        for (const task of log.tasks) {
            for (const skillId of task.skillsUsed) {
                if (!skillDayMap.has(skillId))
                    skillDayMap.set(skillId, new Set());
                skillDayMap.get(skillId)!.add(log.date);
            }
        }
    }
    for (const [skillId, days] of skillDayMap) {
        if (
            hasConsecutiveDays(
                Array.from(days),
                MEMORY_LIMITS.PROMOTION_CONSECUTIVE_DAYS,
            )
        ) {
            const skill = knowledge.skills.find((s) => s.skillId === skillId);
            strengths.push(`${skill?.skillName ?? skillId} 스킬에 능숙`);
        }
    }

    // ── 반복 에러 → weaknesses ──
    const errorTypeCount = new Map<string, number>();
    for (const log of logs) {
        for (const err of log.errors) {
            errorTypeCount.set(
                err.errorType,
                (errorTypeCount.get(err.errorType) ?? 0) + 1,
            );
        }
    }
    for (const [errorType, count] of errorTypeCount) {
        if (count >= MEMORY_LIMITS.PROMOTION_ERROR_REPEAT) {
            weaknesses.push(`${errorType} 에러 반복 (${count}회)`);
        }
    }

    // ── 연속 성공 → achievements ──
    let consecutiveSuccess = 0;
    let maxConsecutive = 0;
    for (const log of logs) {
        for (const task of log.tasks) {
            if (task.status === 'success') {
                consecutiveSuccess++;
                maxConsecutive = Math.max(maxConsecutive, consecutiveSuccess);
            } else if (task.status === 'failure') {
                consecutiveSuccess = 0;
            }
        }
    }
    if (maxConsecutive >= MEMORY_LIMITS.PROMOTION_CONSECUTIVE_SUCCESS) {
        achievements.push(`${maxConsecutive}개 태스크 연속 성공`);
    }

    // ── 빈번한 협업 → relationships ──
    const collabDayMap = new Map<string, Set<string>>();
    for (const log of logs) {
        for (const interaction of log.interactions) {
            if (!collabDayMap.has(interaction.withAgentId)) {
                collabDayMap.set(interaction.withAgentId, new Set());
            }
            collabDayMap.get(interaction.withAgentId)!.add(log.date);
        }
    }
    for (const [agentId, days] of collabDayMap) {
        if (
            hasConsecutiveDays(
                Array.from(days),
                MEMORY_LIMITS.PROMOTION_CONSECUTIVE_DAYS,
            )
        ) {
            relationships.push({
                agentId,
                summary: `${agentId}와 빈번한 협업 (${days.size}일)`,
            });
        }
    }

    return { strengths, weaknesses, achievements, relationships };
}

/** 날짜 문자열 배열에서 N일 연속이 있는지 체크 */
export function hasConsecutiveDays(dates: string[], n: number): boolean {
    if (dates.length < n) return false;
    const sorted = dates.sort();
    let consecutive = 1;

    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffMs = curr.getTime() - prev.getTime();
        if (diffMs === 24 * 60 * 60 * 1000) {
            consecutive++;
            if (consecutive >= n) return true;
        } else if (diffMs > 24 * 60 * 60 * 1000) {
            consecutive = 1;
        }
        // diffMs === 0 (같은 날) → consecutive 유지
    }

    return consecutive >= n;
}

// ── CharacterMemoryManager ──────────────────────────────────────

class CharacterMemoryManager {
    private stores = new Map<string, Store<AgentMemoryStoreSchema>>();

    /** 캐릭터의 Store를 lazy-init으로 가져온다 */
    private getStore(agentId: string): Store<AgentMemoryStoreSchema> {
        if (!this.stores.has(agentId)) {
            this.stores.set(
                agentId,
                new Store<AgentMemoryStoreSchema>({
                    name: `artience-agent-memory-${agentId}`,
                    defaults: createDefaultSchema(agentId),
                }),
            );
        }
        return this.stores.get(agentId)!;
    }

    /** 모든 열린 Store를 해제 */
    dispose(): void {
        this.stores.clear();
    }

    // ── Tier 1: Core Memory ─────────────────────────────────────

    getCore(agentId: string): CoreMemory {
        const store = this.getStore(agentId);
        this.touchAccessed(store);
        return store.get('core');
    }

    updateCore(
        agentId: string,
        patch: Partial<CoreMemory>,
    ): { success: boolean } {
        const store = this.getStore(agentId);
        const core = store.get('core');
        const updated: CoreMemory = {
            ...core,
            ...patch,
            agentId, // prevent overwrite
            updatedAt: Date.now(),
        };
        store.set('core', updated);
        return { success: true };
    }

    getCoreMarkdown(agentId: string): string {
        return coreToMarkdown(this.getCore(agentId));
    }

    // ── Tier 2: Daily Log ───────────────────────────────────────

    getDailyLog(agentId: string, date?: string): DailyLog | null {
        const store = this.getStore(agentId);
        const d = date ?? formatDateISO();
        const logs = store.get('dailyLogs');
        return logs[d] ?? null;
    }

    getRecentLogs(agentId: string, days: number = 7): DailyLog[] {
        const store = this.getStore(agentId);
        const logs = store.get('dailyLogs');
        const allDates = Object.keys(logs).sort().reverse();
        return allDates.slice(0, days).map((d) => logs[d]);
    }

    /** 오늘의 로그에 태스크 추가 (없으면 자동 생성) */
    appendTaskEntry(
        agentId: string,
        entry: DailyTaskEntry,
    ): { success: boolean } {
        const store = this.getStore(agentId);
        const today = formatDateISO();
        const logs = store.get('dailyLogs');
        const log = logs[today] ?? createEmptyDailyLog(agentId, today);

        log.tasks.push(entry);

        // 메트릭 스냅샷 업데이트
        if (entry.status === 'success') log.metricsSnapshot.tasksCompleted++;
        if (entry.status === 'failure') log.metricsSnapshot.tasksFailed++;
        const completed = log.tasks.filter((t) => t.durationMs != null);
        if (completed.length > 0) {
            log.metricsSnapshot.avgDurationMs =
                completed.reduce((sum, t) => sum + t.durationMs!, 0) /
                completed.length;
        }

        logs[today] = log;
        store.set('dailyLogs', logs);
        return { success: true };
    }

    appendInteraction(
        agentId: string,
        interaction: DailyInteraction,
    ): { success: boolean } {
        const store = this.getStore(agentId);
        const today = formatDateISO();
        const logs = store.get('dailyLogs');
        const log = logs[today] ?? createEmptyDailyLog(agentId, today);

        log.interactions.push(interaction);
        logs[today] = log;
        store.set('dailyLogs', logs);
        return { success: true };
    }

    appendLearning(agentId: string, learning: string): { success: boolean } {
        const store = this.getStore(agentId);
        const today = formatDateISO();
        const logs = store.get('dailyLogs');
        const log = logs[today] ?? createEmptyDailyLog(agentId, today);

        log.learnings.push(learning);
        logs[today] = log;
        store.set('dailyLogs', logs);
        return { success: true };
    }

    appendError(agentId: string, error: DailyError): { success: boolean } {
        const store = this.getStore(agentId);
        const today = formatDateISO();
        const logs = store.get('dailyLogs');
        const log = logs[today] ?? createEmptyDailyLog(agentId, today);

        log.errors.push(error);
        logs[today] = log;
        store.set('dailyLogs', logs);
        return { success: true };
    }

    // ── Tier 3: Deep Knowledge ──────────────────────────────────

    getKnowledge(agentId: string): DeepKnowledge {
        return this.getStore(agentId).get('knowledge');
    }

    updateSkill(agentId: string, skill: SkillKnowledge): { success: boolean } {
        const store = this.getStore(agentId);
        const knowledge = store.get('knowledge');
        const idx = knowledge.skills.findIndex(
            (s) => s.skillId === skill.skillId,
        );
        if (idx >= 0) {
            knowledge.skills[idx] = skill;
        } else {
            knowledge.skills.push(skill);
        }

        // 용량 제한
        if (knowledge.skills.length > MEMORY_LIMITS.MAX_SKILLS) {
            knowledge.skills.sort((a, b) => b.lastUsed - a.lastUsed);
            knowledge.skills = knowledge.skills.slice(
                0,
                MEMORY_LIMITS.MAX_SKILLS,
            );
        }

        knowledge.updatedAt = Date.now();
        store.set('knowledge', knowledge);
        return { success: true };
    }

    addPreference(
        agentId: string,
        pref: PreferenceEntry,
    ): { success: boolean } {
        const store = this.getStore(agentId);
        const knowledge = store.get('knowledge');

        // 같은 key가 있으면 업데이트
        const idx = knowledge.preferences.findIndex(
            (p) => p.key === pref.key && p.category === pref.category,
        );
        if (idx >= 0) {
            knowledge.preferences[idx] = pref;
        } else {
            knowledge.preferences.push(pref);
        }

        knowledge.updatedAt = Date.now();
        store.set('knowledge', knowledge);
        return { success: true };
    }

    searchKnowledge(agentId: string, query: string): string[] {
        const knowledge = this.getKnowledge(agentId);
        return searchKnowledgeByKeyword(knowledge, query);
    }

    // ── 통합 ────────────────────────────────────────────────────

    /** 세션 시작 시 컨텍스트 패킷 빌드 */
    buildContextPacket(
        agentId: string,
        taskKeywords?: string[],
    ): MemoryContextPacket {
        const core = this.getCore(agentId);
        const coreMarkdown = coreToMarkdown(core);

        // 오늘 + 어제 로그
        const today = formatDateISO();
        const yesterday = formatDateISO(
            new Date(Date.now() - 24 * 60 * 60 * 1000),
        );
        const todayLog = this.getDailyLog(agentId, today);
        const yesterdayLog = this.getDailyLog(agentId, yesterday);

        const logParts: string[] = [];
        if (yesterdayLog) logParts.push(dailyLogToMarkdown(yesterdayLog));
        if (todayLog) logParts.push(dailyLogToMarkdown(todayLog));
        const recentLogMarkdown = logParts.join('\n');

        // 태스크 키워드 기반 Tier 3 검색
        let relevantKnowledge: string[] = [];
        if (taskKeywords && taskKeywords.length > 0) {
            for (const kw of taskKeywords) {
                const results = this.searchKnowledge(agentId, kw);
                relevantKnowledge.push(...results);
            }
            // 중복 제거
            relevantKnowledge = [...new Set(relevantKnowledge)];
        }

        // lastAccessed 업데이트
        const store = this.getStore(agentId);
        const meta = store.get('meta');
        meta.lastAccessed = Date.now();
        store.set('meta', meta);

        return {
            agentId,
            coreMarkdown,
            recentLogMarkdown,
            relevantKnowledge,
        };
    }

    /** 메모리 통계 */
    getMemoryStats(agentId: string): {
        coreSizeBytes: number;
        dailyLogCount: number;
        knowledgeItemCount: number;
        lastUpdated: number;
    } {
        const store = this.getStore(agentId);
        const core = store.get('core');
        const logs = store.get('dailyLogs');
        const knowledge = store.get('knowledge');

        const coreSizeBytes = new TextEncoder().encode(
            JSON.stringify(core),
        ).length;
        const dailyLogCount = Object.keys(logs).length;
        const knowledgeItemCount =
            knowledge.skills.length +
            knowledge.preferences.length +
            knowledge.relationships.length +
            knowledge.projects.length +
            knowledge.expertise.length;
        const lastUpdated = Math.max(
            core.updatedAt,
            knowledge.updatedAt,
            ...Object.values(logs).map((l) => l.createdAt),
            0,
        );

        return {
            coreSizeBytes,
            dailyLogCount,
            knowledgeItemCount,
            lastUpdated,
        };
    }

    // ── 관리 ────────────────────────────────────────────────────

    /** 일일 요약 생성 + 오래된 로그 정리 */
    triggerDailySummary(agentId: string): { success: boolean } {
        const store = this.getStore(agentId);
        const today = formatDateISO();
        const logs = store.get('dailyLogs');
        const todayLog = logs[today];

        if (todayLog) {
            // 일일 요약 자동 생성
            const successCount = todayLog.tasks.filter(
                (t) => t.status === 'success',
            ).length;
            const failCount = todayLog.tasks.filter(
                (t) => t.status === 'failure',
            ).length;
            const totalTasks = todayLog.tasks.length;

            todayLog.daySummary =
                totalTasks > 0
                    ? `${totalTasks}개 태스크 수행 (성공 ${successCount}, 실패 ${failCount}). 학습 ${todayLog.learnings.length}건.`
                    : '활동 없음.';
            logs[today] = todayLog;
        }

        // 7일 초과 로그 정리 (Tier 3 추출 후 삭제)
        const knowledge = store.get('knowledge');
        const cutoffDate = new Date();
        cutoffDate.setDate(
            cutoffDate.getDate() - MEMORY_LIMITS.DAILY_LOG_RETENTION_DAYS,
        );
        const cutoffStr = formatDateISO(cutoffDate);

        for (const date of Object.keys(logs)) {
            if (date < cutoffStr) {
                extractToTier3(logs[date], knowledge);
                delete logs[date];
            }
        }

        store.set('dailyLogs', logs);
        store.set('knowledge', knowledge);
        return { success: true };
    }

    /** 승격 트리거: Tier 2 → Tier 1 */
    triggerPromotion(agentId: string): { promoted: string[] } {
        const recentLogs = this.getRecentLogs(agentId, 7);
        const knowledge = this.getKnowledge(agentId);
        const promotions = derivePromotions(recentLogs, knowledge);
        const promoted: string[] = [];

        const store = this.getStore(agentId);
        const core = store.get('core');

        // strengths 승격 (중복 방지)
        for (const s of promotions.strengths) {
            if (!core.strengths.includes(s)) {
                core.strengths.push(s);
                promoted.push(`strength: ${s}`);
            }
        }

        // weaknesses 승격 (중복 방지)
        for (const w of promotions.weaknesses) {
            if (!core.weaknesses.includes(w)) {
                core.weaknesses.push(w);
                promoted.push(`weakness: ${w}`);
            }
        }

        // achievements 승격 (최대 5개, 중복 방지)
        for (const a of promotions.achievements) {
            if (!core.recentAchievements.includes(a)) {
                core.recentAchievements.push(a);
                if (
                    core.recentAchievements.length >
                    MEMORY_LIMITS.MAX_RECENT_ACHIEVEMENTS
                ) {
                    core.recentAchievements = core.recentAchievements.slice(
                        -MEMORY_LIMITS.MAX_RECENT_ACHIEVEMENTS,
                    );
                }
                promoted.push(`achievement: ${a}`);
            }
        }

        // relationships 승격 (최대 5개)
        for (const r of promotions.relationships) {
            const idx = core.topRelationships.findIndex(
                (tr) => tr.agentId === r.agentId,
            );
            if (idx >= 0) {
                core.topRelationships[idx].summary = r.summary;
            } else {
                core.topRelationships.push(r);
            }
            promoted.push(`relationship: ${r.agentId}`);
        }
        if (
            core.topRelationships.length > MEMORY_LIMITS.MAX_TOP_RELATIONSHIPS
        ) {
            core.topRelationships = core.topRelationships.slice(
                0,
                MEMORY_LIMITS.MAX_TOP_RELATIONSHIPS,
            );
        }

        core.updatedAt = Date.now();
        store.set('core', core);

        return { promoted };
    }

    /** 메모리 초기화 */
    resetMemory(agentId: string): { success: boolean } {
        const store = this.getStore(agentId);
        const defaults = createDefaultSchema(agentId);
        store.set('schemaVersion', defaults.schemaVersion);
        store.set('core', defaults.core);
        store.set('dailyLogs', defaults.dailyLogs);
        store.set('knowledge', defaults.knowledge);
        store.set('meta', defaults.meta);
        return { success: true };
    }

    /** 메모리 내보내기 (JSON) */
    exportMemory(agentId: string): {
        success: boolean;
        data: AgentMemoryStoreSchema;
    } {
        const store = this.getStore(agentId);
        return {
            success: true,
            data: {
                schemaVersion: store.get('schemaVersion'),
                core: store.get('core'),
                dailyLogs: store.get('dailyLogs'),
                knowledge: store.get('knowledge'),
                meta: store.get('meta'),
            },
        };
    }

    /** lastAccessed 업데이트 */
    private touchAccessed(store: Store<AgentMemoryStoreSchema>): void {
        const meta = store.get('meta');
        meta.lastAccessed = Date.now();
        store.set('meta', meta);
    }
}

export const characterMemoryManager = new CharacterMemoryManager();
