# Artience 플랫폼 벤치마킹 기획서: claw-empire 분석 기반

> 작성일: 2026-03-11
> 프로젝트: Artience (apps/desktop) — Electron + Claude Code CLI
> 벤치마킹 대상: claw-empire (웹 앱, Express+React, SQLite)

---

## 1. Executive Summary

### 벤치마킹 목적

claw-empire는 멀티 AI 에이전트 협업 플랫폼으로, 메신저 연동(7채널), 자동 회의록, 멀티 프로바이더(6 CLI + 1 API), 스킬 라이브러리, 상세 리포트 등 Artience가 아직 갖추지 못한 기능을 성숙하게 구현했다. 본 기획서는 claw-empire의 핵심 기능을 분석하고, Artience의 CLI-first(Electron + Claude Code) 환경에 맞게 적용 가능한 업그레이드 전략을 수립한다.

### 핵심 발견

| 영역               | claw-empire                                        | Artience 현재      | GAP      |
| ------------------ | -------------------------------------------------- | ------------------ | -------- |
| 메신저 연동        | 7채널 (Telegram, Discord 등)                       | 없음               | Critical |
| 자동 회의          | 라운드별 합의 시스템                               | 없음               | High     |
| 멀티 프로바이더    | 6 CLI + OAuth 교체                                 | Claude Code 전용   | Medium   |
| 스킬 라이브러리    | 외부 카탈로그 + 6프로바이더별                      | 3개 기본 스킬      | High     |
| 상세 리포트        | DB + PPT + 영상                                    | Mail 시스템만 존재 | High     |
| 워크플로 팩        | 6종 (dev/novel/report/video/web_research/roleplay) | 없음               | Medium   |
| 에이전트 동적 관리 | DB 기반 CRUD                                       | 26명 하드코딩      | Medium   |

### 핵심 결론

Artience는 CLI 환경의 강점(PTY 직접 제어, Git worktree 격리, MCP 도구 서버)을 살려 claw-empire와 차별화된 "개발자 특화 AI 팀" 경험을 제공해야 한다. 웹 기반 claw-empire가 메신저/회의/리포트에 강점을 보이는 반면, Artience는 실시간 코드 실행, 에이전트별 독립 작업 환경, 성장 시스템(gamification)에서 우위를 갖는다.

---

## 2. claw-empire 핵심 기능 요약

### 2.1 메신저 연동 (7채널)

- **구현 방식**: Long-polling/REST 기반 수신, 세션-에이전트 라우팅
- **채널**: Telegram, WhatsApp, Discord, Google Chat, Slack, Signal, iMessage
- **특수 명령**: `$` prefix = CEO Directive (전사 지시), `#` prefix = Task Request (태스크 요청)
- **핵심 가치**: 외부 메신저에서 에이전트에게 직접 지시 가능

### 2.2 회의록 (자동 팀장 회의)

- **규모**: 1,859줄 구현
- **흐름**: CEO Directive → 기획팀장 소집 → 다라운드 합의 (approved/hold/revision)
- **산출물**: PROJECT MEMO로 태스크에 자동 기록
- **핵심 가치**: 인간 개입 없이 에이전트 간 의사결정 자동화

### 2.3 멀티 프로바이더 (6 CLI + 1 API)

- **지원**: Claude Code, Codex CLI, Gemini CLI, OpenCode, GitHub Copilot, Antigravity, API Provider
- **구현**: 에이전트별 `cli_provider` 설정, OAuth 토큰 자동 교체
- **핵심 가치**: 프로바이더 장애/비용 최적화를 위한 유연한 전환

### 2.4 스킬 라이브러리

- **구현**: skills.sh 외부 카탈로그 크롤링, 6개 프로바이더별 스킬 디렉토리
- **관리**: Job 큐 기반 학습/삭제, DB 히스토리, 프롬프트 자동 주입
- **핵심 가치**: 에이전트가 동적으로 새 역량을 습득

