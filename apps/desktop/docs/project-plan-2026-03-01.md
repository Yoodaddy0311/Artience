# Artience (Dokba Studio) 프로젝트 기획서

## 작성일: 2026-03-01

---

## 1. 프로젝트 비전/방향

### 핵심 전환: 웹 → exe 로컬 퍼스트

- **이전**: 웹(Firebase Hosting) + 백엔드(GCP Cloud Run) + Electron 데스크탑 (하이브리드)
- **이후**: **Electron exe 전용** + 선택적 클라우드 API
- **전환 이유**: Claude CLI가 로컬에서만 동작 — 캐릭터 채팅/에이전트 실행의 핵심 기능이 로컬 CLI에 의존
- **DNA 유지**: 유저 간 템플릿/학습/워크플로우 공유는 클라우드 API로 선택적 지원

### 원칙

1. exe 단독으로 기본 기능 100% 작동 (백엔드 없이)
2. 네트워크 기능은 선택적 — 연결 실패 시 graceful degradation
3. 로컬 데이터 우선 (Zustand persist → localStorage, 향후 SQLite)

---

## 2. 아키텍처 (AS-IS -> TO-BE)

### AS-IS

```
[Firebase Hosting]  ←→  [Cloud Run API (FastAPI)]  ←→  [SQLite/Secret Manager]
       ↑                        ↑
[Electron Desktop]  ←→  [WebSocket /ws/town]
       ↑
[Claude CLI (로컬)]
```

- 웹과 Electron이 동일한 백엔드 API에 의존
- 모든 데이터(프로젝트, 에셋, 히스토리)가 서버에 저장
- 캐릭터 채팅은 Electron에서만 Claude CLI 사용, 웹은 WS fallback

### TO-BE

```
[Electron exe]
  ├── Renderer (React + Pixi.js + Zustand)
  ├── Main Process
  │   ├── child_process.spawn (터미널)
  │   ├── execFile('claude') (캐릭터 채팅)
  │   └── IPC Bridge (preload.ts)
  └── 선택적 API 연결
      ├── 템플릿 공유 (Cloud API)
      ├── 리더보드/업적 (Cloud API)
      └── 멀티플레이 룸 (WebSocket)
```

- 로컬 파일시스템에 데이터 저장 (Zustand persist)
- Claude CLI = 로컬 실행 전용
- 네트워크 기능은 apiUrl 설정에 따라 활성화

---

## 3. 현재 기능 현황 (전수검사)

### 3.1 핵심 기능 (exe에서 작동)

| 기능 | 파일 | 현재 상태 | exe 대응 | 필요 작업 |
|------|------|----------|---------|----------|
| 탭 전환 (town/studio/room/social) | MainLayout.tsx | OK | useState 기반 라우팅 | 없음 |
| AgentTown 렌더링 (Pixi.js) | AgentTown.tsx | 에셋 경로 문제 | file:// 미대응 | 상대 경로 변환 (P0) |
| 수달 캐릭터 이동/애니메이션 | otter-runtime.ts | 에셋 경로 문제 | `/sprites/iso/*.png` 절대 경로 | 상대 경로 변환 (P0) |
| 아이소메트릭 맵 렌더링 | iso-renderer.ts | 에셋 경로 문제 | `/sprites/iso/room-*.png` 절대 경로 | 상대 경로 변환 (P0) |
| 월드 생성/경로 탐색 | grid-world.ts, isometric.ts | OK | 순수 로직 | 없음 |
| 캐릭터 채팅 (Claude CLI) | main.ts (chat:send IPC) | OK | Electron IPC → execFile('claude') | 없음 |
| 터미널 패널 | TerminalPanel.tsx, main.ts | OK | child_process.spawn (node-pty 제거됨) | 없음 |
| 설정 모달 | SettingsModal.tsx | OK | Electron IPC 우선 + localhost guard | 없음 |
| 프로젝트 데이터 (Zustand) | useAppStore.ts | OK | persist middleware → localStorage | 없음 |
| 에이전트 클릭/인스펙터 | InspectorCard.tsx | OK | 로컬 상태 기반 | 없음 |
| 봇 독 (하단 에이전트 목록) | BottomDock.tsx | OK | 순수 UI | 없음 |
| 에러 바운더리 | AppErrorBoundary.tsx | OK | 순수 React | 없음 |
| 토스트 알림 | Toast.tsx | OK | 순수 UI | 없음 |
| CLI 인증 상태/로그인 | main.ts (cli:auth-*) | OK | IPC → execFile('claude auth') | 없음 |

