import Store from 'electron-store';
import { AGENT_PERSONAS } from '../src/data/agent-personas';

export interface TeamTemplateMember {
    role: string;
    agentId: string;
    required: boolean;
}

export interface TeamTemplate {
    id: string;
    name: string;
    description: string;
    agents: TeamTemplateMember[];
    suggestedFor: string[];
}

interface TeamTemplateSchema {
    customTemplates: Record<string, TeamTemplate>;
}

export const DEFAULT_TEMPLATES: TeamTemplate[] = [
    {
        id: 'fullstack-dev',
        name: '풀스택 개발',
        description: '프론트엔드+백엔드 개발에 최적화된 팀 구성',
        agents: [
            { role: '프론트엔드 개발', agentId: 'luna', required: true },
            { role: '백엔드 개발', agentId: 'rio', required: true },
            { role: 'TDD/테스트', agentId: 'ara', required: true },
            { role: '코드 리뷰', agentId: 'podo', required: false },
        ],
        suggestedFor: [
            'fullstack',
            'webapp',
            'web app',
            'full-stack',
            'react',
            'next',
            'frontend',
            'backend',
            'api',
        ],
    },
    {
        id: 'security-audit',
        name: '보안 감사',
        description: '보안 취약점 점검과 코드 감사에 특화된 팀',
        agents: [
            { role: '보안 감사', agentId: 'duri', required: true },
            { role: '코드 리뷰', agentId: 'podo', required: true },
            { role: '백엔드 검증', agentId: 'rio', required: false },
        ],
        suggestedFor: [
            'security',
            'audit',
            'vulnerability',
            'penetration',
            'owasp',
            'compliance',
            '보안',
            '감사',
            '취약점',
        ],
    },
    {
        id: 'content-team',
        name: '콘텐츠 팀',
        description: '마케팅 콘텐츠 제작과 분석에 최적화된 팀',
        agents: [
            { role: '기술 문서화', agentId: 'bomi', required: true },
            { role: '데이터 분석', agentId: 'alex', required: true },
            { role: 'UX 디자인', agentId: 'hana', required: false },
            { role: '이슈 트래킹', agentId: 'dari', required: false },
        ],
        suggestedFor: [
            'content',
            'marketing',
            'blog',
            'documentation',
            'seo',
            'article',
            '콘텐츠',
            '마케팅',
            '문서',
        ],
    },
    {
        id: 'architecture-review',
        name: '아키텍처 리뷰',
        description: '시스템 설계와 성능 검토에 특화된 팀',
        agents: [
            { role: '아키텍처', agentId: 'namu', required: true },
            { role: '성능 최적화', agentId: 'somi', required: true },
            { role: 'DB 관리', agentId: 'toto', required: false },
        ],
        suggestedFor: [
            'architecture',
            'design',
            'system',
            'scalability',
            'performance',
            'database',
            '아키텍처',
            '설계',
            '성능',
        ],
    },
    {
        id: 'rapid-prototype',
        name: '빠른 프로토타입',
        description: 'MVP/프로토타입 빠른 구현에 최적화된 팀',
        agents: [
            { role: 'PM/총괄', agentId: 'sera', required: true },
            { role: '프론트엔드 개발', agentId: 'luna', required: true },
            { role: '백엔드 개발', agentId: 'rio', required: true },
        ],
        suggestedFor: [
            'prototype',
            'mvp',
            'rapid',
            'poc',
            'demo',
            'hackathon',
            '프로토타입',
            '빠른',
            'quick',
        ],
    },
];

let counter = 0;

function generateId(): string {
    counter++;
    return `custom-${Date.now()}-${counter}`;
}

class TeamTemplateManager {
    private templates = new Map<string, TeamTemplate>();
    private store: Store<TeamTemplateSchema> | null = null;

    constructor() {
        for (const tpl of DEFAULT_TEMPLATES) {
            this.templates.set(tpl.id, tpl);
        }
    }

    init(): void {
        if (this.store) return;
        this.store = new Store<TeamTemplateSchema>({
            name: 'artience-team-templates',
            defaults: { customTemplates: {} },
        });
        const custom = this.store.get('customTemplates', {});
        for (const [id, tpl] of Object.entries(custom)) {
            this.templates.set(id, tpl);
        }
    }

    getTemplate(id: string): TeamTemplate | undefined {
        return this.templates.get(id);
    }

    listTemplates(): TeamTemplate[] {
        return Array.from(this.templates.values());
    }

    suggestTemplate(projectDescription: string): TeamTemplate | null {
        const lower = projectDescription.toLowerCase();
        let bestMatch: TeamTemplate | null = null;
        let bestScore = 0;

        for (const tpl of this.templates.values()) {
            let score = 0;
            for (const keyword of tpl.suggestedFor) {
                if (lower.includes(keyword.toLowerCase())) {
                    score++;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = tpl;
            }
        }

        return bestMatch;
    }

    createCustomTemplate(template: Omit<TeamTemplate, 'id'>): string {
        const id = generateId();
        const full: TeamTemplate = { ...template, id };
        this.templates.set(id, full);
        this.persistCustom();
        return id;
    }

    validateTemplate(template: TeamTemplate): {
        valid: boolean;
        missing: string[];
    } {
        const missing: string[] = [];
        for (const member of template.agents) {
            if (!(member.agentId in AGENT_PERSONAS)) {
                missing.push(member.agentId);
            }
        }
        return { valid: missing.length === 0, missing };
    }

    private persistCustom(): void {
        if (!this.store) return;
        const custom: Record<string, TeamTemplate> = {};
        for (const [id, tpl] of this.templates.entries()) {
            if (!DEFAULT_TEMPLATES.some((d) => d.id === id)) {
                custom[id] = tpl;
            }
        }
        this.store.set('customTemplates', custom);
    }
}

export const teamTemplateManager = new TeamTemplateManager();
