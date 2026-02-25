# 독바(DogBa) 플랫폼 마스터 PRD v3
> 날짜: 2026-02-24 | 상태: Claude Code 개발용 확정 스펙

---

## 1. 제품 한 줄 정의

**CLI를 무서워하는 사람도 귀여운 동물 에이전트들이 일하는 픽셀 오피스를 보며 코드를 만들 수 있는 비주얼 개발 플랫폼**

> "터미널 대신 동물 친구들이 일하는 사무실을 구경하세요"

---

## 2. 비전 & 핵심 가치

### 2.1 비전
CLI 환경의 강력함을 유지하면서, 프로세스를 **아기자기한 픽셀아트 세계**로 시각화하여 비개발자도 두려움 없이 소프트웨어를 만들 수 있게 한다.

### 2.2 핵심 가치 (우선순위)
1. **Approachability (친근함)** — 귀여운 동물 캐릭터가 복잡한 과정을 친근하게 전달
2. **Transparency (투명성)** — 에이전트가 뭘 하는지, 왜 하는지 실시간으로 보여줌
3. **Completeness (완결성)** — 대화부터 Export까지 한 곳에서 완주
4. **Reproducibility (재현성)** — 동일 입력 → 일관된 산출물

---

## 3. 3대 레퍼런스 흡수 전략

### 3.1 pixel-agents (핵심 차용)
| 기능 | 차용 방식 | 독바 적용 |
|------|-----------|-----------|
| Canvas 2D 게임 루프 | 그대로 | PixiJS 또는 Canvas 2D로 Agent Town 렌더 |
| BFS pathfinding | 그대로 | 에이전트 타일맵 이동 |
| 캐릭터 상태 머신 (idle→walk→type/read) | 확장 | idle→walk→type→read→think→success→error→asking |
| JSONL 트랜스크립트 감시 | 변형 | Task Graph 노드 상태를 WebSocket/폴링으로 동기화 |
| 오피스 레이아웃 에디터 | 차용+확장 | 타일맵 에디터 + 테마 프리셋(사무실/카페/공원) |
| 말풍선(Speech Bubble) | 그대로 | 현재 작업 요약 + 질문 표시 |
| 서브에이전트 시각화 | 그대로 | Task 하위 노드 → 새 캐릭터 스폰 |
| 사운드 알림 | 차용 | 완료/에러/질문 시 효과음(귀여운 톤) |

### 3.2 ChatDev (역할 체인)
| 기능 | 차용 방식 | 독바 적용 |
|------|-----------|-----------|
| 역할 에이전트(CEO/CTO/…) | 캐릭터화 | 동물별 역할 배정(햄스터=PM, 너구리=Dev, 고양이=QA…) |
| CompanyConfig | 차용 | 프로젝트별 에이전트 구성 JSON |
| 소프트웨어 제작 체인 | 확장 | Task Graph(DAG) 기반 순차/병렬 실행 |
| Visualizer | 대체 | Agent Town이 비주얼라이저 역할 |
| Collaborative Seminar | 차용 | "회의실" 공간에서 에이전트 간 대화 시각화 |

### 3.3 Generative Agents — Stanford (기억/반성)
| 기능 | 차용 방식 | 독바 적용 |
|------|-----------|-----------|
| Memory Stream | 단순화 | 프로젝트 범위 Working/Episodic/Semantic 메모리 |
| Reflection | 단순화 | 단계 완료 시 "이번 단계에서 배운 점" 자동 생성 |
| Planning | 차용 | Planner 에이전트가 Task Graph 생성 |
| Emergent Behavior | 축소 | MVP에서는 정해진 행동 매핑만, v2에서 자율성 확대 |
| Sandbox World | 차용 | 16×16 타일 기반 오피스 월드 |

---

## 4. 캐릭터 시스템

### 4.1 기본 캐릭터 로스터 (MVP)

| ID | 이름 | 동물 | 역할 | 컬러 키 | 성격 키워드 |
|----|------|------|------|---------|------------|
| char_hamster | 뭉치 | 햄스터 | PM/기획 | #FFE4E1 (미스티 로즈) | 꼼꼼, 다정, 걱정 많음 |
| char_raccoon | 라쿠 | 너구리 | Developer | #708090 (슬레이트 그레이) | 묵묵, 집중, 야행성 |
| char_cat | 나비 | 고양이 | QA/Reviewer | #F4A460 (샌디 브라운) | 까칠, 정확, 눈치 빠름 |
| char_rabbit | 토토 | 토끼 | Architect | #E6E6FA (라벤더) | 빠름, 체계적, 호기심 |
| char_penguin | 펭 | 펭귄 | DevOps/Release | #B0E0E6 (파우더 블루) | 침착, 신뢰, 정리 좋아함 |
| char_fox | 여우 | 여우 | UX Designer | #FFDAB9 (피치 퍼프) | 감각적, 창의, 말 많음 |

