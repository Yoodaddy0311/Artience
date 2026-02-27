# CLI 핵심기능 미처리 업무 + Dokba Town 비전

> 조사일: 2026-02-27 | 최종 업데이트: 2026-02-27
> 조사 방식: 코드베이스 전수조사 + Remote Control 문서 리서치 + 비전 논의

---

## Part 1: CLI 핵심기능 미처리 업무

### CRITICAL (핵심 기능 미동작)

| # | 미처리 항목 | 현황 | 위치 |
|---|-----------|------|------|
| 1 | **에이전트 채팅 AI 연동** | 하드코딩 한국어 랜덤 응답만 반환, 실제 LLM 미연결 | `ws.py` CHAT_MESSAGE |
| 2 | **agentId 매핑** | 모든 에이전트가 `"a01"`로 고정 (Sera든 뭐든 전부 a01) | `ws.py` L227, L268 |
| 3 | **Artifacts 전용 엔드포인트** | studio/assets API 임시 재활용 중, 전용 `/api/jobs/artifacts` 없음 | `RunPanel.tsx` L509 |

### HIGH (사용자 경험 직접 영향)

| # | 미처리 항목 | 현황 |
|---|-----------|------|
| 4 | Inspector 카드 | 에이전트 클릭 시 상세정보 패널 미구현 |
| 5 | Draft Preview | PixiJS 월드 프리뷰 미구현 (2D Canvas 간이 버전만) |
| 6 | 레시피 동적 관리 | 5개 하드코딩 DEMO_RECIPES → DB CRUD + project.json 연동 필요 |
| 7 | WebSocket URL | `localhost:8000` 하드코딩 3곳 → appSettings.apiUrl 사용 필요 |

### MEDIUM (품질/확장성)

| # | 항목 | 비고 |
|---|------|------|
| 8 | NanoBanana 서비스 | 전체가 mock (실제 API 호출 주석 처리) |
| 9 | project.json 전역 상태 | Run/Studio 모드 간 Zustand 실시간 연동 미구현 |
| 10 | 업로드 후처리 | 썸네일 자동 생성, 태그 스캔/필터링 미구현 |
| 11 | Version Diff 비교뷰 | JSON diff 요약 미구현 |
| 12 | **테스트 커버리지** | FE 3개, BE 2개, E2E 1개 — CI도 `continue-on-error: true` |

### LOW (인프라/배포)

| # | 항목 |
|---|------|
| 13 | Dockerfile 작성 + GCP Cloud Run 배포 |
| 14 | GCS 에셋 스토리지 연동 |
| 15 | 25명 에이전트 A* 전면 적용 (기획 확정 대기) |
| 16 | 다방향 스프라이트 애니메이션 확장 |
| 17 | print() → logging 전환 (백엔드 6건) |

### 코드 내 TODO/FIXME (2건)

| 파일 | 라인 | 내용 |
|------|------|------|
| `apps/desktop/src/components/run/RunPanel.tsx` | L509 | `// TODO: Run-specific artifacts endpoint 분리 필요` |
| `apps/api/app/routers/ws.py` | L227 | `"a01" if agent.lower() == "sera" else "a01" # TODO: map by name` |

### 더미/스텁 코드 현황

| 파일 | 상태 | 설명 |
|------|------|------|
| `nano_banana.py` | 전체 Fake | 이미지 생성 API 전부 mock 데이터 |
| `ws.py` CHAT_MESSAGE | 하드코딩 | 역할별 미리 작성된 한국어 랜덤 선택 |
| `ws.py` CHAT_COMMAND | 부분 구현 | agentId 항상 "a01" 고정 |
| `jobs.py` DEMO_RECIPES | 하드코딩 | 5개 데모 레시피 인메모리 |
| `RunPanel.tsx` Artifacts | 임시 | studio/assets API 재활용 |

### 테스트 현황

- **프론트엔드**: 단위 3개 (useAppStore, logParser, grid-world), 컴포넌트 테스트 0개
- **백엔드**: 2개 (export_service, auth), 주요 라우터 테스트 0개
- **E2E**: 1개 (앱 로드 확인만), 실질 사용자 플로우 0개
- **CI**: `continue-on-error: true` — 테스트 실패해도 통과

---

## Part 2: Remote Control 기술 분석

