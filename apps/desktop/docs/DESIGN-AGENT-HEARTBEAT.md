# 에이전트 Heartbeat 자율 판단 시스템 설계서

> 작성일: 2026-03-26
> 상태: Draft
> 참고: OpenClaw Heartbeat 시스템 + Artience 캐릭터 성장 시스템 연동
> 관련 모듈: feedback-loop.ts, task-scheduler.ts, agent-metrics.ts, retro-generator.ts, hooks-manager.ts

---

## 1. 개요

### 1.1 Heartbeat란?

Heartbeat는 에이전트가 **주기적으로 자율 판단을 수행하는 데몬 시스템**이다. OpenClaw의 Heartbeat 시스템에서 영감을 받았으며, 각 캐릭터가 설정된 간격(기본 30분)마다 "깨어나서" 사전 정의된 체크리스트를 확인하고, 자율성 레벨에 따라 직접 실행하거나 유저에게 알림만 보낸다.

### 1.2 핵심 가치

**현재**: 유저가 직접 캐릭터에게 작업을 지시해야 함 (완전 수동)
**목표**: 캐릭터가 스스로 "할 일"을 감지하고, 성장 레벨에 따라 자율적으로 처리

예시 시나리오:

- Luna (Lv.25, 자율성 Level 2): 30분마다 깨어나서 `npm run build`가 깨졌는지 확인. 깨지면 자동으로 수정 시도 → 성공하면 결과 보고, 실패하면 유저에게 알림.
- Ara (Lv.10, 자율성 Level 1): 30분마다 테스트 커버리지 체크. 60% 미만이면 유저에게 "테스트 추가 필요" 알림 전송. 유저 승인 후 실행.
- Duri (Lv.50, 자율성 Level 3): 1시간마다 `npm audit` 실행. 취약점 발견 시 자동으로 패치 적용 → Mail 보고.

### 1.3 시스템 구성 개요

```
┌─────────────────────────────────────────────┐
│  Electron Main Process                       │
│                                              │
│  ┌─────────────────┐  ┌──────────────────┐  │
│  │ HeartbeatDaemon  │  │ CharacterGrowth  │  │
│  │ (setInterval)    │←→│ Manager          │  │
│  │                  │  │ (autonomy level) │  │
│  └────────┬────────┘  └──────────────────┘  │
│           │                                  │
│           ▼                                  │
│  ┌─────────────────┐                         │
│  │ HeartbeatRunner  │                         │
│  │ (체크리스트 실행)│                         │
│  └────────┬────────┘                         │
│           │                                  │
│     ┌─────┴─────┐                            │
│     ▼           ▼                            │
│  [자율 실행]  [알림 전송]                    │
│  (PTY/CLI)   (Notification)                  │
│     │           │                            │
│     ▼           ▼                            │
│  ┌─────────────────┐                         │
│  │ HeartbeatLogger  │                         │
│  │ (electron-store) │                         │
│  └─────────────────┘                         │
│           │                                  │
│     IPC   │                                  │
├───────────┼──────────────────────────────────┤
│           ▼                   Renderer       │
│  ┌─────────────────────────────────────┐     │
│  │ Heartbeat Dashboard                 │     │
│  │ - 에이전트별 Heartbeat 상태         │     │
│  │ - 실행 히스토리 타임라인            │     │
│  │ - 승인 대기 알림 목록               │     │
│  └─────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
```

---

## 2. 자율성 레벨 (4단계)

### 2.1 레벨 정의

| 레벨        | 이름                      | 동작                                                               | 해금 조건      |
| ----------- | ------------------------- | ------------------------------------------------------------------ | -------------- |
| **Level 0** | 신입 (Observer)           | 체크리스트 실행 결과를 **알림만** 전송. 아무것도 실행하지 않음.    | 기본값 (Lv.1~) |
| **Level 1** | 주니어 (Approval)         | 체크리스트 실행 후 **유저 확인을 받고** 실행. 승인 대기 UI 표시.   | 캐릭터 Lv.10+  |
| **Level 2** | 시니어 (Execute & Report) | 체크리스트를 **자율 실행하고 결과를 보고**. 유저 사전 승인 불필요. | 캐릭터 Lv.25+  |
| **Level 3** | 자율 (Autonomous)         | **독립적으로 판단 및 실행**. 중요한 변경만 사후 보고.              | 캐릭터 Lv.50+  |

### 2.2 각 레벨의 허용 범위

