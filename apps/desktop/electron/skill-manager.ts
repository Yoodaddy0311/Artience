/**
 * Skill Manager — .claude/skills/ 디렉토리 스캔 + 기본 스킬셋 배포.
 *
 * Claude Code의 스킬 시스템은 .claude/skills/ 디렉토리에
 * 각 스킬별 서브디렉토리 + SKILL.md 파일로 구성된다.
 *
 * 이 매니저는:
 * 1. 프로젝트의 .claude/skills/ 스캔하여 설치된 스킬 목록 반환
 * 2. 기본 스킬셋(code-review, run-tests, security-audit)을 배포
 * 3. skill-map.ts의 CHARACTER_SKILLS와 연동
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CHARACTER_SKILLS } from './skill-map';
import { searchCatalog, type CatalogSkill } from './skill-catalog';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkillInfo {
    id: string;
    name: string;
    description: string;
    path: string;
    agent?: string; // primary agent this skill is for
}

// ── Default Skills ─────────────────────────────────────────────────────────

interface DefaultSkillDef {
    id: string;
    name: string;
    description: string;
    agent: string;
    content: string; // SKILL.md content
}

const DEFAULT_SKILLS: DefaultSkillDef[] = [
    {
        id: 'code-review',
        name: 'Code Review',
        description:
            'Podo 에이전트용 코드 리뷰 스킬. 코드 품질, 버그, 보안 취약점을 검토합니다.',
        agent: 'podo',
        content: `# Code Review Skill

## Description
코드 리뷰를 수행합니다. 코드의 품질, 버그, 보안 취약점을 검토하고 구체적인 개선안을 제시합니다.

## Instructions
1. 변경된 파일을 확인하세요 (git diff 또는 지정된 파일)
2. 각 파일에 대해 다음을 검토하세요:
   - 버그 및 논리 오류
   - 보안 취약점 (OWASP Top 10)
   - 성능 이슈
   - 코드 스타일 및 가독성
   - 타입 안전성
3. 발견 사항을 \`파일경로:줄번호\` 형식으로 보고하세요
4. 심각도를 Critical/High/Medium/Low로 분류하세요
5. 각 이슈에 대한 수정 제안을 포함하세요

## Output Format
\`\`\`
## 리뷰 결과

### Critical
- \`src/foo.ts:42\` — SQL 인젝션 위험: 사용자 입력을 직접 쿼리에 삽입

### High
- \`src/bar.ts:15\` — 에러 핸들링 누락: async 함수에서 try/catch 없음

### Medium
- \`src/baz.ts:88\` — 불필요한 리렌더링: useMemo/useCallback 고려

### Low
- \`src/utils.ts:3\` — 미사용 import 제거 필요
\`\`\`
`,
    },
    {
        id: 'run-tests',
        name: 'Run Tests',
        description:
            'Ara 에이전트용 테스트 실행 스킬. 테스트를 실행하고 결과를 분석합니다.',
        agent: 'ara',
        content: `# Run Tests Skill

## Description
프로젝트의 테스트를 실행하고 결과를 분석합니다. 실패한 테스트의 원인을 파악하고 수정을 제안합니다.

## Instructions
1. 프로젝트의 테스트 프레임워크를 감지하세요 (vitest, jest, pytest 등)
2. 테스트를 실행하세요:
   - Vitest: \`npx vitest run\`
   - Jest: \`npx jest\`
   - pytest: \`python -m pytest\`
3. 실패한 테스트가 있으면:
   - 실패 원인을 분석하세요
   - 관련 소스 코드를 확인하세요
   - 수정 방안을 제시하세요
4. 커버리지 리포트가 있으면 요약하세요

## Output Format
\`\`\`
## 테스트 결과

- 전체: 42개
- 통과: 40개
- 실패: 2개
- 건너뜀: 0개

### 실패 테스트
1. \`src/__tests__/auth.test.ts\` > "should validate token"
   - 원인: mock 설정 누락
   - 수정: jest.mock() 추가 필요

2. \`src/__tests__/api.test.ts\` > "should handle 404"
   - 원인: API 응답 형식 변경
   - 수정: 예상 응답 객체 업데이트
\`\`\`
`,
    },
    {
        id: 'security-audit',
        name: 'Security Audit',
        description:
            'Duri 에이전트용 보안 감사 스킬. OWASP Top 10 기준으로 보안 취약점을 점검합니다.',
        agent: 'duri',
        content: `# Security Audit Skill

## Description
OWASP Top 10 기준으로 프로젝트의 보안 취약점을 점검합니다.

## Instructions
1. 프로젝트 구조를 파악하세요
2. 다음 영역을 점검하세요:
   - 인젝션 (SQL, NoSQL, OS Command, LDAP)
   - 인증/인가 결함
   - 민감 데이터 노출 (.env, 하드코딩된 시크릿)
   - XML External Entity (XXE)
   - 잘못된 접근 제어
   - 보안 설정 오류
   - XSS (Cross-Site Scripting)
   - 안전하지 않은 역직렬화
   - 알려진 취약점이 있는 컴포넌트 사용
   - 불충분한 로깅 및 모니터링
3. 의존성 취약점도 확인하세요 (npm audit, pip audit 등)
4. 발견 사항을 심각도별로 분류하세요

## Output Format
\`\`\`
## 보안 감사 결과

### Critical (즉시 수정 필요)
- [A03:2021 인젝션] \`src/api/users.ts:25\` — 사용자 입력을 직접 SQL 쿼리에 사용
  수정: parameterized query 사용

### High
- [A07:2021 XSS] \`src/components/Comment.tsx:12\` — dangerouslySetInnerHTML 사용
  수정: DOMPurify로 sanitize

### Medium
- [A05:2021 설정 오류] CORS가 * 로 설정됨
  수정: 허용 도메인 명시적 지정

### 의존성 취약점
- lodash@4.17.20 — Prototype Pollution (CVE-2021-23337)
  수정: lodash@4.17.21 이상으로 업데이트
\`\`\`
`,
    },
];

// ── Skill Manager ──────────────────────────────────────────────────────────

/**
 * Load skills from the project's .claude/skills/ directory.
 */
