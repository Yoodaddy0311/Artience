// Shared types for the DogBa Platform Run Mode
// Based on .ref/Specs/State_machine.md and .ref/Specs/Data_model.md

export type AgentState =
    | 'IDLE'
    | 'WALK'
    | 'THINKING'
    | 'RUNNING'
    | 'SUCCESS'
    | 'ERROR'
    | 'NEEDS_INPUT'
    | 'READING'
    | 'TYPING'
    | 'WRITING'
    | 'SLEEPING';
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
export interface IpcJobRun {
    type: 'job:run';
    recipeId: string;
    args?: string[];
    cwd?: string;
}
export interface IpcJobStop {
    type: 'job:stop';
    jobId: string;
}
export interface IpcJobStarted {
    type: 'job:started';
    jobId: string;
    recipeId: string;
    startedAt: number;
}
export interface IpcJobLog {
    type: 'job:log';
    jobId: string;
    stream: 'stdout' | 'stderr';
    text: string;
    ts: number;
    agentId?: string;
}
export interface IpcJobEnded {
    type: 'job:ended';
    jobId: string;
    exitCode: number;
    endedAt: number;
}

export type WsMessage =
    | { type: 'TASK_ASSIGNED'; agent: string; taskContent: string }
    | { type: 'AGENT_STATE_CHANGE'; agentId: string; state: AgentState }
    | { type: 'JOB_UPDATE'; job: Job }
    | { type: 'JOB_LOG'; log: LogEntry }
    | { type: 'CHAT_COMMAND'; text: string; target_agent: string };

// Character profile images — 5 canonical characters (ch0–ch4 from .ref/image)
const SPRITES = {
    OTTER: '/assets/characters/dokba_profile.png', // ch0 — Dokba
    CAT: '/assets/characters/cat_profile.png', // ch1 — Marketer
    HAMSTER: '/assets/characters/hamster_profile.png', // ch2 — Intern
    DOG: '/assets/characters/dog_profile.png', // ch3 — PM
    RABBIT: '/assets/characters/rabbit_profile.png', // ch4 — Designer
} as const;

// Sprite cycle for agents beyond the 4 canonical characters
const SPRITE_CYCLE = [
    SPRITES.CAT,
    SPRITES.HAMSTER,
    SPRITES.DOG,
    SPRITES.RABBIT,
];
function spriteFor(index: number): string {
    return SPRITE_CYCLE[index % SPRITE_CYCLE.length];
}

// Agent ID → AnimalType mapping (used by AgentTown to pick correct map sprite)
const ANIMAL_CYCLE = ['cat', 'hamster', 'dog', 'rabbit'];
export const AGENT_ANIMAL_MAP: Record<string, string> = {
    raccoon: 'otter', // ch0 — Dokba
    a01: 'cat', // ch1 — Cat (Sera)
    a02: 'hamster', // ch2 — Hamster (Rio)
    a03: 'dog', // ch3 — Dog (Luna)
    a04: 'rabbit', // ch4 — Rabbit (Alex)
};
// Populate a05–a26 with cycling animal types
for (let i = 5; i <= 26; i++) {
    const id = `a${String(i).padStart(2, '0')}`;
    AGENT_ANIMAL_MAP[id] = ANIMAL_CYCLE[(i - 1) % ANIMAL_CYCLE.length];
}

