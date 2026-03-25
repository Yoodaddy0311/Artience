# 캐릭터 호감도/관계도 시스템 설계서

> 작성일: 2026-03-26
> 상태: Draft — 구현 전 설계 문서
> 참조: 페르소나 5 Confidant, 스타듀밸리 Hearts, Project Sid (Altera AI), DESIGN-CHARACTER-MEMORY.md

---

## 1. 개요

### 1.1 왜 필요한가

26개 캐릭터가 함께 일하는 독바 플랫폼에서 캐릭터 간 "관계"는 현재 존재하지 않는다. 모든 협업은 동일한 비용과 효과를 가진다 — Sera와 Rio가 100번 함께 일했든 처음 만났든 동일하다. 이는 비현실적이며, 게이미피케이션과 자율 에이전트 비전 모두에 걸림돌이 된다.

호감도 시스템은 다음을 가능하게 한다:

1. **협업 시너지**: 자주 함께 일한 캐릭터끼리 더 효율적으로 협업
2. **자율 팀 구성**: 시너지 높은 캐릭터끼리 자동으로 팀을 이루는 기반
3. **게이미피케이션 깊이**: 캐릭터 관계 육성이라는 장기 콘텐츠
4. **시각적 재미**: Agent Town에서 호감도에 따른 캐릭터 행동 변화
5. **의미 있는 선택**: 어떤 캐릭터를 팀에 배치할지에 전략적 요소 부여

### 1.2 게임 레퍼런스 분석

#### 페르소나 5 — Confidant 시스템

| 요소      | 페르소나 5          | 독바 적용                                      |
| --------- | ------------------- | ---------------------------------------------- |
| 관계 단계 | 10단계 (Rank 1→10)  | 5단계 티어 (0-20, 21-40, 41-60, 61-80, 81-100) |
| 시간 투자 | 시간 슬롯 소비      | 실제 협업 작업으로 자연 축적                   |
| 해금 보상 | 전투 능력 해금      | 협업 보너스 해금 (속도, 자율성, 결합 스킬)     |
| 관계 방향 | 일방향 (주인공→NPC) | **비대칭 양방향** (A→B ≠ B→A)                  |
| 성장 계기 | 대화 선택지         | 작업 성과, 미팅 결과, 메시지 교환              |

**적용 포인트**: 호감도 레벨별 능력 해금은 강력한 동기부여. 비대칭 관계로 현실성 확보.

#### 스타듀밸리 — 하트 시스템

| 요소   | 스타듀밸리                | 독바 적용                            |
| ------ | ------------------------- | ------------------------------------ |
| 수치   | 0-10 하트 (각 250포인트)  | trust/rapport/synergy 3축            |
| 증가   | 선물, 대화, 이벤트        | 협업 성공, P2P 메시지, 미팅 합의     |
| 감소   | 무시, 쓰레기 선물         | 장기간 미상호작용 (decay), 협업 실패 |
| 이벤트 | 특정 하트에서 컷신 트리거 | 시너지 티어 달성 시 특수 이벤트      |

**적용 포인트**: Decay 메커니즘으로 관계 유지 동기부여. 이벤트 트리거로 달성감.

#### Project Sid — AI 사회 시뮬레이션 (학술 논문)

| 요소      | Project Sid                             | 독바 적용                            |
| --------- | --------------------------------------- | ------------------------------------ |
| 규모      | 50~500 에이전트                         | 26 에이전트                          |
| 관계 형성 | 상호작용에서 emergent                   | 구조화된 이벤트 기반 + emergent 요소 |
| 비대칭성  | A가 B를 좋아해도 B가 A를 싫어할 수 있음 | 완전 비대칭 매트릭스                 |
| 역할 분화 | 자연 발생적 역할 전문화                 | 사전 정의된 역할 + 성장에 따른 변화  |
| 문화 전파 | 종교/밈 전파 시뮬레이션                 | 작업 스타일/선호도 전파 (v2)         |

**적용 포인트**: 비대칭 관계의 현실성. 상호작용 빈도와 질이 모두 관계에 영향.

### 1.3 설계 원칙

1. **관계는 행동에서 나온다**: 명시적 설정이 아닌 실제 협업/상호작용에서 자연스럽게 형성
2. **비대칭이 기본**: A→B와 B→A는 독립적으로 변동
3. **실질적 효과**: 호감도가 게임적 재미에 그치지 않고 실제 작업 효율에 영향
4. **시각적 피드백**: Agent Town에서 관계가 눈에 보여야 함
5. **유지 비용**: 관계는 유지하려면 지속적 상호작용 필요 (decay)

---

## 2. 데이터 모델

### 2.1 AffinityScore — 개별 관계 점수

```typescript
/**
 * 한 캐릭터가 다른 캐릭터에 대해 가지는 호감도.
 * 비대칭: affinityScores[A][B] !== affinityScores[B][A]
 */
export interface AffinityScore {
    /** 출발 캐릭터 */
    fromAgentId: string;

    /** 대상 캐릭터 */
    toAgentId: string;

    /**
     * 신뢰도 (-100 ~ +100)
     * 업무 결과(성공/실패)에 기반한 신뢰 수준.
     * 양수: 이 캐릭터와 협업하면 성공적
     * 음수: 이 캐릭터와의 협업에서 실패 경험 많음
     */
    trust: number;

    /**
     * 친밀도 (-100 ~ +100)
     * 상호작용 빈도와 질에 기반한 친밀감.
     * 양수: 자주 소통하고 긍정적 상호작용
     * 음수: 갈등이 잦거나 소통 부재
     */
    rapport: number;

    /**
     * 시너지 (0 ~ 100) — 계산값, 직접 수정 불가
     * trust + rapport + 역할 호환성 + 스킬 다양성의 가중 합산.
     * 실제 협업 효과를 결정하는 최종 지표.
     */
    synergy: number;

    /** 마지막 상호작용 타임스탬프 */
    lastInteraction: number;

    /** 총 상호작용 횟수 */
    totalInteractions: number;

    /** 상호작용 이력 (ring buffer, 최대 30개) */
    history: InteractionLog[];

    /** 이 관계에서 해금된 보너스 (시너지 티어에 따라 자동 계산) */
    unlockedTier: AffinityTier;
}
```

