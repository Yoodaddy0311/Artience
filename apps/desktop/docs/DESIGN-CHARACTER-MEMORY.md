# 캐릭터 3티어 메모리 시스템 설계서

> 작성일: 2026-03-26
> 상태: Draft — 구현 전 설계 문서
> 참조: OpenClaw 3-Tier Memory, Project Sid Memory Architecture

---

## 1. 개요

### 1.1 왜 필요한가

현재 독바 플랫폼의 26개 캐릭터(에이전트)는 **개별 기억**이 없다. `agent-metrics.ts`가 전역 성과 통계(완료율, 평균 속도)를 추적하지만 이것은 숫자에 불과하다. 캐릭터가 "어떤 작업을 했는지", "어떤 스킬에 강한지", "다른 캐릭터와 어떤 상호작용을 했는지", "사용자가 어떤 피드백을 주었는지"는 어디에도 저장되지 않는다.

자율 에이전트로의 진화를 위해서는 각 캐릭터가 **독립적인 메모리**를 가져야 한다. 메모리가 없는 에이전트는 매번 같은 실수를 반복하고, 사용자 선호를 학습할 수 없으며, 자율 판단의 근거가 없다.

### 1.2 OpenClaw 3티어 메모리 참조

OpenClaw은 메모리를 3개 계층으로 분리한다:

| Tier   | OpenClaw                         | 로딩 시점      | 용량       |
| ------ | -------------------------------- | -------------- | ---------- |
| Tier 1 | `MEMORY.md`                      | 매 대화 시작   | ~100줄     |
| Tier 2 | `memory/YYYY-MM-DD.md`           | 오늘+어제 자동 | 일별 1파일 |
| Tier 3 | `memory/people/`, `projects/` 등 | 벡터 검색 시   | 무제한     |

이 구조의 장점:

- **Tier 1**은 항상 컨텍스트에 포함되므로 가장 중요한 정보만 유지 (비용 효율)
- **Tier 2**는 최근 맥락을 저렴하게 제공
- **Tier 3**는 필요할 때만 검색하므로 무한 확장 가능

### 1.3 현재 시스템과의 차이

| 현재 (`agent-metrics.ts`)              | 신규 (3티어 메모리)               |
| -------------------------------------- | --------------------------------- |
| 전역 1개 Store (`dokba-agent-metrics`) | 캐릭터별 독립 Store               |
| 숫자 통계만 (완료율, 속도)             | 구조화된 지식 (스킬, 선호, 관계)  |
| 최근 50개 태스크 ring buffer           | 일일 로그 + 심층 지식 + 핵심 요약 |
| 수동 조회만                            | 세션 시작 시 자동 로드 + 검색     |
| 성장/자율화 연동 없음                  | EXP, 스킬, 워크플로와 통합        |

### 1.4 설계 목표

1. **캐릭터별 격리**: 26개 캐릭터가 각자 독립 메모리 보유
2. **3티어 계층화**: 핵심/일일/심층으로 분리하여 비용과 관련성 최적화
3. **자동 생명주기**: 로그 자동 생성 → 요약 → 정리 → 승격의 자동 파이프라인
4. **기존 모듈 연동**: agent-metrics, retro-generator, agent-db와 자연스러운 통합
5. **UI 통합**: InspectorCard에서 캐릭터 메모리 조회/편집

---

## 2. 데이터 모델

### 2.1 Tier 1: 핵심 메모리 (Core Memory)

캐릭터의 가장 중요한 정보. 모든 세션 시작 시 Claude CLI의 시스템 프롬프트에 주입된다. ~100줄 이내로 유지.

```typescript
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
        summary: string; // e.g., "rio와 백엔드 작업에서 시너지 높음"
    }[];

    /** 최근 주요 성과 (최대 5개) */
    recentAchievements: string[];

    /** 자유 형식 메모 (사용자가 직접 편집 가능) */
    notes: string;
}
```

