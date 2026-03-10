/**
 * Agent Recommender — recommends agents based on task description keywords.
 *
 * Uses AGENT_PERSONAS roles and CHARACTER_SKILLS mappings to score
 * agents against a task description via keyword matching.
 */

import { AGENT_PERSONAS } from '../src/data/agent-personas';
import { CHARACTER_SKILLS } from './skill-map';

export interface AgentRecommendation {
    agentId: string;
    score: number;
    reason: string;
}

// ── Keyword → domain mapping with weights ───────────────────────────────────

interface DomainKeywords {
    domain: string;
    keywords: string[];
    weight: number;
}

const DOMAIN_KEYWORDS: DomainKeywords[] = [
    {
        domain: 'frontend',
        keywords: [
            'frontend',
            'front-end',
            'react',
            'ui',
            'ux',
            'component',
            'css',
            'tailwind',
            'design',
            'layout',
            'responsive',
            'accessibility',
            '프론트엔드',
            '프론트',
            '컴포넌트',
            '디자인',
            '화면',
            '레이아웃',
            'jsx',
            'tsx',
        ],
        weight: 2,
    },
    {
        domain: 'backend',
        keywords: [
            'backend',
            'back-end',
            'api',
            'server',
            'rest',
            'endpoint',
            'route',
            'middleware',
            'controller',
            'handler',
            'ipc',
            'electron',
            '백엔드',
            '서버',
            '라우트',
            '미들웨어',
            '핸들러',
        ],
        weight: 2,
    },
    {
        domain: 'database',
        keywords: [
            'database',
            'db',
            'sql',
            'query',
            'schema',
            'migration',
            'index',
            'table',
            'orm',
            'prisma',
            'supabase',
            '데이터베이스',
            '디비',
            '쿼리',
            '스키마',
            '마이그레이션',
            '인덱스',
        ],
        weight: 2,
    },
    {
        domain: 'test',
        keywords: [
            'test',
            'tdd',
            'unit',
            'integration',
            'e2e',
            'coverage',
            'jest',
            'vitest',
            'spec',
            'assert',
            'mock',
            'qa',
            '테스트',
            '단위테스트',
            '통합테스트',
            '커버리지',
            '품질',
        ],
        weight: 2,
    },
    {
        domain: 'security',
        keywords: [
            'security',
            'auth',
            'authentication',
            'authorization',
            'owasp',
            'vulnerability',
            'xss',
            'csrf',
            'injection',
            'encrypt',
            'rbac',
            '보안',
            '인증',
            '인가',
            '취약점',
            '암호화',
            '감사',
        ],
        weight: 2,
    },
    {
        domain: 'devops',
        keywords: [
            'devops',
            'ci',
            'cd',
            'pipeline',
            'docker',
            'kubernetes',
            'deploy',
            'build',
            'infra',
            'monitoring',
            'log',
            'cloud',
            '배포',
            '인프라',
            '파이프라인',
            '빌드',
            '모니터링',
            '자동화',
        ],
        weight: 2,
    },
    {
        domain: 'performance',
        keywords: [
            'performance',
            'optimize',
            'optimization',
            'cache',
            'latency',
            'memory',
            'cpu',
            'bottleneck',
            'profiling',
            'benchmark',
            '성능',
            '최적화',
            '캐싱',
            '병목',
            '프로파일링',
            '벤치마크',
        ],
        weight: 2,
    },
    {
        domain: 'architecture',
        keywords: [
            'architecture',
            'design pattern',
            'structure',
            'refactor',
            'module',
            'scalability',
            'maintainability',
            'solid',
            'clean',
            '아키텍처',
            '설계',
            '구조',
            '리팩토링',
            '확장성',
            '유지보수',
        ],
        weight: 2,
    },
    {
        domain: 'documentation',
        keywords: [
            'document',
            'docs',
            'readme',
            'api doc',
            'comment',
            'jsdoc',
            'specification',
            'wiki',
            '문서',
            '문서화',
            '명세',
            '가이드',
            '설명',
        ],
        weight: 1.5,
    },
    {
        domain: 'data',
        keywords: [
            'data',
            'analysis',
            'analytics',
            'insight',
            'metric',
            'chart',
            'visualization',
            'report',
            'statistics',
            '데이터',
            '분석',
            '인사이트',
            '지표',
            '시각화',
            '통계',
            '리포트',
        ],
        weight: 1.5,
    },
    {
        domain: 'planning',
        keywords: [
            'plan',
            'planning',
            'roadmap',
            'strategy',
            'priority',
            'milestone',
            'task',
            'breakdown',
            'estimate',
            '계획',
            '기획',
            '전략',
            '로드맵',
            '우선순위',
            '일정',
        ],
        weight: 1.5,
    },
    {
        domain: 'code-review',
        keywords: [
            'review',
            'code review',
            'pr',
            'pull request',
            'quality',
            'lint',
            'style',
            'convention',
            'best practice',
            '리뷰',
            '코드리뷰',
            '코드 리뷰',
            '품질',
            '컨벤션',
        ],
        weight: 1.5,
    },
    {
        domain: 'debug',
        keywords: [
            'bug',
            'debug',
            'error',
            'fix',
            'crash',
            'issue',
            'trace',
            'stacktrace',
            'exception',
            'broken',
            '버그',
            '디버그',
            '에러',
            '오류',
            '수정',
            '장애',
            '크래시',
        ],
        weight: 1.5,
    },
];

