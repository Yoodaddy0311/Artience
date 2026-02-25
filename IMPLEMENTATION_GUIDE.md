# 독바(DogBa) Claude Code 구현 가이드
> 단계별 구현 프롬프트 — 이 파일을 Claude Code에 그대로 사용

---

## 구현 순서 (권장)

```
Phase 1: 기반 (Sprint 1, 1~2주)
  Step 01: 모노레포 스캐폴딩
  Step 02: 디자인 시스템 + UI 컴포넌트
  Step 03: FastAPI 백엔드 기본
  Step 04: Electron 셸 + IPC

Phase 2: 핵심 기능 (Sprint 2, 2주)
  Step 05: 파일 업로드 + 파서
  Step 06: Agent Town (PixiJS 타일맵 + 캐릭터)
  Step 07: Task Graph 오케스트레이터
  Step 08: LLM Router + 기본 에이전트

Phase 3: 완성 (Sprint 3, 2주)
  Step 09: 문서 생성 (PRD/UX/ARCH)
  Step 10: WebSocket 시뮬 동기화
  Step 11: Export ZIP
  Step 12: 통합 테스트 + 마무리
```

---

## Step 01: 모노레포 스캐폴딩

### 프롬프트

```
당신은 시니어 풀스택 엔지니어입니다.

목표: 독바(DogBa) 플랫폼의 모노레포를 생성하세요.

기술 스택:
- 패키지 매니저: pnpm workspace
- 프론트엔드: Electron 33 + React 19 + TypeScript + Vite
- 백엔드: FastAPI (Python 3.12)
- 스타일: Tailwind CSS 4
- 상태 관리: Zustand
- DB: SQLite (SQLAlchemy)
- 시뮬레이션: PixiJS 8

폴더 구조:
dogba/
├── apps/
│   ├── desktop/          # Electron + React
│   │   ├── electron/     # main.ts, preload.ts
│   │   ├── src/          # React 앱
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   └── api/              # FastAPI
│       ├── app/
│       │   ├── main.py
│       │   ├── config.py
│       │   ├── database.py
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── routers/
│       │   ├── services/
│       │   ├── agents/
│       │   └── parsers/
│       ├── requirements.txt
│       └── pyproject.toml
├── packages/
│   ├── shared-types/     # 공유 TypeScript 타입
│   └── design-tokens/    # CSS/JS 디자인 토큰
├── assets/               # 캐릭터/타일셋/사운드
├── docs/                 # 문서
├── scripts/
│   └── dev.sh           # 개발 서버 시작
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── .env.example

요구사항:
1. pnpm workspace로 모노레포 설정
2. Electron main process + preload (IPC bridge) 기본 구현
3. React 앱에서 "Hello DogBa" 렌더 + Tailwind 작동 확인
4. FastAPI에서 GET /api/health → {"status": "ok"} 엔드포인트
5. Electron에서 FastAPI를 자식 프로세스로 시작
6. scripts/dev.sh로 전체 개발 환경 한번에 시작
7. .env.example에 필요한 환경 변수 목록
8. 각 패키지의 tsconfig가 tsconfig.base.json을 확장

제약: 
- React는 Vite로 빌드
- Electron은 electron-builder로 패키징
- Python 가상환경 사용
```

---

## Step 02: 디자인 시스템 + UI 컴포넌트

### 프롬프트