**제약 조건**: 직렬화 시 약 4KB 이내 (Claude 컨텍스트 비용 고려). `toMarkdown()` 메서드로 ~100줄 마크다운으로 변환하여 CLAUDE.md에 주입.

### 2.2 Tier 2: 일일 로그 (Daily Log)

캐릭터가 하루 동안 수행한 모든 활동의 구조화된 기록. 자동 생성되며, 최근 7일분만 유지한다.

```typescript
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
```

### 2.3 Tier 3: 심층 지식 (Deep Knowledge)

캐릭터의 축적된 전문 지식. 필요할 때 키워드 검색으로 조회한다.

```typescript
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
    confidence: number; // 0.0-1.0 — 관찰 횟수 기반
    observedAt: number;
    source: 'explicit' | 'inferred'; // 사용자 직접 지시 vs 행동 패턴 추론
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
    domain: string; // e.g., 'react-hooks', 'sql-optimization', 'css-grid'
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    /** 축적된 패턴/교훈 */
    patterns: string[];
    /** 관련 작업 수 */
    taskCount: number;
    updatedAt: number;
}
```

### 2.4 통합 래퍼 타입

```typescript
/** 캐릭터 메모리 전체 — 3개 티어 통합 */
export interface CharacterMemory {
    agentId: string;
    core: CoreMemory; // Tier 1
    dailyLogs: DailyLog[]; // Tier 2 (최근 7일)
    knowledge: DeepKnowledge; // Tier 3
    meta: {
        createdAt: number;
        lastAccessed: number;
        totalSizeBytes: number;
        version: number; // 스키마 마이그레이션용
    };
}

/** 세션 시작 시 로드되는 컨텍스트 패킷 */
export interface MemoryContextPacket {
    agentId: string;
    coreMarkdown: string; // Tier 1 → 마크다운 변환
    recentLogMarkdown: string; // Tier 2 (오늘+어제) → 마크다운 요약
    relevantKnowledge: string[]; // Tier 3 → 태스크 키워드 기반 검색 결과
}
```

---

## 3. 저장소 설계

### 3.1 electron-store 구조

캐릭터별로 독립된 electron-store 인스턴스를 사용한다.

```
electron-store 파일 위치 (OS별):
  Windows: %APPDATA%/artience-desktop/
  macOS:   ~/Library/Application Support/artience-desktop/
  Linux:   ~/.config/artience-desktop/

파일 구조:
  artience-agent-memory-sera.json     ← Sera 캐릭터 전용
  artience-agent-memory-rio.json      ← Rio 캐릭터 전용
  artience-agent-memory-luna.json     ← Luna 캐릭터 전용
  ...
  artience-agent-memory-{agentId}.json
```

### 3.2 Store 스키마

```typescript
interface AgentMemoryStoreSchema {
    /** 스키마 버전 (마이그레이션용) */
    schemaVersion: number;

    /** Tier 1: 핵심 메모리 */
    core: CoreMemory;

    /** Tier 2: 일일 로그 (최근 7일, key = YYYY-MM-DD) */
    dailyLogs: Record<string, DailyLog>;

    /** Tier 3: 심층 지식 */
    knowledge: DeepKnowledge;

    /** 메타데이터 */
    meta: {
        createdAt: number;
        lastAccessed: number;
        version: number;
    };
}
```

### 3.3 Store 이름 규칙

```typescript
function getStoreName(agentId: string): string {
    return `artience-agent-memory-${agentId}`;
}
```

### 3.4 Store Manager

여러 캐릭터의 Store를 관리하는 싱글톤 매니저:

```typescript
class AgentMemoryManager {
    private stores = new Map<string, Store<AgentMemoryStoreSchema>>();

    /** 캐릭터의 Store 가져오기 (lazy init) */
    getStore(agentId: string): Store<AgentMemoryStoreSchema> {
        if (!this.stores.has(agentId)) {
            this.stores.set(
                agentId,
                new Store<AgentMemoryStoreSchema>({
                    name: getStoreName(agentId),
                    defaults: createDefaultMemory(agentId),
                }),
            );
        }
        return this.stores.get(agentId)!;
    }

    /** 모든 초기화된 Store 해제 */
    dispose(): void {
        this.stores.clear();
    }
}
```