### 2.2 InteractionLog — 상호작용 기록

```typescript
export interface InteractionLog {
    /** 고유 ID */
    id: string;

    /** 타임스탬프 */
    timestamp: number;

    /** 상호작용 유형 */
    type: InteractionType;

    /** 결과 (성공/실패/중립) */
    outcome: 'positive' | 'neutral' | 'negative';

    /** trust 변동량 */
    trustDelta: number;

    /** rapport 변동량 */
    rapportDelta: number;

    /** 상세 설명 */
    description: string;
}

export type InteractionType =
    | 'task_collaboration' // 공동 태스크 수행
    | 'task_delegation' // 태스크 위임
    | 'code_review' // 코드 리뷰
    | 'p2p_message' // 직접 메시지
    | 'meeting_agree' // 미팅에서 의견 일치
    | 'meeting_disagree' // 미팅에서 의견 충돌
    | 'meeting_constructive' // 미팅에서 건설적 토론
    | 'skill_share' // 스킬 공유/교환
    | 'error_help' // 에러 해결 도움
    | 'long_absence'; // 장기간 미상호작용 (decay 이벤트)
```

### 2.3 AffinityTier — 시너지 등급

```typescript
export type AffinityTier =
    | 'stranger' // 0-20:   기본 (보너스 없음)
    | 'acquaintance' // 21-40:  소통 비용 감소
    | 'colleague' // 41-60:  자율 협업 가능
    | 'partner' // 61-80:  결합 스킬 해금
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
    stranger: '#9CA3AF', // gray-400
    acquaintance: '#60A5FA', // blue-400
    colleague: '#34D399', // emerald-400
    partner: '#A78BFA', // violet-400
    soulmate: '#F472B6', // pink-400
};
```

### 2.4 AffinityMatrix — 전체 관계 매트릭스

```typescript
/**
 * 전체 호감도 매트릭스.
 * 26개 캐릭터 × 25개 대상 = 최대 650개 AffinityScore.
 * 실제로는 상호작용이 있는 쌍만 저장 (sparse matrix).
 */
export interface AffinityMatrix {
    /** 버전 (마이그레이션용) */
    version: number;

    /** 마지막 업데이트 */
    updatedAt: number;

    /**
     * 호감도 데이터.
     * key: `${fromAgentId}:${toAgentId}`
     * 존재하지 않는 키 = 아직 상호작용 없음 (기본값 적용)
     */
    scores: Record<string, AffinityScore>;

    /** 전역 통계 */
    globalStats: {
        totalInteractions: number;
        highestSynergy: { pair: string; synergy: number } | null;
        mostActive: { agentId: string; interactions: number } | null;
    };
}

/** 매트릭스 키 생성 */
export function matrixKey(from: string, to: string): string {
    return `${from}:${to}`;
}

/** 기본 AffinityScore (첫 상호작용 전) */
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
```

### 2.5 AffinityEvent — 변동 이벤트

```typescript
/** 호감도 변동을 유발하는 외부 이벤트 */
export interface AffinityEvent {
    /** 이벤트 유형 */
    type: InteractionType;

    /** 주체 캐릭터 */
    fromAgentId: string;

    /** 대상 캐릭터 */
    toAgentId: string;

    /** 추가 컨텍스트 */
    context?: {
        taskId?: string;
        meetingId?: string;
        messageId?: string;
        outcome?: 'success' | 'failure' | 'partial';
        quality?: 'high' | 'normal' | 'low';
    };

    /** 타임스탬프 */
    timestamp: number;
}
```

---

## 3. 호감도 변동 트리거

### 3.1 전체 이벤트-변동량 테이블

모든 상호작용 유형별 trust/rapport 변동량. 각 값은 기본값이며, `context.quality`에 따라 ±50% 조정된다.

| 이벤트 유형                   | trust 변동 | rapport 변동 | 발생 조건                               | 양쪽 적용                  |
| ----------------------------- | ---------- | ------------ | --------------------------------------- | -------------------------- |
| **task_collaboration (성공)** | +8         | +5           | 두 캐릭터가 같은 태스크에 참여하고 성공 | 양쪽 모두                  |
| **task_collaboration (실패)** | -5         | -2           | 두 캐릭터가 같은 태스크에 참여하고 실패 | 양쪽 모두                  |
| **task_collaboration (부분)** | +2         | +1           | 부분적 성공                             | 양쪽 모두                  |
| **task_delegation (성공)**    | +10        | +3           | A가 B에게 위임한 태스크 성공            | A→B만                      |
| **task_delegation (실패)**    | -8         | -1           | A가 B에게 위임한 태스크 실패            | A→B만                      |
| **code_review (통과)**        | +6         | +2           | B가 A의 코드를 리뷰하고 승인            | 양쪽 모두                  |
| **code_review (리젝트)**      | -3         | -1           | B가 A의 코드를 리뷰하고 거절            | A→B: trust-3, B→A: trust+1 |
| **p2p_message**               | 0          | +2           | 에이전트 간 직접 메시지                 | 양쪽 모두                  |
| **meeting_agree**             | +4         | +4           | 미팅에서 같은 투표                      | 양쪽 모두                  |
| **meeting_disagree**          | -2         | -1           | 미팅에서 반대 투표                      | 양쪽 모두                  |
| **meeting_constructive**      | +1         | +3           | 의견 충돌 후 합의 도출에 기여           | 양쪽 모두                  |
| **skill_share**               | +3         | +5           | 한 캐릭터가 다른 캐릭터에게 스킬 전수   | 양쪽 모두                  |
| **error_help**                | +12        | +6           | 에러 발생 시 다른 캐릭터가 도움         | 도움받는 쪽→주는 쪽        |
| **long_absence**              | 0          | -1/day       | 7일 이상 미상호작용 시 일별 감소        | 양쪽 모두                  |