### 4.2 캐릭터 디자인 규칙
- **스타일**: 치비(Chibi) + 카와이(Kawaii) — 2~2.5등신, 큰 눈, 작은 입
- **아웃라인**: 두꺼운 다크 아웃라인(2~3px) — 첨부 이미지 참조
- **색감**: 파스텔+따뜻한 톤, 채도 40~60% 범위
- **표정**: 눈 모양 변화로 감정 표현(기본/집중/성공/에러/질문)
- **크기**: 스프라이트 시트 기준 64×64px (렌더 시 2x~4x 스케일)

### 4.3 상태-행동 매핑

| 에이전트 상태 | 월드 행동 | 위치 | 애니메이션 | 말풍선 |
|--------------|----------|------|-----------|--------|
| Idle | 책상에 앉아 대기 | 자기 책상 | idle_down | "다음 지시를 기다리는 중…" |
| Ingesting | 파일 읽기 | 서재/책장 | read_down | "파일을 분석하고 있어요…" |
| Planning | 회의 | 회의실 | think_down | "구조를 설계 중이에요…" |
| Drafting | 타이핑 | 자기 책상 | type_down | "PRD를 작성 중이에요…" |
| Reviewing | 문서 검토 | 동료 책상 옆 | read_down | "코드를 검토하고 있어요…" |
| Asking | 질문 대기 | 사용자 책상 앞 | idle_down + ❓ | "이 부분 확인이 필요해요!" |
| Revising | 수정 중 | 자기 책상 | type_down | "피드백 반영 중…" |
| Testing | 테스트 실행 | QA 룸 | type_down | "테스트를 돌리고 있어요…" |
| Success | 완료 축하 | 자기 책상 | success_down | "완료! 🎉" |
| Error | 오류 발생 | 자기 책상 | error_down | "문제가 발생했어요…" |
| Exporting | 패키징 | 출고장 | walk→type | "ZIP으로 묶는 중…" |

---

## 5. 핵심 사용자 여정 (상세)

### 5.1 Journey 1: 첫 프로젝트 만들기

```
[사용자] 앱 실행
    ↓
[홈 화면] "새 프로젝트 만들기" 버튼 — 큰 + 아이콘, 파스텔 배경
    ↓
[프로젝트 설정] 
  - 프로젝트 이름 입력
  - 목표 한 줄 설명 (자연어)
  - 스택 프리셋 선택 (웹앱/모바일/API/자유)
  - 에이전트 팀 선택 (기본 3인/풀팀 6인/커스텀)
    ↓
[파일 첨부] 드래그&드롭 영역
  - 지원: PDF, DOCX, XLSX, PNG/JPG, ZIP(기존 레포)
  - 각 파일마다 "분석 중…" → "✓ 완료" 상태 표시
    ↓
[Agent Town 활성화]
  - 오피스에 선택된 에이전트들이 스폰
  - 뭉치(햄스터/PM)가 "프로젝트를 시작할게요!" 말풍선
  - 파일을 들고 서재로 이동 → Ingesting 상태
    ↓
[자동 분석 → 문서 생성]
  - PM이 파일 분석 → 회의실로 이동 → Planning
  - 다른 에이전트들 회의실에 모임 (Collaborative Seminar 시각화)
  - Task Graph 생성 → 각자 책상으로 이동 → Drafting
  - PRD → UX → ARCH 순차 생성 (각 완료 시 Success 애니메이션)
    ↓
[사용자 검토]
  - 우측 패널에 생성된 문서 카드 표시
  - 클릭하면 문서 뷰어(마크다운 렌더)
  - 채팅으로 수정 지시 가능 → 에이전트가 Revising 상태로 전환
    ↓
[Export]
  - 펭(DevOps)이 출고장으로 이동
  - ZIP 프리셋 선택 → 패키징 → 다운로드
```

### 5.2 Journey 2: 코드까지 생성

