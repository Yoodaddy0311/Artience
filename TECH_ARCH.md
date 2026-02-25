# 독바(DogBa) 기술 아키텍처 v3
> Claude Code 개발용 상세 설계

---

## 1. 시스템 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│                    Electron Shell (Main Process)          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  IPC Bridge                                         │  │
│  │  - File System Access                               │  │
│  │  - Native Dialogs                                   │  │
│  │  - Window Management                                │  │
│  │  - Local API Process Management                     │  │
│  └────────────────────────────────────────────────────┘  │
│                         │                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │           Renderer Process (React)                  │  │
│  │  ┌──────────┬──────────────┬──────────────────┐    │  │
│  │  │ Sidebar  │  Main View   │  Side Panel      │    │  │
│  │  │ (Nav)    │              │  (Chat/Log/Docs) │    │  │
│  │  │          │  ┌─────────┐ │                   │    │  │
│  │  │  🏠 Home │  │ Agent   │ │  💬 Chat         │    │  │
│  │  │  📁 Proj │  │ Town    │ │  📋 Timeline     │    │  │
│  │  │  ⚙️ Set  │  │ (PixiJS)│ │  📄 Artifacts    │    │  │
│  │  │          │  └─────────┘ │                   │    │  │
│  │  └──────────┴──────────────┴──────────────────┘    │  │
│  └────────────────────────────────────────────────────┘  │
│                         │ HTTP/WS                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Local API (FastAPI)                     │  │
│  │  ┌──────────┬───────────┬────────────┬──────────┐  │  │
│  │  │  Parser  │Orchestrat.│ LLM Router │ Exporter │  │  │
│  │  │  Engine  │(TaskGraph)│            │          │  │  │
│  │  └──────────┴───────────┴────────────┴──────────┘  │  │
│  │                    │                                │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │            SQLite + File Storage              │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 모노레포 구조

