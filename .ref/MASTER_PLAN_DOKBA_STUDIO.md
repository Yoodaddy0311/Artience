# Dokba Studio — CLI Town Platform Master Brief (v2.0)

> 목적: **비개발자/비디자이너도** CLI(Claude/Gemini/Codex 등)를 “귀엽고 직관적인 플랫폼”으로 이해·운영할 수 있도록,  
> **심즈처럼 움직이는 오피스/마을(월드)** 위에서 **에이전트(캐릭터)와 작업 흐름**을 시각화하는 **Electron 데스크탑 앱**을 만든다.

---

## 0) 한 문장 요약

**CLI 자동화(에이전트/워크플로우)를 ‘오피스에서 일하는 캐릭터들’로 번역해, 누구나 실행·관제·개선할 수 있게 만드는 Studio + Run 플랫폼.**

---

## 1) 왜 이걸 만드나 (취지/문제 정의)

### 1.1 문제
- CLI는 강력하지만, 비개발자에게는 **“무슨 일이 벌어지는지”**가 보이지 않는다.
- 에이전트가 여러 개 돌아가는 순간(계획→코드→테스트→문서화)  
  텍스트 로그만으로는 **진행·원인·병목**이 이해되지 않는다.
- 팀 도입 시 “보여줄 수 있는 UI”가 없으면 확산이 어렵다.

### 1.2 해결 컨셉(메타포)
- “명령어/로그”를 그대로 읽게 하지 않고,
- **에이전트(캐릭터)가 오피스에서 움직이며 일하는 모습**으로 번역한다.
  - THINKING → 회의실/화이트보드 근처에서 고민
  - RUNNING → 자리에서 타다다(작업)
  - SUCCESS/ERROR → 리액션(알림) + 로그 하이라이트

---

## 2) 제품 콘셉트 & 세계관(컨셉)

### 2.1 플랫폼 구조: Studio / Run / (Dev 옵션)
- **Studio(제작/생성) 모드**: “플랫폼을 만드는 모드”
  - 사용자(비개발자)가 **AI + 첨부파일**로 월드/테마/에이전트/레시피를 **생성 → 미리보기(Draft) → 적용(Apply) → 버전관리**
  - *중요*: “타일을 직접 칠하는 인테리어 게임”이 아니라  
    **제작자(프로덕트 빌더) 모드**로 설계한다.
- **Run(관제/시뮬) 모드**: “실행·관제 모드”
  - 에이전트 25명이 심즈처럼 이동
  - 작업(레시피) 실행/중지, 로그 스트리밍, 상태 전환
- **Dev(숨김/옵션) 모드**: 개발자용 디버그(필요 시만 노출)
  - 수동 타일 페인트/좌표 보기/충돌 보기 등

### 2.2 “독바(Dokba)” 캐릭터 감성
- 키워드: **귀엽다 / 믿음직하다 / 바쁘게 일한다 / 과장되지 않다**
- 과도한 애니메이션보다 **짧고 명확한 상태 표현**(12fps, 1~2초 리액션)을 우선한다.
- 캐릭터는 “사용자를 도와주는 안내자 + 에이전트의 아바타”로 동작.

---

## 3) 핵심 사용자(페르소나)

1) **비개발자 운영자/기획자**
- CLI를 몰라도 버튼으로 작업을 실행하고, 상태를 이해해야 함

2) **팀 리드/PM**
- “에이전트가 어떻게 협업하는지”를 팀에 보여주고, 운영 규칙을 만들고 싶음

3) **개발자(서포트 역할)**
- 플랫폼의 확장/연동/패키징을 맡지만, 기본 UX는 비개발자 중심으로 설계되어야 함

---

## 4) 전체 UX 흐름 (A to Z)

### 4.1 최초 세팅(Studio)
1. New Project(템플릿 선택: Basic Office / Minimal Lab)
2. **Asset Inbox**에 첨부(무드보드/로고/참고 UI/문서/에셋팩 ZIP)
3. **AI Builder**에 지시:
   - “회의실 2, 업무존 1, 휴게실 1 / 다크 미니멀 / 동선 막히지 않게”
   - “에이전트 25명 역할 분배”
   - “레시피 3개(코드/테스트/문서) 버튼으로”
4. 시스템이 Draft 생성 → Preview
5. 만족하면 Apply(버전 생성), 아니면 Refine/Regenerate
6. Export(프로젝트 패키지 ZIP)로 공유/백업

### 4.2 운영(런타임: Run)
1. Run 모드 전환
2. 레시피 클릭 → 작업 실행(메인 프로세스 spawn)
3. 로그 스트리밍 + 에이전트 상태 전환
4. 성공/실패 리액션 + 산출물 링크
5. 문제가 있으면 Studio로 돌아가 레시피/룰/레이아웃 수정 → Apply → 재실행

---

## 5) UI/IA(화면 구조)