```typescript
export type AutonomyLevel = 0 | 1 | 2 | 3;

export interface AutonomyPermissions {
    canReadFiles: boolean;
    canRunTests: boolean;
    canEditFiles: boolean;
    canRunBash: boolean;
    canCommitChanges: boolean;
    canCreateBranch: boolean;
    canInstallPackages: boolean;
    requiresApproval: boolean;
    maxFileEditsPerHeartbeat: number;
}

export const AUTONOMY_PERMISSIONS: Record<AutonomyLevel, AutonomyPermissions> =
    {
        0: {
            canReadFiles: true,
            canRunTests: false,
            canEditFiles: false,
            canRunBash: false,
            canCommitChanges: false,
            canCreateBranch: false,
            canInstallPackages: false,
            requiresApproval: true,
            maxFileEditsPerHeartbeat: 0,
        },
        1: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: false,
            canRunBash: true, // 읽기 전용 명령만
            canCommitChanges: false,
            canCreateBranch: false,
            canInstallPackages: false,
            requiresApproval: true,
            maxFileEditsPerHeartbeat: 0,
        },
        2: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: true,
            canRunBash: true,
            canCommitChanges: false, // 커밋은 Level 3
            canCreateBranch: true,
            canInstallPackages: false,
            requiresApproval: false,
            maxFileEditsPerHeartbeat: 10,
        },
        3: {
            canReadFiles: true,
            canRunTests: true,
            canEditFiles: true,
            canRunBash: true,
            canCommitChanges: true,
            canCreateBranch: true,
            canInstallPackages: true,
            requiresApproval: false,
            maxFileEditsPerHeartbeat: 50,
        },
    };
```

### 2.3 레벨 간 전환 규칙

- **승격**: 캐릭터 레벨이 해금 조건을 만족하면 **유저가 수동으로 승격**해야 함 (자동 승격 없음 — 안전장치)
- **강등**: 유저가 언제든 자율성 레벨을 낮출 수 있음
- **긴급 중지**: 자율성 레벨과 무관하게 즉시 모든 Heartbeat를 중지하는 긴급 버튼

---

## 3. Heartbeat 설정 모델

### 3.1 TypeScript 인터페이스

```typescript
// types/heartbeat.ts

export interface HeartbeatConfig {
    agentId: string;
    enabled: boolean;
    intervalMs: number; // 기본 30분 = 1_800_000
    autonomyLevel: AutonomyLevel;
    checklist: HeartbeatCheckItem[];
    schedule: HeartbeatSchedule;
    constraints: HeartbeatConstraints;
}

export interface HeartbeatCheckItem {
    id: string;
    name: string;
    description: string;
    type: CheckItemType;
    command?: string; // Bash 명령 (type이 'command'일 때)
    filePattern?: string; // 파일 패턴 (type이 'file-check'일 때)
    threshold?: number; // 임계값 (type이 'metric-check'일 때)
    priority: 'critical' | 'normal' | 'low';
    enabled: boolean;
    requiredAutonomyLevel: AutonomyLevel; // 이 항목 실행에 필요한 최소 자율성
}

export type CheckItemType =
    | 'build-check' // 빌드가 통과하는지 확인
    | 'test-check' // 테스트가 통과하는지 확인
    | 'lint-check' // 린트 에러가 없는지 확인
    | 'dependency-check' // 의존성 취약점 확인
    | 'file-check' // 특정 파일 변경 감지
    | 'metric-check' // 메트릭 임계값 확인
    | 'command' // 커스텀 명령 실행
    | 'doc-freshness' // 문서가 코드와 동기화되었는지
    | 'todo-scan' // TODO/FIXME 스캔
    | 'coverage-check'; // 테스트 커버리지 확인

export interface HeartbeatSchedule {
    type: 'interval' | 'cron' | 'event-driven';
    intervalMs?: number; // type이 'interval'일 때
    cronExpression?: string; // type이 'cron'일 때
    triggerEvents?: string[]; // type이 'event-driven'일 때
    activeHoursStart?: number; // 활성 시간 시작 (0~23, 옵션)
    activeHoursEnd?: number; // 활성 시간 종료 (0~23, 옵션)
    daysOfWeek?: number[]; // 활성 요일 (0=일~6=토, 옵션)
}

export interface HeartbeatConstraints {
    maxDurationMs: number; // Heartbeat 1회 최대 실행 시간 (기본 5분)
    maxFileEdits: number; // 1회당 최대 파일 편집 수
    maxRetries: number; // 실패 시 재시도 횟수
    cooldownMs: number; // 실패 후 다음 실행까지 대기 시간
    blockedPaths: string[]; // 수정 금지 경로 (예: ['.env', 'credentials.*'])
    blockedCommands: string[]; // 실행 금지 명령 (예: ['rm -rf', 'drop table'])
}
```

### 3.2 HEARTBEAT.md 구조

각 에이전트의 프로젝트 디렉토리에 `.claude/heartbeat/{agentId}.md` 파일로 체크리스트를 정의한다. 유저가 직접 편집할 수 있는 인간 친화적 포맷이다.

