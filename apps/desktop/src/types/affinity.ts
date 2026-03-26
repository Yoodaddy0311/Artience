/**
 * Affinity System — 캐릭터 간 호감도/관계도 타입 정의
 *
 * 비대칭 양방향 호감도 매트릭스: A→B ≠ B→A
 * 3축 평가: trust (신뢰도), rapport (친밀도), synergy (시너지, 계산값)
 */

// ── Interaction Types ──

export type InteractionType =
    | 'task_collaboration'
    | 'task_delegation'
    | 'code_review'
    | 'p2p_message'
    | 'meeting_agree'
    | 'meeting_disagree'
    | 'meeting_constructive'
    | 'skill_share'
    | 'error_help'
    | 'long_absence';

export interface InteractionLog {
    id: string;
    timestamp: number;
    type: InteractionType;
    outcome: 'positive' | 'neutral' | 'negative';
    trustDelta: number;
    rapportDelta: number;
    description: string;
}

// ── Affinity Tiers ──

export type AffinityTier =
    | 'stranger' // 0-20:  기본 (보너스 없음)
    | 'acquaintance' // 21-40: 소통 비용 감소
    | 'colleague' // 41-60: 자율 협업 가능
    | 'partner' // 61-80: 결합 스킬 해금
    | 'soulmate'; // 81-100: 팀 피니셔

export function getTierFromSynergy(synergy: number): AffinityTier {
    if (synergy >= 81) return 'soulmate';
    if (synergy >= 61) return 'partner';
    if (synergy >= 41) return 'colleague';
    if (synergy >= 21) return 'acquaintance';
    return 'stranger';
}

export const TIER_LABELS: Record<AffinityTier, string> = {
    stranger: '낯선 사이',
    acquaintance: '아는 사이',
    colleague: '동료',
    partner: '파트너',
    soulmate: '소울메이트',
};

export const TIER_COLORS: Record<AffinityTier, string> = {
    stranger: '#9CA3AF',
    acquaintance: '#60A5FA',
    colleague: '#34D399',
    partner: '#A78BFA',
    soulmate: '#F472B6',
};

// ── Affinity Score ──

export interface AffinityScore {
    fromAgentId: string;
    toAgentId: string;
    /** 신뢰도 (-100 ~ +100). 업무 결과 기반. */
    trust: number;
    /** 친밀도 (-100 ~ +100). 상호작용 빈도/질 기반. */
    rapport: number;
    /** 시너지 (0 ~ 100). 계산값 — trust + rapport + 역할호환 + 스킬다양성 가중합산. */
    synergy: number;
    lastInteraction: number;
    totalInteractions: number;
    /** 상호작용 이력 (ring buffer, 최대 30개) */
    history: InteractionLog[];
    unlockedTier: AffinityTier;
}

// ── Affinity Matrix ──

export interface AffinityMatrix {
    version: number;
    updatedAt: number;
    /** key: `${fromAgentId}:${toAgentId}` */
    scores: Record<string, AffinityScore>;
    globalStats: {
        totalInteractions: number;
        highestSynergy: { pair: string; synergy: number } | null;
        mostActive: { agentId: string; interactions: number } | null;
    };
}

// ── Affinity Event ──

export interface AffinityEvent {
    type: InteractionType;
    fromAgentId: string;
    toAgentId: string;
    context?: {
        taskId?: string;
        meetingId?: string;
        messageId?: string;
        outcome?: 'success' | 'failure' | 'partial';
        quality?: 'high' | 'normal' | 'low';
    };
    timestamp: number;
}

// ── Synergy Bonus ──

export interface SynergyBonus {
    tier: AffinityTier;
    speedMultiplier: number;
    canAutoDelegate: boolean;
    canCombineSkills: boolean;
    canProxyVote: boolean;
}