### 3.2 API 의존 기능 (서버 필요 — 선택적)

| 기능 | 파일 | localhost guard | try/catch | exe 동작 |
|------|------|:---:|:---:|------|
| WS 에이전트 상태 (AgentTown) | AgentTown.tsx:480 | O | O | skip — 에이전트는 로컬 AI로 움직임 |
| WS 타운 상태 (RightSidebar) | RightSidebar.tsx:136 | O | O | skip |
| WS 타운 상태 (RunPanel) | RunPanel.tsx:155 | O | O | skip |
| 프로젝트 로드 | useAppStore.ts:245 | O | O | skip — localStorage 사용 |
| 스튜디오 에셋 목록 | StudioDecorator.tsx:12 | O | O | skip — 빈 목록 |
| 리더보드 | Leaderboard.tsx:79 | O | O | skip — 빈 목록 |
| 룸 목록 | useRoomStore.ts:183 | O | O | skip |
| AI 빌더 (생성) | AIBuilder.tsx:71 | X | O | 실패 → 에러 토스트 |
| 드래프트 프리뷰 | DraftPreview.tsx:45,64 | X | O | 실패 → fallback 데이터 |
| 버전 히스토리 | VersionHistory.tsx:384,400 | X | O | 실패 → 에러 표시 |
| 에셋 패널 | AssetsPanel.tsx:18 | X | O | 실패 → 에러 |
| 에셋 인박스 (업로드) | AssetInbox.tsx:86 | X | O | 실패 → 에러 토스트 |
| 유저 프로필 | UserProfile.tsx:86 | X | O | 실패 → 에러 |
| 업적 패널 | AchievementPanel.tsx:114 | X | O | 실패 → 에러 |
| 스튜디오 생성/적용/롤백 | MainLayout.tsx:94,109,122 | X | O | 실패 → 에러 토스트 |
| 임포트/익스포트 | MainLayout.tsx:210,228 | X | O | 실패 → 에러 토스트 |
| 스탯 조회 | RightSidebar.tsx:73 | X | O | 실패 → 기본값 |
| 문서 업로드 | RightSidebar.tsx:103 | X | O | 실패 |
| 잡 실행/중지 | RunPanel.tsx:227,233 | X | O | 실패 → 에러 |
| 잡 아티팩트 | RunPanel.tsx:516 | X | O | 실패 |
| 프로젝트 저장 | useAppStore.ts:267 | X | O | 실패 → 에러 메시지 |
| 룸 WebSocket | roomSocket.ts:91 | X | X | 연결 실패 → 콘솔 에러 |

### 3.3 file:// 프로토콜 문제

| 항목 | 파일 | 문제 | 심각도 |
|------|------|------|:---:|
| Service Worker 등록 | index.html:18-20 | file://에서 SW 등록 불가 → 에러 | P0 |
| Pixi.js 수달 텍스처 | otter-runtime.ts:55-58 | `/sprites/iso/*.png` → file:/// 루트 = 404 | P0 |
| Pixi.js 룸 스프라이트 | iso-renderer.ts:57-58 | `/sprites/iso/room-*.png` → 404 | P0 |
| index.html favicon | index.html:7 | `href="/favicon.png"` → file:/// 루트 | P1 |
| index.html manifest | index.html:8 | `href="/manifest.json"` → file:/// 루트 | P1 |
| 드래프트 JSON fetch | DraftPreview.tsx:64 | `fetch('/generated/draft.json')` → 404 | P2 (fallback 있음) |
| 게임 HUD 이미지 | MainLayout.tsx:474-507 | `/assets/ui/*.png` — SHOW_GAMIFICATION=false라 미사용 | 없음 |

---

## 4. 취소/변경 항목

### 취소

| 항목 | 이유 |
|------|------|
| Firebase Hosting 웹 배포 | exe 전용으로 전환 |
| Service Worker (sw.js) | file:// 프로토콜에서 미지원 |
| PWA 매니페스트 (manifest.json) | 웹앱 불필요 |
| GCP Cloud Run API 필수 의존 | 로컬 퍼스트로 전환 |
| node-pty 네이티브 모듈 | 빌드 문제로 child_process.spawn 대체 완료 |