```
[문서 생성 완료 후]
    ↓
[사용자] "코드도 만들어줘" 또는 "풀 빌드" 선택
    ↓
[라쿠(너구리/Dev)]가 책상으로 이동 → 코드 스캐폴딩 생성
  - 레포 구조 + 보일러플레이트
  - 주요 파일별 코드 생성
    ↓
[나비(고양이/QA)]가 QA룸으로 이동 → 테스트 생성+실행
  - 스모크 테스트 → 유닛 테스트
  - 실패 시: 에러 말풍선 → 라쿠에게 전달 → 자동 수정 루프
    ↓
[Export] 코드 포함 ZIP 생성
```

### 5.3 Journey 3: 기존 레포 분석

```
[사용자] ZIP 파일(기존 레포) 업로드
    ↓
[자동 파싱] 디렉토리 구조/코드/설정파일 분석
    ↓
[문서 역생성] 기존 코드 기반 PRD/ARCH 초안 생성
    ↓
[개선 제안] "이 부분을 리팩토링하면 좋겠어요" 제안
```

---

## 6. 기능 요구사항 (상세)

### 6.1 워크스페이스 & 프로젝트

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-WS-01 | 프로젝트 CRUD | P0 | 생성/조회/수정/삭제/복제 |
| F-WS-02 | 스택 프리셋 | P0 | 웹앱(React)/API(FastAPI)/데스크톱(Electron) 템플릿 |
| F-WS-03 | 에이전트 팀 구성 | P1 | 프로젝트별 에이전트 조합 설정 |
| F-WS-04 | 프로젝트 설정 | P1 | LLM 제공자, 비용 상한, 전송 모드 |

### 6.2 파일 인제스트 & 파싱

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-IN-01 | 멀티파일 업로드 | P0 | 드래그&드롭, 다중 파일, 진행률 표시 |
| F-IN-02 | PDF 파싱 | P0 | 텍스트/표/이미지 추출 → 구조화 JSON |
| F-IN-03 | DOCX 파싱 | P0 | 섹션/스타일/표 추출 |
| F-IN-04 | XLSX 파싱 | P1 | 시트별 테이블 추출, 수식 해석(선택) |
| F-IN-05 | 이미지 분석 | P1 | OCR + 레이아웃 분석(LLM 보조) |
| F-IN-06 | ZIP(레포) 분석 | P1 | 디렉토리 구조 파싱, package.json/requirements.txt 등 해석 |
| F-IN-07 | 청크/인덱싱 | P2 | 대용량 파일 벡터 인덱스 생성 |

### 6.3 에이전트 오케스트레이션

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-AG-01 | Task Graph 생성 | P0 | Planner가 DAG 형태 작업 그래프 생성 |
| F-AG-02 | 순차/병렬 실행 | P0 | 의존성 기반 노드 실행 스케줄링 |
| F-AG-03 | Role Agent 인터페이스 | P0 | PM/Arch/Dev/QA/Release 최소 5개 |
| F-AG-04 | Artifact Registry | P0 | 산출물 버전 관리(생성/diff/조회) |
| F-AG-05 | 실패 복구 | P1 | 자동 재시도(최대 3회) → Asking 전환 → 롤백 |
| F-AG-06 | Memory (Working) | P1 | 현재 Run 범위 컨텍스트 유지 |
| F-AG-07 | Memory (Episodic) | P2 | 과거 Run 학습 → 동일 패턴 자동 적용 |
| F-AG-08 | Reflection | P2 | 단계 완료 시 "배운 점" 생성 |
| F-AG-09 | Collaborative Seminar | P2 | 에이전트 간 대화/토론 시뮬레이션 |

### 6.4 코드 생성/실행

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-CD-01 | 레포 스캐폴딩 | P0 | 템플릿 기반 폴더 구조 + 보일러플레이트 |
| F-CD-02 | 파일별 코드 생성 | P1 | ARCH 기반 주요 파일 코드 생성 |
| F-CD-03 | 스모크 테스트 | P1 | 최소 1개 실행 가능 테스트 |
| F-CD-04 | 샌드박스 실행 | P1 | Docker 격리 환경에서 코드 실행 |
| F-CD-05 | 자동 수정 루프 | P2 | 테스트 실패 → 에러 분석 → 코드 수정 → 재실행 |

