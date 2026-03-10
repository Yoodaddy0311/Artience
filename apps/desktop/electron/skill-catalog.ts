/**
 * Skill Catalog — curated list of installable skills for the marketplace.
 *
 * Each entry represents a skill that can be cloned from a Git repository
 * into the project's .claude/skills/{id}/ directory.
 */

export interface CatalogSkill {
    id: string;
    name: string;
    description: string;
    tags: string[];
    repoUrl: string;
    /** Subdirectory within the repo to copy (if skill is nested). Defaults to root. */
    subdir?: string;
    author: string;
}

/**
 * Built-in skill catalog. In the future this could be fetched from a remote registry.
 */
export const SKILL_CATALOG: CatalogSkill[] = [
    {
        id: 'commit-message',
        name: 'Commit Message Generator',
        description:
            '변경사항을 분석하여 컨벤셔널 커밋 메시지를 자동 생성합니다.',
        tags: ['git', 'commit', 'convention', '자동화'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'commit-message',
        author: 'anthropics',
    },
    {
        id: 'pr-review',
        name: 'PR Review',
        description: 'Pull Request를 분석하여 코드 리뷰 코멘트를 생성합니다.',
        tags: ['git', 'review', 'pr', 'code-review', '리뷰'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'pr-review',
        author: 'anthropics',
    },
    {
        id: 'api-generator',
        name: 'API Endpoint Generator',
        description:
            '스키마 정의로부터 REST API 엔드포인트와 타입을 자동 생성합니다.',
        tags: ['api', 'backend', 'rest', 'codegen', '백엔드'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'api-generator',
        author: 'anthropics',
    },
    {
        id: 'test-generator',
        name: 'Test Generator',
        description:
            '소스 코드를 분석하여 단위 테스트와 통합 테스트를 자동 생성합니다.',
        tags: ['test', 'tdd', 'vitest', 'jest', '테스트'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'test-generator',
        author: 'anthropics',
    },
    {
        id: 'db-migration',
        name: 'DB Migration Helper',
        description:
            '데이터베이스 스키마 변경사항을 분석하여 마이그레이션 파일을 생성합니다.',
        tags: ['database', 'migration', 'schema', 'sql', '데이터베이스'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'db-migration',
        author: 'anthropics',
    },
    {
        id: 'docker-setup',
        name: 'Docker Setup',
        description:
            '프로젝트 구조를 분석하여 Dockerfile과 docker-compose.yml을 생성합니다.',
        tags: ['docker', 'devops', 'infra', 'container', '배포'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'docker-setup',
        author: 'anthropics',
    },
    {
        id: 'perf-audit',
        name: 'Performance Audit',
        description:
            '코드의 성능 병목 구간을 식별하고 최적화 방안을 제시합니다.',
        tags: ['performance', 'optimization', 'profiling', '성능', '최적화'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'perf-audit',
        author: 'anthropics',
    },
    {
        id: 'i18n-extract',
        name: 'i18n Extractor',
        description:
            '소스 코드에서 하드코딩된 문자열을 추출하여 다국어 파일을 생성합니다.',
        tags: ['i18n', 'localization', 'translation', '다국어', '번역'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'i18n-extract',
        author: 'anthropics',
    },
    {
        id: 'changelog',
        name: 'Changelog Generator',
        description:
            'Git 커밋 히스토리를 분석하여 CHANGELOG.md를 자동 생성합니다.',
        tags: ['git', 'changelog', 'release', 'documentation', '문서'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'changelog',
        author: 'anthropics',
    },
    {
        id: 'dependency-audit',
        name: 'Dependency Audit',
        description:
            '프로젝트 의존성의 보안 취약점, 라이선스, 업데이트 상태를 점검합니다.',
        tags: ['security', 'dependencies', 'npm', 'audit', '보안', '의존성'],
        repoUrl: 'https://github.com/anthropics/claude-code-skills',
        subdir: 'dependency-audit',
        author: 'anthropics',
    },
];

/**
 * Search the catalog by query string. Matches against name, description, and tags.
 */
export function searchCatalog(query: string): CatalogSkill[] {
    if (!query.trim()) return [...SKILL_CATALOG];

    const lower = query.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);

    return SKILL_CATALOG.filter((skill) => {
        const haystack = [
            skill.name,
            skill.description,
            ...skill.tags,
            skill.id,
        ]
            .join(' ')
            .toLowerCase();

        return terms.every((term) => haystack.includes(term));
    });
}
