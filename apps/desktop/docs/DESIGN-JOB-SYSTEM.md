# Jobs 원클릭 자동화 시스템 설계서

> **Status**: Draft v1.0
> **Date**: 2026-03-26
> **Author**: frontend-dev
> **Depends on**: `workflow-pack.ts`, `task-scheduler.ts`, `skill-manager.ts`, `agent-recommender.ts`, `growth-bridge.ts`, `exp-engine.ts`

---

## 1. 개요

### 1.1 Job이란?

Job은 Artience 캐릭터 시스템의 **최종 자동화 형태**다. 사용자가 프롬프트를 작성하거나 에이전트에게 지시할 필요 없이, **버튼 하나**로 복잡한 멀티스텝 작업을 실행하는 "원클릭 자동화 단위"다.

현재 시스템의 진화 경로:

```
Skill (단일 능력) → Workflow Pack (에이전트+스킬 조합) → Job (완전한 자동화 파이프라인)
```

기존 `workflow-pack.ts`는 에이전트와 스킬의 **조합을 정의**하지만, 실행 순서, 스텝 간 입출력 매핑, 품질 게이트, 에러 처리 등의 **실행 로직이 없다**. Job은 이 빈 공간을 채우는 시스템이다.

### 1.2 왜 Job이 필요한가?

1. **프롬프팅 피로 제거**: 매번 "리뷰해줘", "테스트 돌려줘", "리포트 작성해줘"를 반복 입력하는 대신 원클릭
2. **품질 일관성**: 동일한 파이프라인으로 실행하므로 결과 품질이 안정적
3. **캐릭터 성장의 실질적 보상**: 캐릭터가 레벨업하면 더 복잡한 Job을 해금 — 성장이 실제 기능 확장으로 이어짐
4. **반복 작업의 자산화**: 한 번 정의한 Job은 재사용 가능한 자동화 자산이 됨
5. **Workflow Pack의 진화**: 기존 6개 워크플로 팩을 실행 가능한 Job 프리셋으로 업그레이드

### 1.3 핵심 비유: 레고

| 비유            | 시스템   | 설명                                                                                |
| --------------- | -------- | ----------------------------------------------------------------------------------- |
| **레고 블럭**   | Skill    | 단일 능력. `code-review`, `run-tests`, `security-audit` 같은 `.claude/skills/` 파일 |
| **조립 설명서** | Workflow | 블럭을 어떤 순서로, 어떤 에이전트가 조립할지 정의하는 스텝 시퀀스                   |
| **완성 세트**   | Job      | 설명서 + 블럭 + 입력 폼 + 실행 엔진이 포함된 원클릭 패키지                          |

Skill은 개별 도구(망치, 드라이버), Workflow는 시공 순서(1단계 기초, 2단계 골조...), Job은 "클릭 한 번으로 집 한 채를 짓는" 자동화 시스템이다.

---

## 2. Job 정의 스키마

### 2.1 핵심 인터페이스

```typescript
/** Job 정의 — electron-store에 저장되는 영속 데이터 */
export interface JobDefinition {
    /** 고유 ID (예: "job-code-gen", "job-custom-20260326-a1b2c3") */
    id: string;

    /** 사용자에게 표시되는 이름 */
    name: string;

    /** Job 설명 (1-2문장) */
    description: string;

    /** 표시 아이콘 (이모지 또는 Lucide 아이콘명) */
    icon: string;

    /** 분류 카테고리 */
    category: JobCategory;

    /** 사용자에게 받을 입력 정의 */
    inputs: JobInput[];

    /** 워크플로 실행 파이프라인 */
    workflow: JobWorkflow;

    /** Job 완료 후 산출물 정의 */
    outputs: JobOutput[];

    /** 메타데이터: 난이도, 비용, 시간 등 */
    metadata: JobMetadata;

    /** 원본 WorkflowPack ID (빌트인 프리셋의 경우) */
    sourcePackId?: string;

    /** Job 생성 시점 */
    createdAt: number;

    /** 마지막 수정 시점 */
    updatedAt: number;

    /** 빌트인 여부 (삭제 불가) */
    builtin: boolean;
}

export type JobCategory =
    | 'development'
    | 'report'
    | 'creative'
    | 'video'
    | 'research'
    | 'roleplay'
    | 'custom';
```

### 2.2 입력 정의

```typescript
/** Job 실행 전 사용자에게 받을 입력값 */
export interface JobInput {
    /** 입력 변수명 (스텝에서 {{input.변수명}}으로 참조) */
    key: string;

    /** 사용자에게 표시할 라벨 */
    label: string;

    /** 입력 타입 */
    type:
        | 'text'
        | 'textarea'
        | 'file'
        | 'directory'
        | 'select'
        | 'boolean'
        | 'number';

    /** textarea/text 기본값 */
    defaultValue?: string;

    /** select 타입일 때 선택지 */
    options?: Array<{ value: string; label: string }>;

    /** file 타입일 때 허용 확장자 (예: ['.ts', '.tsx', '.js']) */
    accept?: string[];

    /** 필수 여부 */
    required: boolean;

    /** 입력 설명/힌트 */
    placeholder?: string;

    /** 유효성 검사 정규식 */
    validation?: string;
}
```

### 2.3 워크플로 정의

```typescript
/** 멀티스텝 실행 파이프라인 */
export interface JobWorkflow {
    /** 실행할 스텝 목록 (순서대로) */
    steps: JobStep[];

    /** 스텝 간 전역 설정 */
    settings: WorkflowSettings;
}

export interface WorkflowSettings {
    /** 최대 동시 실행 에이전트 수 */
    maxConcurrentAgents: number;

    /** 전체 타임아웃 (ms) — 기본 600000 (10분) */
    timeoutMs: number;

    /** 에러 발생 시 전략 */
    errorStrategy: 'stop' | 'skip' | 'retry' | 'ask_user';

    /** 최대 재시도 횟수 (errorStrategy가 'retry'일 때) */
    maxRetries: number;

    /** PTY 퍼미션 모드 */
    permissionMode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';
}

/** 워크플로 내 단일 실행 스텝 */
export interface JobStep {
    /** 스텝 고유 ID (워크플로 내에서 유니크) */
    id: string;

    /** 사용자에게 표시할 스텝 이름 */
    name: string;

    /** 이 스텝에 사용할 스킬 ID (.claude/skills/의 디렉토리명) */
    skillId: string;

    /** 이 스텝을 실행할 에이전트 ID (없으면 agent-recommender가 자동 배정) */
    agentId?: string;

    /** 프롬프트 템플릿 — {{input.키}}, {{step.이전스텝ID.output}} 등 변수 치환 */
    promptTemplate: string;

    /** 입력 매핑: 이전 스텝의 출력을 이 스텝의 입력으로 연결 */
    inputMapping: InputMapping[];

    /** 품질 게이트: 이 스텝 완료 후 통과 조건 */
    gate?: StepGate;

    /** 조건부 실행: 이전 스텝 결과에 따라 스킵 여부 */
    condition?: StepCondition;

    /** 스텝별 타임아웃 오버라이드 (ms) */
    timeoutMs?: number;

    /** 이 스텝의 Claude 모델 (기본: 에이전트 설정 따름) */
    model?: 'opus' | 'sonnet' | 'haiku';

    /** 실행 순서 제어 — 같은 order 값이면 병렬 실행 */
    executionOrder: number;
}

/** 스텝 간 입출력 매핑 */
export interface InputMapping {
    /** 이 스텝에서 사용할 변수명 */
    targetKey: string;

    /** 소스 종류 */
    source: 'job_input' | 'step_output' | 'literal';

    /** job_input이면 JobInput.key, step_output이면 "stepId.outputKey" */
    sourceRef: string;

    /** literal이면 고정값 */
    literalValue?: string;
}

/** 품질 게이트 — 스텝 완료 후 검증 */
export interface StepGate {
    /** 게이트 타입 */
    type:
        | 'auto_check'
        | 'user_approval'
        | 'regex_match'
        | 'file_exists'
        | 'exit_code';

    /** auto_check: 다른 에이전트가 결과를 검증 */
    reviewerAgentId?: string;

    /** regex_match: 출력에서 이 패턴이 매칭되어야 통과 */
    pattern?: string;

    /** file_exists: 이 파일이 존재해야 통과 */
    filePath?: string;

    /** 게이트 실패 시 행동 */
    onFail: 'retry_step' | 'abort_job' | 'ask_user' | 'skip';

    /** 게이트 실패 메시지 (사용자에게 표시) */
    failMessage?: string;
}

/** 조건부 실행 */
export interface StepCondition {
    /** 참조할 이전 스텝 ID */
    stepId: string;

    /** 조건 타입 */
    type: 'output_contains' | 'output_not_contains' | 'succeeded' | 'failed';

    /** output_contains/output_not_contains에서 매칭할 값 */
    value?: string;
}
```

### 2.4 출력 정의