```
dogba/
├── apps/
│   ├── desktop/                    # Electron + React
│   │   ├── electron/
│   │   │   ├── main.ts             # Electron main process
│   │   │   ├── preload.ts          # IPC bridge
│   │   │   └── ipc-handlers.ts     # File system, dialogs
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   ├── routes/
│   │   │   │   ├── home/
│   │   │   │   │   ├── HomePage.tsx
│   │   │   │   │   └── ProjectCard.tsx
│   │   │   │   ├── project/
│   │   │   │   │   ├── ProjectLayout.tsx
│   │   │   │   │   ├── OverviewPage.tsx
│   │   │   │   │   ├── UploadsPage.tsx
│   │   │   │   │   ├── ArtifactsPage.tsx
│   │   │   │   │   ├── TaskGraphPage.tsx
│   │   │   │   │   ├── AgentTownPage.tsx
│   │   │   │   │   └── ExportPage.tsx
│   │   │   │   └── settings/
│   │   │   │       └── SettingsPage.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/              # 기본 UI 컴포넌트
│   │   │   │   │   ├── Button.tsx
│   │   │   │   │   ├── Card.tsx
│   │   │   │   │   ├── Input.tsx
│   │   │   │   │   ├── Badge.tsx
│   │   │   │   │   ├── Modal.tsx
│   │   │   │   │   ├── Toast.tsx
│   │   │   │   │   ├── ProgressBar.tsx
│   │   │   │   │   └── Tabs.tsx
│   │   │   │   ├── layout/          # 레이아웃 컴포넌트
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── SidePanel.tsx
│   │   │   │   │   └── MainLayout.tsx
│   │   │   │   ├── chat/            # 채팅 관련
│   │   │   │   │   ├── ChatPanel.tsx
│   │   │   │   │   ├── ChatMessage.tsx
│   │   │   │   │   └── ChatInput.tsx
│   │   │   │   ├── agent-town/      # Agent Town 시뮬
│   │   │   │   │   ├── AgentTown.tsx       # 메인 컨테이너
│   │   │   │   │   ├── PixiCanvas.tsx      # PixiJS 래퍼
│   │   │   │   │   ├── TileMap.ts          # 타일맵 렌더러
│   │   │   │   │   ├── Character.ts        # 캐릭터 클래스
│   │   │   │   │   ├── SpeechBubble.ts     # 말풍선
│   │   │   │   │   ├── Pathfinder.ts       # BFS pathfinding
│   │   │   │   │   ├── StateMachine.ts     # 에이전트 상태 머신
│   │   │   │   │   ├── OfficeMap.ts        # 맵 데이터/레이아웃
│   │   │   │   │   └── assets/
│   │   │   │   │       ├── tilesets/       # 타일셋 PNG
│   │   │   │   │       ├── characters/     # 캐릭터 스프라이트 시트
│   │   │   │   │       └── sounds/         # 효과음
│   │   │   │   ├── documents/       # 문서 뷰어
│   │   │   │   │   ├── MarkdownViewer.tsx
│   │   │   │   │   ├── DiffViewer.tsx
│   │   │   │   │   └── VersionHistory.tsx
│   │   │   │   └── timeline/        # 타임라인/로그
│   │   │   │       ├── Timeline.tsx
│   │   │   │       ├── LogEntry.tsx
│   │   │   │       └── ArtifactCard.tsx
│   │   │   ├── stores/              # Zustand 스토어
│   │   │   │   ├── projectStore.ts
│   │   │   │   ├── simStore.ts      # 시뮬레이션 상태
│   │   │   │   ├── chatStore.ts
│   │   │   │   ├── artifactStore.ts
│   │   │   │   └── settingsStore.ts
│   │   │   ├── hooks/               # 커스텀 훅
│   │   │   │   ├── useProject.ts
│   │   │   │   ├── useSimulation.ts
│   │   │   │   ├── useWebSocket.ts
│   │   │   │   └── useApi.ts
│   │   │   ├── lib/                 # 유틸리티
│   │   │   │   ├── api-client.ts    # API 클라이언트
│   │   │   │   ├── ws-client.ts     # WebSocket 클라이언트
│   │   │   │   └── constants.ts
│   │   │   └── styles/
│   │   │       ├── globals.css
│   │   │       └── design-tokens.css
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── electron-builder.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── api/                         # FastAPI 백엔드
│       ├── app/
│       │   ├── __init__.py
│       │   ├── main.py              # FastAPI 앱 진입점
│       │   ├── config.py            # 설정 관리
│       │   ├── database.py          # SQLite 연결/세션
│       │   ├── models/              # SQLAlchemy 모델
│       │   │   ├── __init__.py
│       │   │   ├── project.py
│       │   │   ├── upload.py
│       │   │   ├── task_graph.py
│       │   │   ├── artifact.py
│       │   │   ├── run.py
│       │   │   ├── chat.py
│       │   │   └── memory.py
│       │   ├── schemas/             # Pydantic 스키마
│       │   │   ├── __init__.py
│       │   │   ├── project.py
│       │   │   ├── upload.py
│       │   │   ├── task_graph.py
│       │   │   ├── artifact.py
│       │   │   ├── run.py
│       │   │   └── sim.py
│       │   ├── routers/             # API 라우터
│       │   │   ├── __init__.py
│       │   │   ├── projects.py
│       │   │   ├── uploads.py
│       │   │   ├── task_graphs.py
│       │   │   ├── runs.py
│       │   │   ├── artifacts.py
│       │   │   ├── chat.py
│       │   │   ├── sim.py
│       │   │   ├── exports.py
│       │   │   └── settings.py
│       │   ├── services/            # 비즈니스 로직
│       │   │   ├── __init__.py
│       │   │   ├── parser_service.py    # 파일 파싱
│       │   │   ├── orchestrator.py      # Task Graph 실행
│       │   │   ├── agent_runner.py      # 에이전트 실행기
│       │   │   ├── llm_router.py        # LLM 라우팅
│       │   │   ├── export_service.py    # ZIP 생성
│       │   │   ├── sim_service.py       # 시뮬 상태 관리
│       │   │   └── memory_service.py    # 메모리 관리
│       │   ├── agents/              # Role 에이전트 정의
│       │   │   ├── __init__.py
│       │   │   ├── base_agent.py        # 기본 에이전트 인터페이스
│       │   │   ├── pm_agent.py          # PM (뭉치)
│       │   │   ├── architect_agent.py   # Architect (토토)
│       │   │   ├── ux_agent.py          # UX (여우)
│       │   │   ├── dev_agent.py         # Developer (라쿠)
│       │   │   ├── qa_agent.py          # QA (나비)
│       │   │   └── release_agent.py     # Release (펭)
│       │   ├── prompts/             # 에이전트 프롬프트 템플릿
│       │   │   ├── system/
│       │   │   │   ├── pm.md
│       │   │   │   ├── architect.md
│       │   │   │   ├── ux.md
│       │   │   │   ├── dev.md
│       │   │   │   ├── qa.md
│       │   │   │   └── release.md
│       │   │   └── templates/
│       │   │       ├── prd_template.md
│       │   │       ├── ux_template.md
│       │   │       ├── arch_template.md
│       │   │       ├── wbs_template.md
│       │   │       └── qa_template.md
│       │   ├── parsers/             # 파일 파서
│       │   │   ├── __init__.py
│       │   │   ├── pdf_parser.py
│       │   │   ├── docx_parser.py
│       │   │   ├── xlsx_parser.py
│       │   │   ├── image_parser.py
│       │   │   └── zip_parser.py
│       │   └── ws/                  # WebSocket 핸들러
│       │       ├── __init__.py
│       │       └── sim_ws.py
│       ├── tests/
│       │   ├── test_projects.py
│       │   ├── test_parser.py
│       │   ├── test_orchestrator.py
│       │   └── test_export.py
│       ├── alembic/                 # DB 마이그레이션
│       │   └── versions/
│       ├── alembic.ini
│       ├── requirements.txt
│       └── pyproject.toml
│
├── packages/
│   ├── shared-types/               # 공유 타입 정의 (TS)
│   │   ├── src/
│   │   │   ├── project.ts
│   │   │   ├── agent.ts
│   │   │   ├── task-graph.ts
│   │   │   ├── artifact.ts
│   │   │   ├── sim.ts
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── design-tokens/              # 디자인 토큰 (CSS/JS)
│       ├── tokens.css
│       ├── tokens.ts
│       └── package.json
│
├── assets/                         # 공유 에셋
│   ├── characters/
│   │   ├── hamster/                # 뭉치
│   │   │   ├── sheet.png
│   │   │   ├── sheet.json
│   │   │   └── meta.json
│   │   ├── raccoon/                # 라쿠
│   │   ├── cat/                    # 나비
│   │   ├── rabbit/                 # 토토
│   │   ├── penguin/                # 펭
│   │   └── fox/                    # 여우
│   ├── tilesets/
│   │   ├── office_floor.png
│   │   ├── office_walls.png
│   │   ├── furniture.png
│   │   └── decorations.png
│   ├── sounds/
│   │   ├── pop.wav
│   │   ├── complete.wav
│   │   ├── error.wav
│   │   ├── question.wav
│   │   └── export.wav
│   └── illustrations/
│       ├── empty_state.png
│       ├── loading.png
│       └── onboarding/
│
├── docs/                           # 프로젝트 문서
│   ├── PRD_MASTER.md
│   ├── DESIGN_GUIDE.md
│   ├── TECH_ARCH.md
│   ├── API_SPEC.md
│   ├── DATA_SCHEMA.md
│   └── SPRITE_SPEC.md
│
├── scripts/                        # 빌드/유틸 스크립트
│   ├── dev.sh                      # 개발 서버 시작
│   ├── build.sh                    # 프로덕션 빌드
│   ├── package_zip.sh              # ZIP Export
│   └── seed_db.py                  # 샘플 데이터 시딩
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── build.yml
│
├── pnpm-workspace.yaml
├── package.json                    # 루트 (pnpm workspace)
├── tsconfig.base.json
├── .gitignore
├── .env.example
└── README.md
```