### 변경

| 항목 | AS-IS | TO-BE |
|------|-------|-------|
| 캐릭터 채팅 | WS/API fallback | Claude CLI 전용 (Electron IPC) |
| 터미널 | node-pty (PTY) | child_process.spawn (pipe 기반) |
| 데이터 저장 | Cloud API (fetch) | 로컬 (Zustand persist → 향후 SQLite) |
| 에셋 경로 | 절대 경로 (/sprites/...) | 상대 경로 (./sprites/...) |
| Vite base | `/` (웹 서버) | `./` (file:// 호환) |
| API 호출 | 항상 시도 | localhost이면 skip |
| WebSocket | 항상 연결 | localhost이면 skip + exponential backoff |
| 코드 서명 | 미설정 | forceCodeSigning: false, sign: null |

---

## 5. 신규 필요 작업

### 5.1 로컬 데이터 저장 강화

현재 `useAppStore`는 `zustand/persist`로 `localStorage`에 저장 중. 충분하지만 대용량 데이터(에셋, 히스토리)는 별도 저장 필요:

- **옵션 A**: `electron-store` (JSON 파일 기반, 간단)
- **옵션 B**: `better-sqlite3` (SQLite, 대규모 데이터에 적합)
- **권장**: 단기 electron-store, 장기 SQLite

### 5.2 Auto-update

- `electron-updater` 연동 (GitHub Releases 기반)
- `package.json`에 `publish` 설정 추가 필요
- 자동 업데이트 UI (SettingsModal에 버전 정보 + 업데이트 버튼)

### 5.3 로컬 에이전트 실행 (Claude CLI 통합 강화)

- 현재: 채팅만 CLI 사용
- 향후: RunPanel의 잡 실행도 로컬 CLI로 전환
- `main.ts`에 `job:run` IPC 핸들러 추가

### 5.4 로컬 임포트/익스포트

- 현재: API 서버 통해 zip 업로드/다운로드
- 전환: Electron `dialog.showOpenDialog` / `dialog.showSaveDialog` 사용
- `main.ts`에 `file:import`, `file:export` IPC 핸들러 추가

### 5.5 템플릿/워크플로우 공유 (클라우드 선택적)

- 로컬 프로젝트를 JSON으로 serialize → 클라우드 API에 업로드
- 다른 유저의 템플릿 다운로드 → 로컬에 적용
- apiUrl이 클라우드 서버일 때만 활성화

---

## 6. 업무 리스트 (우선순위별)

### P0 -- 즉시 (exe가 정상 작동하도록)

1. [ ] **Pixi.js 에셋 경로 상대 경로 변환** — `otter-runtime.ts`, `iso-renderer.ts`의 `/sprites/iso/*.png` → `./sprites/iso/*.png` 또는 동적 base URL 사용
2. [ ] **index.html Service Worker 제거/guard** — `location.protocol.startsWith('http')` 체크 추가
3. [ ] **index.html 절대 경로 수정** — `/favicon.png` → `./favicon.png`, `/manifest.json` → `./manifest.json`
4. [ ] **roomSocket.ts localhost guard 추가** — WebSocket 생성 전 `apiUrl.includes('localhost')` 체크
5. [ ] **exe 빌드 테스트** — `pnpm electron:build` 후 설치 및 기본 기능 동작 확인

### P1 -- 이번 주

6. [ ] **API 의존 컴포넌트 localhost guard 일괄 추가** — AIBuilder, DraftPreview, VersionHistory, AssetsPanel, AssetInbox, UserProfile, AchievementPanel, RunPanel(잡 실행), RightSidebar(스탯/문서)
7. [ ] **로컬 임포트/익스포트 IPC 구현** — `dialog.showOpenDialog`/`showSaveDialog` + JSON 파일 읽기/쓰기
8. [ ] **프로젝트 저장 로컬 전환** — `useAppStore.saveProject()`를 Electron IPC로 로컬 파일에 저장
9. [ ] **DraftPreview `/generated/draft.json` 경로 수정** — 상대 경로 또는 로컬 파일 읽기
10. [ ] **터미널 개선** — child_process.spawn의 pipe 모드 한계 보완 (ANSI 색상 미지원 등)

### P2 -- 다음 주 이후

11. [ ] **Auto-update 시스템** — `electron-updater` + GitHub Releases
12. [ ] **로컬 데이터 저장소 강화** — `electron-store` 또는 `better-sqlite3` 도입
13. [ ] **RunPanel 로컬 실행** — CLI 기반 잡 실행 IPC 핸들러 (`job:run`, `job:stop`)
14. [ ] **템플릿 공유 시스템** — 클라우드 API 연동 (선택적)
15. [ ] **멀티플레이 룸 로컬 대안** — 로컬 네트워크 P2P 또는 클라우드 선택적
16. [ ] **게이미피케이션 로컬화** — 로컬 데이터 기반 레벨/업적/리더보드
17. [ ] **앱 아이콘 고해상도** — 256x256 이상 전용 아이콘 디자인
18. [ ] **Windows 코드 서명** — 배포 시 인증서 구매 및 서명 설정
19. [ ] **macOS DMG 빌드** — macOS 환경에서 빌드/테스트
20. [ ] **CI/CD 파이프라인** — GitHub Actions로 멀티플랫폼 자동 빌드

### 취소 항목

1. [x] ~~Firebase Hosting 배포~~ — exe 전용 전환
2. [x] ~~Service Worker (sw.js) 캐싱~~ — file:// 미지원
3. [x] ~~PWA 매니페스트~~ — 웹앱 불필요
4. [x] ~~GCP Cloud Run API 필수 의존~~ — 선택적으로 전환
5. [x] ~~node-pty 네이티브 모듈~~ — child_process.spawn으로 대체 완료
6. [x] ~~웹 전용 WS 채팅 fallback~~ — Claude CLI 전용

---

## 7. 파일 구조 요약

```
apps/desktop/
  electron/
    main.ts          ← Electron 메인 프로세스 (터미널, 채팅, 인증 IPC)
    preload.ts       ← IPC 브릿지 (dogbaApi)
  src/
    components/
      agent-town/    ← AgentTown (Pixi.js), InspectorCard, UserCharacter, RaccoonInspector
                        otter-runtime, iso-renderer, agent-runtime
      layout/        ← MainLayout, RightSidebar, BottomDock, SettingsModal
      studio/        ← AIBuilder, DraftPreview, VersionHistory, AssetsPanel, AssetInbox, StudioDecorator
      room/          ← RoomLobby, TaskInputPanel, MemberList, RoomCode
      social/        ← SocialView, Leaderboard, AchievementPanel, UserProfile
      run/           ← RunPanel
      terminal/      ← TerminalPanel
      gamification/  ← LevelProgress
      ui/            ← Toast, Badge, Button, Card, SpeechBubble, ConfirmDialog
    store/
      useAppStore.ts ← 앱 상태, 프로젝트, 게이미피케이션, 설정 (persist)
      useRoomStore.ts ← 룸/멀티플레이 상태
    services/
      roomSocket.ts  ← 룸 WebSocket 관리
    systems/
      grid-world.ts  ← 월드 그리드 생성, 경로 탐색
      isometric.ts   ← 아이소메트릭 좌표 변환
    types/
      platform.ts    ← 에이전트 프로필, 상태 타입
      project.ts     ← 프로젝트 데이터 타입
      electron.d.ts  ← Electron IPC API 타입 선언
  public/
    sprites/iso/     ← 수달/룸 스프라이트 이미지
    assets/ui/       ← UI 아이콘 이미지
    favicon.png      ← 앱 아이콘 (PNG, 640x640)
    icon.ico         ← 앱 아이콘 (ICO, 다중 크기)
```

---

## 8. 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프레임워크 | Electron 35 | 데스크탑 앱 |
| 렌더러 | React 19 + Vite 6 | SPA |
| 2D 렌더링 | Pixi.js 8 | AgentTown |
| 상태 관리 | Zustand 4 (persist) | localStorage |
| 스타일 | Tailwind CSS 4 | Neo-Brutalism |
| 터미널 | xterm.js 6 + child_process | pipe 기반 |
| AI | Claude CLI (execFile) | 로컬 실행 |
| 빌드 | esbuild (Electron) + Vite (renderer) | |
| 패키징 | electron-builder 26 | NSIS installer (Windows) |
| 테스트 | Vitest + Testing Library | |
| 타입 | TypeScript 5.3 | strict |