```typescript
/** Job 완료 후 산출물 */
export interface JobOutput {
    /** 출력 변수명 */
    key: string;

    /** 사용자에게 표시할 라벨 */
    label: string;

    /** 출력 타입 */
    type: 'file' | 'text' | 'directory' | 'report';

    /** 출력 파일 경로 템플릿 ({{input.키}} 치환 가능) */
    pathTemplate?: string;

    /** 소스 스텝 ID */
    fromStepId: string;

    /** 스텝 출력에서 추출할 키 */
    outputKey: string;
}
```

### 2.5 메타데이터

```typescript
/** Job 메타데이터 — 난이도, 비용, 캐릭터 성장 연동 */
export interface JobMetadata {
    /** 난이도 등급 (E 가장 쉬움 ~ S 가장 어려움) */
    difficulty: JobDifficulty;

    /** 해금에 필요한 최소 캐릭터 레벨 */
    requiredLevel: number;

    /** 예상 실행 시간 (초) */
    estimatedTimeSeconds: number;

    /** 실행 비용 (게임 내 크레딧) */
    creditCost: number;

    /** 완료 시 획득 EXP */
    baseExpReward: number;

    /** 태그 (검색/필터용) */
    tags: string[];

    /** 선행 Job (이 Job을 한 번 이상 완료해야 해금) */
    prerequisiteJobIds: string[];

    /** 이 Job의 마스터리 데이터 (반복 실행 보너스) */
    mastery: MasteryConfig;
}

export type JobDifficulty = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

/** 난이도 ↔ 캐릭터 레벨 매핑 */
export const DIFFICULTY_LEVEL_MAP: Record<JobDifficulty, number> = {
    E: 1, // 모든 캐릭터 사용 가능
    D: 5, // apprentice 이상
    C: 10, // journeyman 이상
    B: 20, // expert 이상
    A: 35, // master 이상
    S: 50, // legendary 전용
};

/** 마스터리 설정 */
export interface MasteryConfig {
    /** 마스터리 최대 레벨 */
    maxLevel: number;

    /** 마스터리 레벨업에 필요한 완료 횟수 */
    completionsPerLevel: number;

    /** 레벨당 속도 보너스 (%) — 예: 5이면 마스터리 1렙마다 5% 빨라짐 */
    speedBonusPerLevel: number;

    /** 레벨당 EXP 보너스 (%) */
    expBonusPerLevel: number;
}
```

### 2.6 실행 상태

```typescript
/** Job 실행 인스턴스 — 실행 중/완료된 Job의 상태 */
export interface JobRun {
    /** 실행 인스턴스 ID */
    runId: string;

    /** Job 정의 ID */
    jobId: string;

    /** 실행 상태 */
    status: JobRunStatus;

    /** 사용자가 입력한 값 */
    inputValues: Record<string, unknown>;

    /** 각 스텝의 실행 상태 */
    stepRuns: StepRun[];

    /** 실행 시작 시점 */
    startedAt: number;

    /** 실행 완료 시점 */
    completedAt?: number;

    /** 총 소요 시간 (ms) */
    durationMs?: number;

    /** 에러 정보 (실패 시) */
    error?: string;

    /** 실행한 캐릭터 ID (마스터리 추적용) */
    executedByAgents: string[];

    /** 획득 EXP (마스터리 보너스 포함) */
    expEarned: number;
}

export type JobRunStatus =
    | 'pending' // 큐에서 대기 중
    | 'running' // 실행 중
    | 'paused' // 사용자가 일시정지
    | 'gate_waiting' // 품질 게이트에서 사용자 확인 대기
    | 'completed' // 성공 완료
    | 'failed' // 실패
    | 'cancelled'; // 사용자 취소

export interface StepRun {
    /** 스텝 ID (JobStep.id) */
    stepId: string;

    /** 스텝 상태 */
    status:
        | 'pending'
        | 'running'
        | 'completed'
        | 'failed'
        | 'skipped'
        | 'gate_waiting';

    /** 배정된 에이전트 ID */
    agentId: string;

    /** 실행된 프롬프트 (템플릿 치환 완료) */
    resolvedPrompt: string;

    /** 스텝 출력 (다음 스텝으로 전달) */
    output: Record<string, string>;

    /** 시작/종료 시점 */
    startedAt?: number;
    completedAt?: number;

    /** 재시도 횟수 */
    retryCount: number;

    /** 게이트 통과 여부 */
    gatePassed?: boolean;

    /** 에러 메시지 */
    error?: string;
}
```

---

## 3. 프롬프트 체이닝 패턴

### 3.1 기본 체인 (Sequential)

가장 단순한 패턴. 스텝 1의 출력이 스텝 2의 입력으로 이어진다.

```
[Input Form] → Step 1 (Agent A) → Step 2 (Agent B) → Step 3 (Agent C) → [Output]
```

**변수 치환 규칙**:

| 패턴                        | 설명               | 예시                                                |
| --------------------------- | ------------------ | --------------------------------------------------- |
| `{{input.키}}`              | 사용자 입력값      | `{{input.targetDir}}` → `/src/components`           |
| `{{step.스텝ID.output.키}}` | 이전 스텝 출력     | `{{step.analyze.output.report}}` → 분석 결과 텍스트 |
| `{{job.name}}`              | 현재 Job 이름      | `{{job.name}}` → "코드 생성"                        |
| `{{agent.name}}`            | 실행 에이전트 이름 | `{{agent.name}}` → "Rio"                            |
| `{{timestamp}}`             | 현재 시각 (ISO)    | `2026-03-26T12:00:00Z`                              |
| `{{cwd}}`                   | 프로젝트 디렉토리  | `/Users/dev/my-project`                             |

### 3.2 병렬 실행 (Parallel Fan-Out)

같은 `executionOrder` 값을 가진 스텝은 동시에 실행된다.

```
                ┌→ Step 2a (Agent A) ─┐
[Step 1] ──────┤                      ├──→ [Step 3: Merge]
                └→ Step 2b (Agent B) ─┘
```

```typescript
// Step 2a와 2b의 executionOrder가 같으면 병렬 실행
const steps: JobStep[] = [
    { id: 'plan',     executionOrder: 1, agentId: 'a01', ... },
    { id: 'frontend', executionOrder: 2, agentId: 'a03', ... },  // 병렬
    { id: 'backend',  executionOrder: 2, agentId: 'a02', ... },  // 병렬
    { id: 'review',   executionOrder: 3, agentId: 'a05', ... },  // 2a+2b 완료 후
];
```

### 3.3 조건 분기 (Conditional Branch)

`StepCondition`으로 스텝 실행 여부를 제어한다.

```
              ┌─ [condition: has_tests] → Step: Run Tests ──┐
[Step: Analyze] ─┤                                           ├→ [Step: Report]
              └─ [condition: no_tests]  → Step: Write Tests ─┘
```

```typescript
{
    id: 'run-tests',
    condition: {
        stepId: 'analyze',
        type: 'output_contains',
        value: 'test files found',
    },
    // analyze 스텝 출력에 "test files found"가 있을 때만 실행
}
```

### 3.4 품질 게이트 (Gate)

스텝 완료 후 결과를 검증한다. 실패 시 재시도, 중단, 또는 사용자 확인을 요청한다.

```
[Step: Generate Code] → [Gate: Code Review] → [Step: Write Tests]
                              │
                              ├─ pass → 다음 스텝으로
                              ├─ fail (retry_step) → Step 재실행
                              ├─ fail (ask_user) → 사용자 확인 대기
                              └─ fail (abort_job) → Job 중단
```

**게이트 타입별 동작**:

| 타입            | 동작                                  | 사용 시나리오                   |
| --------------- | ------------------------------------- | ------------------------------- |
| `auto_check`    | 다른 에이전트(reviewer)가 결과를 검증 | 코드 리뷰, 문서 검토            |
| `user_approval` | 사용자에게 결과를 보여주고 승인/거부  | 최종 산출물 확인                |
| `regex_match`   | 출력에서 특정 패턴 매칭               | 테스트 통과 여부 (`\d+ passed`) |
| `file_exists`   | 특정 파일이 생성되었는지 확인         | 빌드 결과물 존재 여부           |
| `exit_code`     | PTY 종료 코드 확인                    | 빌드/테스트 실행 성공 여부      |

### 3.5 에러 핸들링 및 롤백

```
ErrorStrategy별 동작:

stop      → 즉시 중단, 실행된 스텝까지의 결과 보존, 사용자에게 에러 리포트
skip      → 실패한 스텝 건너뛰고 다음 스텝 진행, 경고 표시
retry     → maxRetries까지 재시도, 모두 실패하면 stop으로 폴백
ask_user  → 사용자에게 선택지 표시: [재시도] [건너뛰기] [중단]
```

**롤백 메커니즘**:

- 각 스텝 시작 전 `git stash` 또는 `git checkpoint`로 현재 상태 저장
- 에러 발생 시 `git stash pop` 또는 `git checkout`으로 롤백
- 파일 생성 스텝은 생성된 파일 목록을 기록, 롤백 시 삭제
- 롤백은 자동이 아닌 사용자 확인 후 수행 (의도치 않은 데이터 손실 방지)

---

## 4. 빌트인 Job 프리셋 6개

기존 `workflow-pack.ts`의 6개 팩을 실행 가능한 Job으로 변환한다.

### 4.1 코드 생성 Job (`job-code-gen`)