```markdown
# Heartbeat: Luna (Frontend Developer)

## 설정

- 간격: 30분
- 자율성: Level 2 (실행 후 보고)
- 활성 시간: 09:00~18:00
- 활성 요일: 월~금

## 체크리스트

### [Critical] 빌드 상태 확인

- 명령: `npm run build`
- 실패 시: 자동 수정 시도 (Level 2+) 또는 알림 전송 (Level 0-1)

### [Normal] 테스트 통과 확인

- 명령: `npm run test -- --run`
- 실패 시: 실패한 테스트 분석 후 수정 시도

### [Normal] TypeScript 에러 확인

- 명령: `npx tsc --noEmit`
- 실패 시: 타입 에러 자동 수정 시도

### [Low] TODO/FIXME 스캔

- 패턴: `src/**/*.{ts,tsx}`
- 키워드: TODO, FIXME, HACK
- 동작: 발견 시 리포트 생성

### [Low] 문서 동기화 확인

- 비교: README.md ↔ 실제 API 구조
- 동작: 불일치 발견 시 알림
```

### 3.3 HEARTBEAT.md 파서

```typescript
export interface ParsedHeartbeat {
    agentId: string;
    agentName: string;
    settings: {
        intervalMs: number;
        autonomyLevel: AutonomyLevel;
        activeHours?: { start: number; end: number };
        activeDays?: number[];
    };
    items: HeartbeatCheckItem[];
}

/**
 * HEARTBEAT.md를 파싱하여 HeartbeatConfig로 변환
 * hooks-manager.ts와 유사한 마크다운 파싱 패턴
 */
export function parseHeartbeatMd(
    content: string,
    agentId: string,
): ParsedHeartbeat {
    // 1. "## 설정" 섹션에서 간격/자율성/시간 추출
    // 2. "## 체크리스트" 섹션에서 각 ### 항목을 HeartbeatCheckItem으로 변환
    // 3. [Critical]/[Normal]/[Low] 태그로 priority 결정
    // 4. "명령:", "패턴:", "동작:" 키로 항목 속성 추출
    // ...
}
```

---

## 4. Heartbeat 실행 흐름

### 4.1 전체 실행 사이클

```
[Daemon Timer]
    │
    ▼
[스케줄 확인] ← 현재 시각이 activeHours 내인지?
    │              활성 요일인지?
    │              cooldown 중인지?
    ├── NO → skip, 다음 간격까지 대기
    │
    ▼ YES
[HEARTBEAT.md 읽기] ← .claude/heartbeat/{agentId}.md 파싱
    │
    ▼
[체크리스트 순회] ← priority 순서 (critical → normal → low)
    │
    ├── 각 항목에 대해:
    │   │
    │   ▼
    │   [자율성 레벨 확인]
    │   │
    │   ├── Level 0: 명령 실행 → 결과만 기록 → 알림 전송
    │   ├── Level 1: 명령 실행 → 문제 발견 시 유저 승인 요청 → 승인 후 수정 실행
    │   ├── Level 2: 명령 실행 → 문제 발견 시 자동 수정 → 결과 보고
    │   └── Level 3: 명령 실행 → 자동 수정 → 커밋 → 사후 보고 (중요 건만)
    │   │
    │   ▼
    │   [제약 조건 검증]
    │   │ - maxDurationMs 초과?
    │   │ - maxFileEdits 초과?
    │   │ - blockedPaths 접근 시도?
    │   │ - blockedCommands 실행 시도?
    │   │
    │   ├── 제약 위반 → 즉시 중단, 알림 전송
    │   └── 통과 → 계속 실행
    │
    ▼
[결과 기록] → HeartbeatLogger (electron-store)
    │
    ▼
[메트릭 업데이트] → agent-metrics.ts에 결과 기록
    │
    ▼
[피드백 루프] → feedback-loop.ts에 성공/실패 이벤트 전달
    │
    ▼
[다음 간격까지 대기]
```

### 4.2 실행 상세: Level 2 예시 (Luna 빌드 체크)

```
1. Timer 발동 (30분 경과)
2. Luna의 HEARTBEAT.md 파싱
3. [Critical] 빌드 상태 확인 항목 실행:
   a. 새 PTY 세션 생성 (임시, worktree 격리)
   b. `npm run build` 실행
   c. exit code 확인
      - 0 (성공): ✅ 기록, 다음 항목으로
      - ≠0 (실패):
        i. 에러 메시지 파싱
        ii. Claude CLI에 수정 요청: "빌드 에러를 수정해: {에러 메시지}"
        iii. Claude가 파일 수정 (maxFileEdits=10 제한)
        iv. 다시 `npm run build` 실행
        v. 성공 → ✅ 기록 + Mail 보고
        vi. 실패 → ❌ 기록 + 유저 알림 (자동 수정 실패)
4. 다음 체크 항목으로 이동
5. 모든 항목 완료 후 HeartbeatLog 저장
```

### 4.3 실행 타임아웃 관리

```typescript
async function executeCheckItem(
    item: HeartbeatCheckItem,
    config: HeartbeatConfig,
    runner: HeartbeatRunner,
): Promise<CheckItemResult> {
    const timeoutMs = config.constraints.maxDurationMs;

    return Promise.race([
        runner.run(item, config),
        new Promise<CheckItemResult>((_, reject) =>
            setTimeout(() => reject(new Error('Heartbeat timeout')), timeoutMs),
        ),
    ]).catch((err) => ({
        itemId: item.id,
        status: 'timeout' as const,
        message: `타임아웃 (${timeoutMs / 1000}초 초과): ${err.message}`,
        timestamp: Date.now(),
    }));
}
```