### 3.5 용량 관리

| 항목               | 제한                                                           | 근거                             |
| ------------------ | -------------------------------------------------------------- | -------------------------------- |
| Tier 1 (Core)      | ~4KB                                                           | Claude 컨텍스트 비용             |
| Tier 2 (Daily)     | 최근 7일                                                       | 오래된 로그는 Tier 3로 요약 이전 |
| Tier 3 (Knowledge) | skills 50개, relationships 26개, projects 10개, expertise 30개 | JSON 파일 크기 제한 (~500KB)     |
| 총 Store 크기      | ~1MB/캐릭터                                                    | 26캐릭터 × 1MB = ~26MB 총합      |

---

## 4. IPC 채널 설계

### 4.1 새 IPC 핸들러 목록

preload.ts의 `agentMemory` API 그룹에 추가:

```typescript
agentMemory: {
    // ── Tier 1: Core Memory ──
    getCore: (agentId: string) => Promise<CoreMemory>;
    updateCore: (agentId: string, patch: Partial<CoreMemory>) =>
        Promise<{ success: boolean }>;
    getCoreMarkdown: (agentId: string) => Promise<string>;

    // ── Tier 2: Daily Log ──
    getDailyLog: (agentId: string, date?: string) => Promise<DailyLog | null>;
    getRecentLogs: (agentId: string, days?: number) => Promise<DailyLog[]>;
    appendTaskEntry: (agentId: string, entry: DailyTaskEntry) =>
        Promise<{ success: boolean }>;
    appendInteraction: (agentId: string, interaction: DailyInteraction) =>
        Promise<{ success: boolean }>;
    appendLearning: (agentId: string, learning: string) =>
        Promise<{ success: boolean }>;
    appendError: (agentId: string, error: DailyError) =>
        Promise<{ success: boolean }>;

    // ── Tier 3: Deep Knowledge ──
    getKnowledge: (agentId: string) => Promise<DeepKnowledge>;
    updateSkill: (agentId: string, skill: SkillKnowledge) =>
        Promise<{ success: boolean }>;
    addPreference: (agentId: string, pref: PreferenceEntry) =>
        Promise<{ success: boolean }>;
    searchKnowledge: (agentId: string, query: string) => Promise<string[]>;

    // ── 통합 ──
    getContextPacket: (agentId: string, taskKeywords?: string[]) =>
        Promise<MemoryContextPacket>;
    getMemoryStats: (agentId: string) =>
        Promise<{
            coreSizeBytes: number;
            dailyLogCount: number;
            knowledgeItemCount: number;
            lastUpdated: number;
        }>;

    // ── 관리 ──
    triggerDailySummary: (agentId: string) => Promise<{ success: boolean }>;
    triggerPromotion: (agentId: string) => Promise<{ promoted: string[] }>;
    resetMemory: (agentId: string) => Promise<{ success: boolean }>;
    exportMemory: (agentId: string) =>
        Promise<{ success: boolean; filePath?: string }>;
}
```

### 4.2 IPC 채널 이름 규칙

```
agent-memory:get-core
agent-memory:update-core
agent-memory:get-core-markdown
agent-memory:get-daily-log
agent-memory:get-recent-logs
agent-memory:append-task-entry
agent-memory:append-interaction
agent-memory:append-learning
agent-memory:append-error
agent-memory:get-knowledge
agent-memory:update-skill
agent-memory:add-preference
agent-memory:search-knowledge
agent-memory:get-context-packet
agent-memory:get-memory-stats
agent-memory:trigger-daily-summary
agent-memory:trigger-promotion
agent-memory:reset-memory
agent-memory:export-memory
```

