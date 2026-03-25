# 캐릭터 성장/육성 시스템 설계서

> 작성일: 2026-03-26
> 상태: Draft
> 관련 모듈: exp-engine.ts, useGrowthStore.ts, growth.ts, agent-metrics.ts, skill-manager.ts, hooks-manager.ts, agent-db.ts

---

## 1. 개요

### 1.1 현재 상태

현재 Artience의 성장 시스템은 **글로벌 EXP 풀** 방식이다. 모든 캐릭터가 동일한 `AgentStats` 6개 축(coding, analysis, speed, accuracy, creativity, teamwork)을 공유하며, 활동에 따라 `exp-engine.ts`가 EXP를 계산하고 `useGrowthStore`가 `AgentGrowthProfile`을 관리한다. 레벨/진화 단계(novice→legendary)가 존재하지만, 캐릭터별 **전문화** 메커니즘이 부족하다.

- `useGrowthStore.addExp()`: 글로벌 EXP 추가, 레벨업 처리
- `exp-engine.ts`: 활동 유형별 EXP 및 스탯 증가분 계산
- `types/growth.ts`: `AgentGrowthProfile`, `SkillProgress`, `AgentMemory`, `AgentTrait`, `EvolutionState` 정의
- `LEVEL_EXP_TABLE`: `100 * 1.15^i` 곡선 (99레벨 기준)

### 1.2 목표 전환

**글로벌 EXP 시스템 → RPG 캐릭터 시트 기반 개별 성장 시스템**으로 전환한다.

핵심 비유: 각 캐릭터는 고유한 **캐릭터 시트**(Character Sheet)를 가진다. PM 캐릭터(Sera)는 planning과 communication에 특화되고, 백엔드 개발자(Rio)는 coding과 backend에 특화된다. 유저는 캐릭터를 육성하면서 전문 분야를 선택하고, 성장에 따라 캐릭터의 System Prompt(CLAUDE.md), 사용 가능한 스킬, 자율성 레벨이 자동으로 확장된다.

### 1.3 핵심 설계 원칙

1. **작업이 곧 경험**: 캐릭터가 실제 작업을 수행한 만큼 정확히 성장한다
2. **전문화 보상**: 한 분야에 집중하면 더 빠르게 성장하고 더 강력한 스킬을 해금한다
3. **유저 선택권**: 자동 성장 + 유저의 의도적 포인트 배분 혼합
4. **실질적 영향**: 성장이 실제 CLI 동작(permission mode, system prompt, allowed tools)에 반영된다

---

## 2. 성장 파이프라인

캐릭터의 성장은 4단계 파이프라인으로 진행된다.

```
[작업 수행] → [Skill 축적] → [Workflow 조합] → [Job 자동화]
   │              │               │                │
   ▼              ▼               ▼                ▼
 PTY에서 코드    반복 패턴이    여러 Skill을    Job = 자동 실행
 작성/리뷰/     자동 감지 →    조합한 복합     가능한 Workflow
 테스트 수행     SKILL.md로     작업 흐름       (cron 또는
                 자동 생성                      heartbeat 트리거)
```

### 2.1 Stage 1: 작업 수행 (Task Execution)

캐릭터가 PTY 세션에서 작업을 수행하면 `pty-parser.ts`가 활동을 감지하고, `exp-engine.ts`가 EXP와 스탯 증가분을 계산한다.

**트리거 이벤트**:

- `thinking`: Claude가 사고 중 (스피너 감지) → analysis +2, creativity +1
- `reading`: Read/Glob/Grep 도구 사용 → analysis +2, accuracy +1
- `writing`: Edit/Write 도구 사용 → coding +2, creativity +1
- `typing`: Bash 실행 → speed +2, coding +1
- `working`: 종합 작업 → coding +1, speed +1
- `success`: 작업 성공 완료 → accuracy +2, teamwork +1

### 2.2 Stage 2: Skill 축적

작업 이력이 축적되면 **패턴 감지 엔진**이 반복적인 작업 패턴을 식별한다.

예시:

- Rio가 `Edit(*.ts)` + `Bash(npm test)` 패턴을 5회 이상 반복 → `test-driven-development` 스킬 후보 감지
- Luna가 `Grep(*.tsx)` + `Edit(*.tsx)` + `Bash(npm run build)` 패턴 → `component-refactor` 스킬 후보

감지된 패턴은 `.claude/skills/{skill-name}/SKILL.md`로 자동 생성되어 Claude Code의 네이티브 스킬 시스템과 통합된다.

### 2.3 Stage 3: Workflow 조합

여러 Skill을 순서대로 조합하면 **Workflow**가 된다. Workflow는 `workflow-pack.ts`와 연동된다.