> **기반 팩**: `dev` (개발 팩)
> **난이도**: C | **레벨**: 10 | **예상 시간**: 300s | **EXP**: 150

**입력**:

- `description` (textarea, 필수): 생성할 기능 설명
- `targetDir` (directory, 필수): 코드 생성 대상 디렉토리
- `language` (select, 필수): TypeScript / Python / Go / Rust
- `includeTests` (boolean, 기본 true): 테스트 코드 포함 여부

**워크플로 (5 스텝)**:

| 순서 | 스텝 ID     | 에이전트   | 스킬        | 설명                           |
| ---- | ----------- | ---------- | ----------- | ------------------------------ |
| 1    | `plan`      | Sera (a01) | -           | 기능 분석 + 구현 계획 수립     |
| 2    | `implement` | Rio (a02)  | code-review | 코드 구현                      |
| 3    | `test`      | Ara (a05)  | run-tests   | 테스트 작성 + 실행             |
| 4    | `review`    | Podo (a16) | code-review | 코드 리뷰 (게이트: auto_check) |
| 5    | `refine`    | Rio (a02)  | -           | 리뷰 피드백 반영               |

```typescript
{
    id: 'job-code-gen',
    name: '코드 생성',
    icon: '💻',
    category: 'development',
    workflow: {
        steps: [
            {
                id: 'plan',
                name: '기능 분석 및 계획',
                skillId: '',
                agentId: 'a01',  // Sera
                promptTemplate: `다음 기능을 구현하기 위한 상세 계획을 수립해줘.

기능 설명: {{input.description}}
대상 디렉토리: {{input.targetDir}}
언어: {{input.language}}

다음을 포함해서 계획을 작성해:
1. 파일 구조
2. 핵심 함수/클래스 목록
3. 의존성
4. 에지 케이스`,
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 'implement',
                name: '코드 구현',
                skillId: 'code-review',
                agentId: 'a02',  // Rio
                promptTemplate: `다음 계획에 따라 코드를 구현해줘.

계획:
{{step.plan.output.result}}

대상 디렉토리: {{input.targetDir}}
언어: {{input.language}}

기존 코드 스타일을 따르고, 타입 안전하게 작성해.`,
                inputMapping: [
                    { targetKey: 'plan', source: 'step_output', sourceRef: 'plan.result' },
                ],
                executionOrder: 2,
            },
            {
                id: 'test',
                name: '테스트 작성 및 실행',
                skillId: 'run-tests',
                agentId: 'a05',  // Ara
                promptTemplate: `구현된 코드에 대한 테스트를 작성하고 실행해줘.

구현 내용:
{{step.implement.output.result}}

대상 디렉토리: {{input.targetDir}}

단위 테스트와 엣지 케이스를 포함해.`,
                inputMapping: [
                    { targetKey: 'code', source: 'step_output', sourceRef: 'implement.result' },
                ],
                condition: {
                    stepId: '__input__',
                    type: 'output_contains',
                    value: 'includeTests:true',
                },
                executionOrder: 3,
            },
            {
                id: 'review',
                name: '코드 리뷰',
                skillId: 'code-review',
                agentId: 'a16',  // Podo
                promptTemplate: `다음 구현을 리뷰해줘. 버그, 보안, 성능, 코드 품질을 점검해.

{{step.implement.output.result}}`,
                inputMapping: [
                    { targetKey: 'code', source: 'step_output', sourceRef: 'implement.result' },
                ],
                gate: {
                    type: 'auto_check',
                    reviewerAgentId: 'a16',
                    onFail: 'retry_step',
                    failMessage: '코드 리뷰에서 문제가 발견되었습니다.',
                },
                executionOrder: 4,
            },
            {
                id: 'refine',
                name: '리뷰 피드백 반영',
                skillId: '',
                agentId: 'a02',  // Rio
                promptTemplate: `코드 리뷰 피드백을 반영해줘.

리뷰 결과:
{{step.review.output.result}}

원본 코드 위치: {{input.targetDir}}`,
                inputMapping: [
                    { targetKey: 'feedback', source: 'step_output', sourceRef: 'review.result' },
                ],
                executionOrder: 5,
            },
        ],
        settings: {
            maxConcurrentAgents: 5,
            timeoutMs: 600_000,
            errorStrategy: 'ask_user',
            maxRetries: 2,
            permissionMode: 'acceptEdits',
        },
    },
    metadata: {
        difficulty: 'C',
        requiredLevel: 10,
        estimatedTimeSeconds: 300,
        creditCost: 50,
        baseExpReward: 150,
        tags: ['개발', 'code', 'generation', '코드생성'],
        prerequisiteJobIds: [],
        mastery: {
            maxLevel: 10,
            completionsPerLevel: 3,
            speedBonusPerLevel: 5,
            expBonusPerLevel: 3,
        },
    },
}
```

### 4.2 리포트 작성 Job (`job-report`)

> **기반 팩**: `report` (리포트 팩)
> **난이도**: D | **레벨**: 5 | **예상 시간**: 180s | **EXP**: 80

**입력**:

- `topic` (text, 필수): 리포트 주제
- `scope` (select): 전체 프로젝트 / 특정 디렉토리 / Git 변경분
- `targetDir` (directory): 분석 대상 (scope에 따라)
- `format` (select): Markdown / HTML / PDF

**워크플로 (4 스텝)**:

| 순서 | 스텝 ID   | 에이전트   | 설명                                            |
| ---- | --------- | ---------- | ----------------------------------------------- |
| 1    | `gather`  | Alex (a04) | 프로젝트 데이터 수집 (코드 통계, git log, 구조) |
| 2    | `analyze` | Alex (a04) | 수집 데이터 분석 + 인사이트 도출                |
| 3    | `write`   | Bomi (a09) | 리포트 문서 작성 (Mermaid 다이어그램 포함)      |
| 4    | `review`  | Sera (a01) | 최종 검토 + 포맷팅 (게이트: user_approval)      |

```typescript
{
    id: 'job-report',
    name: '리포트 작성',
    icon: '📊',
    category: 'report',
    inputs: [
        { key: 'topic', label: '리포트 주제', type: 'text', required: true, placeholder: '예: Q1 프로젝트 진행 현황' },
        { key: 'scope', label: '분석 범위', type: 'select', required: true, options: [
            { value: 'full', label: '전체 프로젝트' },
            { value: 'directory', label: '특정 디렉토리' },
            { value: 'git_diff', label: 'Git 변경분' },
        ]},
        { key: 'targetDir', label: '대상 디렉토리', type: 'directory', required: false },
        { key: 'format', label: '출력 형식', type: 'select', required: true, options: [
            { value: 'md', label: 'Markdown' },
            { value: 'html', label: 'HTML' },
        ]},
    ],
    workflow: {
        steps: [
            {
                id: 'gather',
                name: '데이터 수집',
                skillId: '',
                agentId: 'a04',  // Alex
                promptTemplate: `프로젝트 분석을 위한 데이터를 수집해줘.

주제: {{input.topic}}
범위: {{input.scope}}
디렉토리: {{input.targetDir}}

수집할 항목:
- 파일 구조 및 코드 통계 (cloc 또는 직접 카운트)
- git log (최근 30일)
- 주요 의존성 목록
- TODO/FIXME 항목`,
                inputMapping: [],
                executionOrder: 1,
            },
            {
                id: 'analyze',
                name: '데이터 분석',
                skillId: '',
                agentId: 'a04',  // Alex
                promptTemplate: `수집된 데이터를 분석해서 핵심 인사이트를 도출해줘.

수집 데이터:
{{step.gather.output.result}}

분석 관점:
- 코드 품질 트렌드
- 핫스팟 (변경 빈도 높은 파일)
- 기술 부채 추정
- 팀 생산성 지표`,
                inputMapping: [
                    { targetKey: 'data', source: 'step_output', sourceRef: 'gather.result' },
                ],
                executionOrder: 2,
            },
            {
                id: 'write',
                name: '리포트 작성',
                skillId: '',
                agentId: 'a09',  // Bomi
                promptTemplate: `분석 결과를 기반으로 리포트를 작성해줘.

주제: {{input.topic}}
형식: {{input.format}}

분석 결과:
{{step.analyze.output.result}}

포함할 섹션:
1. 요약 (Executive Summary)
2. 주요 발견사항
3. 데이터 시각화 (Mermaid 차트/다이어그램)
4. 권장 사항
5. 부록`,
                inputMapping: [
                    { targetKey: 'analysis', source: 'step_output', sourceRef: 'analyze.result' },
                ],
                executionOrder: 3,
            },
            {
                id: 'review',
                name: '최종 검토',
                skillId: '',
                agentId: 'a01',  // Sera
                promptTemplate: `리포트를 최종 검토해줘.

{{step.write.output.result}}

