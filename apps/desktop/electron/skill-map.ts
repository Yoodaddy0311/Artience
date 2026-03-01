/**
 * Skill Map — Maps DogBa characters to artibot agent specializations.
 *
 * Each character has a default artibot agent based on their role,
 * plus a list of available skills they can perform.
 * The system prompt is augmented with skill-specific instructions
 * when a skill is selected.
 */

export interface ArtibotSkill {
    id: string;
    label: string;
    description: string;
    /** Extra system prompt instructions appended when this skill is active */
    systemPromptSuffix: string;
}

export interface CharacterSkillProfile {
    /** Default artibot agent name */
    defaultAgent: string;
    /** Skills available for this character */
    skills: ArtibotSkill[];
}

// ── Shared skill definitions ────────────────────────────────────────────────

const SKILL_CODE_REVIEW: ArtibotSkill = {
    id: 'code-review',
    label: 'Code Review',
    description: '코드 품질, 버그, 보안 취약점 검토',
    systemPromptSuffix: '지금부터 코드 리뷰어로서 행동해. 코드의 버그, 보안 취약점, 성능 문제, 코드 스타일을 검토하고 구체적인 개선안을 제시해. 파일경로:줄번호 형식으로 위치를 알려줘.',
};

const SKILL_REFACTOR: ArtibotSkill = {
    id: 'refactor',
    label: 'Refactor',
    description: '코드 리팩토링 및 구조 개선',
    systemPromptSuffix: '지금부터 리팩토링 전문가로서 행동해. 코드의 가독성, 유지보수성, 확장성을 개선하는 리팩토링을 제안해. 변경 전후를 코드로 보여줘.',
};

const SKILL_TEST: ArtibotSkill = {
    id: 'tdd',
    label: 'Test',
    description: '테스트 코드 작성 및 TDD 가이드',
    systemPromptSuffix: '지금부터 TDD 가이드로서 행동해. 테스트 케이스를 작성하고, 테스트 커버리지를 높이는 방법을 안내해. 단위 테스트, 통합 테스트, E2E 테스트를 구분해서 제안해.',
};

const SKILL_DEBUG: ArtibotSkill = {
    id: 'debug',
    label: 'Debug',
    description: '버그 분석 및 디버깅',
    systemPromptSuffix: '지금부터 디버깅 전문가로서 행동해. 에러 메시지, 로그, 스택 트레이스를 분석하고 근본 원인을 찾아 해결 방법을 제시해.',
};

const SKILL_ARCHITECTURE: ArtibotSkill = {
    id: 'architecture',
    label: 'Architecture',
    description: '시스템 아키텍처 설계 및 검토',
    systemPromptSuffix: '지금부터 아키텍트로서 행동해. 시스템 설계, 컴포넌트 구조, 데이터 흐름을 분석하고 확장성과 유지보수성 관점에서 개선안을 제시해.',
};

const SKILL_SECURITY: ArtibotSkill = {
    id: 'security',
    label: 'Security',
    description: '보안 감사 및 취약점 분석',
    systemPromptSuffix: '지금부터 보안 감사관으로서 행동해. OWASP Top 10 기준으로 보안 취약점을 점검하고, 인증/인가, 입력 검증, 암호화 등을 검토해. 심각도를 Critical/High/Medium/Low로 분류해.',
};

const SKILL_PERFORMANCE: ArtibotSkill = {
    id: 'performance',
    label: 'Performance',
    description: '성능 분석 및 최적화',
    systemPromptSuffix: '지금부터 성능 엔지니어로서 행동해. 병목 구간을 식별하고, 메모리, CPU, 네트워크 관점에서 최적화 방안을 제시해. 측정 가능한 개선 목표를 함께 제안해.',
};

const SKILL_DOCS: ArtibotSkill = {
    id: 'documentation',
    label: 'Docs',
    description: '기술 문서 작성',
    systemPromptSuffix: '지금부터 테크니컬 라이터로서 행동해. API 문서, README, 아키텍처 문서 등을 작성해. 코드 예제와 다이어그램 설명을 포함해.',
};

const SKILL_DEVOPS: ArtibotSkill = {
    id: 'devops',
    label: 'DevOps',
    description: 'CI/CD 파이프라인 및 인프라 관리',
    systemPromptSuffix: '지금부터 DevOps 엔지니어로서 행동해. CI/CD 파이프라인 설정, Docker, Kubernetes, 클라우드 배포, 모니터링 설정을 도와줘.',
};

const SKILL_DATA: ArtibotSkill = {
    id: 'data-analysis',
    label: 'Data',
    description: '데이터 분석 및 인사이트 도출',
    systemPromptSuffix: '지금부터 데이터 분석가로서 행동해. 데이터를 분석하고, 패턴을 찾아 인사이트를 도출해. 시각화 방법과 쿼리 최적화도 제안해.',
};

const SKILL_PLAN: ArtibotSkill = {
    id: 'plan',
    label: 'Plan',
    description: '작업 계획 수립 및 분해',
    systemPromptSuffix: '지금부터 플래너로서 행동해. 작업을 분석하고 단계별 실행 계획을 수립해. 우선순위, 의존관계, 예상 소요시간을 포함해.',
};

const SKILL_FRONTEND: ArtibotSkill = {
    id: 'frontend',
    label: 'Frontend',
    description: 'React/UI 컴포넌트 개발',
    systemPromptSuffix: '지금부터 프론트엔드 전문가로서 행동해. React, TypeScript, Tailwind CSS, 접근성, 반응형 디자인 관점에서 UI 컴포넌트를 설계하고 구현해.',
};

