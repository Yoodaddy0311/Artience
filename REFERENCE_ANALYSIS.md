# 독바(DogBa) 레퍼런스 분석 리포트
> pixel-agents, ChatDev, Generative Agents 분석 및 독바 적용 전략

---

## 1. pixel-agents 분석

### 프로젝트 개요
- **저장소**: github.com/pablodelucca/pixel-agents (MIT, ⭐675)
- **정체**: VS Code 확장 — Claude Code 터미널마다 픽셀아트 캐릭터를 생성하여 가상 오피스에서 움직이게 함
- **기술**: TypeScript, VS Code Webview API, React 19, Canvas 2D, esbuild/Vite

### 핵심 아키텍처 패턴

**1) JSONL 트랜스크립트 감시**
- Claude Code가 생성하는 JSONL 파일을 file watcher로 감시
- 에이전트의 현재 행동(writing, reading, running) 감지
- 한계: 휴리스틱 기반이라 상태 감지가 불안정

→ **독바 적용**: WebSocket 실시간 스트림으로 대체 (Task Graph 노드 상태 기반, 훨씬 안정적)

**2) Canvas 2D 게임 루프**
```
requestAnimationFrame → update(dt) → render()
- update: 캐릭터 이동, 상태 전환, 경로 추적
- render: 타일 → 가구 → 캐릭터 → UI 순서
```
→ **독바 적용**: PixiJS ticker 사용 (동일 패턴, GPU 가속, 스프라이트 시트 지원 내장)

**3) BFS Pathfinding**
- 2D 그리드 기반 너비 우선 탐색
- 장애물(벽, 가구) 회피 + 최단 경로
→ **독바 적용**: 그대로 차용 (검증된 패턴)

**4) 캐릭터 상태 머신**
- 3상태: idle → walk → type/read
- 상태 전환 시 애니메이션 자동 변경
→ **독바 적용**: 10+상태로 확장 (planning, reviewing, asking, success, error 등)

**5) 오피스 레이아웃 에디터**
- 16×16 타일 기반
- 바닥/벽/가구 배치 도구 (select, paint, erase, place, eyedropper)
- 64×64 최대 그리드, 확장 가능
- Undo/Redo (50레벨)
- JSON export/import
→ **독바 적용**: v2에서 차용 (MVP는 고정 레이아웃 프리셋)

**6) 서브에이전트 시각화**
- Task tool 서브에이전트 → 별도 캐릭터로 스폰
- 부모 에이전트와 시각적 연결
→ **독바 적용**: Task Graph 하위 노드 → 임시 캐릭터 스폰 (독립 작업 시각화)

### 가져올 기능 & 개선점

| 가져올 것 | 개선할 것 |
|-----------|-----------|
| Canvas 게임 루프 패턴 | PixiJS로 업그레이드 (성능/기능) |
| BFS pathfinding | 동일 사용 |
| 캐릭터 상태 머신 | 상태 대폭 확장 |
| 말풍선 시스템 | 인터랙티브 버전 추가 (Asking) |
| 사운드 알림 | 상태별 다양한 효과음 |
| 레이아웃 에디터 | v2 적용, 테마 프리셋 추가 |
| JSONL 감시 | WebSocket으로 대체 |

---

## 2. ChatDev 분석

### 프로젝트 개요
- **저장소**: github.com/OpenBMB/ChatDev (Apache-2.0, ⭐27.8k)
- **정체**: LLM 기반 멀티 에이전트 가상 소프트웨어 회사
- **기술**: Python, OpenAI API, Flask(Visualizer)
- **논문**: arxiv.org/abs/2307.07924

### 핵심 아키텍처 패턴

**1) 역할 에이전트 시스템**
- CEO, CPO, CTO, Programmer, Reviewer, Tester, Art Designer
- 각 역할별 시스템 프롬프트 + 행동 규칙
- 2인 대화(Chat) 기반 작업 수행

→ **독바 적용**: 6개 동물 캐릭터에 역할 배정 (PM=뭉치, Dev=라쿠, QA=나비, Arch=토토, Release=펭, UX=여우)

**2) CompanyConfig**
- JSON/YAML로 회사 구성 커스터마이징
- Phase → ComposedPhase 체인 정의
- 에이전트별 역할/프롬프트/행동 설정

→ **독바 적용**: 프로젝트별 에이전트 팀 구성 JSON

**3) Chat Chain (소프트웨어 제작 체인)**
```
DemandAnalysis → LanguageChoose → Coding → CodeReview → 
Testing → EnvironmentDoc → Manual
```
- 각 Phase에서 2명의 에이전트가 대화로 작업 수행
- Phase 간 산출물 전달

→ **독바 적용**: Task Graph DAG로 발전 (체인보다 유연, 병렬 실행 가능)

**4) Collaborative Seminar**
- 여러 에이전트가 모여 토론하는 세미나 형태
- 코드 리뷰, 아키텍처 결정 등
→ **독바 적용**: 회의실 공간에서 에이전트 간 대화 시각화

**5) WareHouse (산출물 저장소)**
- 생성된 소프트웨어를 폴더별 저장
- 메타데이터 (프롬프트, 설정, 로그)
→ **독바 적용**: Artifact Registry (버전 관리 + diff + provenance 추가)