### 2.5 상세 리포트

- **흐름**: 태스크 완료 → 데이터 수집 → WebSocket 브로드캐스트
- **산출물**: PPT 생성 (pptxgenjs) + 영상 (Remotion) + Git 브랜치 검증
- **핵심 가치**: 작업 결과를 다양한 포맷으로 자동 정리

### 2.6 아키텍처 특징

- **패턴**: Deferred Runtime Proxy (순환 의존성 해결), Factory+DI
- **워크플로 팩**: 6종 (dev/novel/report/video/web_research/roleplay)
- **데이터**: SQLite = ground truth, WebSocket = 실시간 동기화

---

## 3. 기능별 벤치마킹 분석

### 3.1 메신저 연동 → Artience CLI 환경 적용 방안

**claw-empire 방식**: 웹 서버가 메신저 API polling → 세션 라우팅 → 에이전트 배정

**Artience 적용 전략**: MCP 도구 서버 확장

현재 Artience의 `mcp-artience-server.ts`는 4개 도구(notify, agent_status, send_mail, project_info)를 제공한다. 여기에 메신저 브릿지 도구를 추가하는 방식이 CLI 환경에 가장 적합하다.

**구현 계획**:

- `electron/messenger-bridge.ts` 신규 매니저 추가
- MCP 도구 2개 추가: `artience_messenger_receive`, `artience_messenger_send`
- Electron 트레이 아이콘으로 메신저 알림 표시
- 초기 지원 채널: Discord (Bot API) + Slack (Webhook) — 가장 개발자 친화적
- IPC 채널 2개 추가: `messenger:connect`, `messenger:send`

**CLI 환경 이점**:

- 에이전트가 MCP 도구로 직접 메시지 송수신 가능
- PTY 세션에서 메신저 컨텍스트를 자연스럽게 참조
- Electron 트레이로 백그라운드 수신 가능

**위험도**: Medium — 외부 API 의존성, 인증 토큰 관리 필요

### 3.2 회의록 → CLI 환경 구현 전략

**claw-empire 방식**: 서버 내 다라운드 합의 로직 (1,859줄)

**Artience 적용 전략**: CTO Controller 확장 + PTY 멀티세션 협의

현재 `cto-controller.ts`는 Dokba(CTO)가 `--agents` 플래그로 서브에이전트를 spawn하는 구조다. 이를 확장하여 "미팅 모드"를 추가한다.

**구현 계획**:

- `electron/meeting-manager.ts` 신규 매니저 (CTO Controller 의존)
- 미팅 흐름: 유저 지시 → CTO가 관련 에이전트 소집 → 라운드별 의견 수렴 → 합의 도출
- 각 에이전트의 의견은 ChatSessionManager의 stream-json으로 구조화 수신
- 합의 결과를 Mail 시스템(useMailStore)으로 자동 발송
- UI: `MeetingView.tsx` 컴포넌트 — 라운드별 의견 타임라인 표시

**CLI 환경 이점**:

- 각 에이전트가 실제 PTY에서 코드를 실행하며 의견 제시 가능 (claw-empire는 텍스트만)
- Git worktree로 각자 독립 브랜치에서 PoC 후 합의
- 실시간 PTY 파서(`pty-parser.ts`)로 진행 상황 시각화

**위험도**: High — 멀티 에이전트 동시 세션 관리 복잡도, 합의 로직 설계 필요

### 3.3 멀티 프로바이더 → Claude-only 확장 가능성

**claw-empire 방식**: 6개 CLI 프로바이더 + OAuth 토큰 자동 교체

**Artience 현재**: Claude Code CLI 전용 (PTY spawn 시 `claude` 명령어 하드코딩)

**적용 전략**: 프로바이더 추상화 레이어

현재 `main.ts`의 `autoCommand: 'claude'`와 `ChatSessionManager`의 claude CLI spawn을 추상화하여 다른 CLI 도구도 지원 가능하게 한다.