### 3.2 품질 보정 (Quality Modifier)

`context.quality`에 따른 변동량 배율:

| quality  | trust 배율 | rapport 배율 |
| -------- | ---------- | ------------ |
| `high`   | ×1.5       | ×1.3         |
| `normal` | ×1.0       | ×1.0         |
| `low`    | ×0.5       | ×0.7         |

### 3.3 변동 적용 함수

```typescript
export function applyAffinityEvent(
    matrix: AffinityMatrix,
    event: AffinityEvent,
): {
    fromDelta: { trust: number; rapport: number };
    toDelta: { trust: number; rapport: number };
} {
    const baseDeltas = INTERACTION_DELTAS[event.type];
    const qualityMod = QUALITY_MODIFIERS[event.context?.quality ?? 'normal'];

    // 결과 기반 부호 결정
    const outcomeSign =
        event.context?.outcome === 'failure'
            ? -1
            : event.context?.outcome === 'partial'
              ? 0.5
              : 1;

    const trustDelta = Math.round(
        baseDeltas.trust * qualityMod.trust * outcomeSign,
    );
    const rapportDelta = Math.round(
        baseDeltas.rapport *
            qualityMod.rapport *
            (outcomeSign >= 0 ? 1 : outcomeSign),
    );

    // 양쪽 적용 여부 결정
    const bilateral = baseDeltas.bilateral;

    // from → to 적용
    const fromScore = getOrCreateScore(
        matrix,
        event.fromAgentId,
        event.toAgentId,
    );
    fromScore.trust = clamp(fromScore.trust + trustDelta, -100, 100);
    fromScore.rapport = clamp(fromScore.rapport + rapportDelta, -100, 100);
    fromScore.lastInteraction = event.timestamp;
    fromScore.totalInteractions++;
    appendHistory(fromScore, event, trustDelta, rapportDelta);
    fromScore.synergy = calculateSynergy(fromScore);
    fromScore.unlockedTier = getTierFromSynergy(fromScore.synergy);

    // to → from 적용 (양쪽 이벤트인 경우)
    let toDelta = { trust: 0, rapport: 0 };
    if (bilateral) {
        const toScore = getOrCreateScore(
            matrix,
            event.toAgentId,
            event.fromAgentId,
        );
        const toTrustDelta = baseDeltas.reverseTrust ?? trustDelta;
        const toRapportDelta = baseDeltas.reverseRapport ?? rapportDelta;
        toScore.trust = clamp(toScore.trust + toTrustDelta, -100, 100);
        toScore.rapport = clamp(toScore.rapport + toRapportDelta, -100, 100);
        toScore.lastInteraction = event.timestamp;
        toScore.totalInteractions++;
        appendHistory(toScore, event, toTrustDelta, toRapportDelta);
        toScore.synergy = calculateSynergy(toScore);
        toScore.unlockedTier = getTierFromSynergy(toScore.synergy);
        toDelta = { trust: toTrustDelta, rapport: toRapportDelta };
    }

    // 글로벌 통계 업데이트
    updateGlobalStats(matrix);

    return {
        fromDelta: { trust: trustDelta, rapport: rapportDelta },
        toDelta,
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}
```

---

## 4. 시너지 계산 공식

### 4.1 공식

```
synergy = w_t * normalize(trust) + w_r * normalize(rapport)
        + w_c * roleCompatibility + w_d * skillDiversity

여기서:
  w_t = 0.40  (신뢰도 가중치 — 가장 중요, 실제 업무 결과 기반)
  w_r = 0.20  (친밀도 가중치 — 소통 빈도, 부차적)
  w_c = 0.30  (역할 호환성 — 상호 보완적 역할일수록 높음)
  w_d = 0.10  (스킬 다양성 — 겹치지 않을수록 높음)

  normalize(x) = (x + 100) / 200 * 100   ([-100,100] → [0,100] 변환)
```

### 4.2 가중치 근거

| 가중치                  | 값   | 근거                                                                                    |
| ----------------------- | ---- | --------------------------------------------------------------------------------------- |
| trust (w_t)             | 0.40 | 신뢰는 협업의 핵심. 실제 작업 성과에 기반하므로 가장 객관적.                            |
| roleCompatibility (w_c) | 0.30 | PM+Dev, Dev+QA 같은 상호보완 역할은 구조적으로 시너지가 높음.                           |
| rapport (w_r)           | 0.20 | 친밀도는 중요하지만, 소통만 많고 성과가 없으면 시너지 과대평가 위험.                    |
| skillDiversity (w_d)    | 0.10 | 스킬 다양성은 보너스적 요소. 같은 스킬만 가진 두 캐릭터보다 다른 스킬을 가진 쌍이 유리. |

### 4.3 역할 호환성 매트릭스

```typescript
/**
 * roleCompatibility: 두 캐릭터의 역할이 얼마나 상호보완적인지 (0-100).
 * 같은 역할끼리는 낮고, 상호보완적 역할은 높다.
 */
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
    },
    // ... 나머지 역할 조합
};

function getRoleCompatibility(agentA: string, agentB: string): number {
    const roleA = normalizeRole(getAgentRole(agentA));
    const roleB = normalizeRole(getAgentRole(agentB));
    return ROLE_COMPATIBILITY[roleA]?.[roleB] ?? 50; // 기본값 50
}
```

### 4.4 스킬 다양성 계산