총 **18개 IPC 채널** 추가.

### 4.3 main.ts 핸들러 등록 패턴

```typescript
// main.ts — agentMemory IPC 등록
ipcMain.handle('agent-memory:get-core', (_e, agentId: string) => {
    return agentMemoryManager.getCore(agentId);
});

ipcMain.handle(
    'agent-memory:get-context-packet',
    (_e, agentId: string, taskKeywords?: string[]) => {
        return agentMemoryManager.buildContextPacket(agentId, taskKeywords);
    },
);
// ... 나머지 16개
```

---

## 5. 메모리 생명주기

### 5.1 전체 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│                    메모리 생명주기 (하루 단위)                       │
│                                                                  │
│  ① 세션 시작                                                     │
│  ├─ Tier 1 (Core) 로드 → CLAUDE.md에 주입                        │
│  ├─ Tier 2 (오늘+어제 로그) 로드 → 컨텍스트에 추가                   │
│  └─ 태스크 키워드 → Tier 3 검색 → 관련 지식 주입                     │
│                                                                  │
│  ② 작업 수행 중                                                   │
│  ├─ 태스크 시작/완료 → Tier 2 일일 로그에 append                     │
│  ├─ 에러 발생 → Tier 2 에러 로그에 append                           │
│  ├─ 상호작용 → Tier 2 상호작용 로그에 append                         │
│  └─ 학습 사항 발견 → Tier 2 learnings에 append                      │
│                                                                  │
│  ③ 세션 종료                                                      │
│  └─ Tier 2 오늘 로그에 daySummary 자동 생성                          │
│                                                                  │
│  ④ 일일 정리 (자정 또는 앱 시작 시)                                    │
│  ├─ Tier 2 → 7일 이상 된 로그 삭제                                    │
│  ├─ Tier 2 → 최근 로그에서 반복 패턴 추출 → Tier 3 승격                │
│  ├─ Tier 3 → 새 스킬/선호/관계 지식 추가                               │
│  └─ Tier 1 → Tier 2+3 기반으로 핵심 요약 재생성                         │
│                                                                  │
│  ⑤ 주간 정리 (retro-generator 연동)                                  │
│  ├─ 주간 회고 리포트 생성                                              │
│  ├─ 주간 성과에서 strengths/weaknesses 업데이트 → Tier 1                │
│  └─ 비활성 knowledge 항목 아카이브                                      │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Tier 2 → Tier 1 승격 규칙

아래 조건을 만족하면 Tier 2의 정보가 Tier 1로 승격된다:

| 승격 조건                   | 승격 대상      | Tier 1 필드          |
| --------------------------- | -------------- | -------------------- |
| 같은 스킬 3일 연속 사용     | 해당 스킬명    | `strengths`          |
| 같은 에러 타입 2회 이상     | 에러 패턴 요약 | `weaknesses`         |
| 사용자가 명시적 피드백      | 피드백 내용    | `userFeedback`       |
| 특정 캐릭터와 3일 연속 협업 | 관계 요약      | `topRelationships`   |
| 태스크 10개 연속 성공       | 성과 요약      | `recentAchievements` |

### 5.3 Tier 2 → Tier 3 정리 규칙

7일이 지난 Tier 2 로그는 삭제 전에 다음을 Tier 3로 추출한다:

```typescript
async function extractToTier3(log: DailyLog, knowledge: DeepKnowledge): void {
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

    // 3. 학습 사항 → expertise 업데이트
    for (const learning of log.learnings) {
        classifyAndStore(knowledge, learning);
    }

    // 4. 에러 → patterns로 축적
    for (const error of log.errors) {
        if (error.resolution) {
            addExpertisePattern(knowledge, error);
        }
    }
}
```

### 5.4 Tier 1 재생성