**구현 계획**:

- `electron/provider-registry.ts` 신규 모듈
- 프로바이더 인터페이스: `{ name, command, args, outputFormat, authCheck }`
- 초기 지원: Claude Code (기존), Codex CLI, Gemini CLI
- `AgentSettings`에 `provider` 필드 추가 (useTerminalStore)
- PTY spawn 시 프로바이더별 명령어/인자 분기
- PERMISSION_MODE_PRESETS를 프로바이더별로 확장

**CLI 환경 이점**:

- Artience의 PTY 아키텍처는 이미 어떤 CLI든 spawn 가능한 구조
- 프로바이더 교체가 설정 변경만으로 가능 (서버 재시작 불필요)
- 에이전트별 서로 다른 프로바이더 사용 가능

**위험도**: Medium — 각 CLI의 출력 포맷이 다르므로 PTY 파서 확장 필요

### 3.4 스킬 라이브러리 → 기존 SkillManager 비교/개선

**claw-empire 방식**: 외부 카탈로그(skills.sh) 크롤링 + Job 큐 학습 + DB 히스토리

**Artience 현재**:

- `skill-manager.ts`: 3개 기본 스킬 (code-review, run-tests, security-audit)
- `skill-map.ts`: 13개 스킬 정의, 25개 캐릭터 매핑
- `.claude/skills/` 디렉토리 기반 스킬 파일 관리

**GAP 분석**:

| 영역              | claw-empire               | Artience           |
| ----------------- | ------------------------- | ------------------ |
| 스킬 소스         | 외부 카탈로그 크롤링      | 하드코딩 3개 기본  |
| 스킬 학습         | Job 큐 + DB 히스토리      | 없음               |
| 프로바이더별 스킬 | 6개 디렉토리 분리         | 단일 (Claude 전용) |
| 동적 관리         | CRUD + 프롬프트 자동 주입 | 정적 매핑          |

**개선 계획**:

- `skill-manager.ts` 확장: 외부 스킬 마켓플레이스 연동 (GitHub 기반 스킬 레포)
- 스킬 학습 시스템: 에이전트가 태스크 수행 시 useGrowthStore의 `addSkillExp` 활용
- 동적 스킬 설치: `.claude/skills/` 에 Git clone으로 스킬 추가
- 스킬 추천: 태스크 키워드 기반 자동 스킬 활성화
- IPC 채널 추가: `skill:install`, `skill:uninstall`, `skill:search`

**CLI 환경 이점**:

- `.claude/skills/` 구조가 이미 Claude Code의 네이티브 스킬 시스템과 호환
- SKILL.md 파일로 스킬 정의 → Claude가 자동 인식
- Git으로 스킬 버전 관리 가능

**위험도**: Low — 기존 인프라 위에 확장하는 구조

### 3.5 상세 리포트 → 기존 리포트 시스템 업그레이드

**claw-empire 방식**: 태스크 완료 → 데이터 수집 → PPT(pptxgenjs) + 영상(Remotion) + Git 검증

**Artience 현재**:

- `useMailStore.ts`: MailReport (summary, toolsUsed, changedFiles, testResults, duration)
- Mail 시스템으로 에이전트 완료 보고 수신
- PPT/영상 생성 기능 없음

**개선 계획**:

- Phase 1 — Mail 리포트 강화:
    - `MailReport`에 `gitBranch`, `commitHash`, `diffStats` 필드 추가
    - 리포트 생성 시 `git diff --stat` 자동 수집
    - 리포트 상세 뷰 UI: `MailReportDetail.tsx` (코드 diff 하이라이트)

- Phase 2 — 마크다운 리포트 자동 생성:
    - `electron/report-generator.ts` 신규 매니저
    - 태스크 완료 시 구조화된 MD 리포트 자동 생성
    - 포함 내용: 작업 요약, 변경 파일 목록, 테스트 결과, 코드 스니펫
    - 프로젝트 `.reports/` 디렉토리에 날짜별 저장