---

## 5. 체크리스트 항목 유형

### 5.1 빌트인 체크 항목

| 유형               | 설명                    | 기본 명령                    | 실패 시 자동 수정                |
| ------------------ | ----------------------- | ---------------------------- | -------------------------------- |
| `build-check`      | 프로젝트 빌드 통과 확인 | `npm run build`              | 빌드 에러 수정 시도              |
| `test-check`       | 테스트 통과 확인        | `npm run test -- --run`      | 실패 테스트 분석/수정            |
| `lint-check`       | 린트 에러 확인          | `npm run lint`               | `npm run lint -- --fix`          |
| `dependency-check` | 보안 취약점 확인        | `npm audit`                  | `npm audit fix`                  |
| `coverage-check`   | 테스트 커버리지 확인    | `npm run test -- --coverage` | 커버리지 부족 파일에 테스트 추가 |
| `todo-scan`        | TODO/FIXME 스캔         | Grep 패턴 매칭               | (수정 안 함, 리포트만)           |
| `doc-freshness`    | 문서 동기화 확인        | 파일 수정 시각 비교          | 문서 업데이트 시도               |
| `file-check`       | 특정 파일 변경 감지     | Git diff 기반                | (알림만)                         |
| `metric-check`     | 메트릭 임계값 확인      | agent-metrics.ts 조회        | (알림만)                         |
| `command`          | 커스텀 명령             | 유저 지정                    | 유저 지정                        |

### 5.2 커스텀 체크 항목 작성법

유저가 HEARTBEAT.md에 커스텀 항목을 추가할 수 있다:

```markdown
### [Normal] 데이터베이스 백업 확인

- 명령: `ls -la backups/ | tail -1`
- 조건: 파일 날짜가 오늘인지 확인
- 실패 시: "백업이 오늘 실행되지 않았습니다" 알림
- 자율성 요구: Level 0 (알림만)
```

### 5.3 항목 간 의존 관계

체크 항목은 **순차 실행** (priority 순)이며, critical 항목이 실패하면 이후 항목 실행 여부를 설정할 수 있다.

```typescript
export interface HeartbeatCheckItem {
    // ... 기존 필드
    abortOnFail: boolean; // true면 이 항목 실패 시 전체 Heartbeat 중단
    dependsOn?: string[]; // 의존 항목 ID (해당 항목이 성공해야 실행)
}
```

---

## 6. 자율성 레벨과 캐릭터 레벨 연동

### 6.1 연동 규칙

Heartbeat 자율성은 `DESIGN-CHARACTER-GROWTH.md`의 캐릭터 레벨과 연동된다.

```typescript
/**
 * 캐릭터 레벨에 따른 자율성 해금 가능 여부
 * 해금 "가능"일 뿐, 자동 승격은 아님 — 유저가 수동 확인 필요
 */
export function getMaxAllowedAutonomy(characterLevel: number): AutonomyLevel {
    if (characterLevel >= 50) return 3;
    if (characterLevel >= 25) return 2;
    if (characterLevel >= 10) return 1;
    return 0;
}

/**
 * 자율성 승격 요청 시 검증
 */
export function canUpgradeAutonomy(
    sheet: CharacterSheet,
    targetLevel: AutonomyLevel,
): { allowed: boolean; reason?: string } {
    const maxAllowed = getMaxAllowedAutonomy(sheet.level);
    if (targetLevel > maxAllowed) {
        return {
            allowed: false,
            reason: `캐릭터 레벨 ${sheet.level}에서는 자율성 Level ${targetLevel}을 해금할 수 없습니다. (최소 레벨: ${targetLevel === 1 ? 10 : targetLevel === 2 ? 25 : 50})`,
        };
    }
    return { allowed: true };
}
```

### 6.2 성장에 따른 체크리스트 확장

캐릭터가 특정 전문화를 높이면 관련 체크 항목이 자동으로 추천된다.

| 전문화             | 추천 체크 항목                           | 해금 조건 |
| ------------------ | ---------------------------------------- | --------- |
| security ≥ 20      | `dependency-check` (npm audit)           | 자동 추가 |
| unitTesting ≥ 15   | `coverage-check` (커버리지 70%+)         | 자동 추가 |
| performance ≥ 25   | `bundle-size-check` (번들 크기 모니터링) | 자동 추가 |
| documentation ≥ 20 | `doc-freshness` (문서 동기화)            | 자동 추가 |

### 6.3 Heartbeat 성공/실패 → 캐릭터 성장

Heartbeat 실행 결과는 `feedback-loop.ts`를 통해 캐릭터 EXP와 스탯에 반영된다.