---

## 3. 모듈별 상세 설계

### 3.1 Electron Main Process

```typescript
// apps/desktop/electron/main.ts
import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';

let mainWindow: BrowserWindow;
let apiProcess: ChildProcess;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    titleBarStyle: 'hiddenInset', // macOS 깔끔한 타이틀바
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 개발 모드면 Vite dev server, 프로덕션이면 빌드 결과
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function startApiServer() {
  const apiPath = path.join(__dirname, '../../api');
  apiProcess = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--port', '8742'], {
    cwd: apiPath,
    env: { ...process.env, DOGBA_DB_PATH: getDbPath() },
  });
  apiProcess.stdout?.on('data', (data) => console.log(`[API] ${data}`));
  apiProcess.stderr?.on('data', (data) => console.error(`[API] ${data}`));
}

app.whenReady().then(() => {
  startApiServer();
  createWindow();
});

app.on('before-quit', () => {
  apiProcess?.kill();
});
```

### 3.2 Agent Town — PixiJS 렌더러

```typescript
// apps/desktop/src/components/agent-town/AgentTown.tsx
// 핵심 구조 (구현 가이드)

interface AgentTownConfig {
  tileSize: number;        // 16
  renderScale: number;     // 3 (48px per tile on screen)
  mapWidth: number;        // 20 tiles
  mapHeight: number;       // 15 tiles
  fps: number;             // 30
}

// Character 클래스
class Character {
  id: string;
  role: AgentRole;
  spriteSheet: SpriteSheet;
  position: { x: number; y: number }; // 타일 좌표
  pixelPosition: { x: number; y: number }; // 실제 렌더 좌표
  state: AgentState;
  currentAnimation: string;
  path: Point[];  // BFS 결과 경로
  pathIndex: number;
  moveSpeed: number; // pixels per frame
  bubbleText: string | null;
  
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  moveTo(target: Point): void;   // BFS path 계산 후 이동 시작
  setState(state: AgentState): void;
  showBubble(text: string): void;
  hideBubble(): void;
}

// StateMachine
class AgentStateMachine {
  currentState: AgentState;
  character: Character;
  
  transition(newState: AgentState, data: TransitionData): void {
    // 상태 전환 시:
    // 1. 이전 상태 exit 처리
    // 2. 새 상태 enter 처리
    // 3. 애니메이션 변경
    // 4. 위치 변경 (필요시 BFS pathfinding)
    // 5. 말풍선 업데이트
  }
}

// Pathfinder (BFS)
class Pathfinder {
  grid: number[][];  // 0=walkable, 1=blocked
  
  findPath(start: Point, end: Point): Point[] {
    // BFS 구현
    // 장애물 회피
    // 최단 경로 반환
  }
}

// TileMap
class TileMap {
  layers: TileLayer[];  // floor, walls, furniture, decorations
  
  render(ctx: CanvasRenderingContext2D, camera: Camera): void;
  getTile(layer: number, x: number, y: number): Tile;
  isWalkable(x: number, y: number): boolean;
}
```