### Remote Control 핵심 구조
- **통신**: 아웃바운드 HTTPS 폴링 (인바운드 포트 불필요)
- **중계**: Anthropic API가 웹/모바일 ↔ 로컬 세션 메시지 라우팅
- **보안**: TLS 암호화, 단기 자격 증명, 세션별 독립 만료
- **연결**: QR 코드, 세션 URL, claude.ai/code 목록
- **제약**: Pro/Max 플랜 필요, 세션당 1 연결, 터미널 열려있어야 함

### Claude Code 프로그래매틱 인터페이스
- `claude -p "query"` — 비대화형 실행
- `--output-format stream-json` — 구조화 스트리밍 출력
- `--input-format stream-json` — 스트리밍 입력
- `--json-schema` — 스키마 기반 출력 검증
- `--agents` — 런타임 커스텀 서브에이전트 동적 정의
- `--system-prompt` / `--append-system-prompt` — 시스템 프롬프트 제어
- `--max-turns`, `--max-budget-usd` — 실행 제한
- `--permission-mode` — 권한 모드 제어
- `--worktree` — git worktree 격리 병렬 세션
- `--teleport` — 웹 세션을 로컬로 이동
- Agent SDK (`@anthropic-ai/claude-code-sdk`) — 프로그래매틱 전체 SDK

### Remote Control 한계와 대응 전략

| 한계 | 대응 |
|------|------|
| 세션당 1연결 | 유저당 1세션이므로 문제 없음 (N유저 = N세션) |
| 터미널 필요 | Electron 앱 or CLI 데몬이 백그라운드 실행 |
| Pro/Max 전용 | **이것이 비즈니스 모델** — 유저가 자기 구독 사용 |
| API 키 미지원 | OAuth 인증 or CLI 세션 기반 |

**핵심 인사이트**: Remote Control의 "한계"가 아니라 "구독 기반 과금"이 강점.
- API 방식: 플랫폼이 토큰당 과금 부담 → 스케일할수록 적자
- 구독 방식: 유저가 자기 Claude Pro/Max 구독 → 플랫폼 AI 비용 ZERO

---

## Part 3: Dokba Town 비전 — 멀티유저 AI 에이전트 RPG 오피스

### 핵심 컨셉: "모든 유저가 자기 세계의 CTO"

```
유저 A 시점:  나 = CTO,  유저B 캐릭터 = FE개발자,  유저C 캐릭터 = QA
유저 B 시점:  나 = CTO,  유저A 캐릭터 = 백엔드,   유저C 캐릭터 = DevOps
유저 C 시점:  나 = CTO,  유저A 캐릭터 = 아키텍트,  유저B 캐릭터 = PM
```

### 시스템 구조

```
┌─────────────────────────────────────────────────┐
│                  Dokba Town                      │
│                                                  │
│  [25개 직업(Job) 슬롯]                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │PM    │ │FE Dev│ │BE Dev│ │QA    │ ...        │
│  │Sera  │ │Luna  │ │Rio   │ │Ara   │           │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘           │
│     │        │        │        │                 │
│  ┌──┴───┐ ┌──┴───┐ ┌──┴───┐ ┌──┴───┐           │
│  │AI 🤖 │ │유저B │ │AI 🤖 │ │유저C │           │
│  │(자동) │ │(참여)│ │(자동) │ │(참여)│           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                  │
│  [CTO: 유저A] ─── 업무 배정, 팀 운영               │
└─────────────────────────────────────────────────┘
```

- 25개 에이전트는 "직업(Job)" 슬롯으로 존재
- CTO가 업무 요청 → 필요한 직업 슬롯 활성화
- 다른 유저의 캐릭터가 업무에 따라 직업을 받아 활동
- **빈 슬롯 = AI가 자동 수행** (유저의 Claude 구독 사용)
- **유저가 있는 슬롯 = 다른 유저의 Claude가 수행**

### 핵심 메카닉

**1. 캐릭터 시스템**
- 유저가 자신의 아바타 커스터마이징 (외형, 이름)
- 자기 타운에서는 CTO, 남의 타운에서는 직업을 받는 에이전트
- 레벨업하면 더 고급 직업 해금 가능

**2. 직업(Job) 시스템**
- 25개 직업 슬롯이 업무에 따라 활성화
- CTO 업무 요청 → 필요 직업 자동 분석 → 슬롯 배정
- 유저 캐릭터 우선 배정, 빈 슬롯은 AI 자동 수행
- 유저가 직업 수행 = 그 유저의 Claude Code가 실제 작업