```typescript
/**
 * 두 캐릭터의 스킬이 얼마나 다양한지 (겹치지 않을수록 높음).
 * Jaccard 거리 기반: 1 - |A ∩ B| / |A ∪ B|
 */
function getSkillDiversity(agentA: string, agentB: string): number {
    const skillsA = new Set(getAgentSkills(agentA));
    const skillsB = new Set(getAgentSkills(agentB));

    if (skillsA.size === 0 && skillsB.size === 0) return 50; // 기본값

    const intersection = new Set([...skillsA].filter((s) => skillsB.has(s)));
    const union = new Set([...skillsA, ...skillsB]);

    const jaccard = intersection.size / union.size;
    return Math.round((1 - jaccard) * 100);
}
```

### 4.5 전체 시너지 계산 함수

```typescript
export function calculateSynergy(score: AffinityScore): number {
    const trustNorm = ((score.trust + 100) / 200) * 100;
    const rapportNorm = ((score.rapport + 100) / 200) * 100;
    const roleCompat = getRoleCompatibility(score.fromAgentId, score.toAgentId);
    const skillDiv = getSkillDiversity(score.fromAgentId, score.toAgentId);

    const synergy = Math.round(
        0.4 * trustNorm + 0.2 * rapportNorm + 0.3 * roleCompat + 0.1 * skillDiv,
    );

    return clamp(synergy, 0, 100);
}
```

---

## 5. 시너지 → 실제 효과

### 5.1 단계별 해금 테이블

| 시너지 범위 | 티어           | 이름       | 효과                                                                                                | Agent Town 표현                           |
| ----------- | -------------- | ---------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **0-20**    | `stranger`     | 낯선 사이  | 보너스 없음. 기본 협업.                                                                             | 서로 무관심, 랜덤 이동                    |
| **21-40**   | `acquaintance` | 아는 사이  | 코드 리뷰 속도 +10%. 미팅에서 서로의 의견 참조 가능.                                                | 지나칠 때 가볍게 고개 숙임                |
| **41-60**   | `colleague`    | 동료       | 자율 협업 가능 — 사용자 지시 없이 서로 태스크 위임 가능. P2P 메시지 자동 교환 (진행 공유).          | 가까이 앉기, 가끔 대화 말풍선             |
| **61-80**   | `partner`      | 파트너     | 결합 스킬 해금 — 두 캐릭터가 함께 있어야만 실행 가능한 특수 워크플로. 태스크 속도 +20%.             | 자주 대화, 하이파이브 이펙트              |
| **81-100**  | `soulmate`     | 소울메이트 | 팀 피니셔 — 복합 Job 자동 구성. 전체 태스크 속도 +30%. 에러 자동 복구 시 우선 상대방에게 도움 요청. | 나란히 앉기, 하트 이펙트, 특수 애니메이션 |

### 5.2 결합 스킬 (Partner 티어) 예시

두 캐릭터가 `partner` 이상일 때 해금되는 특수 능력:

| 조합              | 결합 스킬          | 효과                                   |
| ----------------- | ------------------ | -------------------------------------- |
| PM + Architect    | "청사진 싱크"      | PRD→ARCH 변환 시 중간 검토 단계 스킵   |
| Frontend + UX     | "디자인 코드"      | 디자인→코드 변환 원클릭                |
| Backend + QA      | "자동 테스트 루프" | 코드 작성 즉시 테스트 자동 생성+실행   |
| DevOps + Security | "보안 배포"        | 보안 감사+배포를 하나의 파이프라인으로 |
| PM + QA           | "품질 게이트"      | 모든 산출물에 자동 품질 검증 추가      |

### 5.3 팀 피니셔 (Soulmate 티어) 효과

`soulmate` 관계의 캐릭터가 같은 팀에 있으면:

```typescript
interface SoulmateBonus {
    /** 태스크 속도 배율 */
    speedMultiplier: 1.3;
    /** 에러 발생 시 자동 페어 디버깅 */
    autoPairDebug: true;
    /** 한 캐릭터의 스킬을 다른 캐릭터가 50% 숙련도로 사용 가능 */
    skillSharing: 0.5;
    /** 미팅에서 한 명이 대표로 참석 가능 (다른 한 명은 작업 계속) */
    proxyVote: true;
}
```

---

## 6. Decay 메커니즘

### 6.1 Decay 규칙

```typescript
const DECAY_CONFIG = {
    /** Decay 시작까지의 유예 기간 (일) */
    gracePeriodDays: 7,

    /** 일별 rapport 감소량 */
    dailyRapportDecay: -1,

    /** trust는 decay하지 않음 (성과 기반이므로 지속) */
    dailyTrustDecay: 0,

    /** 최소 rapport (이 이하로 내려가지 않음) */
    minRapport: -30,

    /** Decay 적용 시간 (매일 자정 또는 앱 시작 시) */
    checkInterval: 'daily',
};
```

### 6.2 Decay 적용 로직

```typescript
function applyDecay(matrix: AffinityMatrix): DecayResult[] {
    const now = Date.now();
    const results: DecayResult[] = [];

    for (const [key, score] of Object.entries(matrix.scores)) {
        if (score.totalInteractions === 0) continue; // 상호작용 없는 쌍은 스킵

        const daysSinceLastInteraction = Math.floor(
            (now - score.lastInteraction) / (24 * 60 * 60 * 1000),
        );

        if (daysSinceLastInteraction <= DECAY_CONFIG.gracePeriodDays) continue;

        const decayDays =
            daysSinceLastInteraction - DECAY_CONFIG.gracePeriodDays;
        const rapportDecay = decayDays * DECAY_CONFIG.dailyRapportDecay;
        const newRapport = Math.max(
            DECAY_CONFIG.minRapport,
            score.rapport + rapportDecay,
        );

        if (newRapport !== score.rapport) {
            const oldTier = score.unlockedTier;
            score.rapport = newRapport;
            score.synergy = calculateSynergy(score);
            score.unlockedTier = getTierFromSynergy(score.synergy);

            results.push({
                key,
                rapportChange: newRapport - score.rapport,
                oldTier,
                newTier: score.unlockedTier,
                tierChanged: oldTier !== score.unlockedTier,
            });
        }
    }

    return results;
}
```