주간 정리 시 Tier 1의 `strengths`, `weaknesses`, `topRelationships`, `recentAchievements`를 Tier 2+3 데이터 기반으로 재계산한다. `userFeedback`과 `notes`는 사용자가 직접 편집한 것이므로 건드리지 않는다.

```typescript
async function regenerateCore(agentId: string): Promise<CoreMemory> {
    const knowledge = getKnowledge(agentId);
    const recentLogs = getRecentLogs(agentId, 7);

    return {
        ...existingCore,
        strengths: deriveStrengths(knowledge.skills, recentLogs),
        weaknesses: deriveWeaknesses(knowledge.skills, recentLogs),
        topRelationships: deriveTopRelationships(knowledge.relationships),
        recentAchievements: deriveAchievements(recentLogs),
        updatedAt: Date.now(),
    };
}
```

---

## 6. 기존 모듈 연동

### 6.1 agent-metrics.ts 연동

`agent-metrics.ts`는 **태스크 성과 데이터의 소스**로 유지하되, 메모리 시스템이 이 데이터를 소비한다.

```
agent-metrics.ts (데이터 소스)
    │
    ├─ recordTaskStart() → 이벤트 발생
    │     ↓
    │   agentMemoryManager.onTaskStart(agentId, taskId, description)
    │     → Tier 2 appendTaskEntry() 호출
    │
    ├─ recordTaskComplete() → 이벤트 발생
    │     ↓
    │   agentMemoryManager.onTaskComplete(agentId, taskId, status, duration)
    │     → Tier 2 태스크 엔트리 업데이트
    │     → Tier 3 스킬 숙련도 업데이트
    │
    └─ getMetrics() → 기존대로 유지 (하위 호환)
```

**구현 방법**: `agent-metrics.ts`에 이벤트 에미터 추가. `AgentMetricsTracker`가 `recordTaskStart`/`recordTaskComplete` 호출 시 이벤트를 emit하고, `AgentMemoryManager`가 이를 구독한다.

```typescript
// agent-metrics.ts 수정 (최소 변경)
class AgentMetricsTracker extends EventEmitter {
  recordTaskComplete(agentId: string, taskId: string, status: string): void {
    // 기존 로직 유지 ...
    this.emit('task:complete', { agentId, taskId, status, durationMs });
  }
}

// agent-memory-manager.ts (신규)
agentMetrics.on('task:complete', ({ agentId, taskId, status, durationMs }) => {
  agentMemoryManager.appendTaskEntry(agentId, { taskId, status, durationMs, ... });
});
```

### 6.2 agent-db.ts 연동

`agent-db.ts`는 캐릭터의 **정적 프로필** (이름, 역할, 성격)을 관리한다. 메모리 시스템의 Tier 1 `identity` 필드를 agent-db 프로필에서 초기 생성한다.

```typescript
// 메모리 초기화 시
function createDefaultCoreMemory(agentId: string): CoreMemory {
    const record = agentDB.get(agentId);
    const persona = AGENT_PERSONAS[agentId];

    return {
        agentId,
        identity: `${record?.name ?? agentId} — ${record?.role ?? '역할 미정'}. ${persona?.personality ?? ''}`,
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
```

### 6.3 retro-generator.ts 연동

`retro-generator.ts`가 생성하는 일간/주간 회고 리포트를 메모리 시스템의 정리 트리거로 활용한다.

```
retro-generator.ts
    │
    ├─ generateDaily() 실행 완료
    │     ↓
    │   agentMemoryManager.onDailyRetro(retroReport)
    │     → 각 캐릭터의 Tier 2 daySummary 생성
    │     → 7일 초과 로그 정리 + Tier 3 추출
    │
    └─ generateWeekly() 실행 완료
          ↓
        agentMemoryManager.onWeeklyRetro(retroReport)
          → Tier 1 Core 재생성
          → Tier 3 비활성 항목 아카이브
```

### 6.4 hooks-manager.ts 연동

캐릭터별 Claude 세션 시작 시 `hooks-manager.ts`가 CLAUDE.md를 생성할 때, Tier 1 메모리를 함께 주입한다.

