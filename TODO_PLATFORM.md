# 🏗️ TODO: Platform (Run 모드 & 인프라)

> `.ref/MASTER_PLAN_DOKBA_STUDIO.md`, `PRD_CLI_Town_Studio_v2.md` 기반 정밀 재검수 결과
> **현재 상태**: 주요 기능들의 "UI 틀(Shell)"과 "기반 시스템(A*, PIXI)"은 구축되었으나, 실제 데이터 연동 및 전면 적용이 필요한 상태입니다.

---

## 🟢 1. 현재 완전히 구현된 기반 시스템 (Foundation)

| 기능 | 현재 구현 수준 |
| --- | --- |
| **PixiJS v8 렌더링 엔진** | ✅ React + PixiJS v8 통합 완벽 동작, HMR 에러 등 해결됨 |
| **도크/사이드바 UI 쉘** | ✅ 25명 BottomDock 표시, RightPanel(탭 구조 쉘) |
| **상태 애니메이션 (코드)** | ✅ sin/cos 기반의 Squash/Stretch, Bounce 모션 로직 (IDLE/ERROR/SUCCESS) |

---

## 🟡 2. 부분적 구현 완료 (적용 확장 필요)

### ✅ R-2. 경로탐색 & 그리드 월드 (기획서 §5.1, §5.3)
>
> ⚠️ **상태**: 코어 시스템 완성 직후 Raccoon 1마리에만 테스트 적용됨. (기타 24명 4방향/2방향 이동 기획 확정 전까지 홀드)

- [x] 타일맵 및 충돌 존 (GridWorld) 구성 (벽/데스크/스폰 포인트)
- [x] A* Pathfinding (장애물 회피) 코어 로직 구현
- [x] 1마리 테스트 캐릭터(Raccoon) A* 이동 적용 완료
- [ ] **(TODO: 기획 확정 후)** 나머지 25명 에이전트에 **A\* 경로탐색 전면 적용**

### R-5. 캐릭터 애니메이션 (스프라이트 시트)
>
> ⚠️ **상태**: 12fps 애니메이션 시스템은 구축되었으나 1마리만 적용됨.

- [x] Raccoon 캐릭터 12fps 스프라이트 프레임 애니메이션 적용 완료 (Walk Front/Back 등)
- [ ] **(TODO)** 다른 방향(좌/우) 걷기 스프라이트 매핑
- [ ] **(TODO)** 25명의 에이전트 전체를 대상으로 한 AnimatedSprite 확장

---

## 🔴 3. 미구현 및 UI 쉘(Shell) 상태인 핵심 기능

### ✅ R-1. 25 에이전트 + 상태머신 연동
>
> ⚠️ **상태**: 상태 동기화 및 애니메이션 연동(RUNNING, ERROR 등) 구축 완료. (이동 A* 로직 확장은 홀드)

- [x] 노드/파이썬 백엔드와 연동된 **진짜 상태(State) 동기화**
- [ ] 에이전트 상태 변화 시 알맞은 위치(작업존/회의실)로 목적지 재설정 로직 추가 (경로탐색 홀드됨)
- [ ] 에이전트 클릭 시 나타나는 Inspector 카드 (최근 로그 요약 패널) 구현

### ✅ R-3. Jobs / Recipes 시스템 (핵심)
>
> ⚠️ **상태**: CLI 실행 엔진(Python subprocess.Popen) 및 UI 탭 연동 완료.

- [x] Electron Main 또는 Python 백엔드에서의 `child_process.spawn` CLI 실행기 구현
- [x] IPC 이벤트 (작업 시작/중지/종료) 통신
- [x] 로그 키워드에 따른 에이전트 상태 변화(run -> RUNNING) 로직

### ✅ R-4. 로그 스트리밍 & Artifacts
>
> ⚠️ **상태**: 웹소켓을 통한 실시간 로그 스트리밍 연동 완료. Artifacts 및 로그 필터 UI 연동 완료.

- [x] Python(백엔드) -> Node.js -> Frontend 로 이어지는 WSS 로그 채널
- [x] Run Panel 우측의 Log 인터페이스에서 실시간 로그 출력
- [ ] 결과물(산출물)을 Artifacts 탭에 폴더 트리나 파일 형태로 자동 파싱/마운트연동

---

## 🔵 4. 인프라 및 배포 (Phase 6)

- [ ] FastAPI 백엔드 Dockerfile 작성
- [ ] GCP Cloud Run 배포 설정
- [ ] 에셋 GCS (Cloud Storage) 연동