### 6.3 Decay 시각적 알림

티어가 하락하면 Agent Town에서 시각적 피드백:

| 이벤트                   | 표현                                  |
| ------------------------ | ------------------------------------- |
| acquaintance → stranger  | 가벼운 회색 연기 이펙트               |
| colleague → acquaintance | 끊어진 점선 이펙트                    |
| partner → colleague      | 작은 하트가 깨지는 이펙트             |
| soulmate → partner       | 큰 하트가 깨지는 이펙트 + 슬픈 말풍선 |

---

## 7. 저장소 설계

### 7.1 electron-store 구조

```typescript
// 단일 Store: 전체 매트릭스를 하나의 파일로 관리
const affinityStore = new Store<AffinityStoreSchema>({
    name: 'artience-affinity-matrix',
    defaults: {
        version: 1,
        matrix: {
            version: 1,
            updatedAt: 0,
            scores: {},
            globalStats: {
                totalInteractions: 0,
                highestSynergy: null,
                mostActive: null,
            },
        },
        decayLastApplied: 0,
    },
});

interface AffinityStoreSchema {
    version: number;
    matrix: AffinityMatrix;
    decayLastApplied: number;
}
```

### 7.2 용량 추정

- 26 캐릭터 × 25 대상 = 650 쌍 (최대)
- 실제 활성 쌍: ~100-200 (모든 캐릭터가 모두와 상호작용하지는 않음)
- 각 AffinityScore: ~2KB (history 30개 포함)
- 총 예상 크기: ~200-400KB

### 7.3 영속화 전략

| 시점             | 동작                                  |
| ---------------- | ------------------------------------- |
| 이벤트 발생 즉시 | 해당 score만 즉시 저장 (debounce 1초) |
| Decay 적용 후    | 전체 매트릭스 저장                    |
| 앱 종료 시       | 전체 매트릭스 최종 저장               |

```typescript
// Debounced 저장
const saveDebounced = debounce(() => {
    affinityStore.set('matrix', matrix);
}, 1000);
```

---

## 8. IPC 채널 설계

### 8.1 새 IPC 핸들러 목록

preload.ts의 `affinity` API 그룹:

```typescript
affinity: {
  // ── 조회 ──
  getMatrix: () => Promise<AffinityMatrix>;
  getScore: (fromAgentId: string, toAgentId: string) => Promise<AffinityScore>;
  getAgentRelationships: (agentId: string) => Promise<{
    outgoing: AffinityScore[];  // 이 캐릭터 → 타인
    incoming: AffinityScore[];  // 타인 → 이 캐릭터
  }>;
  getTopPairs: (limit?: number) => Promise<{
    pair: [string, string];
    synergy: number;
    tier: AffinityTier;
  }[]>;
  getTierDistribution: () => Promise<Record<AffinityTier, number>>;

  // ── 이벤트 ──
  recordEvent: (event: AffinityEvent) => Promise<{
    success: boolean;
    fromDelta: { trust: number; rapport: number };
    toDelta: { trust: number; rapport: number };
    tierChanged: boolean;
    newTier?: AffinityTier;
  }>;

  // ── 관리 ──
  applyDecay: () => Promise<{ decayed: number; tierChanges: number }>;
  resetPair: (fromAgentId: string, toAgentId: string) => Promise<{ success: boolean }>;
  resetAll: () => Promise<{ success: boolean }>;

  // ── 실시간 이벤트 ──
  onAffinityChange: (callback: (change: {
    fromAgentId: string;
    toAgentId: string;
    oldSynergy: number;
    newSynergy: number;
    oldTier: AffinityTier;
    newTier: AffinityTier;
  }) => void) => () => void;

  onTierUp: (callback: (data: {
    fromAgentId: string;
    toAgentId: string;
    newTier: AffinityTier;
  }) => void) => () => void;
}
```

### 8.2 IPC 채널 이름

```
affinity:get-matrix
affinity:get-score
affinity:get-agent-relationships
affinity:get-top-pairs
affinity:get-tier-distribution
affinity:record-event
affinity:apply-decay
affinity:reset-pair
affinity:reset-all
affinity:change          (push event)
affinity:tier-up         (push event)
```

총 **11개 IPC 채널** (9 invoke + 2 push).

---

## 9. 기존 모듈 연동

### 9.1 agent-metrics.ts 연동

태스크 완료 시 협업 여부를 감지하여 호감도 이벤트를 생성한다.

```typescript
// agent-metrics.ts의 recordTaskComplete 이벤트 구독
agentMetrics.on(
    'task:complete',
    ({ agentId, taskId, status, collaborators }) => {
        if (!collaborators || collaborators.length === 0) return;

        for (const collaboratorId of collaborators) {
            affinityManager.recordEvent({
                type: 'task_collaboration',
                fromAgentId: agentId,
                toAgentId: collaboratorId,
                context: {
                    taskId,
                    outcome: status === 'success' ? 'success' : 'failure',
                },
                timestamp: Date.now(),
            });
        }
    },
);
```

**필요 변경**: `agent-metrics.ts`의 `TaskMetric`에 `collaborators: string[]` 필드 추가.

### 9.2 agent-p2p.ts 연동

P2P 메시지 교환 시 rapport를 소폭 증가시킨다.

```typescript
// agent-p2p.ts 이벤트 구독
agentP2P.on('message', (from: string, to: string, msg: P2PMessage) => {
    affinityManager.recordEvent({
        type: 'p2p_message',
        fromAgentId: from,
        toAgentId: to,
        timestamp: msg.timestamp,
    });
});
```

**변경 없음**: `agent-p2p.ts`는 이미 `message` 이벤트를 emit한다.

### 9.3 meeting-manager.ts 연동

미팅에서의 의견 일치/충돌을 호감도에 반영한다.

