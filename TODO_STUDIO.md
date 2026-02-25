# 🎨 TODO: Studio 모드 (제작/생성)

> `.ref/MASTER_PLAN_DOKBA_STUDIO.md`, `PRD_CLI_Town_Studio_v2.md` 기반 정밀 재검수 결과
> **현재 상태**: 모든 프로세스(S-1~S-6)의 "사용자 UI 및 통신 API 엔드포인트"는 연결되었으나, 백엔드 내부의 실제 생성 로직이 더미(Stub)로 작동하는 "Prototype Shell" 상태입니다.

---

## 🟢 1. 현재 완전히 구현된 기반 시스템 (Foundation)

| 기능 | 현재 구현 수준 |
| --- | --- |
| **Studio 레이아웃 및 탭** | ✅ Inbox, Builder, Draft, History 탭 라우팅 및 UI 완벽 동작 |
| **에셋 갤러리 (Decorator)** | ✅ 우측 패널 에셋 목업 표시 |

---

## 🟡 2. 부분적 구현 완료 (백엔드 고도화 필요)

### S-1. Asset Inbox
>
> ⚠️ **상태**: 파일 업로드 API는 정상 작동하지만 후처리가 미비함.

- [x] 드래그 앤 드롭 업로드 UI 및 FastAPI 파일 저장 기능 연동 완료
- [ ] **(TODO)** 파일 타입 자동 세부 분류 로직
- [ ] **(TODO)** 이미지/문서 썸네일 자동 생성 (현재 원본 파일만 저장됨)
- [ ] **(TODO)** 태그 스캔 및 필터링 시스템 적용

### S-4. Version History
>
> ⚠️ **상태**: 스냅샷 내역을 불러와 JSON 포맷으로 복구하는 부분까지는 완료.

- [x] History 스냅샷 파일(JSON) 로드 후 UI 표시
- [x] Rollback 버튼 클릭 시 이전 JSON 상태로 복구 기능 연동
- [ ] **(TODO)** 두 버전(JSON) 간 방 개수, 에이전트 수 등 데이터 **Diff 비교 요약뷰 구현**

### S-5. Export / Import 시스템
>
> ⚠️ **상태**: 압축 다운로드는 되나 구조의 완전성이 부족함.

- [x] Export (현재 public 에셋 폴더만 다운로드하는 API)
- [ ] **(TODO)** `project.json` + `history` + `assets` 모두 패키징하는 Export 고도화
- [ ] **(TODO)** 압축 해제 후 로컬 환경에 덮어쓰는 Import 시스템

### S-6. project.json 데이터 아키텍처
>
> ⚠️ **상태**: 구조체(Schema)만 있으며 앱 실행 전반에 동기화되지 않음.

- [x] JSON 스키마 초안 작성 및 저장 폴더 라우팅 확보
- [ ] **(TODO)** Run 모드(AgentTown)와 Studio 모드 간 전역 상태(Zustand 등) 실시간 연동

---

## 🔴 3. 미구현 및 UI 쉘(Shell) 상태인 핵심 기능

### S-2. AI Builder (제너레이터)
>
> ⚠️ **상태**: 채팅 UI는 완성형이나, FastAPI 제너레이터가 항상 "더미 draft.json"을 뱉습니다. 실제 추론 엔진 없음.

- [ ] **텍스트(프롬프트) 분석 모델 연동** (Nano Banana Pro 등 LLM 활용 여부)
- [ ] Theme, Layout, Agent Pack, Recipe 생성을 위한 규칙 기반(Rule-based) 컨텐츠 생성기 구현
- [ ] 생성된 데이터를 `draft.json` 규격에 완벽히 맞추는 직렬화 로직

### S-3. Draft Preview & Apply
>
> ⚠️ **상태**: Draft 요약 카드는 뜨지만, Preview(미리보기) 화면은 구현되지 않음.

- [ ] Draft 상태의 `draft.json`을 캔버스(또는 별도 React 뷰)에 **미리보기(Preview) 월드로 렌더링**
- [ ] Regenerate(재생성), Refine(수정 요청) 플로우 연결