export const TIER_BONUSES: Record<AffinityTier, SynergyBonus> = {
    stranger: {
        tier: 'stranger',
        speedMultiplier: 1.0,
        canAutoDelegate: false,
        canCombineSkills: false,
        canProxyVote: false,
    },
    acquaintance: {
        tier: 'acquaintance',
        speedMultiplier: 1.1,
        canAutoDelegate: false,
        canCombineSkills: false,
        canProxyVote: false,
    },
    colleague: {
        tier: 'colleague',
        speedMultiplier: 1.15,
        canAutoDelegate: true,
        canCombineSkills: false,
        canProxyVote: false,
    },
    partner: {
        tier: 'partner',
        speedMultiplier: 1.2,
        canAutoDelegate: true,
        canCombineSkills: true,
        canProxyVote: false,
    },
    soulmate: {
        tier: 'soulmate',
        speedMultiplier: 1.3,
        canAutoDelegate: true,
        canCombineSkills: true,
        canProxyVote: true,
    },
};

// ── Decay Config ──

export const DECAY_CONFIG = {
    gracePeriodDays: 7,
    dailyRapportDecay: -1,
    dailyTrustDecay: 0,
    minRapport: -30,
} as const;

// ── Interaction Deltas ──

export interface InteractionDelta {
    trust: number;
    rapport: number;
    /** 양쪽 모두에 적용할지 여부 */
    bilateral: boolean;
    /** 양쪽 적용 시 수신자의 trust 변동 (미지정 시 발신자와 동일) */
    reverseTrust?: number;
    /** 양쪽 적용 시 수신자의 rapport 변동 (미지정 시 발신자와 동일) */
    reverseRapport?: number;
}

export const INTERACTION_DELTAS: Record<InteractionType, InteractionDelta> = {
    task_collaboration: { trust: 8, rapport: 5, bilateral: true },
    task_delegation: { trust: 10, rapport: 3, bilateral: false },
    code_review: { trust: 6, rapport: 2, bilateral: true },
    p2p_message: { trust: 0, rapport: 2, bilateral: true },
    meeting_agree: { trust: 4, rapport: 4, bilateral: true },
    meeting_disagree: { trust: -2, rapport: -1, bilateral: true },
    meeting_constructive: { trust: 1, rapport: 3, bilateral: true },
    skill_share: { trust: 3, rapport: 5, bilateral: true },
    error_help: { trust: 12, rapport: 6, bilateral: false },
    long_absence: { trust: 0, rapport: -1, bilateral: true },
};

export const QUALITY_MODIFIERS: Record<
    string,
    { trust: number; rapport: number }
> = {
    high: { trust: 1.5, rapport: 1.3 },
    normal: { trust: 1.0, rapport: 1.0 },
    low: { trust: 0.5, rapport: 0.7 },
};

// ── Pure Helper Functions ──

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function matrixKey(from: string, to: string): string {
    return `${from}:${to}`;
}

export function defaultScore(from: string, to: string): AffinityScore {
    return {
        fromAgentId: from,
        toAgentId: to,
        trust: 0,
        rapport: 0,
        synergy: 0,
        lastInteraction: 0,
        totalInteractions: 0,
        history: [],
        unlockedTier: 'stranger',
    };
}

export function normalize(value: number): number {
    return ((value + 100) / 200) * 100;
}

export function createEmptyMatrix(): AffinityMatrix {
    return {
        version: 1,
        updatedAt: 0,
        scores: {},
        globalStats: {
            totalInteractions: 0,
            highestSynergy: null,
            mostActive: null,
        },
    };
}

// ── Role Compatibility ──

/** 역할을 정규화된 카테고리로 매핑 */
export function normalizeRole(role: string): string {
    const r = role.toLowerCase();
    if (r.includes('pm') || r.includes('총괄')) return 'PM';
    if (r.includes('프론트') || r.includes('frontend') || r.includes('ui'))
        return 'Frontend';
    if (
        r.includes('백엔드') ||
        r.includes('backend') ||
        r.includes('서버') ||
        r.includes('api')
    )
        return 'Backend';
    if (r.includes('qa') || r.includes('테스트')) return 'QA';
    if (
        r.includes('devops') ||
        r.includes('배포') ||
        r.includes('ci/cd') ||
        r.includes('인프라')
    )
        return 'DevOps';
    if (r.includes('ux') || r.includes('디자인')) return 'UX';
    if (r.includes('보안') || r.includes('security')) return 'Security';
    if (
        r.includes('데이터') ||
        r.includes('data') ||
        r.includes('분석') ||
        r.includes('로그')
    )
        return 'Data';
    if (r.includes('문서') || r.includes('doc')) return 'Doc';
    if (r.includes('아키텍처') || r.includes('architect') || r.includes('설계'))
        return 'Architect';
    if (r.includes('db') || r.includes('데이터베이스')) return 'Backend';
    if (r.includes('성능') || r.includes('최적화') || r.includes('캐싱'))
        return 'Backend';
    if (
        r.includes('모니터링') ||
        r.includes('에러') ||
        r.includes('이슈') ||
        r.includes('의존성') ||
        r.includes('마이그레이션') ||
        r.includes('빌드')
    )
        return 'DevOps';
    return 'General';
}