- Phase 3 — 시각적 리포트 (선택):
    - Mermaid 다이어그램 자동 생성 (아키텍처 변경 시각화)
    - 차트 생성 (테스트 커버리지 추이, 코드 변경량 등)

**CLI 환경 이점**:

- Git 데이터에 직접 접근 가능 (claw-empire는 WebSocket 경유)
- PTY 세션 로그에서 실제 실행 과정 추출 가능
- Electron의 로컬 파일 시스템으로 리포트 즉시 저장/공유

**위험도**: Low (Phase 1-2), Medium (Phase 3)

---

## 4. 캐릭터 작동 원리 비교

### 4.1 에이전트 정의

| 측면 | claw-empire                                                  | Artience                     |
| ---- | ------------------------------------------------------------ | ---------------------------- |
| 인원 | 14명 기본 (6개 부서)                                         | 26명 고정                    |
| 저장 | SQLite DB (동적 CRUD)                                        | `agent-personas.ts` 하드코딩 |
| 속성 | role, personality, department, cli_provider, assignment_mode | role, personality            |
| 확장 | DB insert로 즉시 추가                                        | 코드 수정 필요               |

### 4.2 의사결정 로직

**claw-empire**:

1. 키워드/부서 감지 → 자동 에이전트 배정
2. `assignment_mode`: auto (자동 배정) / manual (유저 선택)
3. 팀장 선발 → 미팅 라운드 → 합의 도출
4. cross-dept cooperation, subtask delegation

**Artience**:

1. 유저가 캐릭터 아이콘 클릭 → PTY 세션 생성 (수동)
2. CTO(Dokba) 모드: `--agents`로 서브에이전트 위임
3. `PERMISSION_MODE_PRESETS`: 에이전트별 권한 사전 설정 (25개)
4. `skill-map.ts`: 캐릭터별 기본 에이전트 + 스킬 매핑

### 4.3 메모리 시스템

**claw-empire**:

- 대화 컨텍스트 N건
- 미팅 트랜스크립트
- 프로젝트 메모 (18KB)
- 스킬 히스토리

**Artience**:

- `useGrowthStore`: AgentGrowthProfile (레벨, EXP, 스킬, 특성)
- `AgentMemory`: 에이전트별 기억 저장 (accessCount, lastAccessedAt)
- `AgentTrait`: 경험 기반 특성 습득
- `Relationship`: 에이전트 간 친밀도/협업 횟수
- `TaskHistoryEntry`: 태스크 수행 히스토리 (최대 500건)

### 4.4 비교 평가

**claw-empire 강점**: 동적 에이전트 관리, 자동 배정, 미팅 합의
**Artience 강점**: 성장 시스템(gamification), 에이전트 간 관계 모델링, PTY 기반 실제 코드 실행

**업그레이드 방향**: Artience의 성장/관계 시스템을 유지하면서 claw-empire의 자동 배정 + 미팅 합의를 CTO Controller에 통합

---

## 5. Artience만의 차별점/강점

### 5.1 CLI 환경이 오히려 장점인 부분

1. **실시간 코드 실행 관찰**
    - PTY 세션에서 에이전트의 실제 코딩 과정을 실시간 관찰 가능
    - `pty-parser.ts`가 ANSI 스트림을 파싱하여 활동 상태 시각화
    - claw-empire는 결과만 받지만, Artience는 과정을 볼 수 있음

2. **에이전트별 독립 작업 환경**
    - `worktree-manager.ts`: Git worktree로 에이전트별 브랜치 격리
    - 동시에 여러 에이전트가 같은 프로젝트에서 충돌 없이 작업
    - claw-empire는 단일 작업 디렉토리 공유