```typescript
// hooks-manager.ts 수정
async function generateClaudeMd(
    projectDir: string,
    agentId?: string,
): Promise<string> {
    let content = baseTemplate;

    if (agentId) {
        const contextPacket =
            await agentMemoryManager.buildContextPacket(agentId);
        content += '\n\n# Agent Memory\n\n' + contextPacket.coreMarkdown;
        if (contextPacket.recentLogMarkdown) {
            content +=
                '\n\n## Recent Activity\n\n' + contextPacket.recentLogMarkdown;
        }
    }

    return content;
}
```

### 6.5 chat-session-manager.ts 연동

CTO가 에이전트에게 태스크를 위임할 때, 해당 에이전트의 메모리 컨텍스트를 세션에 주입한다.

```typescript
// chat-session-manager.ts 수정
async function createSession(agentId: string, ...): Promise<...> {
  const packet = await agentMemoryManager.buildContextPacket(agentId, taskKeywords);

  // --system-prompt 또는 extraArgs에 메모리 컨텍스트 추가
  const memoryArgs = ['--append-system-prompt', packet.coreMarkdown];
  const allArgs = [...baseArgs, ...memoryArgs, ...extraArgs];

  // 기존 세션 생성 로직 ...
}
```

---

## 7. Zustand Store 설계

### 7.1 useAgentMemoryStore

```typescript
import { create } from 'zustand';

interface AgentMemoryState {
    /** 현재 로드된 캐릭터 메모리 (InspectorCard용) */
    inspectedMemory: CoreMemory | null;
    inspectedAgentId: string | null;

    /** 메모리 통계 캐시 (전체 캐릭터) */
    memoryStats: Record<
        string,
        {
            coreSizeBytes: number;
            dailyLogCount: number;
            knowledgeItemCount: number;
            lastUpdated: number;
        }
    >;

    /** 로딩 상태 */
    loading: boolean;
    error: string | null;

    /** 액션 */
    loadCoreMemory: (agentId: string) => Promise<void>;
    updateCoreField: (
        agentId: string,
        field: keyof CoreMemory,
        value: any,
    ) => Promise<void>;
    loadMemoryStats: () => Promise<void>;
    clearInspection: () => void;

    /** 검색 */
    searchResults: string[];
    searchKnowledge: (agentId: string, query: string) => Promise<void>;
    clearSearchResults: () => void;
}

export const useAgentMemoryStore = create<AgentMemoryState>((set, get) => ({
    inspectedMemory: null,
    inspectedAgentId: null,
    memoryStats: {},
    loading: false,
    error: null,
    searchResults: [],

    loadCoreMemory: async (agentId) => {
        set({ loading: true, error: null });
        try {
            const core = await window.dogbaApi.agentMemory.getCore(agentId);
            set({
                inspectedMemory: core,
                inspectedAgentId: agentId,
                loading: false,
            });
        } catch (e: any) {
            set({ error: e.message, loading: false });
        }
    },

    updateCoreField: async (agentId, field, value) => {
        await window.dogbaApi.agentMemory.updateCore(agentId, {
            [field]: value,
        });
        // 로컬 상태 즉시 반영
        const current = get().inspectedMemory;
        if (current && current.agentId === agentId) {
            set({ inspectedMemory: { ...current, [field]: value } });
        }
    },

    loadMemoryStats: async () => {
        // 모든 활성 캐릭터의 메모리 통계 로드
        const agents = await window.dogbaApi.agentDb.list();
        const stats: Record<string, any> = {};
        for (const agent of agents.agents) {
            stats[agent.id] = await window.dogbaApi.agentMemory.getMemoryStats(
                agent.id,
            );
        }
        set({ memoryStats: stats });
    },

    clearInspection: () =>
        set({ inspectedMemory: null, inspectedAgentId: null }),

    searchKnowledge: async (agentId, query) => {
        const results = await window.dogbaApi.agentMemory.searchKnowledge(
            agentId,
            query,
        );
        set({ searchResults: results });
    },

    clearSearchResults: () => set({ searchResults: [] }),
}));
```