```
당신은 시니어 프론트엔드 엔지니어이자 디자인 시스템 전문가입니다.

목표: 독바(DogBa) 디자인 시스템을 구현하세요.

디자인 컨셉: "귀여운 동물 친구들의 사무실"
- 치비/카와이 스타일 캐릭터
- 파스텔 + 따뜻한 톤
- 둥근 모서리, 부드러운 그림자
- 두꺼운 아웃라인 미학

디자인 토큰 (packages/design-tokens/tokens.css):
[여기에 DESIGN_GUIDE.md의 CSS 변수 전체를 붙여넣기]

구현할 UI 컴포넌트 (apps/desktop/src/components/ui/):
1. Button — primary(그라디언트)/secondary/ghost/icon 변형
2. Card — 호버 효과, 캐릭터 아바타 슬롯
3. Input — 기본 입력/textarea/채팅 입력(둥근)
4. Badge — success/error/warning/info/running + 역할별(PM/Dev/QA...)
5. Modal — 배경 블러, bounce 애니메이션, ESC 닫기
6. Toast — 슬라이드업, 자동 사라짐, 아이콘
7. ProgressBar — 그라디언트 바/스텝 프로그레스
8. Tabs — 활성 탭 하이라이트, 애니메이션
9. SpeechBubble — 말풍선 (꼬리 포함, Asking 시 펄스)
10. Avatar — 캐릭터 아바타 (원형, 스택 가능)

레이아웃 컴포넌트 (apps/desktop/src/components/layout/):
1. MainLayout — 사이드바(64px/240px) + 메인 + 사이드패널
2. Sidebar — 내비게이션, 축소/확장 토글
3. SidePanel — 채팅/타임라인/아티팩트 탭

요구사항:
- Tailwind CSS + CSS Modules 혼용
- 디자인 토큰 CSS 변수 사용
- 다크 모드 지원 (prefers-color-scheme + 수동 토글)
- 모션: ease-bounce(모달), ease-out-soft(호버)
- 접근성: 포커스 스타일, aria-label, 키보드 내비게이션
- Storybook 또는 단독 데모 페이지로 컴포넌트 확인 가능
```

---

## Step 03: FastAPI 백엔드 기본

### 프롬프트

```
당신은 시니어 백엔드 엔지니어입니다.

목표: 독바(DogBa) FastAPI 백엔드의 핵심 모듈을 구현하세요.

구현 범위:
1. SQLAlchemy 모델 (apps/api/app/models/):
   - Project, Upload, ParsedDoc, TaskGraph, TaskNode, Run,
     Artifact, ChatMessage, MemoryItem, Export
   - 관계(relationship) 설정
   
2. Pydantic 스키마 (apps/api/app/schemas/):
   - 각 모델의 Create/Update/Response 스키마
   - SimState 스키마 (에이전트 상태 배열)

3. API 라우터 (apps/api/app/routers/):
   - projects: CRUD + 목록/상세
   - uploads: 파일 업로드(multipart) + 파싱 시작
   - task_graphs: 생성 + 조회
   - runs: 시작 + 상태조회 + 취소 + 사용자 응답
   - artifacts: 목록 + 상세 + 버전 diff
   - chat: 메시지 전송 + 히스토리
   - exports: ZIP 생성 + 다운로드
   - settings: 전역 설정 CRUD
   - sim: 시뮬레이션 상태 GET

4. 데이터베이스 설정 (database.py):
   - SQLite 연결 (경로: 환경변수 DOGBA_DB_PATH)
   - 세션 관리 (get_db dependency)
   - 초기 테이블 생성

5. 기본 에러 핸들링:
   - 404 Not Found
   - 422 Validation Error (커스텀 메시지)
   - 500 Internal Server Error

6. CORS 설정 (localhost 개발용)

요구사항:
- 비동기(async) 핸들러 사용
- Type hints 철저히
- 각 라우터에 최소 1개 테스트 (pytest)
- Alembic 마이그레이션 초기 설정

제약:
- 파일 저장 경로: data/{project_id}/uploads/
- SQLite DB 경로: data/dogba.db
```

---

## Step 04: Electron 셸 + IPC

### 프롬프트

```
당신은 Electron 전문 엔지니어입니다.

목표: 독바(DogBa) Electron 셸을 완성하세요.

구현:
1. Main Process (electron/main.ts):
   - BrowserWindow 생성 (1440×900, 최소 1024×720)
   - titleBarStyle: 'hiddenInset' (macOS)
   - FastAPI 서버를 자식 프로세스로 시작/종료
   - 앱 종료 시 API 프로세스 정리

2. Preload (electron/preload.ts):
   - contextBridge로 안전한 API 노출
   - 노출 API:
     - fileSystem: { readFile, writeFile, selectDirectory, selectFiles }
     - dialog: { showSaveDialog, showOpenDialog, showMessageBox }
     - app: { getVersion, getPlatform, getDataPath }
     - settings: { get, set }

3. IPC 핸들러 (electron/ipc-handlers.ts):
   - file:select-files → 파일 선택 다이얼로그
   - file:save-zip → ZIP 저장 위치 선택
   - app:get-data-path → 앱 데이터 디렉토리

4. 개발 모드:
   - Vite dev server URL 로드
   - DevTools 자동 열기

5. 프로덕션 모드:
   - 빌드된 index.html 로드
   - electron-builder 설정 (macOS .dmg, Windows .exe)

6. React 측 API 클라이언트 (src/lib/api-client.ts):
   - fetch 래퍼 (base URL: http://localhost:8742)
   - 에러 처리
   - 타입 안전한 API 호출

7. WebSocket 클라이언트 (src/lib/ws-client.ts):
   - 시뮬레이션 채널 구독/해제
   - 자동 재연결
   - 이벤트 핸들러
```

