// ── Tier 1: Core Memory ─────────────────────────────────────────

/** Tier 1 — 항상 컨텍스트에 포함되는 핵심 메모리 */
export interface CoreMemory {
    /** 캐릭터 ID (e.g., 'sera', 'rio') */
    agentId: string;
    /** 마지막 업데이트 타임스탬프 */
    updatedAt: number;
    /** 캐릭터의 핵심 정체성 요약 (1-3줄) */
    identity: string;
    /** 사용자가 이 캐릭터에게 준 피드백 요약 */
    userFeedback: string[];
    /** 검증된 강점 (작업 결과 기반으로 자동 축적) */
    strengths: string[];
    /** 알려진 약점 또는 주의사항 */
    weaknesses: string[];
    /** 현재 진행 중인 장기 목표/프로젝트 */
    activeGoals: string[];
    /** 사용자 선호도 (작업 스타일, 커뮤니케이션 등) */
    userPreferences: string[];
    /** 다른 캐릭터와의 관계 요약 (상위 5개) */
    topRelationships: {
        agentId: string;
        summary: string;
    }[];
    /** 최근 주요 성과 (최대 5개) */
    recentAchievements: string[];
    /** 자유 형식 메모 (사용자가 직접 편집 가능) */
    notes: string;
}

// ── Tier 2: Daily Log ───────────────────────────────────────────

export interface DailyTaskEntry {
    taskId: string;
    description: string;
    status: 'success' | 'failure' | 'timeout' | 'in_progress';
    startedAt: number;
    completedAt?: number;
    durationMs?: number;
    /** 협업한 다른 캐릭터 */
    collaborators: string[];
    /** 사용된 스킬 ID */
    skillsUsed: string[];
    /** 사용자 피드백 (있을 경우) */
    userFeedback?: string;
}

export interface DailyInteraction {
    type: 'p2p_message' | 'meeting' | 'code_review' | 'task_delegation';
    withAgentId: string;
    timestamp: number;
    summary: string;
    sentiment: 'positive' | 'neutral' | 'negative';
}

export interface DailyError {
    timestamp: number;
    taskId?: string;
    errorType: string;
    message: string;
    resolution?: string;
}

/** Tier 2 — 일일 활동 로그 (자동 생성) */
export interface DailyLog {
    /** 캐릭터 ID */
    agentId: string;
    /** 날짜 (YYYY-MM-DD) */
    date: string;
    /** 생성 시각 */
    createdAt: number;
    /** 해당 일의 태스크 목록 */
    tasks: DailyTaskEntry[];
    /** 해당 일의 상호작용 요약 */
    interactions: DailyInteraction[];
    /** 해당 일의 학습/발견 사항 */
    learnings: string[];
    /** 해당 일의 에러/실패 사항 */
    errors: DailyError[];
    /** 자동 생성된 일일 요약 (1-3문장) */
    daySummary: string;
    /** 메트릭 스냅샷 (해당 일 기준) */
    metricsSnapshot: {
        tasksCompleted: number;
        tasksFailed: number;
        avgDurationMs: number;
        expGained: number;
    };
}

// ── Tier 3: Deep Knowledge ──────────────────────────────────────

export interface SkillKnowledge {
    skillId: string;
    skillName: string;
    /** 숙련도 0-100 */
    proficiency: number;
    /** 총 사용 횟수 */
    usageCount: number;
    /** 최근 사용일 */
    lastUsed: number;
    /** 이 스킬로 배운 교훈 */
    lessons: string[];
    /** 자주 결합되는 다른 스킬 */
    commonPairings: string[];
}

export interface PreferenceEntry {
    category: 'code_style' | 'communication' | 'workflow' | 'tools' | 'general';
    key: string;
    value: string;
    confidence: number; // 0.0-1.0
    observedAt: number;
    source: 'explicit' | 'inferred';
}