### 6.5 Agent Town (시뮬레이션)

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-AT-01 | 타일맵 렌더 | P0 | 16×16 기반, PixiJS/Canvas 2D |
| F-AT-02 | 캐릭터 이동 | P0 | BFS pathfinding, waypoint 이동 |
| F-AT-03 | 상태 머신 애니메이션 | P0 | 상태별 스프라이트 전환 |
| F-AT-04 | 말풍선 | P0 | 현재 작업 요약 텍스트 |
| F-AT-05 | 오피스 레이아웃 | P0 | 고정 맵(회의실/책상/QA룸/출고장/서재) |
| F-AT-06 | 진행률 UI | P0 | 우측 패널: 타임라인 + 로그 + 아티팩트 카드 |
| F-AT-07 | 사운드 효과 | P1 | 완료/에러/질문 시 귀여운 효과음 |
| F-AT-08 | 레이아웃 에디터 | P2 | 사용자 맵 커스터마이징 |
| F-AT-09 | 테마 프리셋 | P2 | 사무실/카페/공원 등 |
| F-AT-10 | 캐릭터 클릭 상호작용 | P1 | 클릭 → 상세 상태/로그 표시 |

### 6.6 Export

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-EX-01 | ZIP 생성 | P0 | docs/ + prompts/ 최소 포함 |
| F-EX-02 | 프리셋 선택 | P0 | docs / docs_code / full |
| F-EX-03 | 파일 트리 미리보기 | P1 | 포함될 파일 목록 사전 확인 |
| F-EX-04 | IDE 프롬프트 번들 | P1 | Claude Code/Gemini CLI용 프롬프트 동봉 |

### 6.7 UI/UX 공통

| ID | 기능 | 우선순위 | 설명 |
|----|------|---------|------|
| F-UI-01 | 채팅 인터페이스 | P0 | 좌측 또는 하단 채팅 패널 |
| F-UI-02 | 문서 뷰어 | P0 | 마크다운 렌더 + diff 뷰 |
| F-UI-03 | 다크/라이트 모드 | P1 | 시스템 설정 연동 |
| F-UI-04 | 반응형 레이아웃 | P1 | 최소 1280×720 지원 |
| F-UI-05 | 온보딩 튜토리얼 | P2 | 첫 실행 시 가이드 |

---

## 7. 비기능 요구사항

### 7.1 성능
- **첫 PRD 생성**: 파일 업로드 후 5분 이내
- **Agent Town FPS**: 30fps 이상 (에이전트 6명 동시 활동 기준)
- **메모리 사용**: Electron 앱 기준 512MB 이내 (idle)
- **ZIP Export**: 10초 이내

### 7.2 재현성
- 동일 입력 + 동일 설정 → 문서 구조 80% 이상 일치
- 템플릿 기반 생성으로 구조적 일관성 확보

### 7.3 보안
- 파일은 로컬 우선 저장
- LLM 호출 시 전송 모드 선택: 원문 / 요약 / 마스킹
- 코드 실행은 Docker 샌드박스 격리
- API 키는 로컬 keychain/env 저장

### 7.4 접근성
- 키보드 내비게이션 지원
- 스크린 리더 기본 호환
- 최소 색대비 4.5:1

---

## 8. 기술 스택 (확정)

| 레이어 | 기술 | 이유 |
|--------|------|------|
| Desktop Shell | Electron 33+ | 크로스 플랫폼, 로컬 파일 접근 |
| Frontend | React 19 + TypeScript | 컴포넌트 기반, 생태계 |
| 시뮬레이션 | PixiJS 8 또는 Canvas 2D | 2D 렌더링, 스프라이트 시트 |
| 스타일링 | Tailwind CSS 4 + CSS Modules | 유틸리티 + 커스텀 디자인 시스템 |
| 상태 관리 | Zustand | 경량, TypeScript 친화 |
| Local API | FastAPI (Python 3.12) | LLM 연동, 파싱 라이브러리 풍부 |
| DB | SQLite (via SQLAlchemy) | 로컬, 경량, 충분한 성능 |
| LLM | Multi-provider (Claude/GPT/Gemini) | 추상화 레이어로 교체 가능 |
| 코드 실행 | Docker (선택) | 격리 환경 |
| 패키지 관리 | pnpm (모노레포) | 효율적 의존성 관리 |

---

## 9. 정보 구조 (IA)