예시: `code-review` → `run-tests` → `security-audit` = "품질 검증 워크플로"

### 2.4 Stage 4: Job 자동화

Workflow에 트리거 조건을 붙이면 **Job**이 된다. Job은 `task-scheduler.ts`를 통해 자동 실행된다.

예시: "매일 09:00에 품질 검증 워크플로 실행" = Job

---

## 3. 캐릭터별 능력치 모델

### 3.1 확장된 스탯 인터페이스

기존 6개 스탯을 7개 주요 스탯(Primary Stat)으로 재편하고, 각 스탯에 세부 전문화 분야(Specialization)를 추가한다.

```typescript
// types/character-growth.ts

/**
 * 7개 주요 스탯 — 모든 캐릭터가 공유하는 기본 능력치 축
 * 각 값은 0~100. 초기값은 캐릭터 역할에 따라 다름.
 */
export interface PrimaryStats {
    coding: number; // 코드 작성/수정 능력
    analysis: number; // 코드 분석/이해 능력
    writing: number; // 문서/커뮤니케이션 작성 능력
    design: number; // 설계/아키텍처 능력
    testing: number; // 테스트/QA 능력
    review: number; // 코드 리뷰/품질 검증 능력
    planning: number; // 기획/프로젝트 관리 능력
}

/**
 * 전문화 트리 — 각 Primary Stat에서 분기하는 세부 분야
 * 값은 0~50. Primary Stat의 절반이 상한.
 */
export interface SpecializationTree {
    // coding 하위
    frontend: number; // React, CSS, UI 구현
    backend: number; // API, 서버, 데이터 처리
    systems: number; // 인프라, DevOps, 스크립팅

    // analysis 하위
    debugging: number; // 버그 추적, 근본 원인 분석
    performance: number; // 성능 프로파일링, 최적화
    security: number; // 보안 취약점 분석

    // writing 하위
    documentation: number; // API 문서, README, 가이드
    communication: number; // 팀 커뮤니케이션, 리포트
    content: number; // 마케팅, 블로그, 콘텐츠

    // design 하위
    architecture: number; // 시스템 아키텍처 설계
    database: number; // 데이터 모델링, 스키마 설계
    api: number; // API 설계, 인터페이스 정의

    // testing 하위
    unitTesting: number; // 단위 테스트 작성
    integration: number; // 통합/E2E 테스트
    automation: number; // 테스트 자동화 프레임워크

    // review 하위
    codeQuality: number; // 코드 스타일, 패턴, 가독성
    securityReview: number; // 보안 코드 리뷰
    performanceReview: number; // 성능 코드 리뷰

    // planning 하위
    taskDecomposition: number; // 태스크 분해, 우선순위 지정
    estimation: number; // 작업량 추정, 일정 관리
    stakeholder: number; // 이해관계자 관리, 요구사항 정리
}

/**
 * 완전한 캐릭터 시트
 */
export interface CharacterSheet {
    agentId: string;
    agentName: string;

    // 레벨 & EXP
    level: number; // 1~100
    exp: number; // 현재 레벨 내 누적 EXP
    expToNext: number; // 다음 레벨까지 필요 EXP
    totalExp: number; // 총 누적 EXP

    // 능력치
    primaryStats: PrimaryStats; // 7개 주요 스탯 (0~100)
    specializations: SpecializationTree; // 21개 세부 전문화 (0~50)

    // 스킬
    equippedSkills: string[]; // 현재 장착된 스킬 ID 목록
    maxSkillSlots: number; // 최대 스킬 슬롯 수 (레벨에 따라 증가)

    // 성장 이력
    statPointsAvailable: number; // 미배분 스탯 포인트
    specPointsAvailable: number; // 미배분 전문화 포인트

    // 진화
    evolution: EvolutionState;
    autonomyLevel: AutonomyLevel; // 0~3 (Heartbeat 시스템 연동)

    // 메타
    streakDays: number;
    lastActiveAt: number;
    createdAt: number;
}

export type AutonomyLevel = 0 | 1 | 2 | 3;
```

### 3.2 캐릭터별 초기값

각 캐릭터는 역할에 맞는 **초기 스탯 프리셋**을 가진다.