### 3.3 Task Graph 오케스트레이터

```python
# apps/api/app/services/orchestrator.py

from enum import Enum
from typing import Dict, List, Optional
import asyncio

class NodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    ASKING = "asking"
    SKIPPED = "skipped"

class TaskNode:
    id: str
    name: str
    role: str
    status: NodeStatus
    dependencies: List[str]
    inputs: Dict
    outputs: Dict
    retry_policy: Dict  # { max_retries: 3, delay_ms: 1000 }
    sim_action: Dict    # Agent Town 연동 정보

class TaskGraph:
    nodes: Dict[str, TaskNode]
    edges: List[tuple]  # (from_id, to_id)
    
    def get_ready_nodes(self) -> List[TaskNode]:
        """의존성이 모두 완료된 실행 가능 노드 반환"""
        ready = []
        for node in self.nodes.values():
            if node.status != NodeStatus.PENDING:
                continue
            deps_met = all(
                self.nodes[dep].status == NodeStatus.SUCCESS
                for dep in node.dependencies
            )
            if deps_met:
                ready.append(node)
        return ready

class Orchestrator:
    def __init__(self, project_id: str, task_graph: TaskGraph):
        self.project_id = project_id
        self.graph = task_graph
        self.agents = self._init_agents()
        self.sim_broadcaster = SimBroadcaster()
    
    async def run(self):
        """메인 실행 루프"""
        while True:
            ready_nodes = self.graph.get_ready_nodes()
            if not ready_nodes:
                if self._all_complete():
                    break
                if self._has_asking():
                    await self._wait_for_user_input()
                    continue
                if self._has_failed():
                    break
                await asyncio.sleep(0.5)
                continue
            
            # 병렬 실행 가능한 노드 동시 시작
            tasks = [self._execute_node(node) for node in ready_nodes]
            await asyncio.gather(*tasks)
    
    async def _execute_node(self, node: TaskNode):
        """단일 노드 실행"""
        node.status = NodeStatus.RUNNING
        
        # Agent Town에 상태 변경 브로드캐스트
        await self.sim_broadcaster.broadcast({
            "agent_id": node.sim_action["agentId"],
            "state": "running",
            "target_location": node.sim_action["targetLocation"],
            "bubble_text": node.sim_action["bubbleText"],
        })
        
        agent = self.agents[node.role]
        
        for attempt in range(node.retry_policy.get("max_retries", 3)):
            try:
                result = await agent.execute(
                    task_name=node.name,
                    inputs=node.inputs,
                    context=self._build_context(node),
                )
                node.outputs = result
                node.status = NodeStatus.SUCCESS
                
                # 산출물 저장
                if result.get("artifact"):
                    await self._save_artifact(node, result["artifact"])
                
                # Agent Town 성공 상태
                await self.sim_broadcaster.broadcast({
                    "agent_id": node.sim_action["agentId"],
                    "state": "success",
                    "bubble_text": "완료! ✨",
                })
                return
                
            except NeedUserInputError as e:
                node.status = NodeStatus.ASKING
                await self.sim_broadcaster.broadcast({
                    "agent_id": node.sim_action["agentId"],
                    "state": "asking",
                    "bubble_text": str(e),
                })
                return
                
            except Exception as e:
                if attempt < node.retry_policy.get("max_retries", 3) - 1:
                    await asyncio.sleep(
                        node.retry_policy.get("delay_ms", 1000) / 1000
                    )
                    continue
                node.status = NodeStatus.FAILED
                await self.sim_broadcaster.broadcast({
                    "agent_id": node.sim_action["agentId"],
                    "state": "error",
                    "bubble_text": f"오류: {str(e)[:50]}…",
                })
```