```typescript
// meeting-manager.ts 라운드 완료 시
meetingManager.on(
    'round-complete',
    (meetingId: string, round: MeetingRound) => {
        const opinions = round.opinions;

        // 모든 참가자 쌍에 대해 투표 비교
        for (let i = 0; i < opinions.length; i++) {
            for (let j = i + 1; j < opinions.length; j++) {
                const a = opinions[i];
                const b = opinions[j];

                const sameVote = a.vote === b.vote;
                const type: InteractionType = sameVote
                    ? 'meeting_agree'
                    : 'meeting_disagree';

                // 합의에 도달한 라운드에서의 충돌은 'constructive'로 업그레이드
                if (!sameVote && round.consensus === 'approved') {
                    affinityManager.recordEvent({
                        type: 'meeting_constructive',
                        fromAgentId: a.agentId,
                        toAgentId: b.agentId,
                        context: { meetingId },
                        timestamp: Date.now(),
                    });
                } else {
                    affinityManager.recordEvent({
                        type,
                        fromAgentId: a.agentId,
                        toAgentId: b.agentId,
                        context: { meetingId },
                        timestamp: Date.now(),
                    });
                }
            }
        }
    },
);
```

**필요 변경**: `meeting-manager.ts`에 `round-complete` 이벤트 emit 추가.

### 9.4 team-template.ts 연동

팀 구성 시 시너지 데이터를 활용하여 최적 팀을 추천한다.

```typescript
// team-template.ts 확장
function suggestOptimalTeam(
    requiredRoles: string[],
    affinityMatrix: AffinityMatrix,
): TeamTemplateMember[] {
    // 1. 각 역할에 맞는 후보 캐릭터 선정
    const candidates = requiredRoles.map((role) => getAgentsForRole(role));

    // 2. 후보 조합 중 팀 전체 시너지가 가장 높은 조합 선택
    const bestTeam = findMaxSynergyTeam(candidates, affinityMatrix);

    return bestTeam;
}

function calculateTeamSynergy(
    members: string[],
    matrix: AffinityMatrix,
): number {
    let totalSynergy = 0;
    let pairCount = 0;

    for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
            const key = matrixKey(members[i], members[j]);
            const score = matrix.scores[key];
            totalSynergy += score?.synergy ?? 0;
            pairCount++;
        }
    }

    return pairCount > 0 ? Math.round(totalSynergy / pairCount) : 0;
}
```

### 9.5 Character Memory 연동

`DESIGN-CHARACTER-MEMORY.md`의 Tier 1 `topRelationships`는 호감도 매트릭스에서 자동 도출된다.

```typescript
// agent-memory-manager.ts
function deriveTopRelationships(
    agentId: string,
): CoreMemory['topRelationships'] {
    const relationships = affinityManager.getAgentRelationships(agentId);
    const sorted = relationships.outgoing
        .sort((a, b) => b.synergy - a.synergy)
        .slice(0, 5);

    return sorted.map((score) => ({
        agentId: score.toAgentId,
        summary: `${score.toAgentId}와 ${TIER_LABELS[score.unlockedTier]} (시너지 ${score.synergy})`,
    }));
}
```

---

## 10. UI 설계

### 10.1 관계도 네트워크 그래프

`src/components/affinity/AffinityNetworkGraph.tsx`

캔버스 기반 네트워크 그래프 (PixiJS 또는 SVG):

```
┌─────────────────────────────────────────────┐
│           관계도 네트워크 그래프               │
│                                              │
│         [Sera]────────[Rio]                  │
│          / ╲            │  ╲                 │
│         /   ╲           │   ╲                │
│      [Luna]  [Alex]    [Ara]  [Miso]         │
│                ╲       /                     │
│                 ╲     /                      │
│                 [Hana]                       │
│                                              │
│  ── soulmate (분홍)                           │
│  ── partner (보라)                            │
│  ── colleague (초록)                          │
│  -- acquaintance (파랑, 점선)                  │
│  (stranger는 표시 안 함)                       │
│                                              │
│  노드 크기 = 총 상호작용 수                      │
│  선 굵기 = 시너지 값                            │
└─────────────────────────────────────────────┘
```

### 10.2 호감도 바 (AffinityBar)

`src/components/affinity/AffinityBar.tsx`

InspectorCard의 Relationships 탭에 표시:

```
┌─────────────────────────────────────────┐
│  Relationships (Sera)                    │
│                                          │
│  Rio        ██████████████░░░░ 72 Partner│
│  Trust: ████████░░ +65                   │
│  Rapport: ██████░░░░ +48                 │
│                                          │
│  Luna       ████████████░░░░░░ 58 Colleague│
│  Trust: ██████░░░░ +42                   │
│  Rapport: ████████░░ +61                 │
│                                          │
│  Alex       ████████░░░░░░░░░░ 35 Acquaint│
│  Trust: ████░░░░░░ +28                   │
│  Rapport: ██████░░░░ +40                 │
│                                          │
│  [More ▼]                                │
└─────────────────────────────────────────┘
```

### 10.3 InspectorCard 확장

기존 InspectorCard에 `[Relationships]` 탭 추가:

```
InspectorCard
  ├─ [Info] 탭
  ├─ [Memory] 탭 (CHARACTER-MEMORY 설계서)
  └─ [Relationships] 탭 (신규):
      ├─ 상위 5개 관계 AffinityBar
      ├─ 현재 해금된 결합 스킬 목록
      ├─ 최근 상호작용 타임라인
      └─ "관계도 보기" 버튼 → 전체화면 네트워크 그래프
```

### 10.4 컴포넌트 구조

```
src/components/affinity/
  ├─ AffinityTab.tsx              — InspectorCard 내 Relationships 탭 루트
  ├─ AffinityBar.tsx              — 개별 관계 바 (trust/rapport/synergy)
  ├─ AffinityNetworkGraph.tsx     — 네트워크 그래프 (전체화면 모달)
  ├─ TierBadge.tsx                — 시너지 티어 뱃지 (색상+아이콘)
  ├─ InteractionTimeline.tsx      — 최근 상호작용 타임라인
  └─ CombinedSkillList.tsx        — 해금된 결합 스킬 목록
```