```typescript
export const CHARACTER_INITIAL_STATS: Record<string, Partial<PrimaryStats>> = {
    sera: { planning: 15, writing: 12, design: 8 }, // PM
    rio: { coding: 15, analysis: 10, testing: 8 }, // Backend Dev
    luna: { coding: 15, design: 10, review: 8 }, // Frontend Dev
    ara: { testing: 15, analysis: 12, review: 8 }, // QA
    duri: { analysis: 15, review: 12, testing: 8 }, // Security
    podo: { review: 15, analysis: 10, coding: 8 }, // Code Reviewer
    namu: { design: 15, planning: 12, analysis: 8 }, // Architect
    miso: { coding: 12, testing: 10, planning: 8 }, // DevOps
    toto: { design: 15, analysis: 12, coding: 8 }, // DBA
    somi: { analysis: 15, coding: 12, testing: 8 }, // Performance
    alex: { analysis: 15, writing: 12, planning: 8 }, // Data Analyst
    bomi: { writing: 15, design: 10, planning: 8 }, // Content
    hana: { design: 15, writing: 12, coding: 8 }, // UX Designer
    dari: { writing: 15, analysis: 10, planning: 8 }, // Tech Writer
    // ... 나머지 캐릭터도 동일 패턴
};
```

초기 전문화 값은 모두 0이며, Primary Stat에 종속된 전문화만 성장할 수 있다. 예: `frontend` 전문화를 올리려면 `coding` Primary Stat이 최소 10 이상이어야 하며, 전문화 상한은 `coding / 2`이다.

### 3.3 스탯 자동 증가 규칙

작업 수행 시 관련 Primary Stat이 자동으로 미세 증가한다. 증가량은 **현재 스탯 값의 역수**에 비례하여 저레벨일수록 빠르게, 고레벨일수록 느리게 성장한다.

```typescript
/**
 * 스탯 증가량 계산 (체감 수확 함수)
 * currentValue가 낮을수록 더 많이 오름
 */
export function calculateStatGain(
    currentValue: number,
    baseGain: number,
): number {
    // 1~100 범위에서 감쇠: gain * (1 - currentValue/120)
    // currentValue=0  → 100% 효율
    // currentValue=60 → 50% 효율
    // currentValue=100 → 17% 효율
    const efficiency = Math.max(0.1, 1 - currentValue / 120);
    return Math.round(baseGain * efficiency * 100) / 100;
}
```

---

## 4. 레벨 시스템

### 4.1 레벨 범위: 1~100

기존 `LEVEL_EXP_TABLE`(`100 * 1.15^i`)을 유지하되, 100레벨로 확장한다.

```typescript
/**
 * EXP 테이블 (레벨 1→2부터 99→100까지)
 *
 * 레벨  1→2:   100 EXP
 * 레벨  5→6:   175 EXP
 * 레벨 10→11:  352 EXP
 * 레벨 20→21:  1,424 EXP
 * 레벨 30→31:  5,766 EXP
 * 레벨 50→51:  94,401 EXP
 * 레벨 75→76:  5,378,469 EXP
 * 레벨 99→100: 168,676,793 EXP (사실상 도달 불가, 명예 레벨)
 */
export const LEVEL_EXP_TABLE: number[] = Array.from({ length: 100 }, (_, i) =>
    Math.round(100 * Math.pow(1.15, i)),
);
```

### 4.2 레벨업 해금 보상

| 레벨 | 해금 내용                                     |
| ---- | --------------------------------------------- |
| 1    | 기본 스킬 슬롯 2개, 스탯 포인트 0             |
| 5    | 스킬 슬롯 +1 (총 3), 전문화 트리 해금         |
| 10   | 스킬 슬롯 +1 (총 4), 자율성 Level 1 해금 가능 |
| 15   | 스탯 포인트 보너스 +3                         |
| 20   | 스킬 슬롯 +1 (총 5), Job 스케줄링 해금        |
| 25   | 자율성 Level 2 해금 가능                      |
| 30   | 스킬 슬롯 +1 (총 6), Workflow 생성 해금       |
| 40   | 스킬 슬롯 +1 (총 7), 전문화 2차 분기 해금     |
| 50   | 자율성 Level 3 해금 가능, 마스터 스킬 슬롯 +1 |
| 60   | 팀 리더 모드 해금 (서브에이전트 위임 가능)    |
| 75   | 전설 스킬 해금 가능                           |
| 99   | 전체 자율 모드 해금                           |

### 4.3 레벨업 시 포인트 배분

레벨업 시 **스탯 포인트 2개 + 전문화 포인트 1개**를 획득한다. 유저가 배분하지 않으면 **자동 배분** (가장 많이 사용한 활동 관련 스탯에 투자).