```
독바 플랫폼
├── 홈
│   ├── 프로젝트 목록 (카드 그리드)
│   ├── 최근 실행 (Recent Runs)
│   └── + 새 프로젝트
├── 프로젝트 상세
│   ├── 개요 (Goals / Stack / Status / 비용)
│   ├── 파일 (Uploads — 드래그&드롭)
│   ├── 문서 (Artifacts — PRD/UX/ARCH/WBS 탭)
│   ├── 작업 (Task Graph — DAG 뷰)
│   ├── 코드 (Repo Snapshot — 파일 트리 + 에디터)
│   ├── QA (테스트 결과 / 리포트)
│   ├── Agent Town (시뮬레이션 뷰)
│   └── Export (프리셋 선택 / ZIP 생성)
├── 채팅 패널 (항상 접근 가능)
│   ├── 프로젝트 대화 히스토리
│   └── 에이전트 지시 / 질문 응답
├── 설정
│   ├── LLM 제공자 / API 키
│   ├── 테마 (다크/라이트)
│   ├── Agent Town 설정
│   └── Export 기본 프리셋
└── 캐릭터 라이브러리 (v2)
    ├── 기본 캐릭터 목록
    ├── 커스텀 캐릭터 (스튜디오 연동)
    └── 스프라이트 시트 관리
```

---

## 10. 화면 상세 설계

### 10.1 홈 화면
- **레이아웃**: 좌측 사이드바(내비게이션) + 중앙 콘텐츠
- **프로젝트 카드**: 대표 캐릭터 아이콘 + 프로젝트명 + 상태 뱃지 + 마지막 수정일
- **상태 뱃지 컬러**: 🟢 Ready, 🟡 In Progress, 🔴 Error, 🔵 Exported
- **빈 상태**: "아직 프로젝트가 없어요! 뭉치와 함께 시작해볼까요?" + 캐릭터 일러스트

### 10.2 프로젝트 개요
- **상단 헤더**: 프로젝트명 + 진행률(%) + 현재 활동 에이전트 아바타들
- **진행 타임라인**: 수평 스텝(Ingest → Plan → Draft → Review → QA → Export)
- **비용 위젯**: 토큰/이미지 사용량 + 예상 비용
- **"Run 시작" 버튼**: 큰 둥근 버튼, 그라디언트 애니메이션

### 10.3 Agent Town (핵심 화면)
- **좌측 60%**: 타일맵 뷰
  - 오피스 맵 (회의실, 개인 책상×6, QA룸, 서재, 출고장)
  - 캐릭터가 실시간 이동, 애니메이션
  - 말풍선 오버레이
  - 줌/팬 지원
- **우측 40%**: 정보 패널
  - **탭 1: 타임라인** — 이벤트 로그 (시간순, 컬러 코딩)
  - **탭 2: 아티팩트** — 생성된 문서/코드 카드 목록
  - **탭 3: 채팅** — 에이전트와 대화
- **하단 바**: 재생 속도 조절(1x/2x/4x) + 일시정지 + 스킵

### 10.4 문서 뷰어
- **탭 네비게이션**: PRD | UX | ARCH | WBS | QA
- **마크다운 렌더링**: 코드 하이라이팅, 테이블, 이미지
- **버전 히스토리**: 사이드바에서 버전 선택 → diff 뷰
- **인라인 수정**: 더블클릭 → 편집 → "반영" 버튼

### 10.5 Export 화면
- **프리셋 카드 3개**: docs / docs_code / full
- **파일 트리 미리보기**: 체크박스로 포함/제외 토글
- **"ZIP 생성" 버튼**: 프로그레스 → 완료 → 다운로드 링크
- **Export 히스토리**: 이전 Export 목록

---

## 11. API 엔드포인트 (확정)

### 11.1 프로젝트
```
POST   /api/projects                          → 프로젝트 생성
GET    /api/projects                          → 프로젝트 목록
GET    /api/projects/:id                      → 프로젝트 상세
PATCH  /api/projects/:id                      → 프로젝트 수정
DELETE /api/projects/:id                      → 프로젝트 삭제
```

### 11.2 파일
```
POST   /api/projects/:id/uploads              → 파일 업로드 (multipart)
GET    /api/projects/:id/uploads              → 업로드 목록
POST   /api/uploads/:id/parse                 → 파싱 시작
GET    /api/uploads/:id/parsed                → 파싱 결과 조회
```

### 11.3 Task Graph & Run
```
POST   /api/projects/:id/task-graph/generate  → Task Graph 생성
GET    /api/projects/:id/task-graph           → 현재 Task Graph
POST   /api/task-graphs/:id/run               → Run 시작
GET    /api/runs/:id                          → Run 상태 조회
GET    /api/runs/:id/logs                     → Run 로그 스트리밍
POST   /api/runs/:id/answer                   → 사용자 질문 응답
POST   /api/runs/:id/cancel                   → Run 취소
```