**6) Experience Co-Learning (최신)**
- 에이전트 간 경험 공유 및 축적
- 반복 작업에서 효율 향상
→ **독바 적용**: v2 Memory Service (Episodic Memory)

**7) MacNet — Multi-Agent Collaboration Networks (최신)**
- DAG 기반 토폴로지
- 1000+ 에이전트 확장 가능
- 다양한 조직 구조 지원
→ **독바 적용**: Task Graph가 DAG 기반이므로 자연스럽게 확장 가능

### 가져올 기능 & 개선점

| 가져올 것 | 개선할 것 |
|-----------|-----------|
| 역할 에이전트 체계 | 동물 캐릭터화 + 성격 부여 |
| Chat Chain 워크플로 | DAG 기반 Task Graph (더 유연) |
| CompanyConfig | 프로젝트별 팀 구성 UI |
| WareHouse | Artifact Registry + 버전관리 |
| Visualizer | Agent Town (훨씬 풍부한 시각화) |
| Experience Co-Learning | v2 Episodic Memory |

---

## 3. Stanford Generative Agents 분석

### 연구 개요
- **논문**: "Generative Agents: Interactive Simulacra of Human Behavior" (2023)
- **핵심**: 25개 AI 에이전트가 가상 마을에서 자율적으로 생활
- **결과**: 평가단이 AI 에이전트의 행동을 실제 인간보다 더 인간적으로 평가

### 핵심 아키텍처

**1) Memory Stream (기억 스트림)**
```
Observation → Memory Stream → Retrieval
                ↓
        Reflection (고수준 인사이트)
                ↓
        Planning (행동 계획)
```
- 모든 경험을 시간순으로 기록
- 중요도(importance) 점수 부여
- 최근성(recency) + 중요도(importance) + 관련성(relevance)로 메모리 검색

→ **독바 적용**:
  - MVP: Working Memory (현재 Run 컨텍스트만)
  - v2: Episodic Memory (과거 Run 학습) + Semantic Memory (추출된 지식)

**2) Reflection (반성)**
- 충분한 경험이 쌓이면 고수준 인사이트 자동 생성
- 예: "나는 파이썬 프로젝트에서 항상 테스트를 먼저 작성하는 것이 효과적이다"
→ **독바 적용**: v2에서 단계 완료 시 "이번에 배운 점" 자동 생성

**3) Planning (계획)**
- 일일 계획을 자율적으로 수립
- 환경 변화에 따라 계획 수정
→ **독바 적용**: Planner 에이전트가 Task Graph 생성 (구조화된 계획)

**4) Sandbox World (가상 세계)**
- 심즈(The Sims)와 유사한 가상 마을
- 에이전트가 공간을 이동하며 행동
- 위치에 따른 행동 트리거
→ **독바 적용**: Agent Town (오피스 테마, 위치별 행동 매핑)

**5) Emergent Behavior (창발적 행동)**
- 사전 프로그래밍 없이 자율적으로 파티 조직, 선거 캠페인 등
→ **독바 적용**: MVP에서는 제한 (정해진 행동만), v2에서 자율성 확대 검토

### 가져올 기능 & 적용 시기

| 기능 | MVP | v2 |
|------|-----|-----|
| Memory Stream | Working Memory만 | Episodic + Semantic |
| Importance Scoring | ❌ | ✅ |
| Reflection | ❌ | 단계 완료 시 인사이트 |
| Planning | Task Graph (구조화) | 자율 계획 + Task Graph |
| Sandbox World | 고정 맵 | 커스텀 맵 + 테마 |
| Emergent Behavior | 정해진 행동 | 제한적 자율 행동 |

---

## 4. 종합: 독바만의 차별점

### 세 프로젝트와 독바의 차이

| 측면 | pixel-agents | ChatDev | Generative Agents | **독바** |
|------|-------------|---------|-------------------|---------|
| 형태 | VS Code 확장 | CLI 도구 | 연구 프로젝트 | **데스크톱 앱** |
| 타깃 | 개발자 | 개발자 | 연구자 | **비개발자 + 개발자** |
| 시각화 | 오피스 시뮬 | 웹 로그 | 웹 데모 | **인터랙티브 Agent Town** |
| 캐릭터 | 픽셀 사람 | 아이콘 | 심즈 스타일 | **귀여운 동물 치비** |
| 산출물 | 없음(시각화만) | 코드 | 없음(행동만) | **문서+코드+ZIP** |
| 메모리 | 없음 | 제한적 | 고도화 | **단계적 도입** |
| 사용자 개입 | 관찰만 | CLI 입력 | 관찰만 | **채팅 + 클릭 상호작용** |

### 독바만의 핵심 차별점
1. **친근한 캐릭터**: CLI 공포를 해소하는 귀여운 동물 에이전트
2. **시각적 투명성**: 에이전트가 뭘 하는지 오피스에서 직관적으로 확인
3. **완결형 산출물**: 시각화로 끝나지 않고 실제 사용 가능한 ZIP Export
4. **인터랙티브**: 관찰만이 아닌, 채팅+클릭으로 에이전트에 개입 가능
5. **비개발자 친화**: 파일 첨부 + 자연어만으로 전 과정 수행