**3. AI-유저 협업 모드**
```
유저 B가 "프론트엔드 개발자" 슬롯에 배정되면:
→ 유저 B의 Claude Code가 태스크 수신 (유저 B의 구독으로)
→ AI가 코드 초안 생성
→ 유저 B가 리뷰/수정/승인 (또는 AI 자동)
→ 결과물이 CTO(유저 A)의 타운에 반영
→ 유저 B: 경험치 획득, 레벨업
```

**4. 게이미피케이션** (기존 기반 코드 활용)
- 코인/다이아몬드: 태스크 완료 시 획득
- 레벨: 직업별 숙련도 (Lv1 인턴 → Lv10 시니어)
- 랭킹: 기여도 리더보드
- 업적: "첫 PR 머지", "100줄 코드 리뷰" 등

### 비즈니스 모델

```
기존 AI SaaS:
  유저 → 플랫폼 (월 $50) → OpenAI/Anthropic API ($$$) → 마진 압박

Dokba Town:
  유저 → Claude 구독 ($20-100/월, 유저가 직접 결제)
       → Artifarm 구독 ($10-30/월, 순수 플랫폼 수익)
       → AI 비용 ZERO, 오케스트레이션만 제공

= 유저는 어차피 Claude 구독 중 → Artifarm은 "더 재밌게 쓰는 방법" 제공
= 플랫폼은 서버 비용만 부담 → 높은 마진
```

### 차별화

| 기존 서비스 | Dokba Town |
|------------|------------|
| Gather.town | 사람만 있는 가상 오피스 |
| Cursor/Copilot | AI가 코드만 짜주는 도구 (1:1) |
| **Dokba Town** | **N명 유저 + 25 AI가 같은 공간에서 같은 직업으로 함께 일하는 세계** |

---

## Part 4: 기술 실현 방안 — CLI Daemon + MCP 하이브리드

### 방법 비교

| | CLI Daemon (방법 3) | MCP 브릿지 (방법 1) | SDK 내장 (방법 2) |
|---|---|---|---|
| **유저 경험** | CLI 명령어 1줄 | MCP 설치 필요 | 앱만 설치 |
| **구독 활용** | 유저 구독 사용 | 유저 구독 사용 | 유저 구독 사용 |
| **플랫폼 AI 비용** | ZERO | ZERO | ZERO |
| **구현 난이도** | 중하 | 중 | 중상 |
| **공식 지원** | CLI 공식 기능 | MCP 공식 프로토콜 | SDK 공식 |
| **실현 가능성** | **높음** | **높음** | 검증 필요 |
| **양방향 통신** | stdin/stdout | WebSocket | 프로그래매틱 |
| **용도** | 빠른 MVP | 정식 통합 | 최종 형태 |

### 선택: 방법 3(CLI Daemon) → 방법 1(MCP 브릿지) 순차 진화

---

## Part 5: 하이브리드 구현 계획 (CLI Daemon + MCP)

### 전체 아키텍처

```
Phase 1: CLI Daemon                    Phase 2: MCP 브릿지
┌──────────────────┐                  ┌──────────────────┐
│ 유저 PC           │                  │ 유저 PC           │
│                   │                  │                   │
│ $ dokba connect   │                  │ Claude Code       │
│   ↓               │                  │  ├─ artifarm-mcp  │
│ claude -p         │                  │  │  (자동 연결)     │
│  --input stdin    │                  │  └─ 유저 구독 사용  │
│  --output json    │◄──WebSocket──►  │◄──WebSocket──►    │
│                   │   Platform       │   Platform        │
└──────────────────┘                  └──────────────────┘
         ▼                                     ▼
┌──────────────────────────────────────────────────────┐
│                Artifarm Platform Server                │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐           │
│  │ Room Mgr │  │ Task Queue│  │ State Sync│           │
│  │ (타운관리) │  │ (업무분배) │  │ (실시간)   │           │
│  └─────────┘  └──────────┘  └───────────┘           │
│                                                       │
│  ┌─────────────────────────────────────────┐         │
│  │           Dokba Town Engine              │         │
│  │  유저A(CTO) ←→ 유저B(FE) ←→ 유저C(QA)   │         │
│  │  25개 직업 슬롯 + 캐릭터 매핑 + 게이미피케이션 │         │
│  └─────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────┘
```

