# Phase 4 기능 사용자 가이드

> 이 문서는 Phase 4에서 구현된 12개 신규 기능의 상세 사용 가이드입니다.
> DevTools 콘솔 테스트 코드를 복붙해서 각 기능을 직접 검증할 수 있습니다.

---

## 목차

1. [CEO Directive 라우팅](#1-ceo-directive-라우팅)
2. [에이전트 상태 머신](#2-에이전트-상태-머신)
3. [태스크 큐 스케줄러](#3-태스크-큐-스케줄러)
4. [세션 히스토리 검색](#4-세션-히스토리-검색)
5. [에이전트 성과 메트릭](#5-에이전트-성과-메트릭)
6. [팀 템플릿 시스템](#6-팀-템플릿-시스템)
7. [P2P 에이전트 메시징](#7-p2p-에이전트-메시징)
8. [라이브 대시보드](#8-라이브-대시보드)
9. [회고 리포트 생성](#9-회고-리포트-생성)
10. [에이전트 피드백 루프](#10-에이전트-피드백-루프)
11. [에이전트 자동 추천](#11-에이전트-자동-추천)
12. [스킬 마켓플레이스](#12-스킬-마켓플레이스)

---

## 1. CEO Directive 라우팅

**설명**: 채팅 입력 앞에 특수 기호(`$`, `#`, `@`)를 붙여 메시지를 자동으로 적절한 대상으로 라우팅하는 기능입니다.

**위치**: 모든 채팅 탭의 메시지 입력창

**라우팅 규칙**:

| 접두사       | 타입     | 동작                                                       |
| ------------ | -------- | ---------------------------------------------------------- |
| `$`          | `ceo`    | 전사 지시 — CTO 컨트롤러를 통해 전 에이전트에 브로드캐스트 |
| `#`          | `task`   | 태스크 요청 — 에이전트 자동 추천 후 해당 에이전트에 라우팅 |
| `@agentName` | (수식어) | 특정 에이전트 지정 (다른 접두사와 조합 가능)               |
| 없음         | `normal` | 현재 탭의 에이전트에게 일반 메시지                         |

**사용법**:

1. 채팅 입력창에서 원하는 접두사로 시작하는 메시지를 입력합니다
2. `$` + 메시지 → 전사 지시 (예: `$ 모든 코드에 주석을 추가해`)
3. `#` + 메시지 → 태스크 요청 (예: `# 로그인 API 버그 수정`)
4. `#@luna` + 메시지 → luna에게 직접 태스크 요청 (예: `#@luna 컴포넌트 최적화`)
5. Enter 전송 시 Electron IPC `directive:route`가 호출되어 자동 분기됩니다

**DevTools 콘솔 테스트**:

```js
// CEO 지시 파싱 테스트
await window.dogbaApi.directive.route('$ 전사 코드 리뷰 진행', 'tab-1');
// => { success: true, type: 'ceo', routedTo: 'cto' }

// 태스크 요청 (자동 추천)
await window.dogbaApi.directive.route('# React 컴포넌트 리팩토링', 'tab-1');
// => { success: true, type: 'task', routedTo: 'luna' }

// 특정 에이전트 지정 태스크
await window.dogbaApi.directive.route('#@rio API 엔드포인트 추가', 'tab-1');
// => { success: true, type: 'task', routedTo: 'rio' }

// 일반 메시지
await window.dogbaApi.directive.route('안녕하세요', 'tab-1');
// => { success: true, type: 'normal' }
```

**예상 결과**: `success: true` + 올바른 `type`과 `routedTo` 반환

**관련 파일**:

- `apps/desktop/src/lib/directive-parser.ts` — 순수 함수 파서 (prefix 감지, @mention 추출)
- `apps/desktop/src/types/electron.d.ts` — `DogbaDirectiveApi` 인터페이스

---

## 2. 에이전트 상태 머신

**설명**: 각 에이전트의 현재 작업 상태를 6단계로 추적하는 상태 머신입니다. 유효하지 않은 전환은 자동으로 거부됩니다.

**6가지 상태**:

| 상태        | 의미          | 다음 가능 상태               |
| ----------- | ------------- | ---------------------------- |
| `idle`      | 대기 중       | `assigned`                   |
| `assigned`  | 태스크 배정됨 | `working`, `idle`            |
| `working`   | 작업 중       | `reviewing`, `done`, `error` |
| `reviewing` | 검토 중       | `done`, `error`, `working`   |
| `done`      | 완료          | `idle`                       |
| `error`     | 오류 발생     | `idle`, `assigned`           |

**위치**: 라이브 대시보드 (하단 독 → Dashboard 탭)에서 각 에이전트의 상태 배지로 시각화

**사용법**:

1. 앱 하단 독에서 "Dashboard" 아이콘 클릭
2. "Agent Status" 카드에서 각 에이전트의 현재 상태 확인
3. 상태별 색상: Idle(회색) / Assigned(노랑) / Working(파랑) / Reviewing(보라) / Done(초록) / Error(빨강)
4. 상단 요약 바에서 상태별 에이전트 수 확인

**DevTools 콘솔 테스트**:

```js
// Zustand store에서 에이전트 상태 직접 확인
// (useTerminalStore의 agentStates 구독)
const store = window.__ZUSTAND_STORE__?.getState?.();
// 또는 React DevTools에서 useTerminalStore → agentStates 확인

// 상태 전환 유효성 검사 (순수 함수 — 브라우저 콘솔에서 직접 실행 불가,
// 단위 테스트 또는 Vitest로 확인)
```

**예상 결과**: 에이전트가 태스크를 받으면 `idle` → `assigned` → `working` → `done` 순서로 전환

**관련 파일**:

- `apps/desktop/src/types/agent-state.ts` — 상태 정의, `VALID_TRANSITIONS`, `appendTransition()`
- `apps/desktop/src/components/dashboard/LiveDashboard.tsx` — 상태 시각화

---

## 3. 태스크 큐 스케줄러

**설명**: 우선순위(`critical` > `high` > `medium` > `low`)와 데드라인 기반으로 태스크를 정렬하고 동시 실행을 제어하는 스케줄러입니다. 최대 3개 태스크가 동시에 실행됩니다.

**위치**: 라이브 대시보드 "Task Queue" 카드 / DevTools 콘솔에서 직접 조작 가능

**사용법**:

1. DevTools 콘솔 또는 앱 내부 로직에서 `taskQueue.enqueue()` 호출
2. 라이브 대시보드에서 Queued / Running / Completed 탭으로 상태 확인
3. `dispatch()` 호출 시 우선순위 순으로 다음 태스크가 running으로 이동

**DevTools 콘솔 테스트**:

```js
// 태스크 등록 (critical 우선순위)
const r1 = await window.dogbaApi.taskQueue.enqueue({
    description: '프로덕션 서버 긴급 패치',
    priority: 'critical',
    assignedAgent: 'rio',
});
// => { success: true, taskId: 'tq-...', dispatched: true/false }

// 일반 태스크 등록 (데드라인 포함)
const r2 = await window.dogbaApi.taskQueue.enqueue({
    description: 'UI 개선 작업',
    priority: 'medium',
    deadline: Date.now() + 3600_000, // 1시간 후
    assignedAgent: 'luna',
});

// 현재 큐 상태 조회
const queue = await window.dogbaApi.taskQueue.list();
console.log('Queued:', queue.queued.length);
console.log('Running:', queue.running.length);
console.log('Completed:', queue.completed.length);

// 다음 태스크 dispatch
await window.dogbaApi.taskQueue.dispatch();

// 태스크 완료 처리
await window.dogbaApi.taskQueue.complete(r1.taskId, '패치 완료');

// 태스크 취소 (queued 상태인 경우만)
await window.dogbaApi.taskQueue.cancel(r2.taskId);
```

**예상 결과**:

- `critical` 태스크가 `low` 태스크보다 항상 먼저 dispatch됨
- 동시 실행 3개 초과 시 `dispatch()` 결과 `{ success: false, error: 'No tasks to dispatch' }`
- 라이브 대시보드가 5초마다 자동 갱신됨

**관련 파일**:

- `apps/desktop/electron/task-scheduler.ts` — `TaskScheduler` 클래스, 우선순위 정렬 로직
- `apps/desktop/src/types/electron.d.ts` — `DogbaTaskQueueApi` 인터페이스

---

## 4. 세션 히스토리 검색

**설명**: 저장된 채팅 세션을 키워드로 검색하고, 특정 세션의 전체 대화 히스토리를 불러오는 기능입니다.

**위치**: 하단 독 → History 아이콘 (또는 DevTools 콘솔)

**사용법**:

1. History 버튼 클릭 → 검색창 입력
2. 에이전트 이름, 대화 내용 키워드로 검색
3. 검색 결과 클릭 → 해당 세션의 전체 메시지 히스토리 표시
4. 세션별로 마지막 활동 시간 및 에이전트 이름 확인

**DevTools 콘솔 테스트**:

```js
// 세션 검색
const results = await window.dogbaApi.session.search('react 컴포넌트');
console.log(results.sessions);
// => [{ id, label, agentName, lastActive, preview }]

// 특정 세션 히스토리 조회
const sessionId = results.sessions[0]?.id;
if (sessionId) {
    const history = await window.dogbaApi.session.getHistory(sessionId);
    console.log(history.messages);
    // => [{ role: 'user'|'assistant', content, timestamp }]
}
```

**예상 결과**: 키워드와 관련된 세션 목록 반환, 세션 클릭 시 전체 대화 내역 로드

**관련 파일**:

- `apps/desktop/src/types/electron.d.ts` — `DogbaSessionApi`, `SessionSearchResult`, `SessionMessage`

---

## 5. 에이전트 성과 메트릭

**설명**: 각 에이전트의 태스크 완료율, 평균 소요시간, 최근 태스크 이력을 추적하고 집계하는 성과 측정 시스템입니다. `electron-store`에 영속적으로 저장됩니다.

**위치**: 라이브 대시보드 "Top Performers" 카드 / DevTools 콘솔

**사용법**:

1. 라이브 대시보드에서 Top Performers 카드 확인
2. 완료율 퍼센트 바와 평균 소요시간 표시
3. 에이전트가 태스크를 실행하면 자동으로 메트릭 기록됨

**DevTools 콘솔 테스트**:

```js
// 특정 에이전트 메트릭 조회
const metrics = await window.dogbaApi.metrics.get('luna');
console.log({
    completionRate: (metrics.completionRate * 100).toFixed(1) + '%',
    avgDuration: metrics.avgDurationMs + 'ms',
    totalTasks: metrics.totalTasks,
});

// 전체 에이전트 메트릭 조회
const all = await window.dogbaApi.metrics.getAll();
console.table(all);

// 상위 성과자 조회 (상위 5명)
const top = await window.dogbaApi.metrics.topPerformers(5);
top.forEach((m) => {
    console.log(
        `${m.agentId}: ${(m.completionRate * 100).toFixed(0)}% (${m.totalTasks}건)`,
    );
});
```

**예상 결과**:

- `completionRate`: 0~1 사이 값 (1.0 = 100% 완료율)
- `recentTasks`: 최근 50개 태스크 이력 (ring buffer)
- `topPerformers`: 완료율 내림차순 정렬

**관련 파일**:

- `apps/desktop/electron/agent-metrics.ts` — `AgentMetricsTracker`, `dokba-agent-metrics` store
- `apps/desktop/src/types/electron.d.ts` — `DogbaMetricsApi`, `AgentMetricsRecord`

---

## 6. 팀 템플릿 시스템

**설명**: 프로젝트 유형에 맞는 사전 정의된 팀 구성을 빠르게 적용하는 기능입니다. 5개 기본 템플릿과 커스텀 템플릿 생성을 지원합니다.

**기본 제공 템플릿**:

| 템플릿 ID             | 이름            | 구성원                 |
| --------------------- | --------------- | ---------------------- |
| `fullstack-dev`       | 풀스택 개발     | luna, rio, ara, podo   |
| `security-audit`      | 보안 감사       | duri, podo, rio        |
| `content-team`        | 콘텐츠 팀       | bomi, alex, hana, dari |
| `architecture-review` | 아키텍처 리뷰   | namu, somi, toto       |
| `rapid-prototype`     | 빠른 프로토타입 | sera, luna, rio        |

**위치**: DevTools 콘솔 또는 Settings 모달 내 팀 설정

**사용법**:

1. 프로젝트 설명으로 자동 추천 받기 (예: "react webapp 개발")
2. 또는 템플릿 목록에서 직접 선택
3. 커스텀 템플릿 생성으로 자주 사용하는 팀 구성 저장

**DevTools 콘솔 테스트**:

```js
// 전체 템플릿 목록 조회
const list = await window.dogbaApi.teamTemplate.list();
list.templates.forEach((t) => console.log(t.id, '-', t.name));

// 프로젝트 설명으로 자동 추천
const suggested = await window.dogbaApi.teamTemplate.suggest(
    'react web app fullstack 개발',
);
console.log('추천 템플릿:', suggested.template?.name);
// => "풀스택 개발"

// 특정 템플릿 상세 조회
const tpl = await window.dogbaApi.teamTemplate.get('fullstack-dev');
console.log(tpl.template?.agents);

// 커스텀 템플릿 생성
const created = await window.dogbaApi.teamTemplate.create({
    name: '내 팀',
    description: '개인 프로젝트용 최소 팀',
    agents: [
        { role: '개발', agentId: 'luna', required: true },
        { role: '리뷰', agentId: 'podo', required: false },
    ],
    suggestedFor: ['개인', 'personal', 'solo'],
});
console.log('생성된 ID:', created.id);
```

**예상 결과**:

- `suggest()`: 프로젝트 설명 키워드 매칭으로 가장 적합한 템플릿 반환 (없으면 `null`)
- 커스텀 템플릿은 `artience-team-templates` electron-store에 영속 저장됨

**관련 파일**:

- `apps/desktop/electron/team-template.ts` — `TeamTemplateManager`, 5개 기본 템플릿 정의
- `apps/desktop/src/types/electron.d.ts` — `DogbaTeamTemplateApi`

---

## 7. P2P 에이전트 메시징

**설명**: 에이전트 간 직접 메시지를 주고받는 인박스 시스템입니다. 읽음/안읽음 상태 추적, 대화 스레드 조회, 에이전트별 inbox 관리를 제공합니다.

**위치**: DevTools 콘솔에서 직접 사용 / 향후 에이전트 타운 UI에서 시각화 예정

**사용법**:

1. 에이전트 간 메시지 전송
2. 수신 에이전트 inbox에서 메시지 확인
3. 두 에이전트 간 전체 대화 내역 조회

**DevTools 콘솔 테스트**:

```js
// 에이전트 간 메시지 전송
const msg = await window.dogbaApi.p2p.send(
    'luna',
    'rio',
    '백엔드 API 스펙 공유 부탁드려요',
);
console.log('전송됨:', msg.message.id);

// rio의 inbox 조회 (전체)
const inbox = await window.dogbaApi.p2p.inbox('rio', false);
inbox.messages.forEach((m) => {
    console.log(
        `[${m.read ? '읽음' : '안읽음'}] ${m.from} → ${m.to}: ${m.content}`,
    );
});

// 안읽은 메시지만 조회
const unread = await window.dogbaApi.p2p.inbox('rio', true);
console.log('안읽은 메시지 수:', unread.messages.length);

// 메시지 읽음 처리
await window.dogbaApi.p2p.markRead('rio', inbox.messages[0].id);

// luna ↔ rio 대화 내역 조회 (시간순 정렬)
const convo = await window.dogbaApi.p2p.conversation('luna', 'rio');
convo.messages.forEach((m) => console.log(`${m.from}: ${m.content}`));

// inbox 초기화
await window.dogbaApi.p2p.clear('rio');

// 신규 메시지 실시간 수신 (이벤트 리스너)
const unsub = window.dogbaApi.p2p.onNewMessage((msg) => {
    console.log('새 메시지 수신:', msg);
});
// 해제: unsub()
```

**예상 결과**:

- 에이전트당 최대 100개 메시지 보관 (초과 시 오래된 것부터 삭제)
- `onNewMessage` 리스너는 메시지 전송 즉시 호출됨

**관련 파일**:

- `apps/desktop/electron/agent-p2p.ts` — `AgentP2PBus` (EventEmitter 기반), in-memory 저장
- `apps/desktop/src/types/electron.d.ts` — `DogbaP2PApi`, `P2PMessage`

---

## 8. 라이브 대시보드

**설명**: 에이전트 상태, 태스크 큐, Top Performers를 실시간으로 시각화하는 대시보드 컴포넌트입니다. 5초마다 자동 갱신됩니다.

**위치**: 하단 독 → "Dashboard" 아이콘 클릭 (또는 RunPanel의 탭 중 하나)

**구성 섹션**:

| 섹션           | 내용                                                         |
| -------------- | ------------------------------------------------------------ |
| Agent Status   | 에이전트별 상태 배지 + 상태별 카운트 요약 바                 |
| Task Queue     | Queued / Running / Completed 탭 전환, 태스크별 우선순위 배지 |
| Top Performers | 완료율 Progress bar + 평균 소요시간, 총 태스크 수            |

**사용법**:

1. 하단 독의 Dashboard 아이콘 클릭
2. Agent Status 카드: 각 에이전트 이름과 현재 상태 확인
3. Task Queue 카드: 탭 버튼으로 Queued/Running/Completed 전환
4. Top Performers 카드: 완료율 내림차순으로 상위 5개 에이전트 표시
5. 데이터는 5초마다 자동으로 IPC를 통해 최신 상태로 갱신됨

**예상 결과**:

- 에이전트가 없으면 "No agents initialized yet" 표시
- 태스크가 없으면 각 탭에 "No [상태] tasks" 표시
- 성과 데이터 없으면 "No performance data yet" 표시

**관련 파일**:

- `apps/desktop/src/components/dashboard/LiveDashboard.tsx` — 전체 컴포넌트 (339줄)
- `apps/desktop/src/store/useTerminalStore.ts` — `agentStates` (상태 머신 맵)

---

## 9. 회고 리포트 생성

**설명**: 에이전트 메트릭 데이터를 기반으로 일간/주간 회고 리포트를 자동 생성하는 기능입니다. Markdown 파일로 저장됩니다.

**저장 경로**: `{프로젝트 디렉토리}/.reports/YYYY-MM-DD_HH-mm_retro_{daily|weekly}.md`

**위치**: DevTools 콘솔 / Mail 탭에서 생성된 리포트 확인 가능

**사용법**:

1. 에이전트들이 태스크를 실행한 후 메트릭이 쌓임
2. 일간/주간 리포트 생성 호출
3. Markdown 파일로 저장 후 경로 반환

**DevTools 콘솔 테스트**:

```js
// 일간 회고 리포트 생성 (오늘 00:00 ~ 현재)
const daily = await window.dogbaApi.retro.daily();
console.log('기간:', daily.startDate, '~', daily.endDate);
console.log('총 태스크:', daily.summary.totalTasks);
console.log('완료:', daily.summary.completedTasks);
console.log('실패:', daily.summary.failedTasks);
console.log('활성 에이전트:', daily.summary.activeAgents);
console.log('개선 제안:', daily.recommendations);

// 주간 리포트 생성 (이번 주 일요일 ~ 현재)
const weekly = await window.dogbaApi.retro.weekly();
console.log(weekly);

// 리포트 파일로 저장
const saved = await window.dogbaApi.retro.save(daily, '/path/to/project');
console.log('저장 경로:', saved.filePath);
// => { success: true, filePath: '/path/to/project/.reports/2026-03-14_15-30_retro_daily.md' }
```

**생성 리포트 내용**:

- 기간 요약 테이블 (총/완료/실패 태스크, 활성 에이전트 수)
- 에이전트별 성과 테이블 (완료 수, 평균 소요시간, 최고 성과 태스크)
- 개선 제안 리스트 (완료율 50% 미만, 평균 5분 초과, 실패율 30% 이상 감지)

**예상 결과**:

- 해당 기간 데이터 없으면 `recommendations: ['해당 기간에 기록된 태스크가 없습니다']`
- 전체 완료율 80% 이상이면 `'팀 성과 우수 — 전체 완료율 80% 이상'` 메시지

**관련 파일**:

- `apps/desktop/electron/retro-generator.ts` — `RetroGenerator`, `toMarkdown()`, `saveReport()`
- `apps/desktop/src/types/electron.d.ts` — `DogbaRetroApi`, `RetroReportData`

---

## 10. 에이전트 피드백 루프

**설명**: 태스크 완료/실패 결과를 처리하여 EXP(경험치) 획득량과 스킬별 성장을 계산하고, 행동 개선 권고사항을 생성하는 학습 피드백 시스템입니다.

**EXP 계산 규칙**:

| 상황                        | EXP            |
| --------------------------- | -------------- |
| 성공 기본                   | 100 EXP        |
| 실패 기본                   | 10 EXP         |
| 속도 보너스 (5분 미만 완료) | 최대 +50 EXP   |
| 스킬 사용 시                | 스킬당 +30 EXP |

**권고사항 자동 생성**:

- 연속 3회 이상 실패 → "태스크 난이도 하향 조정 권장"
- 최근 3회 EXP 상승세 + 성공 → "숙련도 향상 중 — 난이도 상향 가능"
- 특정 스킬 누적 EXP 150 이상 → "{스킬} 스킬 전문가 — 관련 태스크 우선 배정"

**위치**: DevTools 콘솔 / 향후 에이전트 성장 UI에 통합 예정

**사용법**:

1. 에이전트가 태스크를 완료하면 자동으로 `feedback:process` IPC 호출
2. 또는 DevTools에서 수동으로 피드백 이벤트 전송

**DevTools 콘솔 테스트**:

```js
// 성공 피드백 처리 (3분 안에 완료, frontend 스킬 사용)
const result = await window.dogbaApi.feedback.process({
    agentId: 'luna',
    taskId: 'task-001',
    outcome: 'success',
    durationMs: 180_000, // 3분
    skillsUsed: ['frontend', 'code-review'],
});
console.log('EXP 획득:', result.expGained);
// => 100 (기본) + 40 (속도 보너스) = 140 EXP
console.log('스킬 EXP:', result.skillExpGained);
// => { frontend: 30, 'code-review': 30 }
console.log('권고사항:', result.recommendations);

// 실패 피드백
const fail = await window.dogbaApi.feedback.process({
    agentId: 'luna',
    taskId: 'task-002',
    outcome: 'failure',
    durationMs: 600_000, // 10분
});
console.log('실패 EXP:', fail.expGained); // => 10

// 히스토리 조회
const history = await window.dogbaApi.feedback.getHistory('luna');
console.log('피드백 이력 수:', history.history.length);
history.history.forEach((r) => {
    console.log(
        `EXP: ${r.expGained}, 스킬: ${JSON.stringify(r.skillExpGained)}`,
    );
});
```

**예상 결과**:

- 성공 + 5분 미만 완료 시 최대 150 EXP 획득
- 히스토리는 Electron main 프로세스 메모리에 보관 (재시작 시 초기화)

**관련 파일**:

- `apps/desktop/src/lib/feedback-loop.ts` — `calculateFeedback()`, `generateRecommendations()` 순수 함수
- `apps/desktop/src/types/electron.d.ts` — `DogbaFeedbackApi`, `FeedbackEvent`, `FeedbackResult`

---

## 11. 에이전트 자동 추천

**설명**: 태스크 설명 텍스트를 분석하여 가장 적합한 에이전트를 자동 추천하는 기능입니다. 13개 도메인(frontend, backend, security 등)에 대한 키워드 매칭과 에이전트 스킬 프로파일을 결합하여 점수를 계산합니다.

**위치**: 채팅 입력창에서 `#` 입력 후 타이핑 시 자동으로 팝업 (debounce 500ms)

**추천 로직**:

1. 태스크 텍스트에서 도메인 키워드 추출 (13개 도메인, 한/영 혼용)
2. 각 에이전트의 스킬 프로파일과 도메인 매칭 점수 계산
3. 점수 내림차순으로 상위 3개 에이전트 카드 표시

**사용법**:

1. 채팅 입력창에서 `#` 입력
2. 태스크 내용 타이핑 (예: `# React 컴포넌트 성능 최적화`)
3. 500ms 후 추천 패널이 입력창 위에 자동 표시
4. 추천 카드 클릭 → 해당 에이전트 탭으로 전환 후 태스크 전송

**DevTools 콘솔 테스트**:

```js
// 에이전트 추천 API 직접 호출
const recs = await window.dogbaApi.agent.recommend(
    'React 컴포넌트 리팩토링 및 성능 최적화',
);
recs.forEach((r) => {
    console.log(`${r.agentId}: ${r.score}점 — ${r.reason}`);
});
// 예시 출력:
// luna: 8점 — 프론트엔드 개발 — 관련 스킬: Frontend, Code Review, Refactor
// somi: 4점 — 성능 최적화 전문가 — 관련 스킬: Performance, Refactor

// 보안 관련 태스크
const secRecs = await window.dogbaApi.agent.recommend(
    'OWASP 취약점 점검 및 인증 코드 감사',
);
secRecs.forEach((r) => console.log(r.agentId, r.score));
// => duri(보안 감사), podo(코드 리뷰), ...

// 도메인 키워드가 없는 일반 텍스트 (빈 배열 반환)
const noMatch = await window.dogbaApi.agent.recommend('안녕하세요');
console.log(noMatch); // => []
```

**예상 결과**:

- 도메인 키워드 없으면 빈 배열 반환
- 최대 5개 추천 (UI에서는 상위 3개만 표시)
- 각 추천에 에이전트 역할 + 매칭 스킬 목록이 `reason`에 포함

**관련 파일**:

- `apps/desktop/electron/agent-recommender.ts` — `recommendAgents()`, 도메인 키워드 매핑
- `apps/desktop/electron/skill-map.ts` — `CHARACTER_SKILLS` (25개 에이전트 스킬 프로파일)
- `apps/desktop/src/components/agent/AgentRecommendPanel.tsx` — 추천 카드 UI

---

## 12. 스킬 마켓플레이스

**설명**: 에이전트에게 외부 스킬을 설치/제거하는 마켓플레이스 기능입니다. 로컬 스킬(`.claude/skills/` 디렉토리)과 원격 카탈로그(10개 사전 등록)를 관리합니다.

**위치**: Settings 모달 → Skills 탭 / DevTools 콘솔

**스킬 타입**:

- **로컬 스킬**: `.claude/skills/*.md` 파일로 정의된 스킬 (프로젝트별)
- **기본 스킬**: 앱 초기화 시 자동 설치되는 3개 기본 스킬
- **마켓플레이스 스킬**: 원격 카탈로그에서 검색/설치 가능한 10개 스킬

**사용법**:

1. 스킬 목록 조회 → 현재 설치된 스킬 확인
2. 마켓플레이스 검색 → 키워드로 사용 가능한 스킬 탐색
3. 스킬 설치 → 해당 에이전트의 기능 강화
4. 불필요한 스킬 제거

**DevTools 콘솔 테스트**:

```js
// 현재 설치된 스킬 목록 조회
const local = await window.dogbaApi.skill.list();
console.log('설치된 스킬 수:', local.skills.length);
local.skills.forEach((s) => console.log(s.id, '-', s.name));

// 기본 스킬 설치 (처음 실행 시)
const defaults = await window.dogbaApi.skill.installDefaults();
console.log('설치됨:', defaults.installed);
console.log('건너뜀:', defaults.skipped);

// 마켓플레이스 검색
const found = await window.dogbaApi.skill.search('security');
found.skills.forEach((s) => {
    console.log(
        `[${s.installed ? '설치됨' : '미설치'}] ${s.id}: ${s.description}`,
    );
    console.log('  태그:', s.tags.join(', '));
});

// 스킬 설치
const installed = await window.dogbaApi.skill.install(
    'advanced-security-audit',
);
console.log('설치 결과:', installed.success);

// 스킬 제거
const removed = await window.dogbaApi.skill.uninstall(
    'advanced-security-audit',
);
console.log('제거 결과:', removed.success);

// 특정 에이전트의 스킬 조회
const agentSkills = await window.dogbaApi.skill.getAgentSkills('luna');
agentSkills.skills.forEach((s) => console.log(s.id, s.label));
```

**예상 결과**:

- 스킬 검색 결과에 `installed: true/false` 상태 포함
- 스킬 설치 후 해당 에이전트의 시스템 프롬프트에 스킬 지시사항이 자동 추가됨
- 이미 설치된 스킬을 `installDefaults()`로 재설치 시 `skipped` 배열에 포함

**관련 파일**:

- `apps/desktop/electron/skill-map.ts` — `CHARACTER_SKILLS`, `ArtibotSkill` 타입
- `apps/desktop/src/types/electron.d.ts` — `DogbaSkillApi`, `SkillInfo`, `MarketplaceSkillInfo`

---

## 전체 기능 통합 테스트 시나리오

아래는 12개 기능을 연계하여 하나의 시나리오로 테스트하는 예시입니다.

```js
// 1. 팀 템플릿으로 팀 구성 확인
const tpl = await window.dogbaApi.teamTemplate.suggest(
    'react 웹앱 fullstack 개발',
);
console.log('추천 팀:', tpl.template?.name);

// 2. 에이전트 추천으로 최적 담당자 확인
const recs =
    await window.dogbaApi.agent.recommend('React 로그인 컴포넌트 개발');
console.log('추천 에이전트:', recs[0]?.agentId);

// 3. 태스크 큐에 등록
const task = await window.dogbaApi.taskQueue.enqueue({
    description: 'React 로그인 컴포넌트 개발',
    priority: 'high',
    assignedAgent: recs[0]?.agentId,
});
console.log('태스크 ID:', task.taskId);

// 4. Dispatch 후 상태 확인
await window.dogbaApi.taskQueue.dispatch();
const queue = await window.dogbaApi.taskQueue.list();
console.log('실행 중:', queue.running.length);

// 5. 완료 처리 및 피드백 기록
await window.dogbaApi.taskQueue.complete(task.taskId, '컴포넌트 구현 완료');
await window.dogbaApi.feedback.process({
    agentId: recs[0]?.agentId,
    taskId: task.taskId,
    outcome: 'success',
    durationMs: 240_000,
    skillsUsed: ['frontend'],
});

// 6. 성과 메트릭 확인
const metrics = await window.dogbaApi.metrics.get(recs[0]?.agentId);
console.log('완료율:', (metrics.completionRate * 100).toFixed(0) + '%');

// 7. 일간 회고 리포트 생성
const retro = await window.dogbaApi.retro.daily();
console.log('개선 제안:', retro.recommendations);
```

---

_최종 업데이트: 2026-03-14 | Phase 4 구현 기준_
