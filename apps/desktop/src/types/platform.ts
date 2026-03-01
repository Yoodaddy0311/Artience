// Shared types for the DogBa Platform Run Mode
// Based on .ref/Specs/State_machine.md and .ref/Specs/Data_model.md

export type AgentState = 'IDLE' | 'WALK' | 'THINKING' | 'RUNNING' | 'SUCCESS' | 'ERROR' | 'NEEDS_INPUT';
export type JobState = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'ERROR' | 'CANCELED';

export interface AgentProfile {
    id: string;
    name: string;
    role: string;
    sprite: string; // path to sprite image
    state: AgentState;
    currentJobId: string | null;
    home: { x: number; y: number };
    pos: { x: number; y: number };
}

export interface Recipe {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    parserRules: {
        keywordToState: Record<string, AgentState>;
    };
}

export interface Job {
    id: string;
    recipeId: string;
    recipeName: string;
    assignedAgentId: string;
    state: JobState;
    startedAt: number | null;
    endedAt: number | null;
    exitCode: number | null;
    logs: LogEntry[];
}

export interface LogEntry {
    ts: number;
    stream: 'stdout' | 'stderr';
    text: string;
    jobId: string;
    agentId?: string;
}

// IPC Event types based on .ref/Specs/IPC_event_contract.md
export interface IpcJobRun { type: 'job:run'; recipeId: string; args?: string[]; cwd?: string; }
export interface IpcJobStop { type: 'job:stop'; jobId: string; }
export interface IpcJobStarted { type: 'job:started'; jobId: string; recipeId: string; startedAt: number; }
export interface IpcJobLog { type: 'job:log'; jobId: string; stream: 'stdout' | 'stderr'; text: string; ts: number; agentId?: string; }
export interface IpcJobEnded { type: 'job:ended'; jobId: string; exitCode: number; endedAt: number; }

export type WsMessage =
    | { type: 'TASK_ASSIGNED'; agent: string; taskContent: string }
    | { type: 'AGENT_STATE_CHANGE'; agentId: string; state: AgentState }
    | { type: 'JOB_UPDATE'; job: Job }
    | { type: 'JOB_LOG'; log: LogEntry }
    | { type: 'CHAT_COMMAND'; text: string; target_agent: string };

// Available character sprites (13 unique, excluding raccoon_spritesheet.png)
// Paths are absolute — use assetPath() when rendering in <img> or PIXI to support file:// protocol
const SPRITES = {
    S01: '/assets/characters/media__1771899019764.png',
    S02: '/assets/characters/media__1771899416589.png',
    S03: '/assets/characters/media__1771899539293.png',
    S04: '/assets/characters/media__1771900148918.png',
    S05: '/assets/characters/media__1771900148957.png',
    S06: '/assets/characters/media__1771900149052.png',
    S07: '/assets/characters/media__1771900149065.png',
    S08: '/assets/characters/media__1771900177640.png',
    S09: '/assets/characters/media__1771900352853.png',
    S10: '/assets/characters/media__1771900361390.png',
    S11: '/assets/characters/media__1771900366767.png',
    S12: '/assets/characters/media__1771900374992.png',
    S13: '/assets/characters/media__1771900428230.png',
} as const;