// ── Skill ID → domain mapping ───────────────────────────────────────────────

const SKILL_TO_DOMAIN: Record<string, string> = {
    frontend: 'frontend',
    backend: 'backend',
    database: 'database',
    tdd: 'test',
    security: 'security',
    devops: 'devops',
    performance: 'performance',
    architecture: 'architecture',
    documentation: 'documentation',
    'data-analysis': 'data',
    plan: 'planning',
    'code-review': 'code-review',
    debug: 'debug',
    refactor: 'architecture',
};

// ── Core recommendation function ────────────────────────────────────────────

function extractDomainScores(text: string): Map<string, number> {
    const lower = text.toLowerCase();
    const scores = new Map<string, number>();

    for (const { domain, keywords, weight } of DOMAIN_KEYWORDS) {
        let matchCount = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) matchCount++;
        }
        if (matchCount > 0) {
            scores.set(domain, matchCount * weight);
        }
    }
    return scores;
}

function scoreAgent(
    agentId: string,
    domainScores: Map<string, number>,
): { score: number; matchedDomains: string[] } {
    const skills = CHARACTER_SKILLS[agentId];
    if (!skills) return { score: 0, matchedDomains: [] };

    let score = 0;
    const matchedDomains: string[] = [];

    for (const skill of skills.skills) {
        const domain = SKILL_TO_DOMAIN[skill.id];
        if (domain && domainScores.has(domain)) {
            score += domainScores.get(domain)!;
            matchedDomains.push(skill.label);
        }
    }
    return { score, matchedDomains };
}

function buildReason(agentId: string, matchedDomains: string[]): string {
    const persona = AGENT_PERSONAS[agentId];
    const role = persona?.role ?? agentId;
    const skills = matchedDomains.join(', ');
    return `${role} — 관련 스킬: ${skills}`;
}

export function recommendAgents(
    taskDescription: string,
    maxResults = 5,
): AgentRecommendation[] {
    const domainScores = extractDomainScores(taskDescription);
    if (domainScores.size === 0) return [];

    const results: AgentRecommendation[] = [];
    const agentIds = Object.keys(CHARACTER_SKILLS);

    for (const agentId of agentIds) {
        const { score, matchedDomains } = scoreAgent(agentId, domainScores);
        if (score > 0) {
            results.push({
                agentId,
                score,
                reason: buildReason(agentId, matchedDomains),
            });
        }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.min(maxResults, results.length));
}