```typescript
// Heartbeat 1회 실행 완료 시
function onHeartbeatComplete(result: HeartbeatResult): void {
    const feedbackEvent: FeedbackEvent = {
        agentId: result.agentId,
        taskId: `heartbeat-${result.runId}`,
        outcome: result.allPassed ? 'success' : 'failure',
        durationMs: result.totalDurationMs,
        skillsUsed: result.checkItems.map((i) => i.type),
    };

    const feedback = calculateFeedback(feedbackEvent);
    // EXP 획득 (Heartbeat는 일반 작업의 50% EXP)
    const heartbeatExpMultiplier = 0.5;
    const adjustedExp = Math.round(feedback.expGained * heartbeatExpMultiplier);

    // CharacterGrowthManager에 전달
    growthManager.addExp(result.agentId, adjustedExp, 'heartbeat');
}
```

---

## 7. 안전장치

### 7.1 실행 범위 제한

```typescript
export const SAFETY_DEFAULTS: HeartbeatConstraints = {
    maxDurationMs: 300_000, // 5분 타임아웃
    maxFileEdits: 10, // 1회당 최대 10개 파일 수정
    maxRetries: 2, // 실패 시 최대 2회 재시도
    cooldownMs: 300_000, // 실패 후 5분 쿨다운
    blockedPaths: [
        '.env',
        '.env.*',
        'credentials.*',
        'secrets.*',
        '*.key',
        '*.pem',
        'node_modules/',
        '.git/',
    ],
    blockedCommands: [
        'rm -rf',
        'rmdir /s',
        'drop table',
        'drop database',
        'git push --force',
        'git reset --hard',
        'npm publish',
        'yarn publish',
        'format c:',
    ],
};
```

### 7.2 블로킹 명령 감지

Heartbeat가 PTY에서 명령을 실행하기 전에 블랙리스트를 확인한다.

```typescript
export function isBlockedCommand(
    command: string,
    blockedCommands: string[],
): boolean {
    const normalized = command.toLowerCase().trim();
    return blockedCommands.some((blocked) =>
        normalized.includes(blocked.toLowerCase()),
    );
}

export function isBlockedPath(
    filePath: string,
    blockedPaths: string[],
): boolean {
    return blockedPaths.some((pattern) => {
        if (pattern.endsWith('/')) {
            return (
                filePath.startsWith(pattern) || filePath.includes(`/${pattern}`)
            );
        }
        if (pattern.includes('*')) {
            const regex = new RegExp(
                '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$',
            );
            return regex.test(filePath);
        }
        return filePath === pattern || filePath.endsWith(`/${pattern}`);
    });
}
```

### 7.3 롤백 메커니즘

Level 2+ 자율 실행 시 **Git worktree 격리** + **체크포인트 기반 롤백**을 사용한다.

```typescript
async function executeWithRollback(
    agentId: string,
    checkItem: HeartbeatCheckItem,
    config: HeartbeatConfig,
): Promise<CheckItemResult> {
    // 1. Git worktree에서 실행 (worktree-manager.ts 활용)
    const worktreePath = await worktreeManager.getOrCreate(agentId);

    // 2. 실행 전 Git stash 생성 (체크포인트)
    await exec(`git stash push -m "heartbeat-checkpoint-${Date.now()}"`, {
        cwd: worktreePath,
    });

    try {
        // 3. 체크 항목 실행
        const result = await runCheckItem(checkItem, worktreePath, config);

        if (result.status === 'fixed') {
            // 4a. 수정 성공: 빌드/테스트 재확인
            const verified = await verifyFix(worktreePath, checkItem);
            if (verified) {
                return result; // 성공
            }
            // 검증 실패: 롤백
            await exec('git checkout -- .', { cwd: worktreePath });
            return {
                ...result,
                status: 'rollback',
                message: '수정 후 검증 실패, 롤백됨',
            };
        }

        return result;
    } catch (err) {
        // 4b. 에러 발생: 롤백
        await exec('git checkout -- .', { cwd: worktreePath });
        return {
            itemId: checkItem.id,
            status: 'error',
            message: `실행 중 에러 발생, 롤백됨: ${err}`,
            timestamp: Date.now(),
        };
    }
}
```

### 7.4 유저 긴급 중지

```typescript
// 전체 Heartbeat 즉시 중지
export function emergencyStopAll(): void {
    heartbeatDaemon.stopAll();
    // 실행 중인 PTY 프로세스 강제 종료
    activeRunners.forEach((runner) => runner.abort());
    // 모든 변경사항 롤백
    activeRunners.forEach((runner) => runner.rollback());
    // 알림 전송
    notify('모든 Heartbeat가 긴급 중지되었습니다');
}

// 특정 에이전트 Heartbeat만 중지
export function emergencyStop(agentId: string): void {
    heartbeatDaemon.stop(agentId);
    const runner = activeRunners.get(agentId);
    if (runner) {
        runner.abort();
        runner.rollback();
    }
}
```

---

## 8. 저장소

### 8.1 electron-store 구조