```typescript
export interface LevelUpReward {
    statPoints: number; // 보통 2, 5의 배수 레벨에서 +1 보너스
    specPoints: number; // 보통 1
    newSkillSlot: boolean; // 특정 레벨에서만 true
    autonomyUnlock: AutonomyLevel | null; // 특정 레벨에서만
    abilityUnlock: string | null;
}

export function getLevelUpReward(newLevel: number): LevelUpReward {
    const isMultipleOf5 = newLevel % 5 === 0;
    return {
        statPoints: isMultipleOf5 ? 3 : 2,
        specPoints: 1,
        newSkillSlot: [5, 10, 20, 30, 40, 50].includes(newLevel),
        autonomyUnlock:
            newLevel === 10
                ? 1
                : newLevel === 25
                  ? 2
                  : newLevel === 50
                    ? 3
                    : null,
        abilityUnlock:
            newLevel === 20
                ? 'job-scheduling'
                : newLevel === 30
                  ? 'workflow-creation'
                  : newLevel === 60
                    ? 'team-leader'
                    : null,
    };
}
```

---

## 5. Skill 시스템

### 5.1 스킬 자동 생성

캐릭터의 작업 이력을 분석하여 반복 패턴을 감지하면 `.claude/skills/` 디렉토리에 SKILL.md를 자동 생성한다.

```typescript
export interface SkillCandidate {
    name: string;
    description: string;
    detectedPattern: {
        toolSequence: string[]; // ['Grep', 'Edit', 'Bash']
        filePattern: string; // '*.test.ts'
        frequency: number; // 감지 횟수
    };
    requiredLevel: number;
    category: SkillCategory;
    statRequirements: Partial<PrimaryStats>; // 최소 스탯 요구치
}

/**
 * 작업 이력에서 스킬 후보를 감지하는 함수
 * task-scheduler.ts의 완료된 태스크 + agent-metrics.ts의 이력을 분석
 */
export function detectSkillCandidates(
    taskHistory: TaskHistoryEntry[],
    existingSkills: string[],
): SkillCandidate[] {
    // 1. 도구 시퀀스 N-gram 분석 (3-gram)
    // 2. 파일 패턴 클러스터링
    // 3. 기존 스킬과 중복 제거
    // 4. 빈도 5회 이상인 패턴만 후보로 반환
    // ...
}
```

자동 생성되는 SKILL.md 템플릿:

```markdown
---
name: { skill-name }
description: { 자동 생성 설명 }
argument-hint: '[target]'
user-invocable: true
allowed-tools: { 감지된 도구 목록 }
---

# {Skill Name}

## 감지된 작업 패턴

{도구 시퀀스 설명}

## 지시사항

$ARGUMENTS가 지정되면 해당 대상에 대해 실행하고,
지정되지 않으면 최근 변경사항을 대상으로 실행해.

{구체적 지시사항 — 감지된 패턴 기반}
```

### 5.2 스킬 트리 구조

각 Primary Stat 아래에 3단계 스킬 트리가 존재한다.

```
coding
├── [Tier 1] basic-edit (Lv.1 해금)
│   ├── [Tier 2] refactor-patterns (Lv.10 해금, coding≥20)
│   │   └── [Tier 3] architecture-refactor (Lv.30 해금, coding≥50)
│   └── [Tier 2] code-generation (Lv.10 해금, coding≥20)
│       └── [Tier 3] full-feature-impl (Lv.30 해금, coding≥50)
├── [Tier 1] basic-debug (Lv.1 해금)
│   ├── [Tier 2] root-cause-analysis (Lv.15 해금, analysis≥25)
│   │   └── [Tier 3] predictive-debug (Lv.40 해금, analysis≥60)
│   └── [Tier 2] performance-fix (Lv.15 해금, coding≥25)
...
```

### 5.3 스킬 장착/해제

캐릭터는 **레벨에 따른 슬롯 수만큼** 스킬을 동시 장착할 수 있다. 장착된 스킬만 Claude Code의 `/` 슬래시 커맨드로 사용 가능하다.

```typescript
export interface SkillSlotConfig {
    maxSlots: number; // 레벨에 따라 2~8
    equipped: string[]; // 장착된 스킬 ID 목록
    available: string[]; // 해금되었으나 미장착 스킬 목록
}

// 장착 변경 시 .claude/skills/ 디렉토리에 실제 SKILL.md 파일을
// 활성화(심볼릭 링크 또는 복사) / 비활성화(이동) 한다.
```

### 5.4 skill-manager.ts 연동

기존 `skill-manager.ts`는 외부 마켓플레이스 스킬의 설치/삭제를 담당한다. 캐릭터 성장 스킬은 별도 네임스페이스(`growth-skills/`)로 관리하여 충돌을 방지한다.

```
.claude/skills/
├── code-review/           ← 기존 기본 스킬 (skill-manager.ts 관리)
├── run-tests/             ← 기존 기본 스킬
├── security-audit/        ← 기존 기본 스킬
├── marketplace/           ← 외부 설치 스킬 (skill-manager.ts 관리)
│   └── advanced-lint/
└── growth/                ← 성장 시스템 자동 생성 스킬 (CharacterGrowthManager 관리)
    ├── luna-component-refactor/
    ├── rio-tdd-workflow/
    └── duri-vuln-scan/
```