---

## Step 05: 파일 업로드 + 파서

### 프롬프트

```
당신은 문서 파싱 전문 엔지니어입니다.

목표: 독바(DogBa) 파일 업로드 및 파싱 파이프라인을 구현하세요.

프론트엔드 (apps/desktop/src/routes/project/UploadsPage.tsx):
1. 드래그 앤 드롭 영역 (귀여운 디자인: 점선 테두리, 파일 아이콘)
2. 파일 목록: 파일명/타입/크기/상태(Queued→Parsing→Indexed→Failed)
3. 상태별 아이콘과 프로그레스

백엔드 파서 (apps/api/app/parsers/):
1. pdf_parser.py:
   - PyMuPDF(fitz)로 텍스트/표/이미지 추출
   - 페이지별 섹션 분리
   - 출력: { summary, sections[], tables[], images_count }

2. docx_parser.py:
   - python-docx로 단락/표/스타일 추출
   - 헤딩 기반 섹션 분리
   - 출력: { summary, sections[], tables[] }

3. xlsx_parser.py:
   - openpyxl로 시트별 데이터 추출
   - 헤더 자동 감지
   - 출력: { sheets[{ name, headers[], rows[][] }] }

4. image_parser.py:
   - 이미지 메타데이터 추출
   - 필요시 LLM으로 이미지 설명 생성 (선택)
   - 출력: { description, size, format }

5. zip_parser.py:
   - ZIP 파일 해제 + 디렉토리 구조 분석
   - 주요 파일 감지 (package.json, requirements.txt 등)
   - 출력: { structure, detected_stack, key_files[] }

파서 서비스 (apps/api/app/services/parser_service.py):
- 파일 타입 감지 → 적절한 파서 호출
- 파싱 결과를 ParsedDoc 테이블에 저장
- 비동기 실행 (백그라운드 태스크)

요구사항:
- 파일 저장: data/{project_id}/uploads/{upload_id}/{filename}
- 파싱 결과: JSON으로 DB 저장
- 에러 핸들링: 파싱 실패 시 status='failed' + 에러 메시지
- 대용량 파일 (>10MB) 청크 처리
```

---

## Step 06: Agent Town (PixiJS 타일맵 + 캐릭터)

### 프롬프트