3. **Gamification 성장 시스템**
    - useGrowthStore: EXP, 레벨, 스킬 진행도, 진화 단계
    - novice → apprentice → journeyman → expert → master → legendary
    - 에이전트 간 관계(affinity) 모델링
    - claw-empire에는 없는 Artience 고유 기능

4. **MCP 네이티브 도구 서버**
    - `mcp-artience-server.ts`: Claude Code가 직접 호출하는 도구 4개
    - 에이전트가 Artience UI를 능동적으로 제어 가능
    - claw-empire는 WebSocket 단방향 알림만 제공

5. **26개 전문화 캐릭터**
    - claw-empire의 14명 대비 거의 2배
    - 각 캐릭터별 artibot 에이전트 매핑 + 다중 스킬
    - 퍼미션 모드 프리셋으로 역할별 안전한 권한 관리

6. **세션 영속화 + 복원**
    - electron-store로 세션 ID 저장 → `--resume` 자동 적용
    - 앱 재시작 후에도 이전 대화 이어가기 가능

### 5.2 보강해야 할 부분

1. 에이전트 자동 배정 (현재 수동 선택만)
2. 에이전트 간 협의/합의 메커니즘
3. 외부 커뮤니케이션 채널 (메신저)
4. 리포트 자동 생성 및 다양한 포맷
5. 워크플로 팩 (프로젝트 유형별 자동 설정)

---

## 6. 업그레이드 로드맵

### Phase 1: 즉시 구현 가능 (Risk: Low, 기존 인프라 활용)

| Step | 기능                            | 파일                                            | 의존 |
| ---- | ------------------------------- | ----------------------------------------------- | ---- |
| 1.1  | 스킬 마켓플레이스 기초          | `electron/skill-manager.ts` 확장                | 없음 |
| 1.2  | 외부 스킬 Git clone 설치        | `electron/skill-manager.ts`                     | 1.1  |
| 1.3  | MailReport 강화 (git diff 수집) | `useMailStore.ts`, `electron/main.ts`           | 없음 |
| 1.4  | 리포트 상세 뷰 UI               | `src/components/mail/MailReportDetail.tsx` 신규 | 1.3  |
| 1.5  | 에이전트 자동 추천              | `electron/agent-recommender.ts` 신규            | 없음 |

**검증**: 스킬 설치/삭제 동작 확인, 리포트에 git diff 포함 확인, 태스크 키워드로 에이전트 추천 동작

### Phase 2: 핵심 차별화 기능 (Risk: Medium, 신규 매니저 필요)

| Step | 기능                           | 파일                                          | 의존           |
| ---- | ------------------------------ | --------------------------------------------- | -------------- |
| 2.1  | 미팅 매니저 기초 설계          | `electron/meeting-manager.ts` 신규            | CTO Controller |
| 2.2  | 에이전트 소집 + 의견 수렴 로직 | `electron/meeting-manager.ts`                 | 2.1            |
| 2.3  | 합의 결과 → Mail 자동 발송     | `electron/meeting-manager.ts` + useMailStore  | 2.2            |
| 2.4  | 미팅 UI (라운드별 타임라인)    | `src/components/meeting/MeetingView.tsx` 신규 | 2.3            |
| 2.5  | 프로바이더 추상화 레이어       | `electron/provider-registry.ts` 신규          | 없음           |
| 2.6  | Codex CLI / Gemini CLI 지원    | `electron/provider-registry.ts` + main.ts     | 2.5            |
| 2.7  | MD 리포트 자동 생성기          | `electron/report-generator.ts` 신규           | 없음           |
| 2.8  | 워크플로 팩 기초 (dev/report)  | `electron/workflow-pack.ts` 신규              | 없음           |

**검증**: CTO 미팅 모드 실행 → 에이전트 3명 소집 → 합의 도출 → Mail 도착 확인

### Phase 3: 외부 연동 + 고급 기능 (Risk: High, 외부 API 의존)