### 10.5 Zustand Store

```typescript
import { create } from 'zustand';

interface AffinityState {
    /** 현재 조회 중인 캐릭터의 관계 */
    inspectedRelationships: {
        outgoing: AffinityScore[];
        incoming: AffinityScore[];
    } | null;

    /** 상위 시너지 쌍 (대시보드용) */
    topPairs: { pair: [string, string]; synergy: number; tier: AffinityTier }[];

    /** 티어 분포 (통계용) */
    tierDistribution: Record<AffinityTier, number>;

    /** 로딩 */
    loading: boolean;

    /** 액션 */
    loadRelationships: (agentId: string) => Promise<void>;
    loadTopPairs: (limit?: number) => Promise<void>;
    loadTierDistribution: () => Promise<void>;
    clearInspection: () => void;
}

export const useAffinityStore = create<AffinityState>((set) => ({
    inspectedRelationships: null,
    topPairs: [],
    tierDistribution: {
        stranger: 0,
        acquaintance: 0,
        colleague: 0,
        partner: 0,
        soulmate: 0,
    },
    loading: false,

    loadRelationships: async (agentId) => {
        set({ loading: true });
        const data =
            await window.dogbaApi.affinity.getAgentRelationships(agentId);
        set({ inspectedRelationships: data, loading: false });
    },

    loadTopPairs: async (limit = 10) => {
        const pairs = await window.dogbaApi.affinity.getTopPairs(limit);
        set({ topPairs: pairs });
    },

    loadTierDistribution: async () => {
        const dist = await window.dogbaApi.affinity.getTierDistribution();
        set({ tierDistribution: dist });
    },

    clearInspection: () => set({ inspectedRelationships: null }),
}));
```

---

## 11. Agent Town 시각화

### 11.1 호감도 기반 이동 패턴

AgentTown.tsx의 idle wandering 로직을 수정하여 호감도가 높은 캐릭터 근처로 이동하도록 한다.

```typescript
// AgentTown.tsx idle wander 수정
function getIdleWanderTarget(agentId: string, currentPos: GridPos): GridPos {
    const relationships = affinityManager.getAgentRelationships(agentId);
    const topPartner = relationships.outgoing
        .filter((s) => s.synergy >= 41) // colleague 이상만
        .sort((a, b) => b.synergy - a.synergy)[0];

    if (topPartner && Math.random() < 0.4) {
        // 40% 확률로 시너지 높은 파트너 근처로 이동
        const partnerPos = getAgentPosition(topPartner.toAgentId);
        return getRandomWalkableNear(partnerPos, 2);
    }

    // 60% 확률로 기존 랜덤 이동
    return getRandomWalkableNear(currentPos, IDLE_WANDER_RADIUS);
}
```

### 11.2 대화 빈도

```typescript
// 호감도에 따른 자동 대화 말풍선
function maybeShowAffinityBubble(agentId: string): void {
  const relationships = affinityManager.getAgentRelationships(agentId);
  const nearby = findNearbyAgents(agentId, radius: 3); // 3타일 이내

  for (const nearAgentId of nearby) {
    const score = relationships.outgoing.find(s => s.toAgentId === nearAgentId);
    if (!score) continue;

    const bubbleChance = score.synergy >= 81 ? 0.15  // soulmate: 15%
      : score.synergy >= 61 ? 0.08                    // partner: 8%
      : score.synergy >= 41 ? 0.04                    // colleague: 4%
      : 0;                                             // stranger/acquaintance: 0%

    if (Math.random() < bubbleChance) {
      showAnimalBubble(agentId, getRandomAffinityBubbleText(score.unlockedTier));
    }
  }
}
```

### 11.3 이펙트 시스템

```typescript
const AFFINITY_EFFECTS: Record<
    AffinityTier,
    {
        particle: string | null;
        color: number;
        frequency: number; // 프레임당 확률
    }
> = {
    stranger: { particle: null, color: 0, frequency: 0 },
    acquaintance: { particle: null, color: 0, frequency: 0 },
    colleague: { particle: 'sparkle_small', color: 0x34d399, frequency: 0.002 },
    partner: { particle: 'star', color: 0xa78bfa, frequency: 0.005 },
    soulmate: { particle: 'heart', color: 0xf472b6, frequency: 0.01 },
};
```

### 11.4 티어 승급 이벤트

티어가 올라갈 때 Agent Town에서 특별 연출:

```typescript
affinityManager.on('tier-up', ({ fromAgentId, toAgentId, newTier }) => {
    // 1. 두 캐릭터가 서로 마주보며 이동
    moveAgentToFaceAgent(fromAgentId, toAgentId);

    // 2. 티어별 특수 애니메이션
    switch (newTier) {
        case 'acquaintance':
            showBubble(fromAgentId, '반가워요!');
            break;
        case 'colleague':
            showBubble(fromAgentId, '좋은 동료네요!');
            showEffect('handshake', midpoint(fromAgentId, toAgentId));
            break;
        case 'partner':
            showBubble(fromAgentId, '최고의 파트너!');
            showEffect('stars_burst', midpoint(fromAgentId, toAgentId));
            break;
        case 'soulmate':
            showBubble(fromAgentId, '소울메이트!');
            showEffect('heart_burst', midpoint(fromAgentId, toAgentId));
            // 전체 Agent Town에 축하 파티클
            showGlobalEffect('celebration', 3000);
            break;
    }

    // 3. 토스트 알림
    addToast({
        type: 'success',
        message: `${fromName}과 ${toName}이 ${TIER_LABELS[newTier]}가 되었습니다!`,
    });
});
```

---