```typescript
// electron-store key: 'dokba-heartbeat'
interface HeartbeatStore {
    version: number;
    configs: Record<string, HeartbeatConfig>; // agentId → config
    logs: HeartbeatLog[]; // 전역 실행 로그 (최근 1,000건)
    approvalQueue: ApprovalRequest[]; // Level 1 승인 대기 목록
    stats: Record<string, HeartbeatAgentStats>; // agentId → 통계
}

interface HeartbeatLog {
    runId: string;
    agentId: string;
    startedAt: number;
    completedAt: number;
    totalDurationMs: number;
    itemResults: CheckItemResult[];
    overallStatus: 'all-passed' | 'some-failed' | 'aborted' | 'timeout';
}

interface CheckItemResult {
    itemId: string;
    itemName: string;
    status:
        | 'passed'
        | 'failed'
        | 'fixed'
        | 'rollback'
        | 'timeout'
        | 'error'
        | 'skipped';
    message: string;
    durationMs: number;
    filesChanged: string[];
    timestamp: number;
}

interface ApprovalRequest {
    id: string;
    agentId: string;
    checkItemId: string;
    description: string;
    proposedAction: string;
    createdAt: number;
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    expiresAt: number; // 30분 후 자동 만료
}

interface HeartbeatAgentStats {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    totalFixesApplied: number;
    totalRollbacks: number;
    averageDurationMs: number;
    lastRunAt: number;
}
```

### 8.2 히스토리 로그 관리

로그는 **ring buffer** 방식으로 최근 1,000건만 유지한다. 오래된 로그는 자동 삭제된다.

```typescript
const MAX_LOG_ENTRIES = 1000;

function appendLog(store: HeartbeatStore, log: HeartbeatLog): void {
    store.logs = [...store.logs, log].slice(-MAX_LOG_ENTRIES);
}
```

---

## 9. IPC 채널

### 9.1 Heartbeat API 그룹

| 채널                         | 방향   | 설명                                         |
| ---------------------------- | ------ | -------------------------------------------- |
| `heartbeat:start`            | invoke | 특정 에이전트 Heartbeat 시작                 |
| `heartbeat:stop`             | invoke | 특정 에이전트 Heartbeat 중지                 |
| `heartbeat:stopAll`          | invoke | 전체 Heartbeat 긴급 중지                     |
| `heartbeat:getConfig`        | invoke | 특정 에이전트 Heartbeat 설정 조회            |
| `heartbeat:setConfig`        | invoke | Heartbeat 설정 업데이트                      |
| `heartbeat:getLog`           | invoke | 실행 로그 조회 (페이징)                      |
| `heartbeat:getStats`         | invoke | 에이전트별 통계 조회                         |
| `heartbeat:getStatus`        | invoke | 현재 실행 상태 (running/idle/disabled)       |
| `heartbeat:runOnce`          | invoke | 수동으로 1회 즉시 실행                       |
| `heartbeat:approve`          | invoke | Level 1 승인 요청 승인                       |
| `heartbeat:reject`           | invoke | Level 1 승인 요청 거부                       |
| `heartbeat:getApprovals`     | invoke | 승인 대기 목록 조회                          |
| `heartbeat:setAutonomy`      | invoke | 자율성 레벨 변경                             |
| `heartbeat:tick`             | send   | Heartbeat 실행 이벤트 알림 (Main → Renderer) |
| `heartbeat:approval-request` | send   | 승인 요청 알림 (Main → Renderer)             |

### 9.2 preload.ts 인터페이스

```typescript
heartbeat: {
    start: (agentId: string) => Promise<{ success: boolean }>;
    stop: (agentId: string) => Promise<{ success: boolean }>;
    stopAll: () => Promise<{ success: boolean }>;
    getConfig: (agentId: string) => Promise<HeartbeatConfig | null>;
    setConfig: (agentId: string, config: Partial<HeartbeatConfig>) => Promise<{ success: boolean }>;
    getLog: (agentId?: string, limit?: number, offset?: number) => Promise<HeartbeatLog[]>;
    getStats: (agentId: string) => Promise<HeartbeatAgentStats>;
    getStatus: (agentId: string) => Promise<'running' | 'idle' | 'disabled'>;
    runOnce: (agentId: string) => Promise<HeartbeatLog>;
    approve: (requestId: string) => Promise<{ success: boolean }>;
    reject: (requestId: string) => Promise<{ success: boolean }>;
    getApprovals: () => Promise<ApprovalRequest[]>;
    setAutonomy: (agentId: string, level: AutonomyLevel) => Promise<{ success: boolean; reason?: string }>;
    onTick: (callback: (log: HeartbeatLog) => void) => () => void;
    onApprovalRequest: (callback: (req: ApprovalRequest) => void) => () => void;
}
```

---

## 10. 기존 모듈 연동

### 10.1 feedback-loop.ts

Heartbeat 완료 시 `calculateFeedback()`을 호출하여 EXP 획득 및 추천 사항을 생성한다. Heartbeat 전용 EXP 보정(x0.5)을 적용한다.

### 10.2 task-scheduler.ts