확인 항목:
- 내용 정확성
- 문법/맞춤법
- 구조 완결성
- 시각화 데이터 정합성`,
                inputMapping: [
                    { targetKey: 'report', source: 'step_output', sourceRef: 'write.result' },
                ],
                gate: {
                    type: 'user_approval',
                    onFail: 'ask_user',
                    failMessage: '리포트를 확인해주세요.',
                },
                executionOrder: 4,
            },
        ],
        settings: {
            maxConcurrentAgents: 3,
            timeoutMs: 600_000,
            errorStrategy: 'ask_user',
            maxRetries: 1,
            permissionMode: 'plan',
        },
    },
    metadata: {
        difficulty: 'D',
        requiredLevel: 5,
        estimatedTimeSeconds: 180,
        creditCost: 30,
        baseExpReward: 80,
        tags: ['리포트', 'report', '문서', '분석'],
        prerequisiteJobIds: [],
        mastery: {
            maxLevel: 8,
            completionsPerLevel: 3,
            speedBonusPerLevel: 4,
            expBonusPerLevel: 2,
        },
    },
}
```

### 4.3 소설 집필 Job (`job-novel`)

> **기반 팩**: `novel` (소설/창작 팩)
> **난이도**: C | **레벨**: 10 | **예상 시간**: 600s | **EXP**: 200

**입력**:

- `genre` (select): 판타지 / SF / 로맨스 / 미스터리 / 호러 / 자유
- `premise` (textarea, 필수): 작품 전제/줄거리 개요
- `chapters` (number, 기본 5): 목표 챕터 수
- `tone` (select): 경쾌 / 진지 / 유머 / 어두운
- `outputDir` (directory, 필수): 원고 저장 위치

**워크플로 (5 스텝)**:

| 순서 | 스텝 ID      | 에이전트   | 설명                                  |
| ---- | ------------ | ---------- | ------------------------------------- |
| 1    | `worldbuild` | Bomi (a09) | 세계관, 캐릭터 프로필, 설정 문서 작성 |
| 2    | `outline`    | Sera (a01) | 전체 플롯 아웃라인 + 챕터별 시놉시스  |
| 3    | `draft`      | Bomi (a09) | 챕터별 초고 집필                      |
| 4    | `edit`       | Hana (a07) | 문체 교정, 일관성 검토, 페이싱 조절   |
| 5    | `finalize`   | Bomi (a09) | 최종 원고 정리 + 목차 생성            |

### 4.4 영상 기획 Job (`job-video`)

> **기반 팩**: `video` (영상 제작 팩)
> **난이도**: C | **레벨**: 10 | **예상 시간**: 360s | **EXP**: 120

**입력**:

- `videoType` (select): 유튜브 / 쇼츠 / 리뷰 / 튜토리얼 / 브이로그
- `topic` (textarea, 필수): 영상 주제
- `duration` (select): 1분 / 5분 / 10분 / 20분+
- `style` (text): 영상 스타일/톤 설명

**워크플로 (6 스텝)**:

| 순서 | 스텝 ID         | 에이전트   | 설명                            |
| ---- | --------------- | ---------- | ------------------------------- |
| 1    | `research`      | Alex (a04) | 주제 리서치 + 경쟁 영상 분석    |
| 2    | `script`        | Bomi (a09) | 스크립트(대본) 작성             |
| 3    | `storyboard`    | Hana (a07) | 씬별 스토리보드 + 비주얼 노트   |
| 4    | `review-script` | Sera (a01) | 스크립트 리뷰 + 피드백 (게이트) |
| 5    | `thumbnail`     | Luna (a03) | 썸네일 컨셉 + 제목/태그 최적화  |
| 6    | `checklist`     | Sera (a01) | 제작 체크리스트 + 타임라인 산출 |

### 4.5 웹 리서치 Job (`job-web-research`)

> **기반 팩**: `web_research` (웹 리서치 팩)
> **난이도**: D | **레벨**: 5 | **예상 시간**: 240s | **EXP**: 100

**입력**:

- `query` (textarea, 필수): 조사할 주제/질문
- `depth` (select): 개요(5분) / 표준(15분) / 심층(30분)
- `sources` (number, 기본 10): 목표 소스 수
- `outputFormat` (select): 요약 리포트 / 비교 테이블 / 마인드맵

**워크플로 (4 스텝)**:

| 순서 | 스텝 ID      | 에이전트    | 설명                                     |
| ---- | ------------ | ----------- | ---------------------------------------- |
| 1    | `search`     | Alex (a04)  | 웹 검색 + 소스 수집 (WebSearch MCP 활용) |
| 2    | `extract`    | Jelly (a12) | 각 소스에서 핵심 정보 추출 + 팩트체크    |
| 3    | `synthesize` | Bomi (a09)  | 수집 정보 종합 + 인사이트 도출           |
| 4    | `format`     | Alex (a04)  | 출력 형식에 맞게 최종 문서화             |

### 4.6 역할극 Job (`job-roleplay`)

> **기반 팩**: `roleplay` (롤플레이 팩)
> **난이도**: B | **레벨**: 20 | **예상 시간**: 480s | **EXP**: 180

**입력**:

- `scenario` (textarea, 필수): 시나리오 설명
- `roles` (textarea, 필수): 역할 배분 (에이전트명: 역할)
- `rounds` (number, 기본 3): 토론/시뮬레이션 라운드 수
- `objective` (text): 토론 목표/결론 도출 조건

**워크플로 (4 스텝)**:

| 순서 | 스텝 ID    | 에이전트   | 설명                                                 |
| ---- | ---------- | ---------- | ---------------------------------------------------- |
| 1    | `setup`    | Sera (a01) | 시나리오 해석 + 에이전트별 역할 브리핑               |
| 2    | `simulate` | (복수)     | 라운드별 토론/시뮬레이션 실행 (Meeting Manager 연동) |
| 3    | `analyze`  | Namu (a21) | 토론 결과 분석 + 합의점/쟁점 정리                    |
| 4    | `report`   | Bomi (a09) | 최종 보고서 작성 (라운드별 요약 + 결론)              |

---

## 5. Job Runner 설계

### 5.1 아키텍처 개요

```
┌─────────────────────────────────────────────────────────┐
│                     JobRunner (Main Process)             │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ JobQueue  │→│ StepExec  │→│ GateEval  │               │
│  │ (enqueue, │  │ (resolve  │  │ (check,   │               │
│  │  dequeue) │  │  prompt,  │  │  approve, │               │
│  │           │  │  dispatch)│  │  retry)   │               │
│  └──────────┘  └──────────┘  └──────────┘               │
│       ↕              ↕              ↕                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │              TaskScheduler (기존)                  │   │
│  │  - 우선순위 큐 (critical>high>medium>low)         │   │
│  │  - 동시성 제어 (maxConcurrent)                    │   │
│  └──────────────────────────────────────────────────┘   │
│       ↕                                                  │
│  ┌──────────────────────────────────────────────────┐   │
│  │              PTY Layer                             │   │
│  │  - 에이전트별 PTY 세션                             │   │
│  │  - 프롬프트 → terminal:write → PTY stdin           │   │
│  │  - PTY stdout → pty-parser → 이벤트                │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         ↕ IPC
┌─────────────────────────────────────────────────────────┐
│                   Renderer Process                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │JobLauncher│  │JobMonitor │  │JobBuilder │               │
│  │ (입력폼   │  │ (진행률   │  │ (에디터   │               │
│  │  + 실행)  │  │  + 로그)  │  │  + 커스텀)│               │
│  └──────────┘  └──────────┘  └──────────┘               │
└─────────────────────────────────────────────────────────┘
```

### 5.2 JobRunner 클래스

```typescript
// electron/job-runner.ts

export class JobRunner {
    private activeRuns = new Map<string, JobRun>();
    private scheduler: TaskScheduler;
    private store: ElectronStore;

    constructor(scheduler: TaskScheduler, store: ElectronStore) {
        this.scheduler = scheduler;
        this.store = store;
    }

    /**
     * Job 실행 시작
     * 1. JobDefinition 조회
     * 2. 입력값 검증
     * 3. JobRun 인스턴스 생성
     * 4. 스텝 순차/병렬 실행 시작
     */
    async run(jobId: string, inputValues: Record<string, unknown>): Promise<string> {
        // runId 생성, activeRuns에 등록
        // 스텝을 executionOrder 순서로 그룹화
        // 각 그룹을 순차 실행 (그룹 내 스텝은 병렬)
    }

    /**
     * 단일 스텝 실행
     * 1. condition 체크 → 스킵 여부 결정
     * 2. promptTemplate 변수 치환
     * 3. 에이전트 PTY에 프롬프트 전송
     * 4. 응답 대기 + 파싱
     * 5. gate 체크 → 통과/재시도/중단
     * 6. 출력 저장
     */
    private async executeStep(run: JobRun, step: JobStep): Promise<StepRun> { ... }

    /**
     * 프롬프트 템플릿 변수 치환
     */
    private resolvePrompt(
        template: string,
        inputValues: Record<string, unknown>,
        stepOutputs: Record<string, Record<string, string>>,
        context: { jobName: string; agentName: string; cwd: string },
    ): string { ... }

    /**
     * 게이트 평가
     */
    private async evaluateGate(gate: StepGate, stepRun: StepRun): Promise<boolean> { ... }

    /** Job 일시정지 */
    pause(runId: string): void { ... }

    /** Job 재개 */
    resume(runId: string): void { ... }

    /** Job 취소 */
    cancel(runId: string): void { ... }

    /** 진행률 조회 (0-100) */
    getProgress(runId: string): number { ... }

    /** 실행 히스토리 조회 */
    getHistory(limit?: number): JobRun[] { ... }
}
```