export const ROLE_COMPATIBILITY: Record<string, Record<string, number>> = {
    PM: {
        PM: 20,
        Frontend: 70,
        Backend: 70,
        QA: 60,
        DevOps: 50,
        UX: 80,
        Security: 40,
        Data: 60,
        Doc: 75,
        Architect: 85,
        General: 50,
    },
    Frontend: {
        PM: 70,
        Frontend: 30,
        Backend: 90,
        QA: 75,
        DevOps: 55,
        UX: 95,
        Security: 50,
        Data: 45,
        Doc: 40,
        Architect: 70,
        General: 50,
    },
    Backend: {
        PM: 70,
        Frontend: 90,
        Backend: 30,
        QA: 80,
        DevOps: 85,
        UX: 40,
        Security: 75,
        Data: 80,
        Doc: 40,
        Architect: 75,
        General: 50,
    },
    QA: {
        PM: 60,
        Frontend: 75,
        Backend: 80,
        QA: 25,
        DevOps: 65,
        UX: 50,
        Security: 85,
        Data: 55,
        Doc: 60,
        Architect: 55,
        General: 50,
    },
    DevOps: {
        PM: 50,
        Frontend: 55,
        Backend: 85,
        QA: 65,
        DevOps: 25,
        UX: 30,
        Security: 80,
        Data: 60,
        Doc: 45,
        Architect: 70,
        General: 50,
    },
    UX: {
        PM: 80,
        Frontend: 95,
        Backend: 40,
        QA: 50,
        DevOps: 30,
        UX: 25,
        Security: 35,
        Data: 55,
        Doc: 65,
        Architect: 60,
        General: 50,
    },
    Security: {
        PM: 40,
        Frontend: 50,
        Backend: 75,
        QA: 85,
        DevOps: 80,
        UX: 35,
        Security: 20,
        Data: 50,
        Doc: 55,
        Architect: 65,
        General: 50,
    },
    Data: {
        PM: 60,
        Frontend: 45,
        Backend: 80,
        QA: 55,
        DevOps: 60,
        UX: 55,
        Security: 50,
        Data: 25,
        Doc: 50,
        Architect: 60,
        General: 50,
    },
    Doc: {
        PM: 75,
        Frontend: 40,
        Backend: 40,
        QA: 60,
        DevOps: 45,
        UX: 65,
        Security: 55,
        Data: 50,
        Doc: 20,
        Architect: 55,
        General: 50,
    },
    Architect: {
        PM: 85,
        Frontend: 70,
        Backend: 75,
        QA: 55,
        DevOps: 70,
        UX: 60,
        Security: 65,
        Data: 60,
        Doc: 55,
        Architect: 20,
        General: 50,
    },
    General: {
        PM: 50,
        Frontend: 50,
        Backend: 50,
        QA: 50,
        DevOps: 50,
        UX: 50,
        Security: 50,
        Data: 50,
        Doc: 50,
        Architect: 50,
        General: 30,
    },
};

export function getRoleCompatibility(roleA: string, roleB: string): number {
    const normA = normalizeRole(roleA);
    const normB = normalizeRole(roleB);
    return ROLE_COMPATIBILITY[normA]?.[normB] ?? 50;
}

// ── Decay Result ──

export interface DecayResult {
    key: string;
    fromAgentId: string;
    toAgentId: string;
    rapportChange: number;
    oldTier: AffinityTier;
    newTier: AffinityTier;
    tierChanged: boolean;
}

// ── Affinity Change Event (for IPC push) ──

export interface AffinityChangeEvent {
    fromAgentId: string;
    toAgentId: string;
    oldSynergy: number;
    newSynergy: number;
    oldTier: AffinityTier;
    newTier: AffinityTier;
}