---

## 8. UI 컴포넌트

### 8.1 InspectorCard 확장

기존 `InspectorCard.tsx`에 "Memory" 탭을 추가한다.

```
InspectorCard (기존)
  ├─ [Info] 탭: 이름, 역할, 상태, 현재 작업
  ├─ [Memory] 탭 (신규):
  │   ├─ Core Memory 요약 카드
  │   │   ├─ Identity (읽기 전용)
  │   │   ├─ Strengths 태그 (편집 가능)
  │   │   ├─ Weaknesses 태그 (편집 가능)
  │   │   ├─ Active Goals (편집 가능)
  │   │   └─ Notes (자유 텍스트, 편집 가능)
  │   ├─ Recent Activity (Tier 2 요약)
  │   │   ├─ 오늘의 태스크 목록
  │   │   └─ 최근 상호작용
  │   └─ Knowledge Search (Tier 3 검색)
  │       ├─ 검색 입력
  │       └─ 결과 목록
  └─ [Relationships] 탭 (Affinity 설계서에서 정의)
```

### 8.2 MemoryPanel 컴포넌트 구조

```
src/components/memory/
  ├─ MemoryTab.tsx          — InspectorCard 내 Memory 탭 루트
  ├─ CoreMemoryCard.tsx     — Tier 1 표시/편집
  ├─ DailyActivityList.tsx  — Tier 2 최근 활동 목록
  ├─ KnowledgeSearch.tsx    — Tier 3 검색 UI
  └─ MemoryStatsBar.tsx     — 메모리 사용량 시각화 바
```

### 8.3 Agent Town 연동

캐릭터의 메모리 상태에 따른 시각적 피드백:

| 메모리 상태                    | Agent Town 표현         |
| ------------------------------ | ----------------------- |
| Core Memory에 activeGoals 있음 | 말풍선에 현재 목표 표시 |
| 새 learning 축적 시            | 전구 이펙트 (💡)        |
| 에러가 많은 날                 | 캐릭터 위에 구름 이펙트 |
| 성과 달성 시                   | 별 이펙트 + 축하 말풍선 |

---

## 9. 마이그레이션

### 9.1 기존 agent-metrics 데이터 이전

기존 `dokba-agent-metrics` Store의 데이터를 새 메모리 시스템으로 이전한다.

```typescript
async function migrateFromMetrics(): Promise<void> {
    const allMetrics = agentMetrics.getAllMetrics();

    for (const [agentId, metrics] of Object.entries(allMetrics)) {
        const store = agentMemoryManager.getStore(agentId);

        // 1. 기존 recentTasks → Tier 2 오늘자 로그로 변환
        const today = formatDateISO(new Date());
        const todayLog =
            store.get(`dailyLogs.${today}`) ??
            createEmptyDailyLog(agentId, today);

        for (const task of metrics.recentTasks) {
            todayLog.tasks.push({
                taskId: task.taskId,
                description: task.description,
                status: task.status,
                startedAt: task.startedAt,
                completedAt: task.completedAt,
                durationMs: task.durationMs,
                collaborators: [],
                skillsUsed: [],
            });
        }
        store.set(`dailyLogs.${today}`, todayLog);

        // 2. 기존 completionRate/avgDuration → Tier 1 strengths 초기값
        const core = store.get('core');
        if (metrics.completionRate >= 0.8) {
            core.strengths.push(
                `높은 완료율 (${Math.round(metrics.completionRate * 100)}%)`,
            );
        }
        if (metrics.avgDurationMs > 0 && metrics.avgDurationMs < 60000) {
            core.strengths.push('빠른 작업 처리 속도');
        }
        store.set('core', core);
    }
}
```

### 9.2 마이그레이션 실행 시점