### 11.4 Artifacts
```
GET    /api/projects/:id/artifacts            → 아티팩트 목록
GET    /api/artifacts/:id                     → 아티팩트 상세
GET    /api/artifacts/:id/versions            → 버전 히스토리
GET    /api/artifacts/:id/diff/:v1/:v2        → 버전 diff
```

### 11.5 시뮬레이션
```
GET    /api/projects/:id/sim/state            → 현재 시뮬 상태
WS     /ws/projects/:id/sim                   → 시뮬 실시간 스트림
```

### 11.6 Export
```
POST   /api/projects/:id/export               → ZIP 생성
GET    /api/projects/:id/exports              → Export 히스토리
GET    /api/exports/:id/download              → ZIP 다운로드
```

### 11.7 채팅
```
POST   /api/projects/:id/chat                 → 메시지 전송
GET    /api/projects/:id/chat/history         → 대화 히스토리
```

### 11.8 설정
```
GET    /api/settings                          → 전역 설정 조회
PATCH  /api/settings                          → 전역 설정 수정
GET    /api/settings/llm-providers            → LLM 제공자 목록
POST   /api/settings/llm-providers/test       → 연결 테스트
```

---

## 12. 데이터 스키마

### 12.1 핵심 테이블 (SQLite)

```sql
-- 프로젝트
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  goals TEXT,
  stack_preset TEXT DEFAULT 'web_react',
  agent_team TEXT DEFAULT '["char_hamster","char_raccoon","char_cat"]',
  settings TEXT DEFAULT '{}',  -- JSON: llm_provider, cost_limit 등
  status TEXT DEFAULT 'created', -- created/running/paused/completed/error
  progress INTEGER DEFAULT 0,  -- 0~100
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 업로드 파일
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  filename TEXT NOT NULL,
  file_type TEXT, -- pdf/docx/xlsx/img/zip
  file_size INTEGER,
  status TEXT DEFAULT 'queued', -- queued/parsing/indexed/failed
  sha256 TEXT,
  stored_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 파싱 결과
CREATE TABLE parsed_docs (
  id TEXT PRIMARY KEY,
  upload_id TEXT REFERENCES uploads(id),
  summary TEXT,
  sections TEXT, -- JSON
  tables TEXT,   -- JSON
  entities TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task Graph
CREATE TABLE task_graphs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  version INTEGER DEFAULT 1,
  mode TEXT DEFAULT 'docs_only', -- docs_only/full_build
  graph TEXT NOT NULL, -- JSON: { nodes: [], edges: [] }
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task Node (Task Graph 내 노드)
CREATE TABLE task_nodes (
  id TEXT PRIMARY KEY,
  task_graph_id TEXT REFERENCES task_graphs(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- PM/Architect/Dev/QA/Release/UX
  status TEXT DEFAULT 'pending', -- pending/running/success/failed/asking/skipped
  inputs TEXT,  -- JSON
  outputs TEXT, -- JSON
  retry_count INTEGER DEFAULT 0,
  started_at DATETIME,
  ended_at DATETIME
);

-- Run (실행 단위)
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  task_graph_id TEXT REFERENCES task_graphs(id),
  status TEXT DEFAULT 'running', -- running/paused/completed/failed/cancelled
  provider TEXT,
  model TEXT,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  image_count INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0.0,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

-- Artifact (산출물)
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  run_id TEXT REFERENCES runs(id),
  type TEXT NOT NULL, -- PRD/UX/ARCH/WBS/CODE/QA/TEST/PROMPT
  version INTEGER DEFAULT 1,
  file_path TEXT,
  content TEXT,
  content_hash TEXT,
  provenance TEXT, -- JSON: 근거 파일/섹션 참조
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 시뮬레이션 상태 (인메모리 + 스냅샷)
CREATE TABLE sim_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  run_id TEXT REFERENCES runs(id),
  agents_state TEXT NOT NULL, -- JSON: [{id, state, position, bubble_text, current_task_id}]
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 채팅 히스토리
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  role TEXT NOT NULL, -- user/agent/system
  agent_id TEXT, -- 에이전트 메시지인 경우
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 메모리 (Generative Agents식)
CREATE TABLE memory_items (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  kind TEXT NOT NULL, -- working/episodic/semantic/policy
  text TEXT NOT NULL,
  importance REAL DEFAULT 0.5,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME
);

-- Export 히스토리
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  preset TEXT NOT NULL, -- docs/docs_code/full
  file_path TEXT,
  file_size INTEGER,
  includes TEXT, -- JSON: 포함된 파일 목록
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 13. 에이전트 프롬프트 체계

### 13.1 시스템 프롬프트 구조
```
[역할 정의]
당신은 {role_name}입니다. {role_description}

