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

// Agent ID → AnimalType mapping (used by AgentTown to pick correct map sprite)
export const AGENT_ANIMAL_MAP: Record<string, string> = {
    raccoon: 'otter', // ch0 — Dokba
    a01: 'cat', // ch1 — Cat Marketer (Sera)
    a02: 'hamster', // ch2 — Hamster Intern (Rio)
    a03: 'dog', // ch3 — Dog PM (Luna)
    a04: 'rabbit', // ch4 — Rabbit Designer (Alex)
};

// Default agents — 4 team members matching ch1-ch4
// Dokba (raccoon/ch0) is defined separately in AgentTown.tsx & BottomDock.tsx
export const DEFAULT_AGENTS: AgentProfile[] = [
    {
        id: 'a01',
        name: 'Sera',
        role: '콘텐츠 마케터',
        sprite: SPRITES.CAT,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 5, y: 3 },
        pos: { x: 5, y: 3 },
    },
    {
        id: 'a02',
        name: 'Rio',
        role: '인턴',
        sprite: SPRITES.HAMSTER,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 8, y: 3 },
        pos: { x: 8, y: 3 },
    },
    {
        id: 'a03',
        name: 'Luna',
        role: 'PM',
        sprite: SPRITES.DOG,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 11, y: 3 },
        pos: { x: 11, y: 3 },
    },
    {
        id: 'a04',
        name: 'Alex',
        role: '디자이너',
        sprite: SPRITES.RABBIT,
        state: 'IDLE',
        currentJobId: null,
        home: { x: 14, y: 3 },
        pos: { x: 14, y: 3 },
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