export function loadSkills(projectDir: string): SkillInfo[] {
    const skillsDir = path.join(projectDir, '.claude', 'skills');
    if (!fs.existsSync(skillsDir)) return [];

    const skills: SkillInfo[] = [];

    try {
        const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillDir = path.join(skillsDir, entry.name);
            const skillMdPath = path.join(skillDir, 'SKILL.md');

            if (!fs.existsSync(skillMdPath)) continue;

            const content = fs.readFileSync(skillMdPath, 'utf-8');
            const name = extractMarkdownTitle(content) || entry.name;
            const description = extractMarkdownDescription(content) || '';

            // Find which agent this skill belongs to
            const agent = findAgentForSkill(entry.name);

            skills.push({
                id: entry.name,
                name,
                description,
                path: skillDir,
                agent,
            });
        }
    } catch {
        // directory read error — return empty
    }

    return skills;
}

/**
 * Install default skills to .claude/skills/.
 * Only writes skills that don't already exist.
 */
export function installDefaultSkills(projectDir: string): {
    installed: string[];
    skipped: string[];
} {
    const skillsDir = path.join(projectDir, '.claude', 'skills');
    const installed: string[] = [];
    const skipped: string[] = [];

    // Ensure .claude/skills/ exists
    if (!fs.existsSync(skillsDir)) {
        fs.mkdirSync(skillsDir, { recursive: true });
    }

    for (const skill of DEFAULT_SKILLS) {
        const skillDir = path.join(skillsDir, skill.id);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        if (fs.existsSync(skillMdPath)) {
            skipped.push(skill.id);
            continue;
        }

        try {
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }
            fs.writeFileSync(skillMdPath, skill.content, 'utf-8');
            installed.push(skill.id);
        } catch (err: any) {
            console.warn(
                `[SkillManager] Failed to install skill ${skill.id}:`,
                err.message,
            );
            skipped.push(skill.id);
        }
    }

    return { installed, skipped };
}

/**
 * Get skills available for a specific agent based on CHARACTER_SKILLS mapping.
 */