// All 26 agents — Dokba (raccoon/ch0) is defined separately in AgentTown.tsx & BottomDock.tsx
export const DEFAULT_AGENTS: AgentProfile[] = [
    // ── Canonical 4 (ch1-ch4, fixed sprites) ──
    {
        id: 'a01',
        name: 'Sera',
        role: 'PM / 총괄',
        sprite: SPRITES.CAT,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 5, y: 3 },
        pos: { x: 5, y: 3 },
    },
    {
        id: 'a02',
        name: 'Rio',
        role: '백엔드 개발',
        sprite: SPRITES.HAMSTER,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 8, y: 3 },
        pos: { x: 8, y: 3 },
    },
    {
        id: 'a03',
        name: 'Luna',
        role: '프론트엔드 개발',
        sprite: SPRITES.DOG,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 11, y: 3 },
        pos: { x: 11, y: 3 },
    },
    {
        id: 'a04',
        name: 'Alex',
        role: '데이터 분석',
        sprite: SPRITES.RABBIT,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 14, y: 3 },
        pos: { x: 14, y: 3 },
    },
    // ── Extended agents (a05–a26, sprites cycle) ──
    {
        id: 'a05',
        name: 'Ara',
        role: 'QA 테스트',
        sprite: spriteFor(4),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 17, y: 3 },
        pos: { x: 17, y: 3 },
    },
    {
        id: 'a06',
        name: 'Miso',
        role: 'DevOps',
        sprite: spriteFor(5),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 20, y: 3 },
        pos: { x: 20, y: 3 },
    },
    {
        id: 'a07',
        name: 'Hana',
        role: 'UX 디자인',
        sprite: spriteFor(6),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 23, y: 3 },
        pos: { x: 23, y: 3 },
    },
    {
        id: 'a08',
        name: 'Duri',
        role: '보안 감사',
        sprite: spriteFor(7),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 5, y: 6 },
        pos: { x: 5, y: 6 },
    },
    {
        id: 'a09',
        name: 'Bomi',
        role: '기술 문서화',
        sprite: spriteFor(8),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 8, y: 6 },
        pos: { x: 8, y: 6 },
    },
    {
        id: 'a10',
        name: 'Toto',
        role: 'DB 관리',
        sprite: spriteFor(9),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 11, y: 6 },
        pos: { x: 11, y: 6 },
    },
    {
        id: 'a11',
        name: 'Nari',
        role: 'API 설계',
        sprite: spriteFor(10),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 14, y: 6 },
        pos: { x: 14, y: 6 },
    },
    {
        id: 'a12',
        name: 'Ruru',
        role: '인프라 관리',
        sprite: spriteFor(11),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 17, y: 6 },
        pos: { x: 17, y: 6 },
    },
    {
        id: 'a13',
        name: 'Somi',
        role: '성능 최적화',
        sprite: spriteFor(12),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 20, y: 6 },
        pos: { x: 20, y: 6 },
    },
    {
        id: 'a14',
        name: 'Choco',
        role: 'CI/CD',
        sprite: spriteFor(13),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 23, y: 6 },
        pos: { x: 23, y: 6 },
    },
    {
        id: 'a15',
        name: 'Maru',
        role: '모니터링',
        sprite: spriteFor(14),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 5, y: 9 },
        pos: { x: 5, y: 9 },
    },
    {
        id: 'a16',
        name: 'Podo',
        role: '코드 리뷰',
        sprite: spriteFor(15),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 8, y: 9 },
        pos: { x: 8, y: 9 },
    },
    {
        id: 'a17',
        name: 'Jelly',
        role: '로그 분석',
        sprite: spriteFor(16),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 11, y: 9 },
        pos: { x: 11, y: 9 },
    },
    {
        id: 'a18',
        name: 'Namu',
        role: '아키텍처',
        sprite: spriteFor(17),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 14, y: 9 },
        pos: { x: 14, y: 9 },
    },
    {
        id: 'a19',
        name: 'Gomi',
        role: '빌드 관리',
        sprite: spriteFor(18),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 17, y: 9 },
        pos: { x: 17, y: 9 },
    },
    {
        id: 'a20',
        name: 'Ppuri',
        role: '배포 자동화',
        sprite: spriteFor(19),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 20, y: 9 },
        pos: { x: 20, y: 9 },
    },
    {
        id: 'a21',
        name: 'Dari',
        role: '이슈 트래킹',
        sprite: spriteFor(20),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 23, y: 9 },
        pos: { x: 23, y: 9 },
    },
    {
        id: 'a22',
        name: 'Kongbi',
        role: '의존성 관리',
        sprite: spriteFor(21),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 5, y: 12 },
        pos: { x: 5, y: 12 },
    },
    {
        id: 'a23',
        name: 'Baduk',
        role: '마이그레이션',
        sprite: spriteFor(22),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 8, y: 12 },
        pos: { x: 8, y: 12 },
    },
    {
        id: 'a24',
        name: 'Tangi',
        role: '캐싱 전략',
        sprite: spriteFor(23),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 11, y: 12 },
        pos: { x: 11, y: 12 },
    },
    {
        id: 'a25',
        name: 'Moong',
        role: '에러 핸들링',
        sprite: spriteFor(24),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 14, y: 12 },
        pos: { x: 14, y: 12 },
    },
    {
        id: 'a26',
        name: 'Dokba Jr.',
        role: 'AI 어시스턴트',
        sprite: spriteFor(25),
        state: 'IDLE',
        currentJobId: null,
        home: { x: 17, y: 12 },
        pos: { x: 17, y: 12 },
    },
];

// Default recipes based on .ref spec
export const DEFAULT_RECIPES: Recipe[] = [
    {
        id: 'r01',
        name: 'Node 버전 확인',
        description: 'node -v 를 실행합니다 (데모)',
        command: 'node',
        args: ['-v'],
        cwd: '',
        env: {},
        parserRules: { keywordToState: {} },
    },
    {
        id: 'r02',
        name: '디렉토리 목록',
        description: '현재 디렉토리 파일 목록을 확인합니다',
        command: 'cmd',
        args: ['/c', 'dir'],
        cwd: '',
        env: {},
        parserRules: { keywordToState: { build: 'RUNNING', test: 'RUNNING' } },
    },
    {
        id: 'r03',
        name: 'Git 상태 확인',
        description: 'git status를 실행합니다',
        command: 'git',
        args: ['status'],
        cwd: '',
        env: {},
        parserRules: {
            keywordToState: { think: 'THINKING', plan: 'THINKING' },
        },
    },
    {
        id: 'r04',
        name: 'Python 버전',
        description: 'python --version 확인',
        command: 'python',
        args: ['--version'],
        cwd: '',
        env: {},
        parserRules: { keywordToState: {} },
    },
    {
        id: 'r05',
        name: 'NPM 의존성 확인',
        description: 'npm ls --depth=0',
        command: 'npm',
        args: ['ls', '--depth=0'],
        cwd: '',
        env: {},
        parserRules: { keywordToState: { build: 'RUNNING', exec: 'RUNNING' } },
    },
];
