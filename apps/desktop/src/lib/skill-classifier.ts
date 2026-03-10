/**
 * Skill Classifier: maps tool usage and file patterns to skill categories
 */

import type { SkillCategory, SkillNode } from '../types/growth';

export type { SkillCategory, SkillNode };

const FILE_SKILL_MAP: Record<string, SkillCategory> = {
    '.tsx': 'frontend',
    '.jsx': 'frontend',
    '.css': 'frontend',
    '.scss': 'frontend',
    '.html': 'frontend',
    '.vue': 'frontend',
    '.ts': 'backend',
    '.js': 'backend',
    '.py': 'backend',
    '.go': 'backend',
    '.yml': 'devops',
    '.yaml': 'devops',
    '.dockerfile': 'devops',
    '.md': 'communication',
};

const PATH_SKILL_MAP: [RegExp, SkillCategory][] = [
    [/components?\//, 'frontend'],
    [/pages?\//, 'frontend'],
    [/styles?\//, 'frontend'],
    [/hooks?\//, 'frontend'],
    [/api\//, 'backend'],
    [/server\//, 'backend'],
    [/routes?\//, 'backend'],
    [/models?\//, 'backend'],
    [/middleware\//, 'backend'],
    [/__tests__\//, 'testing'],
    [/\.test\./, 'testing'],
    [/\.spec\./, 'testing'],
    [/e2e\//, 'testing'],
    [/\.github\//, 'devops'],
    [/docker/, 'devops'],
    [/ci\//, 'devops'],
    [/deploy/, 'devops'],
    [/infra/, 'devops'],
    [/docs?\//, 'communication'],
    [/README/, 'communication'],
    [/CHANGELOG/, 'communication'],
    [/types?\//, 'architecture'],
    [/interfaces?\//, 'architecture'],
    [/schemas?\//, 'architecture'],
    [/config/, 'architecture'],
];

const TOOL_SKILL_MAP: Record<string, SkillCategory> = {
    Edit: 'backend',
    Write: 'backend',
    Read: 'backend',
    Bash: 'devops',
    Grep: 'backend',
    Glob: 'backend',
    WebFetch: 'backend',
    WebSearch: 'communication',
    TodoWrite: 'communication',
    Agent: 'architecture',
};

/**
 * Classify a tool usage event into a skill category.
 * Uses tool name, file path (from content), and context clues.
 */
export function classifySkill(
    toolName: string,
    content?: string,
): SkillCategory {
    if (content) {
        const pathMatch = content.match(/[\w\-./\\]+\.\w+/);
        if (pathMatch) {
            const filePath = pathMatch[0];

            for (const [pattern, category] of PATH_SKILL_MAP) {
                if (pattern.test(filePath)) {
                    return category;
                }
            }

            for (const [ext, category] of Object.entries(FILE_SKILL_MAP)) {
                if (filePath.endsWith(ext)) {
                    return category;
                }
            }
        }
    }

    return TOOL_SKILL_MAP[toolName] ?? 'backend';
}

/**
 * Batch classify from a list of tool events.
 * Returns the dominant skill category.
 */
export function classifyDominantSkill(
    events: Array<{ toolName: string; content?: string }>,
): SkillCategory {
    const counts: Record<SkillCategory, number> = {
        frontend: 0,
        backend: 0,
        testing: 0,
        devops: 0,
        architecture: 0,
        communication: 0,
    };

    for (const event of events) {
        const category = classifySkill(event.toolName, event.content);
        counts[category]++;
    }

    let maxCategory: SkillCategory = 'backend';
    let maxCount = 0;
    for (const [category, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            maxCategory = category as SkillCategory;
        }
    }

    return maxCategory;
}

// ── Default Skill Tree Definition ──

export const DEFAULT_SKILL_TREE: SkillNode[] = [
    // Frontend skills
    {
        id: 'fe-components',
        name: 'Component Crafting',
        category: 'frontend',
        description: 'React/Vue component creation',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { coding: 2, creativity: 1 },
    },
    {
        id: 'fe-styling',
        name: 'Style Mastery',
        category: 'frontend',
        description: 'CSS/SCSS styling expertise',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { creativity: 2 },
    },
    {
        id: 'fe-state',
        name: 'State Management',
        category: 'frontend',
        description: 'Zustand/Redux state patterns',
        maxLevel: 5,
        prerequisites: ['fe-components'],
        statBonuses: { analysis: 2, coding: 1 },
    },
    {
        id: 'fe-perf',
        name: 'Frontend Performance',
        category: 'frontend',
        description: 'Bundle optimization, lazy loading',
        maxLevel: 5,
        prerequisites: ['fe-components', 'fe-state'],
        statBonuses: { speed: 2, accuracy: 1 },
    },

    // Backend skills
    {
        id: 'be-api',
        name: 'API Design',
        category: 'backend',
        description: 'RESTful/GraphQL API design',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { coding: 2, analysis: 1 },
    },
    {
        id: 'be-db',
        name: 'Database Mastery',
        category: 'backend',
        description: 'SQL, queries, migrations',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { accuracy: 2, analysis: 1 },
    },
    {
        id: 'be-auth',
        name: 'Auth & Security',
        category: 'backend',
        description: 'Authentication flows, security',
        maxLevel: 5,
        prerequisites: ['be-api'],
        statBonuses: { accuracy: 3 },
    },
    {
        id: 'be-scale',
        name: 'Scalability',
        category: 'backend',
        description: 'Caching, queues, optimization',
        maxLevel: 5,
        prerequisites: ['be-api', 'be-db'],
        statBonuses: { speed: 2, analysis: 1 },
    },

    // Testing skills
    {
        id: 'test-unit',
        name: 'Unit Testing',
        category: 'testing',
        description: 'Vitest/Jest unit testing',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { accuracy: 2, coding: 1 },
    },
    {
        id: 'test-integration',
        name: 'Integration Testing',
        category: 'testing',
        description: 'API and service testing',
        maxLevel: 5,
        prerequisites: ['test-unit'],
        statBonuses: { accuracy: 2, analysis: 1 },
    },
    {
        id: 'test-e2e',
        name: 'E2E Testing',
        category: 'testing',
        description: 'Playwright E2E testing',
        maxLevel: 5,
        prerequisites: ['test-integration'],
        statBonuses: { accuracy: 3 },
    },
    {
        id: 'test-tdd',
        name: 'TDD Mastery',
        category: 'testing',
        description: 'Test-driven development',
        maxLevel: 5,
        prerequisites: ['test-unit', 'test-integration'],
        statBonuses: { accuracy: 2, speed: 1 },
    },

    // DevOps skills
    {
        id: 'ops-ci',
        name: 'CI/CD Pipeline',
        category: 'devops',
        description: 'GitHub Actions, automation',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { speed: 2, accuracy: 1 },
    },
    {
        id: 'ops-docker',
        name: 'Containerization',
        category: 'devops',
        description: 'Docker, compose',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { speed: 1, coding: 1 },
    },
    {
        id: 'ops-monitor',
        name: 'Monitoring',
        category: 'devops',
        description: 'Logging, alerting, observability',
        maxLevel: 5,
        prerequisites: ['ops-ci'],
        statBonuses: { analysis: 2, accuracy: 1 },
    },

    // Architecture skills
    {
        id: 'arch-patterns',
        name: 'Design Patterns',
        category: 'architecture',
        description: 'SOLID, DDD, clean architecture',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { analysis: 2, creativity: 1 },
    },
    {
        id: 'arch-system',
        name: 'System Design',
        category: 'architecture',
        description: 'Distributed systems, microservices',
        maxLevel: 5,
        prerequisites: ['arch-patterns'],
        statBonuses: { analysis: 3, creativity: 1 },
    },
    {
        id: 'arch-refactor',
        name: 'Refactoring',
        category: 'architecture',
        description: 'Code evolution, tech debt management',
        maxLevel: 5,
        prerequisites: ['arch-patterns'],
        statBonuses: { coding: 2, accuracy: 1 },
    },

    // Communication skills
    {
        id: 'comm-docs',
        name: 'Documentation',
        category: 'communication',
        description: 'Technical writing, README',
        maxLevel: 5,
        prerequisites: [],
        statBonuses: { teamwork: 2, creativity: 1 },
    },
    {
        id: 'comm-review',
        name: 'Code Review',
        category: 'communication',
        description: 'Constructive review skills',
        maxLevel: 5,
        prerequisites: ['comm-docs'],
        statBonuses: { teamwork: 2, accuracy: 1 },
    },
    {
        id: 'comm-mentor',
        name: 'Mentoring',
        category: 'communication',
        description: 'Teaching and knowledge sharing',
        maxLevel: 5,
        prerequisites: ['comm-review'],
        statBonuses: { teamwork: 3 },
    },
];
