# IPC Test Scripts - DevTools Console

> Electron DevTools 콘솔(`Ctrl+Shift+I`)에서 복붙하여 실행하는 IPC 테스트 스크립트.
> 모든 API는 `window.dogbaApi.*`로 접근.

---

## 0. 사전 체크 — API 존재 확인

```js
// dogbaApi가 로드되었는지 확인
(() => {
    const api = window.dogbaApi;
    if (!api) {
        console.error('FAIL: dogbaApi가 없습니다. preload 오류 확인 필요');
        return;
    }
    const groups = [
        'terminal',
        'chat',
        'cli',
        'project',
        'file',
        'studio',
        'job',
        'mail',
        'agent',
        'skill',
        'worktree',
        'hooks',
        'directive',
        'session',
        'metrics',
        'taskQueue',
        'p2p',
        'retro',
        'feedback',
        'provider',
        'workflow',
        'teamTemplate',
        'meeting',
        'messenger',
        'agentDb',
        'notification',
        'report',
    ];
    const found = groups.filter((g) => api[g]);
    const missing = groups.filter((g) => !api[g]);
    console.log(
        `PASS: dogbaApi 로드됨 (${found.length}/${groups.length} 그룹)`,
    );
    if (missing.length) console.warn('MISSING:', missing);
    else console.log('ALL API groups present');
})();
```

---

## 1. CEO Directive 라우팅