---

## 6. System Prompt 진화

캐릭터의 성장에 따라 CLAUDE.md(system prompt)가 **자동으로 업데이트**된다.

### 6.1 진화 단계별 System Prompt 변화

```typescript
export function buildEvolvingSystemPrompt(
    sheet: CharacterSheet,
    basePersona: string,
): string {
    const sections: string[] = [basePersona];

    // 레벨 기반 추가 지시
    if (sheet.level >= 10) {
        sections.push(
            '## 경험 수준\n당신은 초보를 벗어난 주니어입니다. 기본적인 판단을 자율적으로 내릴 수 있습니다.',
        );
    }
    if (sheet.level >= 25) {
        sections.push(
            '## 경험 수준\n당신은 시니어 레벨입니다. 복잡한 판단을 자율적으로 내리고, 실행 후 결과를 보고하세요.',
        );
    }
    if (sheet.level >= 50) {
        sections.push(
            '## 경험 수준\n당신은 전문가입니다. 독립적으로 의사결정하고, 중요한 사항만 보고하세요.',
        );
    }

    // 전문화 기반 추가 지시
    const topSpecs = getTopSpecializations(sheet.specializations, 3);
    if (topSpecs.length > 0) {
        const specDesc = topSpecs
            .map((s) => `- ${s.name}: ${s.value}/50`)
            .join('\n');
        sections.push(
            `## 전문 분야\n다음 분야에 특화되어 있습니다:\n${specDesc}`,
        );
    }

    // 장착된 스킬 목록
    if (sheet.equippedSkills.length > 0) {
        sections.push(
            `## 활성 스킬\n/${sheet.equippedSkills.join(', /')} 명령어를 사용할 수 있습니다.`,
        );
    }

    return sections.join('\n\n');
}
```

### 6.2 hooks-manager.ts 연동

`hooks-manager.ts`가 `.claude/settings.json`과 CLAUDE.md를 관리한다. 성장 시스템은 캐릭터 레벨업 이벤트 시 `hooks-manager.ts`를 호출하여 CLAUDE.md를 업데이트한다.

```typescript
// 레벨업 시 호출
async function onLevelUp(sheet: CharacterSheet): Promise<void> {
    const hooksManager = getHooksManager();
    const newPrompt = buildEvolvingSystemPrompt(
        sheet,
        getBasePersona(sheet.agentId),
    );
    await hooksManager.updateAgentClaudeMd(sheet.agentId, newPrompt);

    // permission mode 업그레이드
    if (sheet.autonomyLevel >= 2) {
        await hooksManager.updatePermissionMode(sheet.agentId, 'acceptEdits');
    }
}
```

---

## 7. 저장소 설계

### 7.1 electron-store 구조

```typescript
// electron-store key: 'dokba-character-growth'
interface CharacterGrowthStore {
    version: number; // 스키마 버전 (마이그레이션용)
    sheets: Record<string, CharacterSheet>; // agentId → CharacterSheet
    skillCandidates: Record<string, SkillCandidate[]>; // agentId → 감지된 스킬 후보
    generatedSkills: Record<string, GeneratedSkill[]>; // agentId → 생성된 스킬 메타
    levelUpHistory: LevelUpEvent[]; // 전역 레벨업 이력 (최근 500건)
}

interface LevelUpEvent {
    agentId: string;
    oldLevel: number;
    newLevel: number;
    reward: LevelUpReward;
    timestamp: number;
}

interface GeneratedSkill {
    skillId: string;
    agentId: string;
    name: string;
    filePath: string; // .claude/skills/growth/{name}/SKILL.md
    detectedAt: number;
    generatedAt: number;
    usageCount: number;
}
```

### 7.2 Zustand Store 연동 (Renderer)

기존 `useGrowthStore`의 `profiles`를 `CharacterSheet`로 마이그레이션하며, 렌더러에서는 Zustand persist(localStorage)로 빠른 UI 반영, 백그라운드에서 electron-store에 동기화한다.

```typescript
interface CharacterGrowthRendererStore {
    sheets: Record<string, CharacterSheet>;

