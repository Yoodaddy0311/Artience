# PRD — AI Studio 기반 CLI Town 플랫폼 (v2)

## 1. 제품 개요
### 1.1 한 줄 정의
비개발자/비디자이너가 **AI + 첨부파일**로 “오피스/마을(월드) + 에이전트 + 작업 레시피(CLI)”를 구축하고, Run 모드에서 에이전트가 심즈처럼 움직이며 CLI 작업을 시각화/관제하는 데스크탑 앱(Electron).

### 1.2 핵심 가치
- **시각화**: 텍스트 로그를 ‘공간/이동/상태’로 번역
- **단순화**: CLI 명령을 버튼형 레시피로 전환 + 실행/중지/결과 정리
- **제작 자동화**: 타일/방/테마/에이전트/레시피를 “AI가 초안 → 사람이 Apply/버전관리”

## 2. 대상 사용자
- CLI가 익숙하지 않은 실무자(기획/운영/마케팅/교육)
- 팀 내 AI/에이전트/자동화 도입을 “눈으로 보여줘야” 하는 리드/PM

## 3. 모드 정의
### 3.1 Studio 모드(제작/생성) — 기본 모드
#### 목표
- 사용자가 직접 타일을 칠하지 않아도, AI가 **Draft(초안)** 를 만들어 주고 사용자는 **Preview → Apply**로 채택한다.
- 변경은 “버전 스냅샷” 단위로 관리한다.

#### 주요 컴포넌트
1) Asset Inbox
- 파일 드래그&드롭(이미지/문서/zip)
- 미리보기/태그/버전 연결

2) AI Builder (Chat)
- 사용자의 한국어 지시를 “생성 요청”으로 변환
- 결과를 Draft로 생성(월드/테마/에이전트/레시피)

3) Draft Preview
- 생성 결과를 캔버스/패널에서 미리 확인
- Apply(적용) / Regenerate(재생성) / Refine(수정요청)

4) Version History
- Apply 시마다 스냅샷 저장(최소 20개)
- Rollback / Compare(Diff 요약)

5) Export / Import
- project.json + generated + assets를 묶어 내보내기/불러오기

> Dev 모드(개발자용 수동 타일 페인트 등)는 옵션/숨김 처리(기본 노출 X).

### 3.2 Run 모드(시뮬/관제)
- 25 에이전트 이동(경로탐색) + 상태 표현
- Job 실행/중지 + 로그 스트리밍 + 산출물 링크
- 상태머신: IDLE / WALK(or RUNNING) / THINKING / SUCCESS / ERROR / NEEDS_INPUT(옵션)

## 4. 핵심 사용자 플로우(A to Z)
1) New Project → 템플릿 선택(Basic Office / Minimal Lab)
2) Asset Inbox에 레퍼런스 첨부(로고/무드보드/스샷/문서/에셋팩)
3) AI Builder에 지시(“회의실 2, 업무존 1, 휴게실 1 / 미니멀 톤”)
4) AI가 Draft 생성(맵/테마/에이전트/레시피)
5) Preview → Apply (버전 생성)
6) Run 모드로 전환 → 에이전트 이동/로그/레시피 실행 확인
7) 결과가 마음에 안 들면: Refine 지시 → Draft 재생성 → Apply → Rollback 가능

## 5. 기능 요구사항

### 5.1 World(맵/타일/오브젝트)
- Grid 기반(기본 40×25, tileSize 32)
- 레이어: floor, wall, collision, objects, spawn
- “검증(Validate)” 버튼: 스폰에서 이동 가능 여부 검사(막힌 동선 탐지)

### 5.2 Generators(MVP: 규칙 기반 + 스텁)
- Theme generator: 팔레트/폰트/버튼 스타일 JSON
- Layout generator: 방 3개 이상 + 벽/문 + 동선 확보
- Agent pack generator: 스프라이트 등록 + 25명 프로필 생성
- Recipe generator: 데모 레시피 2~3개 생성(node -v / dir/ls 등)

> 실제 LLM 호출은 옵션(환경변수로 CLI 호출). MVP는 규칙 기반으로도 충분히 시각적 성과 가능.

### 5.3 Agents
- 25명 생성, 랜덤 목표 이동 + 장애물 회피(A* / EasyStar)
- 상태에 따른 애니메이션 전환
- 선택 시: 말풍선/상태/담당 Job 표시

### 5.4 Jobs/CLI 실행
- 레시피(Recipe) = 버튼형 작업 정의
- Run/Stop/Clear
- stdout/stderr IPC 스트리밍
- 키워드 기반 상태 전환 + 종료코드 기반 SUCCESS/ERROR

### 5.5 저장/버전
- project.json에 월드/에이전트/레시피/테마 저장
- Apply마다 history/에 스냅샷 저장
- Import 시 버전 마이그레이션 스텁 포함

## 6. 수용 기준(DoD)
- Studio: 파일 첨부→Draft 생성→Preview→Apply→버전→Rollback 동작
- Run: 25 에이전트 이동 + 충돌 회피 + Job 실행/중지 + 로그 스트리밍 + 상태 전환 동작
- Export/Import로 동일 환경 재현 가능