export interface RelationshipKnowledge {
    withAgentId: string;
    /** 총 상호작용 횟수 */
    totalInteractions: number;
    /** 최근 상호작용 */
    lastInteraction: number;
    /** 주요 협업 이력 (최대 20개) */
    collaborationHistory: {
        date: string;
        taskDescription: string;
        outcome: 'success' | 'partial' | 'failure';
        myContribution: string;
    }[];
    /** 이 캐릭터에 대한 인상/평가 */
    impressions: string[];
}

export interface ProjectKnowledge {
    projectDir: string;
    projectName: string;
    /** 이 프로젝트에서의 역할 */
    myRole: string;
    /** 축적된 프로젝트 지식 */
    knowledge: string[];
    /** 자주 수정하는 파일 패턴 */
    frequentFiles: string[];
    /** 프로젝트별 선호 설정 */
    projectPreferences: Record<string, string>;
    lastWorked: number;
}

export interface ExpertiseEntry {
    domain: string;
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    /** 축적된 패턴/교훈 */
    patterns: string[];
    /** 관련 작업 수 */
    taskCount: number;
    updatedAt: number;
}

/** Tier 3 — 심층 지식 (키워드 검색으로 조회) */
export interface DeepKnowledge {
    agentId: string;
    updatedAt: number;
    /** 축적된 스킬 지식 */
    skills: SkillKnowledge[];
    /** 학습된 사용자 선호도 상세 */
    preferences: PreferenceEntry[];
    /** 다른 캐릭터와의 관계 상세 히스토리 */
    relationships: RelationshipKnowledge[];
    /** 프로젝트별 축적 지식 */
    projects: ProjectKnowledge[];
    /** 도메인 전문 지식 (코드 패턴, 아키텍처 등) */
    expertise: ExpertiseEntry[];
}

// ── 통합 타입 ───────────────────────────────────────────────────

/** 캐릭터 메모리 전체 — 3개 티어 통합 */
export interface CharacterMemory {
    agentId: string;
    core: CoreMemory;
    dailyLogs: DailyLog[];
    knowledge: DeepKnowledge;
    meta: {
        createdAt: number;
        lastAccessed: number;
        totalSizeBytes: number;
        version: number;
    };
}

/** 세션 시작 시 로드되는 컨텍스트 패킷 */
export interface MemoryContextPacket {
    agentId: string;
    coreMarkdown: string;
    recentLogMarkdown: string;
    relevantKnowledge: string[];
}

/** electron-store 스키마 */
export interface AgentMemoryStoreSchema {
    schemaVersion: number;
    core: CoreMemory;
    dailyLogs: Record<string, DailyLog>;
    knowledge: DeepKnowledge;
    meta: {
        createdAt: number;
        lastAccessed: number;
        version: number;
    };
}

// ── 용량 제한 상수 ──────────────────────────────────────────────

export const MEMORY_LIMITS = {
    /** Tier 2: 최대 보관 일수 */
    DAILY_LOG_RETENTION_DAYS: 7,
    /** Tier 3: 최대 스킬 수 */
    MAX_SKILLS: 50,
    /** Tier 3: 최대 관계 수 */
    MAX_RELATIONSHIPS: 26,
    /** Tier 3: 최대 프로젝트 수 */
    MAX_PROJECTS: 10,
    /** Tier 3: 최대 전문 지식 수 */
    MAX_EXPERTISE: 30,
    /** Tier 3: 관계별 최대 협업 이력 */
    MAX_COLLABORATION_HISTORY: 20,
    /** Tier 1: 최대 관계 요약 */
    MAX_TOP_RELATIONSHIPS: 5,
    /** Tier 1: 최대 성과 */
    MAX_RECENT_ACHIEVEMENTS: 5,
    /** 승격: 연속 사용 일수 → strengths */
    PROMOTION_CONSECUTIVE_DAYS: 3,
    /** 승격: 같은 에러 반복 횟수 → weaknesses */
    PROMOTION_ERROR_REPEAT: 2,
    /** 승격: 연속 성공 태스크 수 → achievements */
    PROMOTION_CONSECUTIVE_SUCCESS: 10,
} as const;