---

### Phase 1: CLI Daemon MVP (3주)

> 목표: "유저의 Claude Code를 플랫폼에 연결하여 태스크를 수행하는" 핵심 루프 검증

#### Sprint 1-A: Dokba CLI Wrapper (1주)

**구현물**: `dokba` CLI 도구 — 유저의 Claude Code를 Artifarm에 연결하는 래퍼

```bash
# 유저가 실행하는 명령어 (이게 전부)
$ npx @dokba/cli connect --room abc123 --token <user-token>

# 내부 동작:
# 1. Artifarm 서버에 WebSocket 연결
# 2. 룸 참가 + 캐릭터 등록
# 3. 태스크 수신 대기 (polling)
# 4. 태스크 수신 시 → claude -p 실행 (유저의 구독)
# 5. 결과를 서버로 전송
```

**파일 구조**:
```
packages/cli-connector/
├── package.json
├── src/
│   ├── index.ts              # CLI 엔트리포인트 (commander.js)
│   ├── connector.ts          # WebSocket 연결 관리
│   ├── claude-runner.ts      # claude -p subprocess 실행
│   ├── task-handler.ts       # 태스크 수신 → Claude 실행 → 결과 반환
│   └── auth.ts               # 유저 토큰 인증
└── tsconfig.json
```

**핵심 코드 흐름**:
```
1. WebSocket 연결 → Artifarm 서버
2. 서버로부터 태스크 수신 (JSON)
   {
     "type": "task",
     "taskId": "t-001",
     "job": "frontend-developer",
     "prompt": "로그인 페이지의 폼 검증 로직을 구현해줘",
     "context": { "projectPath": "/user/project", "files": [...] }
   }
3. claude -p 실행
   $ claude -p "{prompt}" \
     --output-format stream-json \
     --system-prompt "당신은 {job} 역할입니다..." \
     --max-turns 10 \
     --max-budget-usd 1.0
4. 스트리밍 결과를 서버로 중계
   { "type": "progress", "taskId": "t-001", "status": "thinking", "content": "..." }
   { "type": "progress", "taskId": "t-001", "status": "coding", "content": "..." }
   { "type": "result", "taskId": "t-001", "status": "complete", "output": {...} }
5. CTO의 타운에서 실시간 시각화
```

**성공 기준**:
- [ ] `dokba connect` 명령어로 서버 연결
- [ ] 서버에서 태스크 수신
- [ ] `claude -p`로 태스크 실행 (유저 구독 사용)
- [ ] 결과를 서버로 반환

#### Sprint 1-B: Platform Task Router (1주)

**구현물**: 서버 측 태스크 분배 + 룸 관리

**백엔드 추가 (FastAPI)**:
```
apps/api/app/
├── routers/
│   ├── rooms.py              # 룸 CRUD + 참가/퇴장
│   └── tasks.py              # 태스크 생성 → 직업 매칭 → 유저 배정
├── services/
│   ├── room_service.py       # 룸 상태 관리
│   ├── task_router.py        # 태스크 → 직업 분석 → 가용 유저 배정
│   └── job_matcher.py        # 업무 내용 → 25개 직업 중 최적 매칭
└── models/
    ├── room.py               # Room, Member, Character 모델
    ├── task.py               # Task, Assignment 모델
    └── job.py                # 25개 직업 정의 + 매칭 규칙
```

**태스크 라우팅 로직**:
```
CTO가 "로그인 페이지 만들어줘" 입력
  ↓
job_matcher: 업무 분석 → "frontend-developer" 직업 필요
  ↓
task_router: 가용 유저 중 FE 슬롯 배정
  ├─ 유저 B가 연결됨 → 유저 B의 Claude에 태스크 전달
  └─ 유저 없음 → 플랫폼 fallback (API 호출 or 대기)
  ↓
결과 반환 → CTO 타운에 반영
```

**성공 기준**:
- [ ] 룸 생성/참가 API
- [ ] CTO 태스크 생성 → 직업 자동 매칭
- [ ] 연결된 유저의 Claude에 태스크 전달
- [ ] 결과 수신 및 CTO에게 전달

#### Sprint 1-C: 프론트엔드 통합 (1주)

**구현물**: 기존 Dokba Town UI에 멀티유저 + 직업 시스템 반영