### 3.4 LLM Router

```python
# apps/api/app/services/llm_router.py

from abc import ABC, abstractmethod
from typing import Dict, List, Optional

class LLMProvider(ABC):
    @abstractmethod
    async def complete(
        self,
        messages: List[Dict],
        model: str,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> Dict:
        pass

class ClaudeProvider(LLMProvider):
    async def complete(self, messages, model="claude-sonnet-4-5-20250929", **kwargs):
        # Anthropic API 호출
        pass

class OpenAIProvider(LLMProvider):
    async def complete(self, messages, model="gpt-4o", **kwargs):
        # OpenAI API 호출
        pass

class GeminiProvider(LLMProvider):
    async def complete(self, messages, model="gemini-2.0-flash", **kwargs):
        # Google AI API 호출
        pass

class LLMRouter:
    """요청 성격에 따라 적절한 제공자/모델로 라우팅"""
    
    def __init__(self, settings: Dict):
        self.providers = {
            "claude": ClaudeProvider(settings.get("claude_api_key")),
            "openai": OpenAIProvider(settings.get("openai_api_key")),
            "gemini": GeminiProvider(settings.get("gemini_api_key")),
        }
        self.default_provider = settings.get("default_provider", "claude")
    
    async def route(
        self,
        messages: List[Dict],
        task_type: str,      # "planning" | "drafting" | "coding" | "reviewing"
        quality: str = "balanced",  # "fast" | "balanced" | "best"
    ) -> Dict:
        provider_name, model = self._select_model(task_type, quality)
        provider = self.providers[provider_name]
        
        result = await provider.complete(messages, model=model)
        
        # 비용/토큰 로깅
        await self._log_usage(provider_name, model, result)
        
        return result
    
    def _select_model(self, task_type: str, quality: str) -> tuple:
        # 라우팅 규칙
        routing_table = {
            ("planning", "best"):    (self.default_provider, "claude-sonnet-4-5-20250929"),
            ("planning", "balanced"): (self.default_provider, "claude-sonnet-4-5-20250929"),
            ("drafting", "best"):    (self.default_provider, "claude-sonnet-4-5-20250929"),
            ("coding", "best"):      (self.default_provider, "claude-sonnet-4-5-20250929"),
            ("reviewing", "fast"):   (self.default_provider, "claude-haiku-4-5-20251001"),
        }
        return routing_table.get(
            (task_type, quality),
            (self.default_provider, "claude-sonnet-4-5-20250929")
        )
```