    // IPC를 통한 조회/수정
    getSheet: (agentId: string) => Promise<CharacterSheet>;
    allocateStatPoint: (
        agentId: string,
        stat: keyof PrimaryStats,
    ) => Promise<void>;
    allocateSpecPoint: (
        agentId: string,
        spec: keyof SpecializationTree,
    ) => Promise<void>;
    equipSkill: (agentId: string, skillId: string) => Promise<void>;
    unequipSkill: (agentId: string, skillId: string) => Promise<void>;
}
```

---

## 8. IPC 채널

### 8.1 Growth API 그룹

| 채널                        | 방향   | 설명                                 |
| --------------------------- | ------ | ------------------------------------ |
| `growth:getSheet`           | invoke | 캐릭터 시트 전체 조회                |
| `growth:getAllSheets`       | invoke | 전체 캐릭터 시트 조회                |
| `growth:getStats`           | invoke | 특정 캐릭터 Primary Stats 조회       |
| `growth:getSpecializations` | invoke | 특정 캐릭터 전문화 트리 조회         |
| `growth:getLevel`           | invoke | 레벨/EXP 정보 조회                   |
| `growth:allocateStatPoint`  | invoke | 스탯 포인트 수동 배분                |
| `growth:allocateSpecPoint`  | invoke | 전문화 포인트 수동 배분              |
| `growth:autoAllocate`       | invoke | 미배분 포인트 자동 배분              |
| `growth:getSkillTree`       | invoke | 스킬 트리 구조 + 해금 상태 조회      |
| `growth:equipSkill`         | invoke | 스킬 장착                            |
| `growth:unequipSkill`       | invoke | 스킬 해제                            |
| `growth:getSkillCandidates` | invoke | 감지된 스킬 후보 목록 조회           |
| `growth:generateSkill`      | invoke | 스킬 후보 → SKILL.md 생성            |
| `growth:getLevelUpHistory`  | invoke | 레벨업 이력 조회                     |
| `growth:levelUp`            | send   | 레벨업 이벤트 알림 (Main → Renderer) |

### 8.2 preload.ts 인터페이스

```typescript
growth: {
    getSheet: (agentId: string) => Promise<CharacterSheet>;
    getAllSheets: () => Promise<Record<string, CharacterSheet>>;
    getStats: (agentId: string) => Promise<PrimaryStats>;
    getSpecializations: (agentId: string) => Promise<SpecializationTree>;
    getLevel: (agentId: string) => Promise<{ level: number; exp: number; expToNext: number }>;
    allocateStatPoint: (agentId: string, stat: string) => Promise<{ success: boolean }>;
    allocateSpecPoint: (agentId: string, spec: string) => Promise<{ success: boolean }>;
    autoAllocate: (agentId: string) => Promise<{ success: boolean; allocated: Record<string, number> }>;
    getSkillTree: (agentId: string) => Promise<SkillTreeData>;
    equipSkill: (agentId: string, skillId: string) => Promise<{ success: boolean }>;
    unequipSkill: (agentId: string, skillId: string) => Promise<{ success: boolean }>;
    getSkillCandidates: (agentId: string) => Promise<SkillCandidate[]>;
    generateSkill: (agentId: string, candidateIndex: number) => Promise<{ success: boolean; skillId: string }>;
    getLevelUpHistory: () => Promise<LevelUpEvent[]>;
    onLevelUp: (callback: (event: LevelUpEvent) => void) => () => void;
}
```

---

## 9. 기존 모듈 연동

### 9.1 exp-engine.ts

**변경**: `calculateStatGains()` 함수를 확장하여 7개 Primary Stat + 21개 전문화에 대한 증가분을 반환하도록 수정.

```typescript
// 기존: Partial<AgentStats> (6개 필드)
// 변경: { primary: Partial<PrimaryStats>, spec: Partial<SpecializationTree> }
export function calculateStatGains(
    activity: string,
    toolName?: string,
    filePattern?: string, // 새 파라미터: 작업 대상 파일 패턴
): { primary: Partial<PrimaryStats>; spec: Partial<SpecializationTree> } {
    // filePattern이 *.tsx → frontend 전문화 가산
    // filePattern이 *.test.* → testing 전문화 가산
    // toolName이 Bash(npm test) → unitTesting 전문화 가산
}
```

### 9.2 agent-metrics.ts

`AgentMetricsTracker`의 `record()` 호출 시 `CharacterGrowthManager`에도 이벤트를 전달. 메트릭의 completionRate, avgDurationMs가 캐릭터 시트의 accuracy, speed 스탯 보정에 사용된다.

### 9.3 skill-manager.ts

성장 시스템이 생성하는 스킬(`growth/` 네임스페이스)과 마켓플레이스 스킬을 분리 관리. `skill-manager.ts`의 `listSkills()`는 양쪽 모두를 반환하되 `source: 'growth' | 'marketplace' | 'default'` 필드로 구분.

### 9.4 hooks-manager.ts

레벨업 이벤트 시 `.claude/settings.json`의 permission mode와 CLAUDE.md의 system prompt를 업데이트.

### 9.5 agent-db.ts

`agent-db.ts`의 에이전트 CRUD와 연동. 새 에이전트 추가 시 기본 `CharacterSheet`가 자동 생성되고, 에이전트 삭제 시 성장 데이터도 함께 정리.

---

## 10. UI 설계

### 10.1 캐릭터 시트 (Character Sheet View)

InspectorCard 클릭 또는 BottomDock 에이전트 우클릭 → "캐릭터 시트" 메뉴로 진입.

```
┌─────────────────────────────────────────────┐
│  [아바타]  Luna  Lv.23  ★★★☆☆              │
│  Frontend Developer  (apprentice)            │
│  EXP: ████████░░ 1,234 / 2,000              │
│                                              │
│  ┌─── Primary Stats ───┐  ┌── Radar Chart ─┐│
│  │ coding:    ████ 42   │  │                ││
│  │ analysis:  ███░ 28   │  │   (7축 레이더  ││
│  │ writing:   ██░░ 15   │  │    차트 시각화) ││
│  │ design:    ███░ 31   │  │                ││
│  │ testing:   ██░░ 18   │  │                ││
│  │ review:    ███░ 25   │  │                ││
│  │ planning:  █░░░ 8    │  │                ││
│  │ [+2 미배분 포인트]   │  └────────────────┘│
│  └──────────────────────┘                    │
│                                              │
│  ┌─── Equipped Skills (4/5) ────────────────┐│
│  │ [⚡] component-refactor                  ││
│  │ [⚡] react-optimization                  ││
│  │ [⚡] css-layout                          ││
│  │ [⚡] accessibility-check                 ││
│  │ [  ] (빈 슬롯)                           ││
│  │              [스킬 트리 열기]             ││
│  └──────────────────────────────────────────┘│
│                                              │
│  자율성: Level 1 (확인 후 실행)              │
│  연속 활동: 12일                             │
└─────────────────────────────────────────────┘
```

### 10.2 스킬 트리 UI

노드 그래프 형태로 스킬 간 의존 관계를 시각화한다.

```
┌──────────────────────────────────────────────┐
│  Skill Tree: Luna                            │
│                                              │
│  [coding] ─── [basic-edit ✓] ──┬── [refactor-patterns ✓]──── [arch-refactor 🔒]
│                                │                              │
│                                └── [code-generation ✓] ────── [full-feature 🔒]
│                                                               │
│  [design] ─── [basic-layout ✓]──── [responsive ✓] ────────── [design-system 🔒]
│                                                               │
│  [testing]─── [basic-test ✓]  ──── [component-test 🔒]       │
│                                                               │
│  ✓ = 해금됨    🔒 = 미해금 (요구조건 표시)                  │
│  ★ = 장착됨    ○ = 해금되었으나 미장착                        │
│                                              │
│  [선택된 노드 상세]                          │
│  refactor-patterns (Tier 2)                  │
│  요구: Lv.10, coding≥20                      │
│  효과: 코드 리팩토링 시 speed+2 보너스       │
│  상태: ★ 장착됨                              │
└──────────────────────────────────────────────┘
```

### 10.3 레벨업 알림

기존 `LevelUpNotification.tsx`를 확장. 레벨업 시 보상 내용과 포인트 배분 UI를 포함한다.

```
┌──────────────────────────────┐
│  🎉 Luna Level UP!          │
│      Lv.22 → Lv.23          │
│                              │
│  보상:                       │
│  • 스탯 포인트 +2            │
│  • 전문화 포인트 +1          │
│                              │
│  [지금 배분하기]  [나중에]   │
└──────────────────────────────┘
```

### 10.4 InspectorCard 연결

AgentTown에서 캐릭터 클릭 시 나타나는 InspectorCard에 레벨/스탯 미니 요약을 추가하고, "캐릭터 시트 열기" 버튼을 배치.

---

## 11. 마이그레이션

### 11.1 기존 → 신규 전환 전략

기존 `useGrowthStore`의 `AgentGrowthProfile`을 `CharacterSheet`로 변환하는 마이그레이션 함수를 제공한다.

```typescript
export function migrateGrowthProfile(
    profile: AgentGrowthProfile,
): CharacterSheet {
    return {
        agentId: profile.agentId,
        agentName: profile.agentId, // agent-personas.ts에서 이름 조회
        level: profile.level,
        exp: profile.exp,
        expToNext: profile.expToNext,
        totalExp: profile.totalExp,
        primaryStats: {
            coding: profile.stats.coding,
            analysis: profile.stats.analysis,
            writing: 1, // 신규 스탯 (기본값)
            design: profile.stats.creativity, // creativity → design으로 매핑
            testing: 1, // 신규 스탯
            review: profile.stats.accuracy, // accuracy → review로 매핑
            planning: profile.stats.teamwork, // teamwork → planning으로 매핑
        },
        specializations: createDefaultSpecializations(), // 전부 0
        equippedSkills: profile.skills.map((s) => s.skillId),
        maxSkillSlots: Math.min(2 + Math.floor(profile.level / 10), 8),
        statPointsAvailable: 0,
        specPointsAvailable: 0,
        evolution: profile.evolution,
        autonomyLevel: 0,
        streakDays: profile.streakDays,
        lastActiveAt: profile.lastActiveAt,
        createdAt: profile.createdAt,
    };
}
```

### 11.2 마이그레이션 실행

앱 시작 시 `CharacterGrowthStore.version`을 체크하여 마이그레이션 필요 여부를 판단한다.

```typescript
const CURRENT_SCHEMA_VERSION = 2;