**변경 사항**:
```
apps/desktop/src/
├── components/
│   ├── agent-town/
│   │   └── AgentTown.tsx     # 유저 캐릭터 렌더링 추가 (다른 유저 = 에이전트 스킨)
│   ├── run/
│   │   └── RunPanel.tsx      # CTO 태스크 입력 → task_router 연동
│   └── room/                 # [신규]
│       ├── RoomLobby.tsx     # 룸 생성/참가 UI
│       ├── RoomCode.tsx      # 초대 코드 공유
│       └── MemberList.tsx    # 참가자 목록 + 직업 표시
├── stores/
│   └── useRoomStore.ts       # 룸 상태 관리 (Zustand)
└── services/
    └── roomSocket.ts         # 룸 전용 WebSocket 관리
```

**CTO 뷰에서 보이는 것**:
```
AgentTown 캔버스:
  - 유저 B의 캐릭터 → "Luna(FE개발자)" 이름표 + 작업 상태 말풍선
  - 유저 C의 캐릭터 → "Ara(QA)" 이름표 + 테스트 진행 중 표시
  - 빈 슬롯 에이전트 → 기존 수달 캐릭터 + AI 아이콘
  - 태스크 진행 바 + 실시간 로그 스트리밍
```

**성공 기준**:
- [ ] 룸 로비에서 초대 코드로 참가
- [ ] CTO가 태스크 입력 → 다른 유저에게 직업 배정 시각화
- [ ] 유저 캐릭터가 AgentTown에 에이전트로 표시
- [ ] 태스크 진행 상황 실시간 반영

---

### Phase 2: MCP 브릿지 정식 버전 (3주)

> 목표: CLI 래퍼 → MCP 서버로 업그레이드, Claude Code 네이티브 통합

#### Sprint 2-A: Artifarm MCP Server 개발 (1주)

**구현물**: `@dokba/mcp-server` — Claude Code에 설치하는 MCP 서버

```
packages/mcp-server/
├── package.json
├── src/
│   ├── index.ts              # MCP 서버 엔트리포인트
│   ├── tools/
│   │   ├── connect-room.ts   # MCP Tool: 룸 연결
│   │   ├── receive-task.ts   # MCP Tool: 태스크 수신
│   │   ├── submit-result.ts  # MCP Tool: 결과 제출
│   │   ├── get-status.ts     # MCP Tool: 타운 상태 조회
│   │   └── chat-agent.ts     # MCP Tool: 에이전트 간 대화
│   ├── resources/
│   │   ├── room-state.ts     # MCP Resource: 룸 실시간 상태
│   │   └── task-queue.ts     # MCP Resource: 대기 중 태스크
│   └── transport/
│       └── ws-bridge.ts      # WebSocket ↔ MCP 브릿지
└── tsconfig.json
```

**유저 설정 (한 줄)**:
```json
// ~/.claude/settings.json 또는 .mcp.json
{
  "mcpServers": {
    "dokba": {
      "command": "npx",
      "args": ["@dokba/mcp-server", "--room", "abc123", "--token", "xxx"]
    }
  }
}
```

**Claude Code에서 자연스럽게 동작**:
```
유저 B의 Claude Code 세션:
> [Dokba] 새 태스크가 도착했습니다: "로그인 폼 검증 구현"
> [Dokba] 직업: Frontend Developer (Luna)
> [Dokba] 프로젝트 컨텍스트를 로드합니다...

Claude: 로그인 폼 검증을 구현하겠습니다.
  (파일 읽기, 코드 작성, 테스트 실행 — 모두 유저 B의 구독으로)

> [Dokba] 결과를 CTO에게 전달합니다... ✅
```

**Phase 1 대비 장점**:
- Claude Code 네이티브 통합 (별도 래퍼 불필요)
- MCP Tool/Resource로 풍부한 상호작용
- Claude Code의 모든 도구(파일 R/W, bash, git) 자연스럽게 활용
- 양방향 실시간 통신

#### Sprint 2-B: 자동 연결 + 백그라운드 모드 (1주)

**구현물**: 유저가 의식하지 않아도 자동으로 Dokba에 연결

```
자동 연결 흐름:
1. Claude Code 실행 시 MCP 서버 자동 시작
2. Artifarm 서버에 자동 등록 (토큰 캐싱)
3. 백그라운드에서 태스크 대기
4. 태스크 도착 시 알림 → 유저 승인 or 자동 실행
5. 결과 자동 전송
```