### 5.1 공통 레이아웃
- **Top Bar**
  - Mode Toggle(Studio/Run)
  - Save / Load / Export / Import
  - Generate(오피스 생성) / Apply Draft / Rollback
  - Run Job / Stop
- **Center Canvas (Phaser World)**
  - 오피스/마을, 에이전트, 하이라이트, 경로 표시(옵션)
- **Right Panel**
  - Studio 탭: Inbox / Builder / Draft / Versions / Assets
  - Run 탭: Agents / Jobs / Logs / Artifacts / Settings
- **Bottom Status Bar(선택)**
  - “현재 모드, 저장 상태, 실행 중 Job, FPS/에러” 표시

---

## 6) UX 디테일(핵심 상호작용)

### 6.1 Studio — 제작자 경험
#### A) Asset Inbox
- 드래그&드롭 업로드
- 파일 타입 자동 분류: image / doc / zip
- 태그(Theme/World/Agents/Recipes)
- 이미지 썸네일/문서 미리보기(요약은 나중)

#### B) AI Builder
- 프롬프트 템플릿 버튼(오피스 생성/테마/에이전트/레시피)
- “생성 범위” 선택: Theme / World / Agents / Recipes
- 출력은 항상 Draft(프로젝트에 즉시 반영 X)

#### C) Draft Preview
- Draft 요약(방 개수/충돌 타일 수/스폰 수/에이전트 수/레시피 수)
- Preview에서 월드 표시
- Apply(반영) / Regenerate(재생성) / Refine(수정 요청)

#### D) Version History
- Apply할 때마다 스냅샷 저장
- Rollback(즉시 복구)
- Compare(요약 Diff: 방 개수, 충돌 타일 수, 레시피 변화)

#### E) Export/Import
- Export: project + assets + generated + history를 ZIP로 패키징
- Import: ZIP 로드 → 프로젝트 교체(충돌 시 폴더 suffix)

> 원칙: 사용자는 “만드는 사람”이지만, **코드/타일을 직접 만지지 않아도** 제작 가능해야 한다.

---

### 6.2 Run — 운영/관제 경험
#### A) Agents 탭
- 25명 리스트(이름/역할/상태/담당 job)
- 클릭하면 월드에서 해당 에이전트 하이라이트 + Inspector 카드(최근 로그 요약)

#### B) Jobs 탭
- 레시피 버튼(자주 쓰는 작업)
- Queue(대기/실행/완료/실패)
- Stop(중지) 및 재실행

#### C) Logs 탭
- Raw 로그(스트리밍)
- 필터: agent / job / stderr만 / 키워드
- (옵션) 5줄 한국어 요약 + 에러 원인 후보 3개

#### D) Artifacts 탭
- 생성된 파일/폴더 링크(탐색기 열기)
- “어디에 생성됐는지”를 명확히 보여줌

---

## 7) 디자인/분위기(UX/UI + 비주얼 가이드)

### 7.1 전체 톤
- **모던 미니멀 + 다크모드 기본**
- 과한 픽셀아트보다는 “깔끔한 도형 + 부드러운 애니메이션”으로 시작
- 월드는 귀엽되, UI는 **프로덕트 툴처럼 단정**

### 7.2 컬러(초안)
- Background: Deep navy/charcoal
- Panel: slightly lighter
- Text: high contrast gray/white
- Accent(성공): vivid green 계열
- Error: red 계열(너무 형광 X)
- Info: blue 계열

### 7.3 타이포그래피
- 기본: system-ui(윈/맥 기본)로 시작
- 강조: 숫자/상태 라벨은 semi-bold

### 7.4 모션(중요)
- UI 트랜지션: 120~180ms
- 캐릭터 애니메이션: **12fps** 권장
- 리액션(성공/에러): 0.8~1.2초 후 IDLE로 복귀

---

## 8) 캐릭터 “작동 원리”(상태 → 행동 매핑)

### 8.1 상태머신(필수)
- IDLE: 대기(호흡/통통)
- WALK: 이동(랜덤 목표/자리 이동)
- THINKING: 고민(회의실/화이트보드 쪽 이동 또는 제자리)
- RUNNING: 작업 실행(책상/작업존 이동, 타다다)
- SUCCESS: 성공 리액션(짧게)
- ERROR: 실패 리액션(짧게)
- NEEDS_INPUT(옵션): 사용자 입력 대기(말풍선)

### 8.2 애니메이션 세트(MVP 최소)
- idle_loop
- walk_loop
- success_one_shot
- error_one_shot
- (확장) thinking_loop, running_loop

> 현재는 PNG 1장 기반 “임시 스프라이트”로 시작하고, 이후 Veo3/이미지 생성으로 워킹 사이클을 교체한다.

---

## 9) 기능 범위

### 9.1 MVP(반드시)
- Studio
  - Asset Inbox(등록/태그/미리보기)
  - Builder(프롬프트 → generator 스텁 실행)
  - Draft → Preview → Apply
  - Version History + Rollback
  - Export/Import ZIP