앱 시작 시 `schemaVersion` 체크:

```typescript
// main.ts 초기화
if (agentMemoryManager.needsMigration()) {
    await migrateFromMetrics();
    agentMemoryManager.setMigrated();
}
```

### 9.3 하위 호환

기존 `agent-metrics.ts`는 **삭제하지 않고** 유지한다. 메모리 시스템이 메트릭 이벤트를 구독하므로 기존 코드 변경 최소화. 기존 `metrics:get`, `metrics:getAll`, `metrics:topPerformers` IPC도 그대로 유지.

---

## 10. 테스트 전략

### 10.1 단위 테스트

파일: `src/lib/__tests__/agent-memory.test.ts`

| 테스트 범위              | 테스트 케이스                                                      |
| ------------------------ | ------------------------------------------------------------------ |
| CoreMemory CRUD          | `getCore` 기본값 반환, `updateCore` 부분 업데이트, 직렬화/역직렬화 |
| CoreMemory 마크다운 변환 | `toMarkdown()` 100줄 이내, 필수 섹션 포함                          |
| DailyLog append          | 태스크 추가, 상호작용 추가, 에러 추가                              |
| DailyLog 정리            | 7일 초과 로그 삭제, Tier 3 추출 후 삭제                            |
| DeepKnowledge 검색       | 키워드 매칭, 빈 결과, 복수 결과                                    |
| SkillKnowledge 업서트    | 새 스킬 추가, 기존 스킬 숙련도 업데이트                            |
| 승격 로직                | 3일 연속 사용 → strengths 승격                                     |
| ContextPacket 빌드       | Tier 1+2+3 조합, 키워드 필터링                                     |
| 용량 제한                | 50개 초과 스킬 시 가장 오래된 것 제거                              |
| 마이그레이션             | agent-metrics → memory 변환 정확성                                 |

### 10.2 통합 테스트 시나리오

| 시나리오                       | 검증 항목                                    |
| ------------------------------ | -------------------------------------------- |
| 태스크 완료 → 메모리 자동 기록 | agent-metrics 이벤트 → Tier 2 로그 생성 확인 |
| 세션 시작 → 컨텍스트 주입      | ContextPacket에 Core + 최근 로그 포함 확인   |
| 7일 경과 → 자동 정리           | 오래된 Tier 2 삭제, Tier 3 추출 확인         |
| 주간 리트로 → Core 재생성      | retro-generator 결과 → Core 업데이트 확인    |
| 사용자 피드백 → Core 반영      | updateCore → 다음 세션 컨텍스트에 포함 확인  |

### 10.3 테스트 모킹 전략

```typescript
// electron-store 모킹
const mockStore = new Map<string, any>();
vi.mock('electron-store', () => ({
    default: class {
        get(key: string) {
            return mockStore.get(key);
        }
        set(key: string, val: any) {
            mockStore.set(key, val);
        }
    },
}));
```

---

## 부록 A: CoreMemory → 마크다운 변환 예시

```markdown
# Sera — PM / 총괄

## Identity

Sera — PM / 총괄. 꼼꼼하고 체계적이며 팀 전체를 조율하는 리더.

## Strengths

- 높은 완료율 (92%)
- 프로젝트 계획 수립에 강함
- 팀 커뮤니케이션 조율 능력

## Weaknesses

- 코드 리뷰 시 세부 사항 놓침 (2회 발생)

## Active Goals

- Phase 5 프론트엔드 리팩토링 관리

## User Preferences

- 한국어로 보고서 작성
- 마크다운 표 형식 선호

## Key Relationships

- Rio: 백엔드 작업 시너지 높음 (trust 78)
- Luna: 프론트엔드 협업 빈번 (trust 65)

## Recent Achievements

- 3월 25일: 팀 미팅에서 아키텍처 합의 도출
- 3월 24일: 8개 태스크 연속 성공

## Notes

(사용자 메모 없음)
```