const SKILL_BACKEND: ArtibotSkill = {
    id: 'backend',
    label: 'Backend',
    description: 'API/서버 개발',
    systemPromptSuffix: '지금부터 백엔드 전문가로서 행동해. API 설계, 데이터베이스 스키마, 인증/인가, 에러 핸들링, 성능 최적화 관점에서 서버 로직을 설계하고 구현해.',
};

const SKILL_DATABASE: ArtibotSkill = {
    id: 'database',
    label: 'Database',
    description: 'DB 스키마 설계 및 쿼리 최적화',
    systemPromptSuffix: '지금부터 DBA로서 행동해. 데이터베이스 스키마 설계, 인덱스 최적화, 쿼리 튜닝, 마이그레이션 전략을 제안해.',
};

// ── Character → Skill mapping ───────────────────────────────────────────────

/**
 * Maps agent name (lowercase) to their artibot skill profile.
 * Characters share common skills but have role-specific defaults.
 */
export const CHARACTER_SKILLS: Record<string, CharacterSkillProfile> = {
    sera:   { defaultAgent: 'orchestrator',        skills: [SKILL_PLAN, SKILL_ARCHITECTURE, SKILL_CODE_REVIEW] },
    rio:    { defaultAgent: 'backend-developer',   skills: [SKILL_BACKEND, SKILL_DATABASE, SKILL_CODE_REVIEW, SKILL_DEBUG] },
    luna:   { defaultAgent: 'frontend-developer',  skills: [SKILL_FRONTEND, SKILL_CODE_REVIEW, SKILL_REFACTOR, SKILL_TEST] },
    alex:   { defaultAgent: 'data-analyst',        skills: [SKILL_DATA, SKILL_DATABASE, SKILL_PERFORMANCE] },
    ara:    { defaultAgent: 'tdd-guide',           skills: [SKILL_TEST, SKILL_DEBUG, SKILL_CODE_REVIEW] },
    miso:   { defaultAgent: 'devops-engineer',     skills: [SKILL_DEVOPS, SKILL_PERFORMANCE, SKILL_SECURITY] },
    hana:   { defaultAgent: 'frontend-developer',  skills: [SKILL_FRONTEND, SKILL_DOCS, SKILL_REFACTOR] },
    duri:   { defaultAgent: 'security-reviewer',   skills: [SKILL_SECURITY, SKILL_CODE_REVIEW, SKILL_DEBUG] },
    bomi:   { defaultAgent: 'doc-updater',         skills: [SKILL_DOCS, SKILL_PLAN, SKILL_CODE_REVIEW] },
    toto:   { defaultAgent: 'database-reviewer',   skills: [SKILL_DATABASE, SKILL_PERFORMANCE, SKILL_BACKEND] },
    nari:   { defaultAgent: 'backend-developer',   skills: [SKILL_BACKEND, SKILL_ARCHITECTURE, SKILL_DOCS] },
    ruru:   { defaultAgent: 'devops-engineer',     skills: [SKILL_DEVOPS, SKILL_SECURITY, SKILL_PERFORMANCE] },
    somi:   { defaultAgent: 'performance-engineer', skills: [SKILL_PERFORMANCE, SKILL_REFACTOR, SKILL_DEBUG] },
    choco:  { defaultAgent: 'devops-engineer',     skills: [SKILL_DEVOPS, SKILL_TEST, SKILL_DEBUG] },
    maru:   { defaultAgent: 'devops-engineer',     skills: [SKILL_DEVOPS, SKILL_PERFORMANCE, SKILL_DATA] },
    podo:   { defaultAgent: 'code-reviewer',       skills: [SKILL_CODE_REVIEW, SKILL_REFACTOR, SKILL_TEST] },
    jelly:  { defaultAgent: 'data-analyst',        skills: [SKILL_DATA, SKILL_DEBUG, SKILL_PERFORMANCE] },
    namu:   { defaultAgent: 'architect',           skills: [SKILL_ARCHITECTURE, SKILL_PLAN, SKILL_CODE_REVIEW] },
    gomi:   { defaultAgent: 'build-error-resolver', skills: [SKILL_DEVOPS, SKILL_DEBUG, SKILL_TEST] },
    ppuri:  { defaultAgent: 'devops-engineer',     skills: [SKILL_DEVOPS, SKILL_PLAN, SKILL_SECURITY] },
    dari:   { defaultAgent: 'planner',             skills: [SKILL_PLAN, SKILL_DOCS, SKILL_DATA] },
    kongbi: { defaultAgent: 'build-error-resolver', skills: [SKILL_DEVOPS, SKILL_SECURITY, SKILL_DEBUG] },
    baduk:  { defaultAgent: 'database-reviewer',   skills: [SKILL_DATABASE, SKILL_BACKEND, SKILL_PLAN] },
    tangi:  { defaultAgent: 'performance-engineer', skills: [SKILL_PERFORMANCE, SKILL_BACKEND, SKILL_DATABASE] },
    moong:  { defaultAgent: 'build-error-resolver', skills: [SKILL_DEBUG, SKILL_CODE_REVIEW, SKILL_TEST] },
};

/**
 * Get the skill profile for an agent. Returns undefined if not mapped.
 */
export function getSkillProfile(agentName: string): CharacterSkillProfile | undefined {
    return CHARACTER_SKILLS[agentName.toLowerCase()];
}

/**
 * Get a specific skill by its id.
 */
export function getSkillById(agentName: string, skillId: string): ArtibotSkill | undefined {
    const profile = getSkillProfile(agentName);
    if (!profile) return undefined;
    return profile.skills.find((s) => s.id === skillId);
}

/**
 * Build the enhanced system prompt with skill context.
 */
export function buildSkillSystemPrompt(basePrompt: string, skill?: ArtibotSkill): string {
    if (!skill) return basePrompt;
    return `${basePrompt}\n\n[Active Skill: ${skill.label}]\n${skill.systemPromptSuffix}`;
}