**권한 모드**:
```json
{
  "dokba": {
    "autoAcceptTasks": false,     // true: AI가 자동 수행
    "requireApproval": true,      // 유저 승인 필요 여부
    "maxBudgetPerTask": 1.0,      // 태스크당 최대 비용 ($)
    "allowedJobs": ["frontend-developer", "qa"]  // 수행 가능 직업 제한
  }
}
```

#### Sprint 2-C: Phase 1 → Phase 2 마이그레이션 (1주)

- CLI Daemon 유저를 MCP 서버로 전환
- 서버 측 프로토콜 통일 (WebSocket 메시지 포맷)
- 프론트엔드 변경 없음 (서버 측만 교체)

---

### Phase 3: 게이미피케이션 + 폴리시 (2주)

> 목표: 재미 요소 강화, 유저 리텐션

#### Sprint 3-A: 직업 레벨링 시스템 (1주)

**기존 코드 활용**: `gamification` 컴포넌트 (feature flag 해제)

```
직업별 숙련도:
  유저 B — Frontend Developer
  ├─ Lv 1: 인턴 (간단한 UI 태스크만)
  ├─ Lv 3: 주니어 (컴포넌트 구현)
  ├─ Lv 5: 미드레벨 (페이지 단위 작업)
  ├─ Lv 7: 시니어 (아키텍처 결정)
  └─ Lv 10: 리드 (코드 리뷰 권한)

보상:
  - 태스크 완료 → 경험치 + 코인
  - 다른 CTO에게 높은 평가 → 보너스 다이아몬드
  - 연속 출석 → 스트릭 보너스
  - 직업 마스터 → 특수 이펙트 + 뱃지
```

#### Sprint 3-B: 소셜 + 랭킹 (1주)

```
랭킹 시스템:
  - 주간 기여도 랭킹 (태스크 완료 수 × 품질)
  - 직업별 랭킹 (FE 1위, BE 1위...)
  - CTO 인기도 (팀원들의 참여율)

소셜 기능:
  - 타운 방문 (다른 유저의 타운 구경)
  - 캐릭터 커스터마이징 상점 (코인으로 구매)
  - 프로젝트 쇼케이스 (완성된 결과물 전시)
```

---

### Phase 4: 고급 기능 (장기)

#### Remote Control 모바일 연동
- CTO가 모바일에서 타운 모니터링
- claude.ai/code에서 Remote Control로 세션 관찰
- 긴급 태스크 모바일 승인

#### Agent Mesh Network
- 25개 에이전트(유저+AI)가 자율적으로 협업
- PM 에이전트가 자동 태스크 분배
- 코드 리뷰 → 머지까지 자동화

#### Recipe Marketplace
- 유저가 만든 워크플로우 레시피 공유/거래
- 코인/다이아몬드로 구매
- 인기 레시피 제작자 수익 분배

---

## 구현 타임라인 요약

```
Phase 1 (3주) — CLI Daemon MVP
  ├─ Week 1: dokba CLI 래퍼 + claude -p 연동
  ├─ Week 2: 서버 태스크 라우터 + 직업 매칭
  └─ Week 3: 프론트엔드 룸/멀티유저 통합

Phase 2 (3주) — MCP 브릿지 정식
  ├─ Week 4: @dokba/mcp-server 개발
  ├─ Week 5: 자동 연결 + 백그라운드 모드
  └─ Week 6: Phase 1 → 2 마이그레이션

Phase 3 (2주) — 게이미피케이션
  ├─ Week 7: 직업 레벨링 시스템
  └─ Week 8: 소셜 + 랭킹

Phase 4 (장기) — 고급 기능
  ├─ 모바일 Remote Control 연동
  ├─ Agent Mesh Network
  └─ Recipe Marketplace
```

---

## 핵심 인사이트

> 1. CRITICAL 미처리 #1(AI 연동) + #2(agentId 매핑) 해결 = Live Brain Phase 1 구현
> 2. **미처리 업무 해결과 혁신적 기능이 같은 방향**
> 3. Remote Control의 강점 = 구독 과금 → **플랫폼 AI 비용 ZERO** 비즈니스 모델
> 4. CLI Daemon(빠른 검증) → MCP 브릿지(정식) → SDK 내장(최종) 순차 진화
> 5. 모든 유저가 CTO + 다른 유저 캐릭터가 직업을 받는 **RPG형 협업** = 차별화