### 3.5 Base Agent

```python
# apps/api/app/agents/base_agent.py

from abc import ABC, abstractmethod
from typing import Dict, List, Optional

class BaseAgent(ABC):
    """모든 Role Agent의 기본 클래스"""
    
    def __init__(
        self,
        role: str,
        character_id: str,
        llm_router: LLMRouter,
        memory_service: MemoryService,
    ):
        self.role = role
        self.character_id = character_id
        self.llm = llm_router
        self.memory = memory_service
        self.system_prompt = self._load_system_prompt()
        self.template = self._load_template()
    
    @abstractmethod
    def _load_system_prompt(self) -> str:
        """역할별 시스템 프롬프트 로드"""
        pass
    
    @abstractmethod
    def _load_template(self) -> str:
        """출력 템플릿 로드"""
        pass
    
    async def execute(
        self,
        task_name: str,
        inputs: Dict,
        context: Dict,
    ) -> Dict:
        """에이전트 실행"""
        
        # 1. 메모리에서 관련 정보 조회
        memories = await self.memory.recall(
            project_id=context["project_id"],
            query=task_name,
            kinds=["working", "semantic"],
        )
        
        # 2. 프롬프트 구성
        messages = self._build_messages(
            task_name=task_name,
            inputs=inputs,
            context=context,
            memories=memories,
        )
        
        # 3. LLM 호출
        result = await self.llm.route(
            messages=messages,
            task_type=self._get_task_type(task_name),
        )
        
        # 4. 출력 검증
        validated = self._validate_output(result)
        
        # 5. 메모리에 결과 저장
        await self.memory.store(
            project_id=context["project_id"],
            kind="working",
            text=f"[{self.role}] {task_name} completed: {validated.get('summary', '')}",
        )
        
        return validated
    
    def _build_messages(self, **kwargs) -> List[Dict]:
        """시스템 프롬프트 + 컨텍스트 + 사용자 입력 조합"""
        system_content = self.system_prompt.format(
            role=self.role,
            template=self.template,
            **kwargs.get("context", {}),
        )
        
        user_content = self._format_user_message(**kwargs)
        
        return [
            {"role": "system", "content": system_content},
            {"role": "user", "content": user_content},
        ]
```