### 5.3 프롬프트 → PTY 명령 변환

Job의 각 스텝은 결국 PTY에 텍스트를 쓰는 것으로 실행된다. 기존 채팅-터미널 PTY 공유 아키텍처를 활용:

```typescript
async function dispatchStepToPty(
    agentId: string,
    resolvedPrompt: string,
    tabId: string,
): Promise<string> {
    const api = window.dogbaApi?.terminal;
    if (!api) throw new Error('Terminal API not available');

    // 1. 에이전트 PTY 탭으로 프롬프트 전송
    //    주의: ink TUI에서 텍스트와 \r을 분리 전송해야 함 (50ms 딜레이)
    await api.write(tabId, resolvedPrompt);
    await new Promise((r) => setTimeout(r, 50));
    await api.write(tabId, '\r');

    // 2. PTY stdout 이벤트를 구독하여 응답 수집
    //    parsePtyChunk로 파싱 → 'success' 또는 'prompt' 이벤트까지 대기
    return collectResponse(tabId);
}
```

### 5.4 큐 관리 (TaskScheduler 연동)

```typescript
// Job의 각 스텝을 TaskScheduler에 ScheduledTask로 등록
function enqueueStepAsTask(step: JobStep, jobPriority: TaskPriority): string {
    return scheduler.enqueue({
        description: `[Job] ${step.name}`,
        priority: jobPriority,
        assignedAgent: step.agentId,
    });
}
```

**우선순위 매핑**:

| Job 난이도 | TaskPriority | 이유                          |
| ---------- | ------------ | ----------------------------- |
| S, A       | critical     | 고레벨 캐릭터 전용, 중요 작업 |
| B, C       | high         | 표준 개발/창작 작업           |
| D          | medium       | 기본 리서치/리포트            |
| E          | low          | 입문 작업                     |

### 5.5 진행률 추적

```typescript
interface JobProgress {
    runId: string;
    jobName: string;
    overallPercent: number; // 전체 진행률 (0-100)
    currentStep: string; // 현재 실행 중인 스텝 이름
    completedSteps: number; // 완료된 스텝 수
    totalSteps: number; // 전체 스텝 수
    stepProgress: StepProgress[]; // 각 스텝별 상태
    elapsedMs: number; // 경과 시간
    estimatedRemainingMs: number; // 예상 남은 시간
}

interface StepProgress {
    stepId: string;
    stepName: string;
    status: StepRun['status'];
    agentId: string;
    agentName: string;
    percent: number; // 0-100 (PTY 파서 이벤트 기반 추정)
}
```

진행률은 IPC `job:onProgress` 이벤트로 renderer에 실시간 전달된다 (100ms throttle).

---

## 6. 커스텀 Job 에디터 (JobBuilder)

### 6.1 비주얼 노드 에디터

Flowise / n8n 스타일의 노드 기반 워크플로 에디터. 사용자가 코드 없이 Job을 설계할 수 있다.

```
┌─────────────────────────────────────────────────────────────────┐
│ JobBuilder                                                [X]   │
├─────────────┬───────────────────────────────────────────────────┤
│  Skill      │                                                   │
│  Palette    │   [Input] ─────→ [Plan] ─────→ [Implement]        │
│             │                                      │             │
│  ☐ code-    │                               [Review] ←──┘       │
│    review   │                                      │             │
│  ☐ run-     │                               [Output] ←──┘       │
│    tests    │                                                   │
│  ☐ security │   ┌─────────────────────────────────────┐        │
│    -audit   │   │ Step Properties (selected node)     │        │
│  ☐ ...      │   │ Agent: [Rio ▾]                      │        │
│             │   │ Skill: [code-review ▾]              │        │
│  Agent      │   │ Prompt: [                      ]    │        │
│  Palette    │   │ Gate: [auto_check ▾]                │        │
│             │   │ Timeout: [60s]                      │        │
│  🐱 Sera    │   └─────────────────────────────────────┘        │
│  🐹 Rio     │                                                   │
│  🐶 Luna    │   [Simulate] [Save] [Run]                        │
│  ...        │                                                   │
└─────────────┴───────────────────────────────────────────────────┘
```

### 6.2 핵심 기능

**노드 타입**:

- **Input Node**: Job 입력 정의 (사용자에게 받을 값)
- **Step Node**: 실행 스텝 (스킬 + 에이전트 + 프롬프트)
- **Gate Node**: 품질 검증 노드 (스텝에 부착 또는 독립)
- **Branch Node**: 조건 분기 (이전 출력에 따라 경로 선택)
- **Output Node**: 최종 산출물 정의

**드래그 & 드롭**:

- 왼쪽 팔레트에서 스킬/에이전트를 캔버스로 드래그하면 Step Node 자동 생성
- 노드 간 연결선(엣지)으로 입출력 매핑 시각화
- 연결선 드래그로 스텝 순서 변경

**프로퍼티 패널**:

- 노드 선택 시 하단 또는 우측에 프로퍼티 패널 표시
- 에이전트 선택, 스킬 선택, 프롬프트 편집, 게이트 설정 등

### 6.3 시뮬레이션 / 미리보기

실행 전에 워크플로를 검증하는 기능:

1. **Dry Run**: 실제 PTY 실행 없이 변수 치환 결과만 표시
    - 각 스텝의 resolvedPrompt를 미리 확인
    - 입력 매핑이 올바르게 연결되었는지 검증
2. **Flow Validation**:
    - 순환 참조 감지 (DAG 검증)
    - 미연결 입력/출력 경고
    - 존재하지 않는 스킬/에이전트 참조 경고
3. **Cost Estimation**:
    - 예상 토큰 소비량 (프롬프트 길이 기반)
    - 예상 실행 시간 (에이전트 히스토리 기반)
    - 예상 크레딧 비용

### 6.4 구현 기술

- 캔버스: **React Flow** (또는 직접 Canvas/SVG 구현, 번들 크기 고려)
- 상태 관리: Zustand `useJobBuilderStore` (비영속, 에디터 세션 only)
- 저장: `electron-store`에 JobDefinition으로 직렬화

---

## 7. Job 자동 제안

### 7.1 반복 패턴 감지 (Pattern Detector)

사용자의 작업 패턴을 분석하여 "이 작업을 Job으로 만들까요?"를 제안한다.

```typescript
// electron/job-pattern-detector.ts

export interface PatternDetection {
    /** 감지된 패턴 설명 */
    description: string;
    /** 패턴에 매칭되는 최근 히스토리 항목 수 */
    matchCount: number;
    /** 패턴 신뢰도 (0-1) */
    confidence: number;
    /** 제안할 Job 템플릿 (자동 생성) */
    suggestedJob: Partial<JobDefinition>;
}

export class JobPatternDetector {
    /**
     * 최근 N개의 TaskHistoryEntry를 분석하여 반복 패턴 감지
     *
     * 감지 기준:
     * 1. 동일한 toolsUsed 조합이 3회 이상 반복
     * 2. 동일한 에이전트 순서로 작업이 3회 이상 반복
     * 3. 동일한 파일 패턴에 대한 작업이 3회 이상 반복
     */
    detect(history: TaskHistoryEntry[], minOccurrences: number = 3): PatternDetection[] { ... }
}
```

**감지 알고리즘**:

1. **Tool Sequence Hashing**: `taskHistory`에서 `toolsUsed` 배열을 정렬 후 해시하여 동일 패턴 그룹화
2. **Agent Sequence Matching**: 연속된 작업에서 에이전트 순서가 반복되는 패턴 감지
3. **Temporal Clustering**: 시간적으로 근접한 작업 클러스터를 식별하여 "세션" 단위로 패턴 추출
4. **Confidence Scoring**: `matchCount / totalHistory * 0.6 + toolOverlap * 0.4`

### 7.2 제안 플로우

```
사용자 작업 완료
    ↓
PatternDetector.detect() (백그라운드, 30초 주기)
    ↓
confidence >= 0.7인 패턴 발견
    ↓
Toast 알림: "비슷한 작업을 3번 하셨네요. Job으로 만들까요?"
    ↓
[만들기] → JobBuilder에 suggestedJob 프리필 → 사용자 편집 → 저장
[무시]   → 이 패턴 24시간 동안 재제안 안 함
```

### 7.3 캐릭터 성장 연동

캐릭터 레벨에 따라 사용 가능한 Job이 달라진다:

| 진화 단계  | 레벨 범위 | 해금 난이도   | 예시                            |
| ---------- | --------- | ------------- | ------------------------------- |
| Novice     | 1-4       | E만           | 기본 파일 정리                  |
| Apprentice | 5-9       | E, D          | 리포트 작성, 웹 리서치          |
| Journeyman | 10-19     | E, D, C       | 코드 생성, 소설 집필, 영상 기획 |
| Expert     | 20-34     | E, D, C, B    | 역할극, 복잡한 분석             |
| Master     | 35-49     | E, D, C, B, A | 멀티프로젝트 관리               |
| Legendary  | 50+       | 전체 (S 포함) | 자율 에이전트 파이프라인        |