| Step | 기능                          | 파일                                 | 의존       |
| ---- | ----------------------------- | ------------------------------------ | ---------- |
| 3.1  | 메신저 브릿지 매니저          | `electron/messenger-bridge.ts` 신규  | MCP Server |
| 3.2  | Discord Bot 연동              | `electron/messenger-bridge.ts`       | 3.1        |
| 3.3  | Slack Webhook 연동            | `electron/messenger-bridge.ts`       | 3.1        |
| 3.4  | MCP 도구 2개 추가 (messenger) | `electron/mcp-artience-server.ts`    | 3.1        |
| 3.5  | Electron 트레이 알림          | `electron/main.ts`                   | 3.2        |
| 3.6  | 에이전트 동적 관리 (DB 전환)  | `electron/agent-db.ts` 신규 (SQLite) | 없음       |
| 3.7  | Mermaid/차트 리포트           | `electron/report-generator.ts` 확장  | Phase 2.7  |
| 3.8  | 워크플로 팩 확대 (4종 추가)   | `electron/workflow-pack.ts`          | Phase 2.8  |

**검증**: Discord에서 메시지 전송 → Artience 에이전트 수신 → 작업 → 결과 Discord 회신

---

## 7. 기술적 제약사항 및 대안

### 7.1 CLI 환경 제약

| 제약                  | 영향                                 | 대안                                                                   |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| 웹 서버 없음          | 메신저 Webhook 수신 불가 (서버 필요) | Electron에서 로컬 HTTP 서버 경량 구동 (express 임베드) 또는 ngrok 터널 |
| PTY 기반 통신         | 구조화된 데이터 교환 어려움          | ChatSessionManager의 stream-json 모드 활용 (이미 구현됨)               |
| 단일 머신             | 분산 처리 불가                       | Electron의 멀티 프로세스 + worker_threads 활용                         |
| Claude Code 의존      | CLI 업데이트에 영향받음              | 프로바이더 추상화로 대체 CLI 즉시 전환 가능                            |
| ConPTY 제약 (Windows) | 텍스트+CR 분리 전송 필요             | 기존 50ms 딜레이 패턴 유지 (이미 해결됨)                               |

### 7.2 아키텍처 제약

| 제약                           | 영향                                          | 대안                                            |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| 26명 하드코딩                  | 에이전트 추가/수정에 코드 변경 필요           | Phase 3.6에서 SQLite 기반 동적 관리 전환        |
| Zustand persist (localStorage) | 대용량 데이터 부적합                          | electron-store 이미 사용 중, 필요시 SQLite 전환 |
| IPC 75+채널 (21개 API 그룹)    | 채널 추가 시 preload/types/main 3곳 동시 수정 | IPC 채널 레지스트리 패턴 도입 검토              |
| MCP 서버 FileBridge            | 동기 busy-wait                                | 비동기 개선 (기존 TODO)                         |

### 7.3 리스크 매트릭스

| ID  | 리스크                                       | 영향   | 확률   | 완화 전략                                           |
| --- | -------------------------------------------- | ------ | ------ | --------------------------------------------------- |
| R1  | 멀티 PTY 동시 세션 메모리 폭발               | High   | Medium | 최대 동시 세션 수 제한 (5-8개), idle 세션 자동 정리 |
| R2  | 메신저 API 인증 토큰 관리                    | Medium | High   | electron-store 암호화 저장 + safeStorage API        |
| R3  | 프로바이더별 PTY 출력 포맷 차이              | Medium | High   | 프로바이더별 파서 어댑터 패턴                       |
| R4  | 미팅 합의 무한루프                           | High   | Low    | 최대 라운드 수 제한 (5회) + 타임아웃                |
| R5  | 에이전트 DB 전환 시 기존 데이터 마이그레이션 | Medium | Medium | 하드코딩 데이터를 시드 데이터로 자동 삽입           |

---

## 부록: 구현 우선순위 요약