```
당신은 2D 게임 개발 전문가입니다.

목표: 독바(DogBa) Agent Town — 픽셀아트 오피스 시뮬레이션을 구현하세요.

참조: pixel-agents (github.com/pablodelucca/pixel-agents)의 Canvas 2D 게임 루프, 
BFS pathfinding, 캐릭터 상태 머신 패턴을 참고합니다.

기술: PixiJS 8 (또는 순수 Canvas 2D)

구현할 모듈:

1. AgentTown.tsx — 메인 React 컴포넌트
   - PixiJS Application 초기화
   - 줌(마우스 휠)/팬(드래그) 컨트롤
   - WebSocket 연결 → 상태 업데이트
   - 캐릭터 클릭 이벤트 → 상세 패널

2. TileMap.ts — 타일맵 렌더러
   - 16×16 기본 타일, 렌더 시 3x 스케일 (48px)
   - image-rendering: pixelated (nearest-neighbor)
   - 레이어: 바닥 → 벽/가구 → 캐릭터 → UI오버레이
   - 맵 데이터: 20×15 타일 그리드
   - 기본 맵: 회의실(좌상), 서재(좌), 책상6개(중앙), QA룸(하), 출고장(우상)

3. Character.ts — 캐릭터 클래스
   - 스프라이트 시트 로딩 (64×64 프레임)
   - 애니메이션 재생 (idle/walk/type/read/think/success/error)
   - 부드러운 이동 (타일 간 보간)
   - 상태에 따른 자동 애니메이션 전환

4. StateMachine.ts — 에이전트 상태 머신
   상태: Idle, Ingesting, Planning, Drafting, Reviewing, 
         Asking, Revising, Testing, Success, Error, Exporting
   전환 시: 
   - 목표 위치 계산 (상태별 고정 위치)
   - BFS path 계산
   - 걸어서 이동
   - 도착 후 해당 상태 애니메이션 시작
   - 말풍선 표시

5. Pathfinder.ts — BFS pathfinding
   - 그리드 기반 (타일 좌표)
   - 장애물(벽, 가구) 회피
   - 최단 경로 반환
   - 캐릭터 간 충돌 처리 (선택)

6. SpeechBubble.ts — 말풍선
   - 캐릭터 위에 표시
   - 텍스트 + 상태 아이콘
   - Asking 상태: 깜빡이는 효과
   - 일정 시간 후 자동 사라짐 (idle) 또는 상태 변경까지 유지

7. OfficeMap.ts — 맵 데이터
   - 타일 타입 정의 (바닥/벽/책상/의자/문/장식)
   - 기본 오피스 레이아웃 JSON
   - 특수 위치 정의 (meeting_room, desk_1~6, qa_room, library, shipping)
   - 각 위치의 타일 좌표

임시 에셋:
- 캐릭터: 컬러 원형으로 대체 (나중에 스프라이트 교체)
- 타일셋: 단색 사각형으로 대체 (바닥=베이지, 벽=갈색, 책상=회색)

디자인 참조: 
- 바닥: #E8D5B7 (나무), 벽: #FFF3E0 (크림), 가구: #D4A574 (우드)
- 캐릭터별 컬러: 뭉치=#FFB5B5, 라쿠=#A0AEC0, 나비=#F6C67C

요구사항:
- 30fps 이상 안정적
- 에이전트 최대 6명 동시 활동
- 캐릭터 클릭 시 이름/역할/현재 상태 표시
- 빠른 시간 모드 (2x/4x) 지원
```

---

## Step 07: Task Graph 오케스트레이터

### 프롬프트

```
당신은 분산 시스템 엔지니어입니다.

목표: 독바(DogBa) Task Graph 오케스트레이터를 구현하세요.

구현:
1. TaskGraph 모델 + 생성기
   - Planner가 프로젝트 설정/파싱 결과를 기반으로 DAG 생성
   - docs_only 모드: Ingest→Plan→PRD→UX→ARCH→WBS→Review→Export
   - full_build 모드: 위 + Code→Test→QA→Fix 추가
   - JSON 형태로 DB 저장

2. Orchestrator (services/orchestrator.py)
   - 의존성 기반 노드 실행 스케줄링
   - 병렬 실행 가능 노드 동시 처리 (asyncio.gather)
   - 노드 실행: 해당 Role Agent 호출
   - 결과를 Artifact로 저장
   - 실패 시: 재시도(최대 3회) → Asking 전환 → 롤백

3. 시뮬레이션 연동
   - 노드 상태 변경 시 SimBroadcaster로 이벤트 전송
   - 이벤트: agent_id, state, target_location, bubble_text
   - Agent Town이 이벤트를 받아 캐릭터 상태 변경

4. Run 관리
   - Run 시작/일시정지/재개/취소
   - 토큰/비용 누적 기록
   - 진행률(%) 계산 (완료 노드 / 전체 노드)

5. 사용자 질문 응답
   - Asking 상태인 노드에 사용자 입력 전달
   - 노드 재실행

테스트:
- 기본 DAG(5 노드)로 순차 실행 테스트
- 병렬 노드 실행 테스트
- 실패 + 재시도 테스트
- Asking 상태 전환 테스트
```

---

## Step 08 ~ 12: 이하 동일 패턴

> 나머지 Step도 위와 동일한 형태로 구체적인 프롬프트를 작성합니다.
> 핵심: 각 프롬프트에 목표/구현범위/기술/제약/테스트를 명시

---

## 부록: pixel-agents에서 가져올 수 있는 추가 기능

### 분석 결과