해금 조건 확인:

```typescript
function canRunJob(
    job: JobDefinition,
    agentProfile: AgentGrowthProfile,
): boolean {
    const reqLevel = DIFFICULTY_LEVEL_MAP[job.metadata.difficulty];
    return agentProfile.level >= reqLevel;
}
```

---

## 8. Job 마스터리 시스템

### 8.1 개념

같은 Job을 반복 실행하면 해당 Job에 대한 **숙련도**가 올라간다. 숙련도가 높을수록 실행 속도가 빨라지고 보상이 증가한다.

### 8.2 마스터리 레벨

```
마스터리 0 (견습)  → 기본 속도, 기본 EXP
마스터리 1 (입문)  → 5% 빠름, 3% 추가 EXP
마스터리 2 (숙련)  → 10% 빠름, 6% 추가 EXP
...
마스터리 5 (전문가) → 25% 빠름, 15% 추가 EXP
마스터리 10 (달인)  → 50% 빠름, 30% 추가 EXP
```

### 8.3 마스터리 데이터 구조

```typescript
/** 에이전트별 Job 마스터리 기록 */
export interface JobMastery {
    jobId: string;
    agentId: string;
    level: number;
    totalCompletions: number;
    totalExpEarned: number;
    averageDurationMs: number;
    bestDurationMs: number;
    lastCompletedAt: number;
    /** 연속 성공 횟수 (실패하면 리셋) */
    streak: number;
}
```

### 8.4 마스터리 보너스 계산

```typescript
function calculateMasteryBonus(
    mastery: JobMastery,
    config: MasteryConfig,
): {
    speedMultiplier: number; // 1.0 = 기본, 0.75 = 25% 빠름
    expMultiplier: number; // 1.0 = 기본, 1.30 = 30% 추가
} {
    const speedBonus = Math.min(
        (mastery.level * config.speedBonusPerLevel) / 100,
        0.5, // 최대 50% 감소
    );
    const expBonus = Math.min(
        (mastery.level * config.expBonusPerLevel) / 100,
        0.5, // 최대 50% 추가
    );
    return {
        speedMultiplier: 1 - speedBonus,
        expMultiplier: 1 + expBonus,
    };
}
```

### 8.5 마스터리 시각화

파티 프레임(PartyFrame)과 JobLauncher에서 마스터리 레벨을 표시:

- 별 아이콘 (0~5개) + 색상 변화
- Job 카드에 "숙련도: ★★★☆☆" 표시
- 에이전트 프로필에 "달인 Job 목록" 섹션

---

## 9. 저장소 설계

### 9.1 electron-store 구조

```typescript
// electron-store 키 구조

interface JobStore {
    /** Job 정의 목록 (빌트인 + 커스텀) */
    'dokba-jobs': JobDefinition[];

    /** Job 실행 히스토리 (최근 100건) */
    'dokba-job-runs': JobRun[];

    /** 에이전트별 Job 마스터리 */
    'dokba-job-mastery': JobMastery[];

    /** 패턴 감지 무시 목록 (패턴 해시 → 무시 만료시각) */
    'dokba-job-pattern-ignore': Record<string, number>;
}
```

### 9.2 데이터 라이프사이클

| 데이터        | 생성                      | 수정          | 삭제               | 최대 보관         |
| ------------- | ------------------------- | ------------- | ------------------ | ----------------- |
| JobDefinition | 빌트인 부팅시/사용자 생성 | 사용자 편집   | 커스텀만 삭제 가능 | 무제한            |
| JobRun        | job:run 실행 시           | 스텝 완료마다 | 수동 정리          | 최근 100건        |
| JobMastery    | 첫 완료 시                | 매 완료마다   | 에이전트 리셋 시   | 에이전트당 무제한 |

### 9.3 마이그레이션

기존 `workflow-pack.ts`의 6개 팩은 앱 최초 실행 시 자동으로 `dokba-jobs`에 빌트인 Job으로 변환된다. 기존 WorkflowPack 데이터는 그대로 유지 (하위 호환).

---

## 10. IPC 채널 설계

### 10.1 채널 목록

```typescript
// preload.ts — job API 그룹

interface JobAPI {
    /** Job 카탈로그 조회 (빌트인 + 커스텀) */
    getCatalog(): Promise<JobDefinition[]>;

    /** 특정 Job 조회 */
    get(jobId: string): Promise<JobDefinition | null>;

    /** 커스텀 Job 생성 */
    create(
        job: Omit<JobDefinition, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<JobDefinition>;

    /** Job 수정 */
    update(
        jobId: string,
        patch: Partial<JobDefinition>,
    ): Promise<JobDefinition>;

    /** 커스텀 Job 삭제 */
    delete(jobId: string): Promise<boolean>;

    /** Job 실행 시작 */
    run(jobId: string, inputs: Record<string, unknown>): Promise<string>; // runId

    /** Job 일시정지 */
    pause(runId: string): Promise<void>;

    /** Job 재개 */
    resume(runId: string): Promise<void>;

    /** Job 취소 */
    stop(runId: string): Promise<void>;

    /** 실행 히스토리 조회 */
    getHistory(limit?: number): Promise<JobRun[]>;

    /** 특정 실행 인스턴스 조회 */
    getRun(runId: string): Promise<JobRun | null>;

    /** Job 자동 제안 (패턴 감지 결과) */
    suggest(): Promise<PatternDetection[]>;

    /** 마스터리 조회 */
    getMastery(agentId: string, jobId?: string): Promise<JobMastery[]>;

    /** 진행률 구독 */
    onProgress(callback: (progress: JobProgress) => void): () => void;

    /** 게이트 대기 알림 구독 */
    onGateWaiting(
        callback: (data: {
            runId: string;
            stepId: string;
            gate: StepGate;
        }) => void,
    ): () => void;

    /** 게이트 응답 (user_approval 타입) */
    approveGate(
        runId: string,
        stepId: string,
        approved: boolean,
    ): Promise<void>;
}
```

### 10.2 IPC 핸들러 등록

```typescript
// main.ts에 추가할 핸들러

ipcMain.handle('job:getCatalog', () => jobRunner.getCatalog());
ipcMain.handle('job:get', (_, jobId: string) => jobRunner.getJob(jobId));
ipcMain.handle('job:create', (_, job) => jobRunner.createJob(job));
ipcMain.handle('job:update', (_, jobId, patch) =>
    jobRunner.updateJob(jobId, patch),
);
ipcMain.handle('job:delete', (_, jobId) => jobRunner.deleteJob(jobId));
ipcMain.handle('job:run', (_, jobId, inputs) => jobRunner.run(jobId, inputs));
ipcMain.handle('job:pause', (_, runId) => jobRunner.pause(runId));
ipcMain.handle('job:resume', (_, runId) => jobRunner.resume(runId));
ipcMain.handle('job:stop', (_, runId) => jobRunner.cancel(runId));
ipcMain.handle('job:getHistory', (_, limit) => jobRunner.getHistory(limit));
ipcMain.handle('job:getRun', (_, runId) => jobRunner.getRun(runId));
ipcMain.handle('job:suggest', () => patternDetector.detect(getRecentHistory()));
ipcMain.handle('job:getMastery', (_, agentId, jobId) =>
    jobRunner.getMastery(agentId, jobId),
);
ipcMain.handle('job:approveGate', (_, runId, stepId, approved) =>
    jobRunner.approveGate(runId, stepId, approved),
);

// Event subscriptions (renderer → main)
// progress와 gateWaiting은 main에서 webContents.send()로 push
```

### 10.3 electron.d.ts 타입 추가

```typescript
// electron.d.ts에 추가

interface DogbaAPI {
    // ... 기존 28개 API 그룹 ...
    job: {
        getCatalog(): Promise<import('./src/types/job').JobDefinition[]>;
        get(
            jobId: string,
        ): Promise<import('./src/types/job').JobDefinition | null>;
        create(
            job: Omit<
                import('./src/types/job').JobDefinition,
                'id' | 'createdAt' | 'updatedAt'
            >,
        ): Promise<import('./src/types/job').JobDefinition>;
        update(
            jobId: string,
            patch: Partial<import('./src/types/job').JobDefinition>,
        ): Promise<import('./src/types/job').JobDefinition>;
        delete(jobId: string): Promise<boolean>;
        run(jobId: string, inputs: Record<string, unknown>): Promise<string>;
        pause(runId: string): Promise<void>;
        resume(runId: string): Promise<void>;
        stop(runId: string): Promise<void>;
        getHistory(limit?: number): Promise<import('./src/types/job').JobRun[]>;
        getRun(runId: string): Promise<import('./src/types/job').JobRun | null>;
        suggest(): Promise<import('./src/types/job').PatternDetection[]>;
        getMastery(
            agentId: string,
            jobId?: string,
        ): Promise<import('./src/types/job').JobMastery[]>;
        onProgress(
            callback: (progress: import('./src/types/job').JobProgress) => void,
        ): () => void;
        onGateWaiting(
            callback: (data: {
                runId: string;
                stepId: string;
                gate: import('./src/types/job').StepGate;
            }) => void,
        ): () => void;
        approveGate(
            runId: string,
            stepId: string,
            approved: boolean,
        ): Promise<void>;
    };
}
```