CEO 지시(📌), 태스크 할당(#), 일반 메시지 3가지 타입을 테스트한다.

```js
// CEO Directive 라우팅 테스트
(async () => {
    const api = window.dogbaApi?.directive;
    if (!api) {
        console.error('FAIL: directive API 없음');
        return;
    }

    // 현재 터미널 탭 ID (없으면 더미값 사용)
    const dummyTabId = 'test-tab-001';

    const cases = [
        {
            label: '📌 CEO 지시문',
            input: '📌 전체 코드베이스 리팩토링 진행해줘',
            expectType: 'ceo',
        },
        {
            label: '# 태스크 할당',
            input: '#backend-developer 로그인 API 버그 수정',
            expectType: 'task',
        },
        {
            label: '@ 일반 메시지',
            input: '오늘 날씨 어때?',
            expectType: 'normal',
        },
    ];

    console.group('=== CEO Directive 라우팅 테스트 ===');
    for (const c of cases) {
        try {
            const result = await api.route(c.input, dummyTabId);
            const pass = result.success && result.type === c.expectType;
            console.log(
                `${pass ? 'PASS' : 'FAIL'} [${c.label}]`,
                `type=${result.type} (expected: ${c.expectType})`,
                result.routedTo ? `→ ${result.routedTo}` : '',
            );
            if (!pass) console.warn('  결과:', result);
        } catch (e) {
            console.error(`ERROR [${c.label}]`, e.message);
        }
    }
    console.groupEnd();
})();
```

**성공 기준**: 각 케이스에서 `type`이 기대값과 일치하고 `success: true`.

---

## 2. 에이전트 상태 머신

에이전트 관련 IPC(팀 생성, 태스크 위임, 추천)를 테스트한다.

```js
// 에이전트 상태 머신 테스트
(async () => {
    const api = window.dogbaApi?.agent;
    if (!api) {
        console.error('FAIL: agent API 없음');
        return;
    }

    console.group('=== 에이전트 상태 머신 테스트 ===');

    // 2-1. 에이전트 추천 (비파괴적)
    try {
        const recs = await api.recommend('React 컴포넌트 성능 최적화');
        console.log(`PASS: recommend 반환 ${recs.length}개 추천`);
        recs.slice(0, 3).forEach((r) =>
            console.log(`  ${r.agentId} (score: ${r.score}) — ${r.reason}`),
        );
    } catch (e) {
        console.error('FAIL: recommend', e.message);
    }

    // 2-2. 터미널 목록으로 현재 에이전트 확인
    try {
        const terminals = await window.dogbaApi.terminal.list();
        console.log(`INFO: 활성 터미널 ${terminals.length}개`);
        terminals.forEach((t) =>
            console.log(`  [${t.id}] ${t.label} (pid: ${t.pid})`),
        );
    } catch (e) {
        console.error('FAIL: terminal.list', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: `recommend`가 1개 이상 추천 반환. `terminal.list`가 배열 반환.

---

## 3. 태스크 큐 스케줄러

태스크 추가 → 목록 → 완료/취소 플로우를 테스트한다.

```js
// 태스크 큐 스케줄러 전체 플로우 테스트
(async () => {
    const api = window.dogbaApi?.taskQueue;
    if (!api) {
        console.error('FAIL: taskQueue API 없음');
        return;
    }

    console.group('=== 태스크 큐 스케줄러 테스트 ===');

    // 3-1. 태스크 추가 (critical)
    let taskId1;
    try {
        const r = await api.enqueue({
            description: '[TEST] IPC 테스트 태스크 - Critical',
            priority: 'critical',
        });
        taskId1 = r.taskId;
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `enqueue critical → taskId=${taskId1}, dispatched=${r.dispatched}`,
        );
    } catch (e) {
        console.error('FAIL: enqueue', e.message);
    }

    // 3-2. 태스크 추가 (low)
    let taskId2;
    try {
        const r = await api.enqueue({
            description: '[TEST] IPC 테스트 태스크 - Low',
            priority: 'low',
            assignedAgent: 'backend-developer',
        });
        taskId2 = r.taskId;
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `enqueue low → taskId=${taskId2}`,
        );
    } catch (e) {
        console.error('FAIL: enqueue low', e.message);
    }

    // 3-3. 목록 조회
    try {
        const list = await api.list();
        const total =
            list.queued.length + list.running.length + list.completed.length;
        console.log(
            `PASS: list → queued=${list.queued.length}, running=${list.running.length}, completed=${list.completed.length} (total=${total})`,
        );
    } catch (e) {
        console.error('FAIL: list', e.message);
    }

    // 3-4. 완료 처리
    if (taskId1) {
        try {
            const r = await api.complete(taskId1, 'IPC 테스트 완료');
            console.log(r.success ? 'PASS' : 'FAIL', `complete(${taskId1})`);
        } catch (e) {
            console.error('FAIL: complete', e.message);
        }
    }

    // 3-5. 취소
    if (taskId2) {
        try {
            const r = await api.cancel(taskId2);
            console.log(r.success ? 'PASS' : 'FAIL', `cancel(${taskId2})`);
        } catch (e) {
            console.error('FAIL: cancel', e.message);
        }
    }

    // 3-6. 최종 목록 확인
    try {
        const list = await api.list();
        console.log(
            `INFO: 최종 상태 → queued=${list.queued.length}, running=${list.running.length}, completed=${list.completed.length}`,
        );
    } catch (e) {
        console.error('FAIL: final list', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: enqueue 2개 성공, list 반환, complete/cancel 성공.

---

## 4. 세션 히스토리 검색

세션 검색과 메시지 이력 조회를 테스트한다.

```js
// 세션 히스토리 검색 테스트
(async () => {
    const api = window.dogbaApi?.session;
    if (!api) {
        console.error('FAIL: session API 없음');
        return;
    }

    console.group('=== 세션 히스토리 검색 테스트 ===');

    // 4-1. 빈 쿼리 검색 (전체 세션)
    try {
        const r = await api.search('');
        console.log(`PASS: search('') → ${r.sessions.length}개 세션`);
        r.sessions
            .slice(0, 5)
            .forEach((s) =>
                console.log(
                    `  [${s.id}] ${s.agentName} — ${s.label} (${new Date(s.lastActive).toLocaleString()})`,
                ),
            );
    } catch (e) {
        console.error('FAIL: search empty', e.message);
    }

    // 4-2. 키워드 검색
    try {
        const r = await api.search('test');
        console.log(`PASS: search('test') → ${r.sessions.length}개 매칭`);
    } catch (e) {
        console.error('FAIL: search keyword', e.message);
    }

    // 4-3. 특정 세션 이력 (첫 번째 세션이 있으면)
    try {
        const all = await api.search('');
        if (all.sessions.length > 0) {
            const sid = all.sessions[0].id;
            const h = await api.getHistory(sid);
            console.log(
                h.success ? 'PASS' : 'FAIL',
                `getHistory(${sid}) → ${h.messages?.length ?? 0}개 메시지`,
            );
            h.messages
                ?.slice(0, 3)
                .forEach((m) =>
                    console.log(
                        `  [${m.role}] ${m.content.substring(0, 80)}...`,
                    ),
                );
        } else {
            console.log('SKIP: 세션 없음, getHistory 스킵');
        }
    } catch (e) {
        console.error('FAIL: getHistory', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: `search` 배열 반환. `getHistory`가 `success: true`.

---

## 5. 에이전트 성과 메트릭

에이전트별 메트릭 조회와 Top performers를 테스트한다.

```js
// 에이전트 성과 메트릭 테스트
(async () => {
    const api = window.dogbaApi?.metrics;
    if (!api) {
        console.error('FAIL: metrics API 없음');
        return;
    }

    console.group('=== 에이전트 성과 메트릭 테스트 ===');

    // 5-1. 전체 메트릭
    try {
        const all = await api.getAll();
        const agents = Object.keys(all);
        console.log(`PASS: getAll → ${agents.length}개 에이전트 메트릭`);
        agents.slice(0, 5).forEach((id) => {
            const m = all[id];
            console.log(
                `  ${id}: total=${m.totalTasks}, completed=${m.completedTasks}, rate=${(m.completionRate * 100).toFixed(1)}%`,
            );
        });
    } catch (e) {
        console.error('FAIL: getAll', e.message);
    }

    // 5-2. 특정 에이전트 메트릭
    try {
        const m = await api.get('backend-developer');
        console.log(`PASS: get('backend-developer') →`, {
            total: m.totalTasks,
            completed: m.completedTasks,
            failed: m.failedTasks,
            avgMs: m.avgDurationMs,
        });
    } catch (e) {
        console.error('FAIL: get specific', e.message);
    }

    // 5-3. Top performers
    try {
        const top = await api.topPerformers(5);
        console.log(`PASS: topPerformers(5) → ${top.length}개`);
        top.forEach((t, i) =>
            console.log(
                `  #${i + 1} ${t.agentId}: ${t.completedTasks} tasks, ${(t.completionRate * 100).toFixed(1)}%`,
            ),
        );
    } catch (e) {
        console.error('FAIL: topPerformers', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: `getAll` 객체 반환. `topPerformers` 배열 반환 (데이터 없으면 빈 배열).

---

## 6. 팀 템플릿

템플릿 목록, 추천, 생성 플로우를 테스트한다.

```js
// 팀 템플릿 테스트
(async () => {
    const api = window.dogbaApi?.teamTemplate;
    if (!api) {
        console.error('FAIL: teamTemplate API 없음');
        return;
    }

    console.group('=== 팀 템플릿 테스트 ===');

    // 6-1. 목록
    try {
        const r = await api.list();
        console.log(`PASS: list → ${r.templates.length}개 템플릿`);
        r.templates.forEach((t) =>
            console.log(`  [${t.id}] ${t.name} — agents: ${t.agents.length}명`),
        );
    } catch (e) {
        console.error('FAIL: list', e.message);
    }

    // 6-2. 프로젝트 설명으로 추천
    try {
        const r = await api.suggest(
            'React + TypeScript 풀스택 웹 개발 프로젝트',
        );
        if (r.template) {
            console.log(
                `PASS: suggest → ${r.template.name} (${r.template.agents.length}명)`,
            );
        } else {
            console.log('PASS: suggest → null (매칭 템플릿 없음)');
        }
    } catch (e) {
        console.error('FAIL: suggest', e.message);
    }

    // 6-3. 커스텀 템플릿 생성
    try {
        const r = await api.create({
            name: '[TEST] IPC 테스트 팀',
            description: 'IPC 테스트용 임시 팀 템플릿',
            agents: [
                { role: 'lead', agentId: 'backend-developer', required: true },
                { role: 'reviewer', agentId: 'code-reviewer', required: false },
            ],
            suggestedFor: ['testing', 'ipc'],
        });
        console.log(r.success ? 'PASS' : 'FAIL', `create → id=${r.id}`);

        // 6-4. 생성한 템플릿 조회
        if (r.id) {
            const detail = await api.get(r.id);
            console.log(
                detail.template ? 'PASS' : 'FAIL',
                `get(${r.id}) → ${detail.template?.name}`,
            );
        }
    } catch (e) {
        console.error('FAIL: create/get', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: list 배열, suggest 반환(null 허용), create+get 성공.

---

## 7. P2P 메시징

에이전트 간 메시지 전송, 수신함, 대화 조회를 테스트한다.

```js
// P2P 메시징 테스트
(async () => {
    const api = window.dogbaApi?.p2p;
    if (!api) {
        console.error('FAIL: p2p API 없음');
        return;
    }

    console.group('=== P2P 메시징 테스트 ===');

    // 7-1. 메시지 전송
    let msgId;
    try {
        const r = await api.send(
            'backend-developer',
            'code-reviewer',
            '[TEST] 코드 리뷰 요청합니다',
        );
        msgId = r.message?.id;
        console.log(r.success ? 'PASS' : 'FAIL', `send → msgId=${msgId}`);
    } catch (e) {
        console.error('FAIL: send', e.message);
    }

    // 7-2. 수신함 (code-reviewer)
    try {
        const r = await api.inbox('code-reviewer');
        console.log(
            `PASS: inbox('code-reviewer') → ${r.messages.length}개 메시지`,
        );
        r.messages
            .slice(0, 3)
            .forEach((m) =>
                console.log(
                    `  [${m.from}→${m.to}] ${m.content.substring(0, 60)} (read: ${m.read})`,
                ),
            );
    } catch (e) {
        console.error('FAIL: inbox', e.message);
    }

    // 7-3. 읽음 처리
    if (msgId) {
        try {
            const r = await api.markRead('code-reviewer', msgId);
            console.log(r.success ? 'PASS' : 'FAIL', `markRead(${msgId})`);
        } catch (e) {
            console.error('FAIL: markRead', e.message);
        }
    }

    // 7-4. 대화 이력
    try {
        const r = await api.conversation('backend-developer', 'code-reviewer');
        console.log(`PASS: conversation → ${r.messages.length}개`);
    } catch (e) {
        console.error('FAIL: conversation', e.message);
    }

    // 7-5. 정리 (테스트 데이터 삭제)
    try {
        await api.clear('code-reviewer');
        console.log('PASS: clear code-reviewer inbox');
    } catch (e) {
        console.error('FAIL: clear', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: send 성공, inbox 배열 반환, markRead 성공, conversation 배열.

---

## 8. 라이브 대시보드

> UI 컴포넌트이므로 콘솔 테스트 불가. 대신 대시보드에 데이터를 공급하는 메트릭/태스크큐 API를 테스트한다. (5번, 3번 참조)

```js
// 라이브 대시보드 데이터 소스 확인
(async () => {
    console.group('=== 라이브 대시보드 데이터 소스 ===');

    // 메트릭 데이터 존재 여부
    try {
        const all = await window.dogbaApi.metrics.getAll();
        console.log(`INFO: metrics 에이전트 수 = ${Object.keys(all).length}`);
    } catch (e) {
        console.error('FAIL: metrics.getAll', e.message);
    }

    // 태스크 큐 상태
    try {
        const q = await window.dogbaApi.taskQueue.list();
        console.log(
            `INFO: taskQueue → queued=${q.queued.length}, running=${q.running.length}, completed=${q.completed.length}`,
        );
    } catch (e) {
        console.error('FAIL: taskQueue.list', e.message);
    }

    // 터미널(에이전트) 상태
    try {
        const t = await window.dogbaApi.terminal.list();
        console.log(`INFO: 활성 터미널 = ${t.length}`);
    } catch (e) {
        console.error('FAIL: terminal.list', e.message);
    }

    console.log('대시보드 UI 테스트는 앱 화면에서 직접 확인하세요.');
    console.groupEnd();
})();
```

---

## 9. 회고 리포트

일간/주간 회고 생성과 저장을 테스트한다.

```js
// 회고 리포트 테스트
(async () => {
    const api = window.dogbaApi?.retro;
    if (!api) {
        console.error('FAIL: retro API 없음');
        return;
    }

    console.group('=== 회고 리포트 테스트 ===');

    // 9-1. 일간 리포트
    let dailyReport;
    try {
        dailyReport = await api.daily();
        console.log('PASS: daily()', {
            period: dailyReport.period,
            totalTasks: dailyReport.summary?.totalTasks,
            activeAgents: dailyReport.summary?.activeAgents?.length,
            recommendations: dailyReport.recommendations?.length,
        });
    } catch (e) {
        console.error('FAIL: daily', e.message);
    }

    // 9-2. 주간 리포트
    try {
        const weekly = await api.weekly();
        console.log('PASS: weekly()', {
            period: weekly.period,
            startDate: weekly.startDate,
            endDate: weekly.endDate,
            totalTasks: weekly.summary?.totalTasks,
        });
    } catch (e) {
        console.error('FAIL: weekly', e.message);
    }

    // 9-3. 리포트 저장
    if (dailyReport) {
        try {
            const r = await api.save(dailyReport);
            console.log(
                r.success ? 'PASS' : 'FAIL',
                `save → ${r.filePath || r.error}`,
            );
        } catch (e) {
            console.error('FAIL: save', e.message);
        }
    }

    console.groupEnd();
})();
```

**성공 기준**: daily/weekly 반환값에 `period`, `summary` 존재. save 성공.

---

## 10. 피드백 루프

에이전트 학습 피드백 처리와 이력 조회를 테스트한다.

```js
// 피드백 루프 테스트
(async () => {
    const api = window.dogbaApi?.feedback;
    if (!api) {
        console.error('FAIL: feedback API 없음');
        return;
    }

    console.group('=== 피드백 루프 테스트 ===');

    // 10-1. 성공 피드백 처리
    try {
        const result = await api.process({
            agentId: 'backend-developer',
            taskId: 'ipc-test-task-001',
            outcome: 'success',
            durationMs: 15000,
            skillsUsed: ['typescript', 'api-design'],
        });
        console.log('PASS: process(success)', {
            expGained: result.expGained,
            skillExp: result.skillExpGained,
            recommendations: result.recommendations?.length,
        });
    } catch (e) {
        console.error('FAIL: process success', e.message);
    }

    // 10-2. 실패 피드백 처리
    try {
        const result = await api.process({
            agentId: 'backend-developer',
            taskId: 'ipc-test-task-002',
            outcome: 'failure',
            durationMs: 60000,
            skillsUsed: ['database'],
        });
        console.log('PASS: process(failure)', {
            expGained: result.expGained,
            recommendations: result.recommendations,
        });
    } catch (e) {
        console.error('FAIL: process failure', e.message);
    }

    // 10-3. 이력 조회
    try {
        const r = await api.getHistory('backend-developer');
        console.log(`PASS: getHistory → ${r.history.length}개 이력`);
        r.history
            .slice(0, 3)
            .forEach((h) =>
                console.log(
                    `  exp=${h.expGained}, skills=${JSON.stringify(h.skillExpGained)}, recs=${h.recommendations?.length}`,
                ),
            );
    } catch (e) {
        console.error('FAIL: getHistory', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: process 반환값에 `expGained` 존재. getHistory 배열 반환.

---

## 11. 에이전트 추천

다양한 태스크 설명에 대해 에이전트 추천을 테스트한다.

```js
// 에이전트 추천 테스트
(async () => {
    const api = window.dogbaApi?.agent;
    if (!api) {
        console.error('FAIL: agent API 없음');
        return;
    }

    console.group('=== 에이전트 추천 테스트 ===');

    const tasks = [
        { desc: 'REST API 엔드포인트 구현', expectTop: 'backend-developer' },
        { desc: 'React 컴포넌트 UI 개발', expectTop: 'frontend-developer' },
        {
            desc: '보안 취약점 점검 및 코드 감사',
            expectTop: 'security-reviewer',
        },
        { desc: '유닛 테스트 작성 (TDD)', expectTop: 'tdd-guide' },
        { desc: '프로젝트 아키텍처 설계', expectTop: 'architect' },
    ];

    for (const t of tasks) {
        try {
            const recs = await api.recommend(t.desc);
            const top = recs[0];
            const match = top?.agentId === t.expectTop;
            console.log(
                `${match ? 'PASS' : 'WARN'} "${t.desc.substring(0, 30)}..."`,
                `→ top: ${top?.agentId} (score: ${top?.score})`,
                match ? '' : `(expected: ${t.expectTop})`,
            );
            if (recs.length > 1) {
                console.log(
                    `  2nd: ${recs[1].agentId} (${recs[1].score}), 3rd: ${recs[2]?.agentId || '-'}`,
                );
            }
        } catch (e) {
            console.error(`FAIL: "${t.desc.substring(0, 30)}"`, e.message);
        }
    }

    console.groupEnd();
})();
```

**성공 기준**: 각 태스크에 1개 이상 추천 반환. WARN은 top1 불일치지만 추천 자체는 성공.

---

## 12. 스킬 마켓플레이스

스킬 목록, 마켓플레이스 검색, 설치/삭제를 테스트한다.

```js
// 스킬 마켓플레이스 테스트
(async () => {
    const api = window.dogbaApi?.skill;
    if (!api) {
        console.error('FAIL: skill API 없음');
        return;
    }

    console.group('=== 스킬 마켓플레이스 테스트 ===');

    // 12-1. 설치된 스킬 목록
    try {
        const r = await api.list();
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `list → ${r.skills.length}개 설치됨`,
        );
        r.skills.forEach((s) =>
            console.log(
                `  [${s.id}] ${s.name} — ${s.description.substring(0, 50)}`,
            ),
        );
    } catch (e) {
        console.error('FAIL: list', e.message);
    }

    // 12-2. 특정 에이전트 스킬
    try {
        const r = await api.getAgentSkills('backend-developer');
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `getAgentSkills('backend-developer') → ${r.skills.length}개`,
        );
    } catch (e) {
        console.error('FAIL: getAgentSkills', e.message);
    }

    // 12-3. 마켓플레이스 검색
    try {
        const r = await api.search('typescript');
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `search('typescript') → ${r.skills.length}개`,
        );
        r.skills
            .slice(0, 5)
            .forEach((s) =>
                console.log(
                    `  [${s.id}] ${s.name} (installed: ${s.installed}) tags: ${s.tags.join(', ')}`,
                ),
            );
    } catch (e) {
        console.error('FAIL: search', e.message);
    }

    // 12-4. 설치 테스트 (마켓에서 미설치 스킬 찾기)
    try {
        const r = await api.search('');
        const notInstalled = r.skills.find((s) => !s.installed);
        if (notInstalled) {
            console.log(
                `INFO: 미설치 스킬 발견 → ${notInstalled.id} (${notInstalled.name})`,
            );
            const installResult = await api.install(notInstalled.id);
            console.log(
                installResult.success ? 'PASS' : 'FAIL',
                `install(${notInstalled.id})`,
            );

            // 12-5. 삭제 (설치 후 정리)
            if (installResult.success) {
                const unResult = await api.uninstall(notInstalled.id);
                console.log(
                    unResult.success ? 'PASS' : 'FAIL',
                    `uninstall(${notInstalled.id})`,
                );
            }
        } else {
            console.log(
                'SKIP: 모든 스킬이 이미 설치됨, install/uninstall 스킵',
            );
        }
    } catch (e) {
        console.error('FAIL: install/uninstall', e.message);
    }

    // 12-6. 기본 스킬 설치
    try {
        const r = await api.installDefaults();
        console.log(
            r.success ? 'PASS' : 'FAIL',
            `installDefaults → installed=${r.installed?.length}, skipped=${r.skipped?.length}`,
        );
    } catch (e) {
        console.error('FAIL: installDefaults', e.message);
    }

    console.groupEnd();
})();
```

**성공 기준**: list/search 배열 반환. install+uninstall 쌍으로 성공. installDefaults 성공.

---

## Bonus: 전체 스모크 테스트 (한 번에 실행)

모든 비파괴적 API를 한 번에 호출하여 전체 IPC 연결 상태를 확인한다.

```js
// 전체 스모크 테스트 — 읽기 전용 API만 호출
(async () => {
    const api = window.dogbaApi;
    if (!api) {
        console.error('dogbaApi 없음');
        return;
    }

    const tests = [
        ['cli.authStatus', () => api.cli.authStatus()],
        ['terminal.list', () => api.terminal.list()],
        ['project.load', () => api.project.load()],
        ['studio.getAssets', () => api.studio.getAssets()],
        ['studio.getHistory', () => api.studio.getHistory()],
        ['job.getStatus', () => api.job.getStatus()],
        ['job.getSettings', () => api.job.getSettings()],
        ['job.getHistory', () => api.job.getHistory()],
        ['job.getArtifacts', () => api.job.getArtifacts()],
        ['mail.getGitDiff', () => api.mail.getGitDiff()],
        ['skill.list', () => api.skill.list()],
        ['skill.search("")', () => api.skill.search('')],
        ['worktree.list', () => api.worktree.list()],
        ['session.search("")', () => api.session.search('')],
        ['metrics.getAll', () => api.metrics.getAll()],
        ['metrics.topPerformers', () => api.metrics.topPerformers(3)],
        ['taskQueue.list', () => api.taskQueue.list()],
        ['p2p.inbox(ceo)', () => api.p2p.inbox('ceo')],
        ['retro.daily', () => api.retro.daily()],
        [
            'feedback.getHistory',
            () => api.feedback.getHistory('backend-developer'),
        ],
        ['agent.recommend', () => api.agent.recommend('테스트')],
        ['teamTemplate.list', () => api.teamTemplate.list()],
        ['provider.list', () => api.provider.list()],
        ['workflow.list', () => api.workflow.list()],
        ['messenger.list', () => api.messenger.list()],
        ['agentDb.list', () => api.agentDb.list()],
        ['report.list', () => api.report.list()],
    ];

    let pass = 0,
        fail = 0;
    console.group('=== SMOKE TEST: 전체 IPC 연결 확인 ===');

    for (const [name, fn] of tests) {
        try {
            const r = await fn();
            pass++;
            console.log(`PASS  ${name}`);
        } catch (e) {
            fail++;
            console.error(`FAIL  ${name} — ${e.message}`);
        }
    }

    console.log(`\n결과: ${pass} PASS / ${fail} FAIL (총 ${tests.length})`);
    console.groupEnd();
})();
```

---

## 참고

| 파일                      | 설명                       |
| ------------------------- | -------------------------- |
| `src/types/electron.d.ts` | 전체 API 타입 정의 (720줄) |
| `electron/preload.ts`     | 실제 노출된 API (927줄)    |
| `electron/main.ts`        | IPC 핸들러 등록            |

> 작성일: 2026-03-14