### 3.6 WebSocket 시뮬레이션 브로드캐스터

```python
# apps/api/app/ws/sim_ws.py

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json

class SimBroadcaster:
    """프로젝트별 WebSocket 연결 관리 및 시뮬 상태 브로드캐스트"""
    
    def __init__(self):
        self.connections: Dict[str, Set[WebSocket]] = {}  # project_id -> websockets
        self.sim_state: Dict[str, Dict] = {}  # project_id -> current state
    
    async def connect(self, project_id: str, websocket: WebSocket):
        await websocket.accept()
        if project_id not in self.connections:
            self.connections[project_id] = set()
        self.connections[project_id].add(websocket)
        
        # 현재 상태 즉시 전송
        if project_id in self.sim_state:
            await websocket.send_json(self.sim_state[project_id])
    
    async def disconnect(self, project_id: str, websocket: WebSocket):
        self.connections.get(project_id, set()).discard(websocket)
    
    async def broadcast(self, project_id: str, event: Dict):
        """시뮬 상태 변경을 모든 연결에 브로드캐스트"""
        
        # 상태 업데이트
        if project_id not in self.sim_state:
            self.sim_state[project_id] = {"agents": {}}
        
        agent_id = event.get("agent_id")
        if agent_id:
            self.sim_state[project_id]["agents"][agent_id] = event
        
        # 모든 연결에 전송
        dead_connections = set()
        for ws in self.connections.get(project_id, set()):
            try:
                await ws.send_json({
                    "type": "sim_update",
                    "data": event,
                    "timestamp": datetime.utcnow().isoformat(),
                })
            except Exception:
                dead_connections.add(ws)
        
        # 끊긴 연결 정리
        for ws in dead_connections:
            self.connections.get(project_id, set()).discard(ws)
```

---

## 4. 스프라이트 시트 규격 (상세)

### 4.1 프레임 크기 & 레이아웃

```
Frame Size: 64×64 pixels (캐릭터 원본은 치비 스타일에 맞게)
Sheet Layout: 10 rows × 4 columns
Total Sheet Size: 256×640 pixels

Row 0: idle_down    [F0] [F1] [  ] [  ]     ← 2프레임, 느린 루프
Row 1: walk_down    [F0] [F1] [F2] [F3]     ← 4프레임
Row 2: walk_left    [F0] [F1] [F2] [F3]     ← 4프레임
Row 3: walk_right   [F0] [F1] [F2] [F3]     ← 4프레임 (또는 left 반전)
Row 4: walk_up      [F0] [F1] [F2] [F3]     ← 4프레임
Row 5: type_down    [F0] [F1] [F2] [F3]     ← 4프레임, 빠른 루프
Row 6: read_down    [F0] [F1] [F2] [  ]     ← 3프레임
Row 7: think_down   [F0] [F1] [F2] [  ]     ← 3프레임
Row 8: success_down [F0] [F1] [F2] [F3]     ← 4프레임 (점프+스파클)
Row 9: error_down   [F0] [F1] [F2] [  ]     ← 3프레임 (흔들림)
```

### 4.2 sheet.json 포맷