---

## 11. 기존 모듈 연동

### 11.1 연동 맵

```
┌────────────────────────────────────────────────────────────────┐
│                        Job System                               │
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ JobRunner     │────→│ TaskScheduler│────→│ CTO Controller│   │
│  │ (실행 엔진)   │     │ (큐 관리)    │     │ (에이전트 관리)│   │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                     │                     │           │
│         ↓                     ↓                     ↓           │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ SkillManager  │     │ AgentRecomm.  │     │ GrowthBridge │   │
│  │ (스킬 로드)   │     │ (에이전트 배정)│     │ (EXP 부여)   │   │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                                           │           │
│         ↓                                           ↓           │
│  ┌──────────────┐                           ┌──────────────┐    │
│  │ WorkflowPack  │                           │ ExpEngine    │   │
│  │ (팩 → Job 변환)│                           │ (EXP 계산)   │   │
│  └──────────────┘                           └──────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

### 11.2 모듈별 연동 상세

**`workflow-pack.ts`** (소스 → 변환):

- 기존 6개 `WorkflowPack`을 `JobDefinition`으로 1회 변환 (마이그레이션)
- `WorkflowPack.agents` → `JobStep.agentId` 매핑
- `WorkflowPack.skills` → `JobStep.skillId` 매핑
- `WorkflowPack.settings` → `JobWorkflow.settings` 매핑
- 변환 후에도 WorkflowPack은 유지 (에이전트 구성 용도로 계속 사용)

**`task-scheduler.ts`** (실행 큐):

- `JobRunner.run()` → `scheduler.enqueue()` 호출
- Job 난이도를 TaskPriority로 변환
- `scheduler.onComplete` 콜백에서 다음 스텝 트리거
- 동시성 제한은 `WorkflowSettings.maxConcurrentAgents`와 `scheduler.maxConcurrent` 중 작은 값

**`skill-manager.ts`** (스킬 해결):

- `JobStep.skillId` → `skillManager.get(skillId)`로 스킬 존재 여부 + SKILL.md 로드
- 스킬이 없으면 자동 설치 시도 (`skillManager.installDefault(skillId)`)
- `CHARACTER_SKILLS` 매핑으로 에이전트-스킬 호환성 검증

**`agent-recommender.ts`** (자동 배정):

- `JobStep.agentId`가 없으면 → `recommender.recommend(step.promptTemplate, 1)`
- 스텝의 프롬프트 템플릿을 task description으로 전달하여 최적 에이전트 추천
- 마스터리가 높은 에이전트 우선 배정 (보너스 가중치)

**`growth-bridge.ts` + `exp-engine.ts`** (캐릭터 성장):

- Job 완료 시 `processActivityChange()` 호출
- 기본 EXP: `metadata.baseExpReward * masteryExpMultiplier`
- 추가 EXP 요소: 난이도 보너스, 첫 클리어 보너스 (2x), 연속 성공 보너스 (streak \* 5%)
- 스킬 카테고리: Job 카테고리 → SkillCategory 매핑 (`development` → `'backend'`, `report` → `'communication'` 등)

**`agent-metrics.ts`** (성과 추적):

- 각 스텝 완료 시 에이전트 메트릭에 기록 (완료율, 속도)
- Job 전체 완료 시 팀 메트릭 업데이트

---

## 12. UI 설계

### 12.1 JobLauncher (원클릭 실행 화면)

RunPanel.tsx를 확장하거나 병렬 배치하는 메인 Job 실행 UI.

```
┌───────────────────────────────────────────────────────┐
│ Jobs                                    [+커스텀]  [x] │
├───────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ │  💻      │ │  📊      │ │  📝      │ │  🎬      │     │
│ │ 코드생성 │ │ 리포트   │ │ 소설집필 │ │ 영상기획 │     │
│ │ ★★★☆☆  │ │ ★★☆☆☆  │ │ ★☆☆☆☆  │ │ ☆☆☆☆☆  │     │
│ │ Lv.10   │ │ Lv.5    │ │ Lv.10   │ │ Lv.10   │     │
│ │  [실행]  │ │  [실행]  │ │  [실행]  │ │ [잠금🔒]│     │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│ ┌─────────┐ ┌─────────┐                              │
│ │  🔍      │ │  🎭      │  ← 나머지 Job 카드          │
│ │ 웹리서치 │ │ 역할극   │                              │
│ │ ★★★★☆  │ │ ☆☆☆☆☆  │                              │
│ │ Lv.5    │ │ Lv.20   │                              │
│ │  [실행]  │ │ [잠금🔒]│                              │
│ └─────────┘ └─────────┘                              │
├───────────────────────────────────────────────────────┤
│ ─── 코드 생성 ───────────────────────────────────     │
│                                                       │
│ 기능 설명:                                             │
│ ┌───────────────────────────────────────────────┐     │
│ │ React 컴포넌트를 만들어줘. 테이블 형태로        │     │
│ │ 데이터를 표시하고, 정렬/필터 기능 포함...       │     │
│ └───────────────────────────────────────────────┘     │
│                                                       │
│ 대상 디렉토리: [src/components         ] [찾아보기]    │
│ 언어: [TypeScript ▾]  테스트 포함: [✓]                │
│                                                       │
│ 예상 시간: ~5분  |  비용: 50 크레딧  |  난이도: C      │
│ 담당: Sera → Rio → Ara → Podo → Rio                   │
│                                                       │
│              [▶ 실행]  [시뮬레이션]                     │
└───────────────────────────────────────────────────────┘
```

**디자인 원칙**:

- Neo-Brutalism 스타일 (기존 프로젝트 통일)
- Job 카드: 두꺼운 테두리 + 크림 배경 + 그림자
- 잠금 Job: 회색 처리 + 자물쇠 아이콘 + 필요 레벨 표시
- 마스터리 별: 채워진 별/빈 별로 숙련도 시각화

### 12.2 JobMonitor (실행 중 진행률)

```
┌───────────────────────────────────────────────────────┐
│ 코드 생성 실행 중                              [취소]  │
├───────────────────────────────────────────────────────┤
│                                                       │
│ 전체 진행률: [████████████░░░░░░░░] 62%  (3:24 경과)  │
│                                                       │
│ Step 1: 기능 분석 및 계획     ✅ 완료 (Sera, 45s)     │
│ Step 2: 코드 구현             ✅ 완료 (Rio, 1:30)     │
│ Step 3: 테스트 작성           🔄 실행 중 (Ara)        │
│   └─ [████████░░░░░░░░░░░░] 40%                      │
│ Step 4: 코드 리뷰             ⏳ 대기 중 (Podo)       │
│ Step 5: 피드백 반영           ⏳ 대기 중 (Rio)        │
│                                                       │
│ ─── 실시간 로그 ─────────────────────────────────     │
│ [Ara] 테스트 파일 생성 중: Table.test.tsx              │
│ [Ara] 테스트 케이스 작성: 정렬 기능 검증...            │
│                                                       │
│ 예상 남은 시간: ~2분 30초                              │
└───────────────────────────────────────────────────────┘
```

### 12.3 JobBuilder (비주얼 에디터)

Section 6에서 상세히 기술. RunPanel 또는 별도 모달로 접근.

### 12.4 RunPanel.tsx 확장

기존 RunPanel에 "Jobs" 탭을 추가:

```typescript
// RunPanel.tsx 수정 방향

type RunTab = 'recipes' | 'jobs'; // 기존 recipes + 새 jobs 탭

// Jobs 탭 선택 시 JobLauncher 렌더링
// 실행 중인 Job이 있으면 JobMonitor로 자동 전환
```

### 12.5 컴포넌트 파일 구조

```
src/components/job/
├── JobLauncher.tsx        // Job 카드 목록 + 입력 폼 + 실행 버튼
├── JobMonitor.tsx         // 실행 중 진행률 + 단계별 상태
├── JobBuilder.tsx         // 비주얼 워크플로 에디터
├── JobCard.tsx            // 개별 Job 카드 (재사용)
├── JobInputForm.tsx       // 동적 입력 폼 (JobInput[] 기반 렌더링)
├── StepProgressBar.tsx    // 스텝별 진행률 바
├── MasteryStars.tsx       // 마스터리 별 표시 컴포넌트
└── GateApprovalModal.tsx  // 품질 게이트 사용자 승인 모달

src/store/
├── useJobStore.ts         // Job 카탈로그 + 실행 상태 + 마스터리 (Zustand)
└── useJobBuilderStore.ts  // JobBuilder 에디터 상태 (비영속)