[톤 가이드]
정중하고 실무 중심. 필요 시 단호.
구조: 배경 요약 → 분석/작업 → 결과 → 다음 단계 제안

[입력 컨텍스트]
- 프로젝트 목표: {goals}
- 스택: {stack_preset}
- 파싱된 파일 요약: {parsed_summaries}
- 이전 단계 산출물: {previous_artifacts}
- 메모리: {relevant_memories}

[출력 규격]
- 형식: 마크다운
- 구조: {template_structure}
- 최소 섹션: {required_sections}
- 금지: 빈 섹션, 플레이스홀더만 있는 내용

[품질 기준]
- 구체적인 내용으로 채울 것 (입력 파일 기반)
- 기술 결정에는 근거를 명시
- 다음 단계 에이전트를 위한 인터페이스 명확히
```

### 13.2 역할별 프롬프트 요약

| 역할 | 핵심 지시 | 출력물 |
|------|----------|--------|
| PM (뭉치) | 요구사항 추출, 범위 확정, 우선순위 결정 | PRD.md, WBS.md |
| UX (여우) | 정보 구조, 화면 흐름, 마이크로카피 | UX.md |
| Architect (토토) | 기술 스택, 모듈 분해, 데이터 스키마, API 설계 | ARCH.md, API.md, DATA.md |
| Developer (라쿠) | 코드 스캐폴딩, 핵심 로직 구현 | 코드 파일들 |
| QA (나비) | 테스트 계획, 테스트 코드, 실행 리포트 | QA.md, 테스트 파일들 |
| Release (펭) | 문서 정리, 프롬프트 번들, ZIP 패키징 | README.md, prompts/, ZIP |

---

## 14. Task Graph 구조

### 14.1 기본 DAG (docs_only)
```
[Ingest] → [Plan] → [PRD] → [UX] → [ARCH] → [WBS] → [Review] → [Export]
                                                              ↓
                                                        [QA Check]
```

### 14.2 풀 빌드 DAG (full_build)
```
[Ingest] → [Plan] → [PRD] → [UX] ─┐
                       ↓            ├→ [ARCH] → [API Design] → [Code Scaffold]
                     [WBS] ─────────┘            ↓                    ↓
                                           [Data Schema]        [Code Gen]
                                                                     ↓
                                                              [Test Gen] → [Test Run]
                                                                     ↓
                                                              [QA Report] → [Fix Loop]
                                                                     ↓
                                                                [Export]