Heartbeat에서 발견된 문제를 `task-scheduler.ts`의 태스크 큐에 자동 등록할 수 있다. Level 0~1에서는 유저 승인 후 큐에 추가되고, Level 2~3에서는 자동으로 추가된다.

```typescript
// Heartbeat에서 문제 발견 시
if (result.status === 'failed' && config.autonomyLevel >= 2) {
    await taskScheduler.enqueue({
        description: `[Heartbeat] ${result.itemName}: ${result.message}`,
        priority: result.priority === 'critical' ? 'high' : 'medium',
        assignedAgent: config.agentId,
    });
}
```

### 10.3 agent-metrics.ts

Heartbeat 실행 결과를 `AgentMetricsTracker`에 기록하여 전체 성과 메트릭에 포함한다. Heartbeat 전용 메트릭(실행 횟수, 자동 수정 성공률)도 추가 추적한다.

### 10.4 retro-generator.ts

일간/주간 회고 리포트에 Heartbeat 요약 섹션을 추가한다:

- 각 에이전트의 Heartbeat 실행 횟수
- 자동 수정 성공/실패 건수
- 가장 빈번한 실패 항목
- 자율성 레벨 변경 이력

---

## 11. Electron 프로세스 모델

### 11.1 Main Process setInterval 방식 (기본)

```typescript
// electron/heartbeat-daemon.ts

export class HeartbeatDaemon {
    private timers = new Map<string, NodeJS.Timeout>();
    private runners = new Map<string, HeartbeatRunner>();

    start(agentId: string, config: HeartbeatConfig): void {
        if (this.timers.has(agentId)) return;

        const timer = setInterval(async () => {
            if (!this.isWithinActiveHours(config.schedule)) return;

            const runner = new HeartbeatRunner(agentId, config);
            this.runners.set(agentId, runner);

            try {
                const log = await runner.execute();
                this.emit('tick', log);
                this.recordLog(log);
            } finally {
                this.runners.delete(agentId);
            }
        }, config.intervalMs);

        this.timers.set(agentId, timer);
    }

    stop(agentId: string): void {
        const timer = this.timers.get(agentId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(agentId);
        }
        const runner = this.runners.get(agentId);
        if (runner) {
            runner.abort();
            this.runners.delete(agentId);
        }
    }

    stopAll(): void {
        for (const agentId of this.timers.keys()) {
            this.stop(agentId);
        }
    }

    private isWithinActiveHours(schedule: HeartbeatSchedule): boolean {
        if (!schedule.activeHoursStart || !schedule.activeHoursEnd) return true;
        const hour = new Date().getHours();
        return (
            hour >= schedule.activeHoursStart && hour < schedule.activeHoursEnd
        );
    }
}
```

### 11.2 Worker Thread 대안 (향후)

Heartbeat 실행이 Main Process를 블로킹할 우려가 있을 경우, `worker_threads`로 분리할 수 있다. 단, 현재는 PTY 프로세스가 비동기로 실행되므로 Main Process 블로킹은 최소화된다. Worker Thread 전환은 실행 중인 Heartbeat가 5개 이상 동시에 활성화될 때 고려한다.

```typescript
// 향후 확장: Worker Thread 모델
import { Worker } from 'worker_threads';

function spawnHeartbeatWorker(
    agentId: string,
    config: HeartbeatConfig,
): Worker {
    return new Worker('./heartbeat-worker.js', {
        workerData: { agentId, config },
    });
}
```

### 11.3 앱 라이프사이클 연동

```typescript
// main.ts에서 앱 시작/종료 시 Heartbeat 관리
app.on('ready', () => {
    // 저장된 설정에서 enabled=true인 Heartbeat 자동 시작
    const store = getHeartbeatStore();
    for (const [agentId, config] of Object.entries(store.configs)) {
        if (config.enabled) {
            heartbeatDaemon.start(agentId, config);
        }
    }
});

app.on('before-quit', () => {
    // 모든 Heartbeat 정리 (실행 중인 것은 결과 기록 후 종료)
    heartbeatDaemon.stopAll();
});
```

---

## 12. UI 설계

### 12.1 Heartbeat 대시보드

LiveDashboard 내에 Heartbeat 탭을 추가하거나 별도 패널로 제공한다.