```
PLANNING SUMMARY
================
Feature:     Artience 플랫폼 벤치마킹 업그레이드
Phases:      3
Total Steps: 21
Risk Level:  Medium (overall)
Estimated Complexity: Complex

Critical Path:
  Phase 1 (스킬+리포트 기초) → Phase 2 (미팅+프로바이더) → Phase 3 (메신저+DB)

Parallelizable:
  Phase 1: Step 1.1-1.2 // Step 1.3-1.4 // Step 1.5 (3개 병렬)
  Phase 2: Step 2.1-2.4 // Step 2.5-2.6 // Step 2.7 // Step 2.8 (4개 병렬)
  Phase 3: Step 3.1-3.5 // Step 3.6 // Step 3.7-3.8 (3개 병렬)

Success Criteria:
  [x] Phase 1: 외부 스킬 설치/삭제 + 리포트에 git diff 포함 (2026-03-11 완료)
  [x] Phase 2: CTO 미팅 모드 동작 + 2개 이상 프로바이더 지원 (2026-03-13 완료)
  [x] Phase 3: Discord/Slack 양방향 통신 + 에이전트 동적 CRUD (2026-03-13 완료)
  [ ] Phase 4: CEO Directive 라우팅 + 에이전트 상태 머신 + 성과 메트릭
```

---

## 8. Phase 4 로드맵 (벤치마킹 2차 분석 기반)

> 추가일: 2026-03-13
> claw-empire 심층 분석에서 발견된 16개 신규 GAP 아이템 기반

### P0: 핵심 UX 개선 (Risk: Medium)

| Step | 기능                                                                      | 파일                                                              | 의존 |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| 4.1  | CEO Directive 라우팅 (`$`/`#` prefix)                                     | `electron/main.ts` + `src/lib/directive-parser.ts` 신규           | 없음 |
| 4.2  | 에이전트 상태 머신 (idle→assigned→working→reviewing→done→error, 6개 상태) | `src/store/useTerminalStore.ts` + `src/types/agent-state.ts` 신규 | 없음 |
| 4.3  | 태스크 큐 우선순위 스케줄링                                               | `electron/task-scheduler.ts` 신규                                 | 4.2  |

### P1: 운영 효율화 (Risk: Medium)

| Step | 기능                                    | 파일                                                                  | 의존      |
| ---- | --------------------------------------- | --------------------------------------------------------------------- | --------- |
| 4.4  | 세션 히스토리 검색                      | `electron/main.ts` + `src/components/terminal/HistorySearch.tsx` 신규 | 없음      |
| 4.5  | 에이전트 성과 메트릭 (완료율/속도/품질) | `electron/agent-metrics.ts` 신규 + `src/store/useGrowthStore.ts`      | 4.2       |
| 4.6  | 팀 구성 템플릿                          | `electron/team-template.ts` 신규                                      | Phase 3.6 |

### P2: 협업 강화 (Risk: High)

| Step | 기능                            | 파일                                              | 의존      |
| ---- | ------------------------------- | ------------------------------------------------- | --------- |
| 4.7  | 에이전트 간 P2P 메시징          | `electron/agent-p2p.ts` 신규                      | Phase 2.1 |
| 4.8  | 실시간 대시보드 (상태 모니터링) | `src/components/dashboard/LiveDashboard.tsx` 신규 | 4.2       |

### P3: 자동화 고도화 (Risk: High)

| Step | 기능                             | 파일                                                  | 의존      |
| ---- | -------------------------------- | ----------------------------------------------------- | --------- |
| 4.9  | 자동 회고 리포트 (스프린트/주간) | `electron/retro-generator.ts` 신규                    | Phase 2.7 |
| 4.10 | 에이전트 학습 피드백 루프        | `src/lib/feedback-loop.ts` 신규 + `useGrowthStore.ts` | 4.5       |

**검증**: CEO Directive로 전사 지시 → 에이전트 자동 배정 → 상태 머신 전이 → 성과 메트릭 기록