pixel-agents에서 독바에 적용 가능한 핵심 패턴:

| 기능 | pixel-agents 구현 | 독바 적용 |
|------|-------------------|-----------|
| **JSONL 트랜스크립트 감시** | Claude Code의 트랜스크립트 파일을 파일 와칭으로 감시 | WebSocket 기반 실시간 상태 스트림으로 대체 (더 안정적) |
| **Canvas 2D 게임 루프** | requestAnimationFrame + 상태 업데이트 | PixiJS ticker 사용 (동일 패턴, 더 효율적) |
| **BFS Pathfinding** | 2D 그리드 BFS | 그대로 차용 (동일 구현) |
| **캐릭터 상태 머신** | idle→walk→type/read 3상태 | 10+상태로 확장 (planning, reviewing, asking 등) |
| **오피스 레이아웃 에디터** | 타일 배치/삭제/페인트 도구 | v2에서 차용 (MVP는 고정 레이아웃) |
| **말풍선** | 캐릭터 위 텍스트 박스 | 그대로 + Asking 시 인터랙티브 버전 |
| **서브에이전트 시각화** | Task tool sub-agents → 별도 캐릭터 | 하위 Task Node → 임시 캐릭터 스폰 |
| **사운드 알림** | 완료 시 차임 | 상태별 다양한 효과음 |
| **영속 레이아웃** | localStorage JSON | SQLite 저장 |

### ChatDev에서 가져올 수 있는 추가 기능

| 기능 | ChatDev 구현 | 독바 적용 |
|------|-------------|-----------|
| **CompanyConfig** | YAML로 에이전트 팀/역할 정의 | JSON으로 프로젝트별 팀 구성 |
| **Chat Chain** | Phase→ComposedPhase 체인 | TaskGraph DAG (더 유연) |
| **Collaborative Seminar** | 에이전트 간 대화 세미나 | 회의실에서 에이전트 대화 시각화 |
| **WareHouse** | 생성된 소프트웨어 저장 | Artifact Registry (버전 관리 포함) |
| **Visualizer** | 웹 기반 실행 시각화 | Agent Town이 대체 (더 풍부) |
| **Experience Co-Learning** | 에이전트 간 경험 공유 | Memory Service (v2) |
| **Multi-Agent Topology** | 체인/DAG/트리 구조 | TaskGraph DAG 지원 |

### Generative Agents에서 가져올 수 있는 추가 기능

| 기능 | Stanford 구현 | 독바 적용 시기 |
|------|-------------|--------------|
| **Memory Stream** | Observation→Reflection→Planning | MVP: Working Memory만 / v2: Episodic+Semantic |
| **Importance Scoring** | 기억 중요도 점수 | v2: 자주 참조되는 메모리 우선 |
| **Reflection** | 과거 행동에서 고수준 인사이트 도출 | v2: 단계 완료 시 "배운 점" 생성 |
| **Planning** | 일일 계획 수립 | MVP: TaskGraph가 계획 역할 |
| **Reaction** | 환경 변화에 대한 반응 | v2: 사용자 피드백에 대한 에이전트 자율 반응 |
| **Social Behavior** | 에이전트 간 관계/대화 | v2: 에이전트 간 코드 리뷰 대화 |

---

## 부록: 환경 변수 목록

```env
# .env.example

# API
DOGBA_API_PORT=8742
DOGBA_DB_PATH=./data/dogba.db
DOGBA_UPLOAD_DIR=./data/uploads
DOGBA_EXPORT_DIR=./data/exports

# LLM Providers
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
GOOGLE_AI_API_KEY=xxx

# LLM Settings
DOGBA_DEFAULT_LLM_PROVIDER=claude
DOGBA_DEFAULT_MODEL=claude-sonnet-4-5-20250929
DOGBA_MAX_TOKENS=4096
DOGBA_TEMPERATURE=0.3

# Cost Limits
DOGBA_MAX_COST_PER_RUN=5.0
DOGBA_MAX_TOKENS_PER_RUN=100000

# Docker (optional, for code execution)
DOGBA_DOCKER_ENABLED=false
DOGBA_DOCKER_IMAGE=python:3.12-slim

# Development
NODE_ENV=development
VITE_API_URL=http://localhost:8742
```