```json
{
  "meta": {
    "image": "hamster_sheet.png",
    "size": { "w": 256, "h": 640 },
    "frameSize": { "w": 64, "h": 64 },
    "scale": "1"
  },
  "frames": {
    "idle_down_0": { "frame": { "x": 0, "y": 0, "w": 64, "h": 64 } },
    "idle_down_1": { "frame": { "x": 64, "y": 0, "w": 64, "h": 64 } },
    "walk_down_0": { "frame": { "x": 0, "y": 64, "w": 64, "h": 64 } },
    "walk_down_1": { "frame": { "x": 64, "y": 64, "w": 64, "h": 64 } },
    "walk_down_2": { "frame": { "x": 128, "y": 64, "w": 64, "h": 64 } },
    "walk_down_3": { "frame": { "x": 192, "y": 64, "w": 64, "h": 64 } }
  },
  "animations": {
    "idle_down":    { "frames": ["idle_down_0", "idle_down_1"], "speed": 0.5 },
    "walk_down":    { "frames": ["walk_down_0", "walk_down_1", "walk_down_2", "walk_down_3"], "speed": 8 },
    "walk_left":    { "frames": ["walk_left_0", "walk_left_1", "walk_left_2", "walk_left_3"], "speed": 8 },
    "walk_right":   { "frames": ["walk_right_0", "walk_right_1", "walk_right_2", "walk_right_3"], "speed": 8 },
    "walk_up":      { "frames": ["walk_up_0", "walk_up_1", "walk_up_2", "walk_up_3"], "speed": 8 },
    "type_down":    { "frames": ["type_down_0", "type_down_1", "type_down_2", "type_down_3"], "speed": 10 },
    "read_down":    { "frames": ["read_down_0", "read_down_1", "read_down_2"], "speed": 2 },
    "think_down":   { "frames": ["think_down_0", "think_down_1", "think_down_2"], "speed": 1.5 },
    "success_down": { "frames": ["success_down_0", "success_down_1", "success_down_2", "success_down_3"], "speed": 6 },
    "error_down":   { "frames": ["error_down_0", "error_down_1", "error_down_2"], "speed": 8 }
  }
}
```

---

## 5. WebSocket 프로토콜

### 5.1 이벤트 타입

```typescript
// Client → Server
type ClientMessage = {
  type: 'subscribe' | 'user_answer' | 'pause' | 'resume' | 'skip';
  data: Record<string, any>;
}

// Server → Client
type ServerMessage = {
  type: 'sim_update' | 'agent_state' | 'artifact_created' | 'run_complete' | 'error' | 'asking';
  data: Record<string, any>;
  timestamp: string;
}

// sim_update 이벤트 상세
interface SimUpdateEvent {
  type: 'sim_update';
  data: {
    agent_id: string;
    state: AgentState;
    position?: { x: number; y: number };
    target_position?: { x: number; y: number };
    animation?: string;
    bubble_text?: string | null;
    current_task_id?: string;
    progress?: number;  // 0~100
  };
}
```

---

## 6. 보안 설계

### 6.1 파일 전송 모드
```
[원문 모드] → 파일 전체를 LLM에 전송 (기본, 빠름)
[요약 모드] → 로컬에서 요약 후 요약본만 전송 (비용 절감)
[마스킹 모드] → 개인정보/키 마스킹 후 전송 (보안 강화)
```

### 6.2 API 키 관리
- Electron `safeStorage`로 암호화 저장
- 환경 변수 fallback
- 메모리에서만 복호화하여 사용

### 6.3 코드 실행 격리
- Docker 컨테이너 내 실행 (선택)
- 네트워크 차단 옵션
- 파일 시스템 접근 제한 (프로젝트 디렉토리만)

---

## 7. 개발 환경 설정

### 7.1 필수 요구사항
```
Node.js >= 20.x
Python >= 3.12
pnpm >= 9.x
SQLite >= 3.40
Docker (선택, 코드 실행용)
```

### 7.2 시작 명령어
```bash
# 1. 의존성 설치
pnpm install
cd apps/api && pip install -r requirements.txt

# 2. 환경 변수 설정
cp .env.example .env
# .env 파일에 API 키 입력

# 3. DB 초기화
cd apps/api && alembic upgrade head && python scripts/seed_db.py

# 4. 개발 서버 시작
pnpm dev  # Electron + Vite + FastAPI 동시 시작
```