- Run
  - 25 에이전트 이동 + 장애물 회피(pathfinding)
  - Recipe 실행(node -v 등 데모 포함)
  - stdout/stderr 스트리밍(IPC)
  - 키워드 기반 상태 전환 + exitCode 기반 SUCCESS/ERROR

### 9.2 v1(추천)
- Validate(동선 검사) 고도화(리포트)
- Logs 요약(5줄)
- 에이전트/잡 필터 UX 개선(검색, 고정핀)
- 에셋팩 pack.json 임포트/적용

### 9.3 v2(확장)
- Generative Agents 스타일(기억/계획/회상)로 고도화
- 멀티 프로젝트/템플릿 마켓
- 협업(프로젝트 공유/리뷰)

---

## 10) 비목표(명확히)
- Dock/Taskbar “상시 애니메이션”을 메인 UX로 삼지 않는다(OS 제약/퀄리티 저하 위험)
  - 대신 Taskbar/Dock는 **앵커/상태(배지/프로그레스)** 용도로만 활용 가능
- MVP에서 완전한 절차적 생성(Procedural Generation) 완성도는 목표가 아니다.
  - 규칙 기반 생성 + 빠른 반복/버전이 우선

---

## 11) 기술/구현 가이드(IDE가 이해하기 쉽게)

### 11.1 권장 스택
- Desktop: **Electron**
- World/Sim: **Phaser 3**
- UI: DOM(필요 시 React 추가 가능)
- Pathfinding: easystarjs(A*) 또는 자체 A*
- Data: JSON(project.json) + snapshot history
- CLI: main process `child_process.spawn` + IPC 스트리밍

### 11.2 아키텍처(역할 분리)
- **Main(Electron)**
  - CLI 실행/중지
  - 파일 시스템(저장/불러오기/Export/Import)
  - IPC 브리지
- **Renderer**
  - Studio UI/Run UI
  - Phaser 월드 렌더/에이전트 이동/상태 표현
  - 로그 표시/필터

### 11.3 프로젝트 파일 구조(권장)
- `electron/` main process
- `src/game/` phaser world, agents, pathfinding
- `src/studio/` inbox, builder, generators, versions
- `src/run/` jobs, logs, artifacts
- `src/shared/` types, schemas, utils
- `project/` project.json
- `generated/` draft outputs
- `history/` snapshots
- `assets/` user assets

---

## 12) 산출물(데이터) 정의

### 12.1 Project JSON
- meta, theme, world(layers), agents, recipes
- schemaVersion 포함

### 12.2 Asset Pack ZIP(pack.json)
- tilesets, objects, sprites 정의 + 경로
- Import 후 Assets 탭에 등록 → Apply Pack으로 매핑

### 12.3 History Snapshots
- Apply 단위로 `history/{id}.json`
- Compare용 요약(summary) 자동 생성

---

## 13) IDE(Claude Code/Gemini CLI/Codex)용 작업 지시 원칙

### 13.1 한 방(bootstrap) → 단계별 프롬프트로 확장
- 먼저 “동작하는 최소 앱”을 생성하고,
- 그 다음 Inbox/Generators/Versioning/Export/Jobs/Validate 순으로 쪼개서 적용

### 13.2 실패율을 낮추는 지시문 룰
- “폴더/파일명/스크립트/의존성”을 명시
- “성공 기준(DoD)”를 문장으로 포함
- OS 호환(Windows/macOS)을 요구사항에 포함

---

## 14) 수용 기준(DoD) — IDE 체크리스트

### Studio
- 파일 업로드(이미지/문서/zip) → 목록/썸네일/태그 정상
- Builder 프롬프트 → Draft 생성(/generated/)
- Preview에서 Draft 월드 확인
- Apply → project.json 반영 + history 스냅샷 생성
- Rollback → 이전 버전 복원
- Export ZIP → Import ZIP → 동일 프로젝트 재현

### Run
- 25 에이전트 생성
- 충돌 타일 회피 이동
- demo recipe 실행 → stdout 로그 표시
- Stop → 프로세스 종료
- exitCode!=0 → ERROR 리액션 + Logs 탭 강조

---

## 15) “독바 캐릭터” 룩 & 모션(요약 가이드)

- 형태: 둥글고 단순한 실루엣(작게 보여도 인지)
- 표정: 최소한(눈/입 정도)으로 상태 전달
- 움직임: 과장 대신 **짧은 bounce + blink**
- 색감: UI 다크모드에서 튀지 않도록 “중립 톤 + 포인트 컬러” 최소화
- 프레임: 8~12 frames loop, 12fps

---

## 16) 향후 확장(옵션)
- “Agent personality + memory”를 붙여, 실제로 스케줄/대화가 자연스럽게 발생
- 작업 레시피를 템플릿 마켓 형태로 공유
- 온보딩: “독바가 안내하는 튜토리얼(3분)”

---

# 끝.