```
┌──────────────────────────────────────────────────┐
│  Heartbeat Dashboard                              │
│                                                    │
│  [전체 중지 🔴]  활성: 8/26 에이전트              │
│                                                    │
│  ┌── 에이전트별 상태 ──────────────────────────┐  │
│  │ Luna   [🟢 Running] Lv.2  다음: 14분 후     │  │
│  │ Rio    [🟢 Running] Lv.2  다음: 28분 후     │  │
│  │ Ara    [🟡 Pending] Lv.1  승인 대기 1건     │  │
│  │ Sera   [⚪ Idle]    Lv.0  비활성 시간       │  │
│  │ Duri   [🟢 Running] Lv.3  다음: 55분 후     │  │
│  │ ...                                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌── 최근 실행 타임라인 ──────────────────────┐  │
│  │ 14:30 Luna  ✅ all-passed (4/4)  32초       │  │
│  │ 14:28 Duri  ⚠️ 1 fixed (3/4)    2분 15초    │  │
│  │ 14:00 Luna  ✅ all-passed (4/4)  28초       │  │
│  │ 13:55 Rio   ❌ 1 failed (3/4)   1분 42초    │  │
│  │ 13:30 Ara   🔔 승인 대기중                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                    │
│  ┌── 승인 대기 ─────────────────────────────────┐ │
│  │ Ara: 테스트 실패 수정 시도 요청              │ │
│  │ "3개 테스트 실패. 자동 수정을 시도할까요?"   │ │
│  │ [승인 ✅]  [거부 ❌]  [상세 보기]            │ │
│  └──────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 12.2 자율 실행 히스토리

에이전트별 Heartbeat 실행 히스토리를 타임라인으로 표시한다.

```
┌──────────────────────────────────────────────┐
│  Luna Heartbeat History                       │
│                                               │
│  Today                                        │
│  ──────────────────────────────────────       │
│  14:30  ✅ Build OK, Tests OK, Lint OK       │
│  14:00  ✅ Build OK, Tests OK, Lint OK       │
│  13:30  ⚠️ Build FAIL → auto-fixed → ✅     │
│         수정 파일: src/App.tsx (+2, -1)       │
│  13:00  ✅ Build OK, Tests OK, Lint OK       │
│                                               │
│  Yesterday                                    │
│  ──────────────────────────────────────       │
│  17:30  ❌ Build FAIL → auto-fix FAIL        │
│         에러: Type 'string' is not assignable │
│         [상세 보기] [수동 수정하기]           │
│  17:00  ✅ All passed                         │
│  ...                                          │
└──────────────────────────────────────────────┘
```

### 12.3 알림 팝업

Heartbeat 이벤트 시 시스템 트레이 알림 또는 인앱 토스트로 알림한다.

| 이벤트         | Level 0~1               | Level 2~3                                  |
| -------------- | ----------------------- | ------------------------------------------ |
| 모든 항목 통과 | 알림 없음 (조용히 기록) | 알림 없음                                  |
| 문제 발견      | 토스트 + 트레이 알림    | 토스트 (간략)                              |
| 자동 수정 성공 | N/A                     | 토스트 ("Luna가 빌드 에러를 수정했습니다") |
| 자동 수정 실패 | 토스트 + 트레이 + 배지  | 토스트 + 트레이 + 배지                     |
| 승인 요청      | 모달 팝업               | N/A                                        |
| 타임아웃       | 트레이 알림             | 트레이 알림                                |
| 긴급 중지      | 모달 알림               | 모달 알림                                  |

---

## 13. 테스트 전략

### 13.1 단위 테스트

| 모듈                      | 테스트 대상              | 파일                                  |
| ------------------------- | ------------------------ | ------------------------------------- |
| parseHeartbeatMd()        | HEARTBEAT.md 파싱 정확성 | `src/lib/__tests__/heartbeat.test.ts` |
| isBlockedCommand()        | 블랙리스트 매칭          | 동일                                  |
| isBlockedPath()           | 경로 패턴 매칭           | 동일                                  |
| getMaxAllowedAutonomy()   | 레벨→자율성 매핑         | 동일                                  |
| canUpgradeAutonomy()      | 승격 가능 여부 검증      | 동일                                  |
| CheckItemResult 타입 검증 | 모든 status 값 커버      | 동일                                  |

### 13.2 통합 테스트

| 시나리오                                     | 검증 내용              |
| -------------------------------------------- | ---------------------- |
| Level 0: 체크 실행 → 알림만 전송             | 파일 변경 없음 확인    |
| Level 1: 체크 실행 → 승인 요청 → 승인 → 실행 | 승인 플로우            |
| Level 2: 체크 실행 → 자동 수정 → 검증        | 수정 + 검증 파이프라인 |
| Level 2: 자동 수정 실패 → 롤백               | 롤백 정확성            |
| 타임아웃 발생 → 정리                         | 리소스 정리            |
| blockedCommand 실행 시도 → 차단              | 안전장치 작동          |
| blockedPath 수정 시도 → 차단                 | 안전장치 작동          |
| 앱 종료 시 Heartbeat 정리                    | 프로세스 누수 방지     |

### 13.3 안전성 테스트

| 시나리오                 | 검증 내용                    |
| ------------------------ | ---------------------------- |
| maxFileEdits 초과 시도   | 제한 적용 확인               |
| maxDurationMs 초과       | 타임아웃 발동                |
| 동시 Heartbeat 10개 실행 | 메모리/CPU 모니터링          |
| 네트워크 없이 실행       | npm audit 실패 graceful 처리 |
| 빈 프로젝트에서 실행     | 에러 없이 skip 처리          |
| HEARTBEAT.md 파일 없음   | 기본 설정으로 fallback       |
| 손상된 HEARTBEAT.md      | 파싱 에러 처리               |

---

_최종 업데이트: 2026-03-26 | Draft_
