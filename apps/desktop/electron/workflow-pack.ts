import * as path from 'path';
import * as fs from 'fs';

export interface WorkflowPack {
    id: string;
    name: string;
    description: string;
    icon: string;
    agents: string[];
    skills: string[];
    settings: {
        maxConcurrentAgents: number;
        permissionMode: string;
        autoRecommend: boolean;
    };
    triggers: string[];
}

export interface ApplyResult {
    success: boolean;
    packId: string;
    agentsAdded: string[];
    skillsActivated: string[];
    error?: string;
}

export const DEFAULT_PACKS: WorkflowPack[] = [
    {
        id: 'dev',
        name: '개발 팩',
        description: '소프트웨어 개발에 최적화된 에이전트+스킬 구성',
        icon: '💻',
        agents: ['rio', 'luna', 'ara', 'podo', 'namu'],
        skills: ['code-review', 'run-tests', 'security-audit'],
        settings: {
            maxConcurrentAgents: 5,
            permissionMode: 'acceptEdits',
            autoRecommend: true,
        },
        triggers: [
            'package.json',
            'tsconfig.json',
            'Cargo.toml',
            'go.mod',
            'pom.xml',
            'requirements.txt',
            'Gemfile',
        ],
    },
    {
        id: 'report',
        name: '리포트 팩',
        description: '문서화와 리포트 생성에 최적화된 에이전트+스킬 구성',
        icon: '📊',
        agents: ['bomi', 'alex', 'sera', 'hana'],
        skills: ['code-review'],
        settings: {
            maxConcurrentAgents: 3,
            permissionMode: 'plan',
            autoRecommend: false,
        },
        triggers: ['.reports', 'docs', 'README.md', 'CHANGELOG.md'],
    },
    {
        id: 'novel',
        name: '소설/창작 팩',
        description: '소설, 시나리오, 창작 문서 작업에 최적화된 구성',
        icon: '📝',
        agents: ['bomi', 'hana', 'sera'],
        skills: [],
        settings: {
            maxConcurrentAgents: 3,
            permissionMode: 'plan',
            autoRecommend: false,
        },
        triggers: ['novel', 'story', 'manuscript', 'chapter'],
    },
    {
        id: 'video',
        name: '영상 제작 팩',
        description: '영상 스크립트, 편집 계획, 리뷰에 최적화된 구성',
        icon: '🎬',
        agents: ['hana', 'alex', 'sera', 'luna'],
        skills: [],
        settings: {
            maxConcurrentAgents: 4,
            permissionMode: 'plan',
            autoRecommend: false,
        },
        triggers: ['video', 'script', 'storyboard', '.mp4', '.mov'],
    },
    {
        id: 'web_research',
        name: '웹 리서치 팩',
        description: '웹 조사, 데이터 수집, 분석 리포트에 최적화된 구성',
        icon: '🔍',
        agents: ['alex', 'jelly', 'bomi', 'dari'],
        skills: [],
        settings: {
            maxConcurrentAgents: 4,
            permissionMode: 'default',
            autoRecommend: true,
        },
        triggers: ['research', 'survey', 'analysis'],
    },
    {
        id: 'roleplay',
        name: '롤플레이 팩',
        description: '에이전트 간 롤플레이, 시뮬레이션, 토론에 최적화된 구성',
        icon: '🎭',
        agents: ['sera', 'luna', 'moong', 'namu', 'rio'],
        skills: [],
        settings: {
            maxConcurrentAgents: 5,
            permissionMode: 'default',
            autoRecommend: false,
        },
        triggers: ['roleplay', 'simulation', 'debate'],
    },
];

class WorkflowPackManager {
    private packs = new Map<string, WorkflowPack>();
    private activePackId: string | null = null;

    constructor() {
        for (const pack of DEFAULT_PACKS) {
            this.packs.set(pack.id, pack);
        }
    }

    list(): WorkflowPack[] {
        return Array.from(this.packs.values());
    }

    get(id: string): WorkflowPack | undefined {
        return this.packs.get(id);
    }

    apply(id: string): ApplyResult {
        const pack = this.packs.get(id);
        if (!pack) {
            return {
                success: false,
                packId: id,
                agentsAdded: [],
                skillsActivated: [],
                error: `Pack not found: ${id}`,
            };
        }

        this.activePackId = id;

        return {
            success: true,
            packId: id,
            agentsAdded: [...pack.agents],
            skillsActivated: [...pack.skills],
        };
    }

    async detect(projectDir: string): Promise<string | null> {
        for (const pack of this.packs.values()) {
            for (const trigger of pack.triggers) {
                const fullPath = path.join(projectDir, trigger);
                if (fs.existsSync(fullPath)) {
                    return pack.id;
                }
            }
        }
        return null;
    }

    getActive(): string | null {
        return this.activePackId;
    }

    setActive(id: string | null): void {
        this.activePackId = id;
    }
}

export const workflowPackManager = new WorkflowPackManager();