export function getAgentSkills(
    agentName: string,
    projectDir: string,
): SkillInfo[] {
    const allSkills = loadSkills(projectDir);
    const profile = CHARACTER_SKILLS[agentName.toLowerCase()];

    if (!profile) return allSkills;

    // Map skill IDs from CHARACTER_SKILLS to installed skills
    const agentSkillIds = new Set(profile.skills.map((s) => s.id));
    return allSkills.filter(
        (s) => agentSkillIds.has(s.id) || s.agent === agentName.toLowerCase(),
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function extractMarkdownTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : null;
}

export function extractMarkdownDescription(content: string): string | null {
    const match = content.match(/^##\s+Description\s*\n+(.+)/m);
    return match ? match[1].trim() : null;
}

export function findAgentForSkill(skillId: string): string | undefined {
    const def = DEFAULT_SKILLS.find((s) => s.id === skillId);
    if (def) return def.agent;

    // Search CHARACTER_SKILLS for matching skill
    for (const [agent, profile] of Object.entries(CHARACTER_SKILLS)) {
        if (profile.skills.some((s) => s.id === skillId)) {
            return agent;
        }
    }
    return undefined;
}

// ── Marketplace Functions ─────────────────────────────────────────────────

export interface MarketplaceSkill extends CatalogSkill {
    installed: boolean;
}

/**
 * Search the skill catalog and mark installed status.
 */
export function searchMarketplace(
    query: string,
    projectDir: string,
): MarketplaceSkill[] {
    const results = searchCatalog(query);
    const installed = loadSkills(projectDir);
    const installedIds = new Set(installed.map((s) => s.id));

    return results.map((skill) => ({
        ...skill,
        installed: installedIds.has(skill.id),
    }));
}

/**
 * Install a skill from the catalog via Git clone.
 * Clones the repo into a temp dir, then copies the skill subdir
 * to .claude/skills/{id}/.
 */
export async function installSkillFromCatalog(
    skillId: string,
    projectDir: string,
): Promise<{ success: boolean; error?: string }> {
    const catalog = searchCatalog('');
    const entry = catalog.find((s) => s.id === skillId);
    if (!entry) {
        return {
            success: false,
            error: `Skill "${skillId}" not found in catalog`,
        };
    }

    const skillsDir = path.join(projectDir, '.claude', 'skills');
    const targetDir = path.join(skillsDir, skillId);

    if (fs.existsSync(targetDir)) {
        return {
            success: false,
            error: `Skill "${skillId}" is already installed`,
        };
    }

    // Create a temp dir for cloning
    const tmpDir = path.join(
        projectDir,
        '.claude',
        '.tmp-skill-install-' + Date.now(),
    );

    try {
        // Ensure skills directory exists
        if (!fs.existsSync(skillsDir)) {
            fs.mkdirSync(skillsDir, { recursive: true });
        }

        // Shallow clone the repo
        await execFileAsync('git', [
            'clone',
            '--depth',
            '1',
            entry.repoUrl,
            tmpDir,
        ]);

        // Determine source directory
        const srcDir = entry.subdir ? path.join(tmpDir, entry.subdir) : tmpDir;

        if (!fs.existsSync(srcDir)) {
            return {
                success: false,
                error: `Subdir "${entry.subdir}" not found in repo`,
            };
        }

        // Copy to target
        copyDirSync(srcDir, targetDir);

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    } finally {
        // Clean up temp dir
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup errors
        }
    }
}

/**
 * Uninstall a skill by removing its directory from .claude/skills/.
 */
export function uninstallSkill(
    skillId: string,
    projectDir: string,
): { success: boolean; error?: string } {
    const skillDir = path.join(projectDir, '.claude', 'skills', skillId);

    if (!fs.existsSync(skillDir)) {
        return { success: false, error: `Skill "${skillId}" is not installed` };
    }

    try {
        fs.rmSync(skillDir, { recursive: true, force: true });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

// ── Directory copy helper ─────────────────────────────────────────────────

function copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        // Skip .git directory
        if (entry.name === '.git') continue;

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