async function initCharacterGrowth(): Promise<void> {
    const store = getElectronStore('dokba-character-growth');
    const version = store.get('version', 1);

    if (version < 2) {
        // v1 → v2: useGrowthStore profiles → CharacterSheet 변환
        const growthData = getElectronStore('dogba-growth-store');
        const oldProfiles = growthData.get('profiles', {});

        const newSheets: Record<string, CharacterSheet> = {};
        for (const [id, profile] of Object.entries(oldProfiles)) {
            newSheets[id] = migrateGrowthProfile(profile as AgentGrowthProfile);
        }

        store.set('sheets', newSheets);
        store.set('version', CURRENT_SCHEMA_VERSION);
    }
}
```

---

## 12. 밸런싱

### 12.1 스탯 증가 곡선

| 스탯 범위 | 작업 1회당 증가량 | 총 필요 작업 수 |
| --------- | ----------------- | --------------- |
| 0 → 10    | 0.5~1.0           | 약 15회         |
| 10 → 25   | 0.3~0.7           | 약 30회         |
| 25 → 50   | 0.15~0.4          | 약 80회         |
| 50 → 75   | 0.08~0.2          | 약 200회        |
| 75 → 100  | 0.03~0.1          | 약 500회        |

### 12.2 레벨 경험치 곡선

| 레벨 구간 | 레벨당 평균 EXP  | 예상 소요 시간 (활동 기준) |
| --------- | ---------------- | -------------------------- |
| 1~10      | 100~350          | 1~2일                      |
| 10~25     | 350~3,000        | 1~2주                      |
| 25~50     | 3,000~95,000     | 1~3개월                    |
| 50~75     | 95,000~5,400,000 | 6개월~1년                  |
| 75~99     | 5,400,000+       | 1년+ (하드코어)            |

### 12.3 스킬 슬롯 수

| 레벨  | 기본 슬롯 | 보너스 슬롯 | 합계 |
| ----- | --------- | ----------- | ---- |
| 1~4   | 2         | 0           | 2    |
| 5~9   | 2         | 1           | 3    |
| 10~19 | 2         | 2           | 4    |
| 20~29 | 2         | 3           | 5    |
| 30~39 | 2         | 4           | 6    |
| 40~49 | 2         | 5           | 7    |
| 50+   | 2         | 6           | 8    |

---

## 13. 테스트 전략

### 13.1 단위 테스트

| 모듈                           | 테스트 대상                 | 파일                                         |
| ------------------------------ | --------------------------- | -------------------------------------------- |
| calculateStatGain()            | 체감 수확 함수 정확성       | `src/lib/__tests__/character-growth.test.ts` |
| getLevelUpReward()             | 각 레벨별 보상 정확성       | 동일                                         |
| detectSkillCandidates()        | 패턴 감지 정확성            | 동일                                         |
| migrateGrowthProfile()         | v1→v2 마이그레이션 정확성   | 동일                                         |
| buildEvolvingSystemPrompt()    | 레벨별 프롬프트 변화        | 동일                                         |
| Specialization cap enforcement | 전문화 상한이 Primary/2인지 | 동일                                         |

### 13.2 통합 테스트

| 시나리오                                  | 검증 내용            |
| ----------------------------------------- | -------------------- |
| 작업 수행 → EXP 획득 → 레벨업 → 보상 지급 | 파이프라인 전체 흐름 |
| 스탯 포인트 배분 → 전문화 해금            | 의존 관계 검증       |
| 스킬 후보 감지 → SKILL.md 생성 → 장착     | 스킬 파이프라인      |
| 마이그레이션 → 기존 데이터 보존           | 데이터 무결성        |

### 13.3 밸런스 테스트

시뮬레이션으로 1,000회 작업을 가상 실행하여 스탯 증가 곡선이 설계 의도와 일치하는지 검증한다.

---

_최종 업데이트: 2026-03-26 | Draft_