src/types/
└── job.ts                 // 모든 Job 관련 TypeScript 인터페이스 정의
```

---

## 13. 캐릭터 성장 연동 상세

### 13.1 난이도 등급 ↔ 캐릭터 레벨

```
등급 E (Easy)       → Lv. 1+   (Novice)      — 누구나 실행 가능
등급 D (Decent)     → Lv. 5+   (Apprentice)  — 기본 작업 익힌 후
등급 C (Challenge)  → Lv. 10+  (Journeyman)  — 핵심 스킬 보유
등급 B (Bold)       → Lv. 20+  (Expert)      — 복합 작업 가능
등급 A (Advanced)   → Lv. 35+  (Master)      — 고급 자동화
등급 S (Supreme)    → Lv. 50+  (Legendary)   — 최상위 파이프라인
```

### 13.2 EXP 보상 공식

```typescript
function calculateJobExpReward(
    job: JobDefinition,
    run: JobRun,
    mastery: JobMastery | null,
    agentProfile: AgentGrowthProfile,
): number {
    let exp = job.metadata.baseExpReward;

    // 1. 마스터리 보너스
    if (mastery) {
        const config = job.metadata.mastery;
        exp *= 1 + (mastery.level * config.expBonusPerLevel) / 100;
    }

    // 2. 첫 클리어 보너스 (2x)
    if (!mastery || mastery.totalCompletions === 0) {
        exp *= 2;
    }

    // 3. 연속 성공 보너스 (streak * 5%, 최대 50%)
    if (mastery && mastery.streak > 0) {
        exp *= 1 + Math.min(mastery.streak * 0.05, 0.5);
    }

    // 4. 난이도 보너스 (캐릭터 레벨 대비 높은 난이도일수록 추가)
    const reqLevel = DIFFICULTY_LEVEL_MAP[job.metadata.difficulty];
    const levelDiff = reqLevel - agentProfile.level;
    if (levelDiff > 0) {
        // 레벨이 부족한데 성공했으면 추가 보상 (실제로는 requiredLevel 체크에 의해 이 경우는 없음)
    }

    // 5. 속도 보너스 (예상 시간보다 빨리 완료하면 추가)
    if (run.durationMs) {
        const estimatedMs = job.metadata.estimatedTimeSeconds * 1000;
        if (run.durationMs < estimatedMs * 0.8) {
            exp *= 1.1; // 10% 추가
        }
    }

    return Math.round(exp);
}
```

### 13.3 성장 이벤트 흐름

```
Job 완료
  ↓
calculateJobExpReward() → EXP 계산
  ↓
useGrowthStore.addExp(agentId, exp, 'job_completion')
  ↓
레벨업 체크 → LEVEL_EXP_TABLE 기반
  ↓
레벨업 시: 새 Job 해금 체크 + LevelUpNotification 큐 추가
  ↓
진화 단계 체크: EvolutionStage 전환 (novice → apprentice → ...)
  ↓
마스터리 업데이트: totalCompletions++, streak++, averageDuration 재계산
```

---

## 14. 테스트 전략

### 14.1 단위 테스트

| 대상          | 파일                           | 테스트 내용                                    |
| ------------- | ------------------------------ | ---------------------------------------------- |
| 프롬프트 치환 | `job-runner.test.ts`           | 변수 치환 (`{{input.*}}`, `{{step.*}}`) 정확성 |
| 게이트 평가   | `job-runner.test.ts`           | 각 게이트 타입별 pass/fail 판정                |
| 마스터리 계산 | `job-mastery.test.ts`          | 보너스 계산, 레벨업 임계값                     |
| EXP 보상      | `job-exp.test.ts`              | 각 보너스 요소별 EXP 계산                      |
| 패턴 감지     | `job-pattern-detector.test.ts` | 반복 패턴 감지 정확도                          |
| 조건 분기     | `job-runner.test.ts`           | StepCondition별 스킵/실행 판정                 |
| 워크플로 검증 | `job-validator.test.ts`        | 순환 참조, 미연결 입력 감지                    |
| 팩 → Job 변환 | `job-migration.test.ts`        | 6개 WorkflowPack → JobDefinition 변환          |

### 14.2 통합 테스트

| 대상               | 파일                                | 테스트 내용                              |
| ------------------ | ----------------------------------- | ---------------------------------------- |
| 순차 실행          | `job-runner.integration.test.ts`    | 3스텝 순차 Job 완전 실행 (mock PTY)      |
| 병렬 실행          | `job-runner.integration.test.ts`    | executionOrder 동일 스텝 병렬 실행 검증  |
| 에러 복구          | `job-runner.integration.test.ts`    | retry/skip/stop 전략별 동작              |
| 게이트 대기        | `job-runner.integration.test.ts`    | user_approval 게이트에서 일시정지 + 재개 |
| TaskScheduler 연동 | `job-scheduler.integration.test.ts` | Job 스텝 → ScheduledTask 변환 + 큐 실행  |
| 성장 연동          | `job-growth.integration.test.ts`    | Job 완료 → EXP 부여 → 레벨업 → 해금 흐름 |

### 14.3 테스트 인프라

```typescript
// 테스트 유틸: mock PTY response
function createMockPtyResponse(content: string): ParsedEvent[] {
    return [
        { type: 'assistant', content, timestamp: Date.now() },
        { type: 'prompt', content: '> ', timestamp: Date.now() + 100 },
    ];
}

// 테스트 유틸: 최소 Job 정의 팩토리
function createTestJob(overrides?: Partial<JobDefinition>): JobDefinition {
    return {
        id: 'test-job',
        name: 'Test Job',
        description: 'Test',
        icon: '🧪',
        category: 'custom',
        inputs: [],
        workflow: {
            steps: [
                {
                    id: 'step1',
                    name: 'Step 1',
                    skillId: '',
                    promptTemplate: 'Hello {{input.name}}',
                    inputMapping: [],
                    executionOrder: 1,
                },
            ],
            settings: {
                maxConcurrentAgents: 1,
                timeoutMs: 30_000,
                errorStrategy: 'stop',
                maxRetries: 0,
                permissionMode: 'default',
            },
        },
        outputs: [],
        metadata: {
            difficulty: 'E',
            requiredLevel: 1,
            estimatedTimeSeconds: 30,
            creditCost: 0,
            baseExpReward: 10,
            tags: [],
            prerequisiteJobIds: [],
            mastery: {
                maxLevel: 5,
                completionsPerLevel: 3,
                speedBonusPerLevel: 5,
                expBonusPerLevel: 3,
            },
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        builtin: false,
        ...overrides,
    };
}
```

---

## 15. 구현 우선순위

| Phase  | 범위                        | 예상 파일 수 | 설명                                                       |
| ------ | --------------------------- | ------------ | ---------------------------------------------------------- |
| **P0** | 타입 정의 + JobRunner 코어  | 3            | `types/job.ts`, `electron/job-runner.ts`, 단위 테스트      |
| **P1** | 빌트인 6개 Job 프리셋 + IPC | 4            | `electron/job-presets.ts`, preload/main 핸들러, e2e 테스트 |
| **P2** | JobLauncher + JobMonitor UI | 6            | 컴포넌트 6개 + useJobStore                                 |
| **P3** | 마스터리 + 성장 연동        | 3            | 마스터리 로직 + EXP 연동 + 테스트                          |
| **P4** | JobBuilder 비주얼 에디터    | 4            | React Flow 에디터 + useJobBuilderStore                     |
| **P5** | 패턴 감지 + 자동 제안       | 2            | PatternDetector + Toast 연동                               |

---

## 부록 A: WorkflowPack → JobDefinition 변환 매핑

| WorkflowPack 필드              | JobDefinition 필드                      | 변환 로직                     |
| ------------------------------ | --------------------------------------- | ----------------------------- |
| `id`                           | `sourcePackId`                          | 원본 팩 ID 보존               |
| `name`                         | `name`                                  | 직접 매핑                     |
| `description`                  | `description`                           | 직접 매핑                     |
| `icon`                         | `icon`                                  | 직접 매핑                     |
| `agents`                       | `workflow.steps[*].agentId`             | 에이전트 순서대로 스텝에 배정 |
| `skills`                       | `workflow.steps[*].skillId`             | 스킬을 적절한 스텝에 배정     |
| `settings.maxConcurrentAgents` | `workflow.settings.maxConcurrentAgents` | 직접 매핑                     |
| `settings.permissionMode`      | `workflow.settings.permissionMode`      | 직접 매핑                     |
| `triggers`                     | `metadata.tags`                         | 트리거 키워드를 태그로 변환   |

## 부록 B: 용어 사전

| 용어                  | 정의                                                              |
| --------------------- | ----------------------------------------------------------------- |
| **Job**               | 원클릭 자동화 단위. 스킬 + 워크플로 + 입출력 + 실행 엔진의 결합체 |
| **Step**              | Job 내 단일 실행 단위. 하나의 에이전트가 하나의 프롬프트를 실행   |
| **Gate**              | 스텝 완료 후 품질 검증 체크포인트                                 |
| **Mastery**           | 동일 Job 반복 실행으로 쌓이는 숙련도                              |
| **Pattern Detection** | 반복 작업 패턴을 자동 감지하여 Job 생성을 제안하는 시스템         |
| **Dry Run**           | 실제 실행 없이 변수 치환 결과만 미리 보는 시뮬레이션              |
| **Fan-Out**           | 병렬 실행 패턴. 같은 executionOrder 값을 가진 스텝들이 동시 실행  |
| **Chain**             | 순차 실행 패턴. 이전 스텝의 출력이 다음 스텝의 입력이 됨          |