```

### 14.3 노드 스키마
```typescript
interface TaskNode {
  id: string;
  name: string;
  role: 'PM' | 'Architect' | 'UX' | 'Dev' | 'QA' | 'Release';
  status: 'pending' | 'running' | 'success' | 'failed' | 'asking' | 'skipped';
  dependencies: string[];  // 선행 노드 ID
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  retryPolicy: { maxRetries: number; delayMs: number };
  simAction: {  // Agent Town 연동
    agentId: string;
    targetLocation: string;  // 'desk' | 'meeting_room' | 'qa_room' | 'library' | 'shipping'
    animation: string;       // 'type' | 'read' | 'think' | 'walk'
    bubbleText: string;
  };
}
```

---

## 15. 시뮬레이션 월드 설계

### 15.1 타일맵 레이아웃 (기본)
```
┌─────────────────────────────────────────┐
│             ┌────────────┐              │
│             │  Meeting   │              │
│  📚 Library │   Room     │  🚚 Shipping │
│             │  (회의실)   │   (출고장)    │
│             └────────────┘              │
│                                         │
│  🖥️ Desk1   🖥️ Desk2   🖥️ Desk3       │
│  (뭉치)     (라쿠)      (여우)          │
│                                         │
│  🖥️ Desk4   🖥️ Desk5   🖥️ Desk6       │
│  (토토)     (나비)      (펭)            │
│                                         │
│             ┌────────────┐              │
│             │  QA Room   │              │
│             │  (QA 룸)   │              │
│             └────────────┘              │
│                  🧑‍💻                    │
│               User Desk                 │
└─────────────────────────────────────────┘
```

### 15.2 타일 타입
| 타일 | 코드 | 통행 | 설명 |
|------|------|------|------|
| 바닥 | 0 | ✅ | 기본 이동 가능 |
| 벽 | 1 | ❌ | 이동 불가 |
| 책상 | 2 | ❌ (상호작용) | 에이전트 앉기 가능 |
| 의자 | 3 | ✅ → ❌ (착석 시) | 착석 시 점유 |
| 문 | 4 | ✅ | 방 입구 |
| 장식 | 5~20 | ❌ | 화분, 책장, 모니터 등 |

---

## 16. 마이크로카피 가이드

### 16.1 톤
- **기본**: 따뜻하고 친근, 존댓말 사용
- **에이전트 말풍선**: 캐릭터 성격 반영
  - 뭉치(PM): "~할게요", "확인해볼게요"
  - 라쿠(Dev): "코드 짜는 중...", "빌드 완료"
  - 나비(QA): "여기 문제가 있어요", "테스트 통과!"
- **에러 상황**: 걱정스럽지만 해결 가능한 톤 ("문제가 생겼지만 다시 시도해볼게요!")
- **성공**: 축하하는 톤 ("완료! 잘했어요 🎉")

### 16.2 주요 표현
| 상황 | 카피 |
|------|------|
| 프로젝트 생성 | "새로운 모험을 시작해볼까요?" |
| 파일 업로드 | "파일을 읽고 있어요, 잠시만 기다려주세요..." |
| 문서 생성 시작 | "뭉치가 PRD를 쓰기 시작했어요!" |
| 질문이 필요할 때 | "잠깐! 이 부분은 어떻게 하면 좋을까요?" |
| 테스트 실패 | "앗, 테스트가 실패했어요. 나비가 원인을 찾고 있어요..." |
| Export 완료 | "ZIP이 준비됐어요! 다운로드하세요 📦" |
| 빈 프로젝트 | "아직 프로젝트가 없어요. 뭉치와 함께 시작해볼까요?" |

---

## 17. 릴리즈 계획

### Phase 1 — MVP (6주)
- [ ] 프로젝트 생성/설정
- [ ] 파일 업로드 + PDF/DOCX 파싱
- [ ] 기본 에이전트 체인 (PM → Arch → Dev)
- [ ] Agent Town (타일맵 + 3 캐릭터 + 상태 머신)
- [ ] PRD/UX/ARCH 문서 생성
- [ ] ZIP Export (docs 프리셋)

### Phase 2 — Beta (4주)
- [ ] 코드 생성/실행
- [ ] QA 에이전트 + 테스트
- [ ] 말풍선 + 사운드 효과
- [ ] 채팅 인터페이스
- [ ] Export 프리셋 (docs_code / full)

### Phase 3 — v1 (4주)
- [ ] Episodic Memory + Reflection
- [ ] 레이아웃 에디터
- [ ] 캐릭터 라이브러리 (스튜디오 연동)
- [ ] 비용 라우팅/최적화
- [ ] 온보딩 튜토리얼

---

## 18. 성공 지표

| 지표 | MVP 목표 | v1 목표 |
|------|---------|---------|
| 첫 완주율 (생성→Export) | 70% | 90% |
| 완주 시간 | 30분 이내 | 15분 이내 |
| 수정 루프 횟수 | ≤ 5회 | ≤ 3회 |
| Agent Town FPS | 30fps | 60fps |
| 사용자 만족도 (1~5) | 3.5 | 4.0 |
| 재현성 (구조 일치율) | 80% | 90% |

---

## 19. 리스크 & 대응

| 리스크 | 확률 | 영향 | 대응 |
|--------|------|------|------|
| LLM 산출물 품질 편차 | 높음 | 높음 | 템플릿 고정 + 구조 검증 + 자동 수정 루프 |
| 파일 파싱 실패 (XLSX 등) | 중간 | 중간 | 룰 기반 + LLM 보조 파서, 실패 시 안내 |
| 코드 실행 안전성 | 낮음 | 높음 | Docker 격리 + 권한 최소화 |
| 비용 폭증 | 중간 | 중간 | 라우팅 프리셋 + 캐시 + 요약 전송 + 상한 설정 |
| Agent Town 성능 | 낮음 | 중간 | Canvas 2D 최적화 + 오프스크린 렌더 |
| Electron 앱 크기 | 중간 | 낮음 | 필요 모듈만 번들링 + lazy loading |