// Default agents based on .ref spec
// CTO (player character) + 25 agents
// 13 sprites distributed across agents: first 13 unique, then cycle with offset
export const DEFAULT_AGENTS: AgentProfile[] = [
    { id: 'cto', name: 'You', role: 'CTO', sprite: SPRITES.S13, state: 'IDLE', currentJobId: null, home: { x: 20, y: 14 }, pos: { x: 20, y: 14 } },
    { id: 'a01', name: 'Sera', role: 'PM / 총괄', sprite: SPRITES.S01, state: 'IDLE', currentJobId: null, home: { x: 5, y: 3 }, pos: { x: 5, y: 3 } },
    { id: 'a02', name: 'Rio', role: '백엔드 개발', sprite: SPRITES.S02, state: 'IDLE', currentJobId: null, home: { x: 8, y: 3 }, pos: { x: 8, y: 3 } },
    { id: 'a03', name: 'Luna', role: '프론트엔드 개발', sprite: SPRITES.S03, state: 'IDLE', currentJobId: null, home: { x: 11, y: 3 }, pos: { x: 11, y: 3 } },
    { id: 'a04', name: 'Alex', role: '데이터 분석', sprite: SPRITES.S04, state: 'IDLE', currentJobId: null, home: { x: 14, y: 3 }, pos: { x: 14, y: 3 } },
    { id: 'a05', name: 'Ara', role: 'QA 테스트', sprite: SPRITES.S05, state: 'IDLE', currentJobId: null, home: { x: 17, y: 3 }, pos: { x: 17, y: 3 } },
    { id: 'a06', name: 'Miso', role: 'DevOps', sprite: SPRITES.S06, state: 'IDLE', currentJobId: null, home: { x: 5, y: 7 }, pos: { x: 5, y: 7 } },
    { id: 'a07', name: 'Hana', role: 'UX 디자인', sprite: SPRITES.S07, state: 'IDLE', currentJobId: null, home: { x: 8, y: 7 }, pos: { x: 8, y: 7 } },
    { id: 'a08', name: 'Duri', role: '보안 감사', sprite: SPRITES.S08, state: 'IDLE', currentJobId: null, home: { x: 11, y: 7 }, pos: { x: 11, y: 7 } },
    { id: 'a09', name: 'Bomi', role: '기술 문서화', sprite: SPRITES.S09, state: 'IDLE', currentJobId: null, home: { x: 14, y: 7 }, pos: { x: 14, y: 7 } },
    { id: 'a10', name: 'Toto', role: 'DB 관리', sprite: SPRITES.S10, state: 'IDLE', currentJobId: null, home: { x: 17, y: 7 }, pos: { x: 17, y: 7 } },
    { id: 'a11', name: 'Nari', role: 'API 설계', sprite: SPRITES.S11, state: 'IDLE', currentJobId: null, home: { x: 5, y: 11 }, pos: { x: 5, y: 11 } },
    { id: 'a12', name: 'Ruru', role: '인프라 관리', sprite: SPRITES.S12, state: 'IDLE', currentJobId: null, home: { x: 8, y: 11 }, pos: { x: 8, y: 11 } },
    { id: 'a13', name: 'Somi', role: '성능 최적화', sprite: SPRITES.S13, state: 'IDLE', currentJobId: null, home: { x: 11, y: 11 }, pos: { x: 11, y: 11 } },
    { id: 'a14', name: 'Choco', role: 'CI/CD', sprite: SPRITES.S01, state: 'IDLE', currentJobId: null, home: { x: 14, y: 11 }, pos: { x: 14, y: 11 } },
    { id: 'a15', name: 'Maru', role: '모니터링', sprite: SPRITES.S02, state: 'IDLE', currentJobId: null, home: { x: 17, y: 11 }, pos: { x: 17, y: 11 } },
    { id: 'a16', name: 'Podo', role: '코드 리뷰', sprite: SPRITES.S03, state: 'IDLE', currentJobId: null, home: { x: 5, y: 15 }, pos: { x: 5, y: 15 } },
    { id: 'a17', name: 'Jelly', role: '로그 분석', sprite: SPRITES.S04, state: 'IDLE', currentJobId: null, home: { x: 8, y: 15 }, pos: { x: 8, y: 15 } },
    { id: 'a18', name: 'Namu', role: '아키텍처', sprite: SPRITES.S05, state: 'IDLE', currentJobId: null, home: { x: 11, y: 15 }, pos: { x: 11, y: 15 } },
    { id: 'a19', name: 'Gomi', role: '빌드 관리', sprite: SPRITES.S06, state: 'IDLE', currentJobId: null, home: { x: 14, y: 15 }, pos: { x: 14, y: 15 } },
    { id: 'a20', name: 'Ppuri', role: '배포 자동화', sprite: SPRITES.S07, state: 'IDLE', currentJobId: null, home: { x: 17, y: 15 }, pos: { x: 17, y: 15 } },
    { id: 'a21', name: 'Dari', role: '이슈 트래킹', sprite: SPRITES.S08, state: 'IDLE', currentJobId: null, home: { x: 20, y: 3 }, pos: { x: 20, y: 3 } },
    { id: 'a22', name: 'Kongbi', role: '의존성 관리', sprite: SPRITES.S09, state: 'IDLE', currentJobId: null, home: { x: 20, y: 7 }, pos: { x: 20, y: 7 } },
    { id: 'a23', name: 'Baduk', role: '마이그레이션', sprite: SPRITES.S10, state: 'IDLE', currentJobId: null, home: { x: 20, y: 11 }, pos: { x: 20, y: 11 } },
    { id: 'a24', name: 'Tangi', role: '캐싱 전략', sprite: SPRITES.S11, state: 'IDLE', currentJobId: null, home: { x: 20, y: 15 }, pos: { x: 20, y: 15 } },
    { id: 'a25', name: 'Moong', role: '에러 핸들링', sprite: SPRITES.S12, state: 'IDLE', currentJobId: null, home: { x: 23, y: 9 }, pos: { x: 23, y: 9 } },
];

// Default recipes based on .ref spec
export const DEFAULT_RECIPES: Recipe[] = [
    { id: 'r01', name: 'Node 버전 확인', description: 'node -v 를 실행합니다 (데모)', command: 'node', args: ['-v'], cwd: '', env: {}, parserRules: { keywordToState: {} } },
    { id: 'r02', name: '디렉토리 목록', description: '현재 디렉토리 파일 목록을 확인합니다', command: 'cmd', args: ['/c', 'dir'], cwd: '', env: {}, parserRules: { keywordToState: { build: 'RUNNING', test: 'RUNNING' } } },
    { id: 'r03', name: 'Git 상태 확인', description: 'git status를 실행합니다', command: 'git', args: ['status'], cwd: '', env: {}, parserRules: { keywordToState: { think: 'THINKING', plan: 'THINKING' } } },
    { id: 'r04', name: 'Python 버전', description: 'python --version 확인', command: 'python', args: ['--version'], cwd: '', env: {}, parserRules: { keywordToState: {} } },
    { id: 'r05', name: 'NPM 의존성 확인', description: 'npm ls --depth=0', command: 'npm', args: ['ls', '--depth=0'], cwd: '', env: {}, parserRules: { keywordToState: { build: 'RUNNING', exec: 'RUNNING' } } },
];