## 12. 테스트 전략

### 12.1 단위 테스트

파일: `src/lib/__tests__/affinity-system.test.ts`

| 테스트 범위             | 테스트 케이스                                              |
| ----------------------- | ---------------------------------------------------------- |
| **AffinityScore 기본**  | 기본값 생성, clamp(-100~+100) 경계값, 직렬화/역직렬화      |
| **이벤트 적용**         | 각 InteractionType별 trust/rapport 변동 정확성 (11개 유형) |
| **양방향 적용**         | bilateral 이벤트가 양쪽 모두에 적용되는지                  |
| **비대칭**              | code_review 리젝트 시 A→B(−3), B→A(+1) 비대칭 확인         |
| **품질 보정**           | high/normal/low quality modifier 정확 적용                 |
| **시너지 계산**         | calculateSynergy 공식 정확성, 경계값 (0, 100)              |
| **역할 호환성**         | PM+Frontend(70) vs Frontend+Frontend(30)                   |
| **스킬 다양성**         | 동일 스킬셋(0%) vs 완전 상이(100%)                         |
| **Decay**               | 7일 유예, 일별 -1 감소, 최소값 -30                         |
| **Decay 티어 전환**     | decay로 partner→colleague 강등 감지                        |
| **Tier 결정**           | synergy 0/20/21/40/41/60/61/80/81/100 경계값               |
| **History ring buffer** | 30개 초과 시 오래된 것 제거                                |
| **Matrix key**          | matrixKey('sera', 'rio') === 'sera:rio'                    |
| **Global stats**        | highestSynergy, mostActive 정확 계산                       |

### 12.2 통합 테스트 시나리오

| 시나리오                       | 검증 항목                                                    |
| ------------------------------ | ------------------------------------------------------------ |
| 태스크 협업 성공 → 호감도 변동 | agent-metrics 이벤트 → affinity 이벤트 변환 → score 업데이트 |
| P2P 메시지 3회 → rapport 증가  | agent-p2p 메시지 이벤트 → rapport +6 (2×3)                   |
| 미팅 3라운드 합의 → trust 증가 | meeting-manager round-complete → 적절한 이벤트 타입 분류     |
| 7일 비상호작용 → decay         | 시간 경과 시뮬 → rapport 감소, 티어 변경 여부                |
| team-template 시너지 추천      | 높은 시너지 캐릭터 조합이 우선 추천되는지                    |
| 티어 승급 이벤트 → UI 알림     | onTierUp 이벤트 → toast + Agent Town 이펙트                  |
| Character Memory 연동          | topRelationships가 affinity 기반으로 자동 업데이트           |

### 12.3 성능 테스트

| 항목                             | 기준   |
| -------------------------------- | ------ |
| 이벤트 적용 + 시너지 재계산      | < 5ms  |
| 전체 매트릭스 Decay 적용 (650쌍) | < 50ms |
| getTopPairs 조회 (전체 정렬)     | < 10ms |
| 매트릭스 직렬화/역직렬화         | < 20ms |

### 12.4 테스트 모킹 전략

```typescript
// agent-metrics 이벤트 모킹
const mockMetrics = new EventEmitter();
vi.mock('../electron/agent-metrics', () => ({
    agentMetrics: mockMetrics,
}));

// agent-p2p 이벤트 모킹
const mockP2P = new EventEmitter();
vi.mock('../electron/agent-p2p', () => ({
    agentP2P: mockP2P,
}));

// 테스트: 태스크 협업 성공 → 호감도 증가
test('task collaboration success increases trust', () => {
    mockMetrics.emit('task:complete', {
        agentId: 'sera',
        taskId: 't1',
        status: 'success',
        collaborators: ['rio'],
    });

    const score = affinityManager.getScore('sera', 'rio');
    expect(score.trust).toBeGreaterThan(0);
    expect(score.rapport).toBeGreaterThan(0);
});
```

---

## 부록 A: 상호작용 변동량 상수 (구현용)

```typescript
export const INTERACTION_DELTAS: Record<
    InteractionType,
    {
        trust: number;
        rapport: number;
        bilateral: boolean;
        reverseTrust?: number;
        reverseRapport?: number;
    }
> = {
    task_collaboration: { trust: 8, rapport: 5, bilateral: true },
    task_delegation: { trust: 10, rapport: 3, bilateral: false },
    code_review: {
        trust: 6,
        rapport: 2,
        bilateral: true,
        reverseTrust: 6,
        reverseRapport: 2,
    },
    p2p_message: { trust: 0, rapport: 2, bilateral: true },
    meeting_agree: { trust: 4, rapport: 4, bilateral: true },
    meeting_disagree: { trust: -2, rapport: -1, bilateral: true },
    meeting_constructive: { trust: 1, rapport: 3, bilateral: true },
    skill_share: { trust: 3, rapport: 5, bilateral: true },
    error_help: { trust: 12, rapport: 6, bilateral: false },
    long_absence: { trust: 0, rapport: -1, bilateral: true },
};

// code_review 리젝트 시 특수 비대칭 처리
// 리뷰어(B)가 거절 → A→B: trust-3, B→A: trust+1 (까다롭지만 신뢰할 수 있다는 의미)
export const CODE_REVIEW_REJECT_OVERRIDE = {
    fromTrust: -3,
    fromRapport: -1,
    toTrust: 1,
    toRapport: 0,
};
```

## 부록 B: 티어 승급 필요 시너지 표

```
stranger     →  acquaintance  :  synergy 21 도달
acquaintance →  colleague     :  synergy 41 도달
colleague    →  partner       :  synergy 61 도달
partner      →  soulmate      :  synergy 81 도달

실제 도달 예상 시간 (일일 1-2회 협업 기준):
  stranger → acquaintance  :  약 3-5일
  acquaintance → colleague :  약 7-14일
  colleague → partner      :  약 14-30일
  partner → soulmate       :  약 30-60일
```
