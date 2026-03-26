import { describe, it, expect } from 'vitest';

// Re-implement buildClaudeMdContent logic as pure function for testing
// (mirrors hooks-manager.ts HooksManager.buildClaudeMdContent)

interface PackageJson {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

function buildClaudeMdContent(
    pkg: PackageJson | null,
    hasGit: boolean,
): string {
    const lines: string[] = ['# Project Instructions', ''];

    if (pkg?.name) {
        lines.push(`Project: ${pkg.name}`, '');
    }

    lines.push('## Build & Test Commands', '');

    if (pkg?.scripts) {
        if (pkg.scripts.build) lines.push(`- Build: \`npm run build\``);
        if (pkg.scripts.dev) lines.push(`- Dev: \`npm run dev\``);
        if (pkg.scripts.test) lines.push(`- Test: \`npm test\``);
        if (pkg.scripts['test:watch'])
            lines.push(`- Test watch: \`npm run test:watch\``);
        if (pkg.scripts.lint) lines.push(`- Lint: \`npm run lint\``);
        if (pkg.scripts['type-check'] || pkg.scripts.typecheck) {
            lines.push(
                `- Type check: \`npm run ${pkg.scripts['type-check'] ? 'type-check' : 'typecheck'}\``,
            );
        }
    }

    if (pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) {
        lines.push(`- TypeScript check: \`npx tsc --noEmit\``);
    }

    lines.push('');

    const frameworks: string[] = [];
    const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    if (allDeps['react']) frameworks.push('React');
    if (allDeps['next']) frameworks.push('Next.js');
    if (allDeps['vue']) frameworks.push('Vue');
    if (allDeps['electron']) frameworks.push('Electron');
    if (allDeps['vitest']) frameworks.push('Vitest');
    if (allDeps['tailwindcss'] || allDeps['@tailwindcss/vite'])
        frameworks.push('Tailwind CSS');

    if (frameworks.length > 0) {
        lines.push('## Tech Stack', '');
        lines.push(frameworks.join(', '), '');
    }

    if (hasGit) {
        lines.push('## Git', '');
        lines.push('- Use conventional commits (feat:, fix:, refactor:, etc.)');
        lines.push('- Run tests before committing');
        lines.push('');
    }

    lines.push('## General', '');
    lines.push('- Write clean, readable code');
    lines.push('- Follow existing code style and patterns');
    lines.push('- Add tests for new features');
    lines.push('- Keep changes focused and minimal');
    lines.push('');

    return lines.join('\n');
}

describe('HooksManager buildClaudeMdContent logic', () => {
    it('includes project name when available', () => {
        const md = buildClaudeMdContent({ name: 'my-app' }, false);
        expect(md).toContain('Project: my-app');
    });

    it('omits project name for null package', () => {
        const md = buildClaudeMdContent(null, false);
        expect(md).not.toContain('Project:');
    });

    it('includes build commands from scripts', () => {
        const md = buildClaudeMdContent(
            {
                scripts: {
                    build: 'tsc',
                    dev: 'vite',
                    test: 'vitest',
                    lint: 'eslint',
                },
            },
            false,
        );
        expect(md).toContain('`npm run build`');
        expect(md).toContain('`npm run dev`');
        expect(md).toContain('`npm test`');
        expect(md).toContain('`npm run lint`');
    });

    it('detects TypeScript and adds tsc command', () => {
        const md = buildClaudeMdContent(
            {
                devDependencies: { typescript: '^5.0.0' },
            },
            false,
        );
        expect(md).toContain('`npx tsc --noEmit`');
    });

    it('detects frameworks from dependencies', () => {
        const md = buildClaudeMdContent(
            {
                dependencies: { react: '^19', electron: '^30' },
                devDependencies: { vitest: '^4' },
            },
            false,
        );
        expect(md).toContain('React');
        expect(md).toContain('Electron');
        expect(md).toContain('Vitest');
    });

    it('includes git section when git is present', () => {
        const md = buildClaudeMdContent(null, true);
        expect(md).toContain('## Git');
        expect(md).toContain('conventional commits');
    });

    it('omits git section when no git', () => {
        const md = buildClaudeMdContent(null, false);
        expect(md).not.toContain('## Git');
    });

    it('always includes General section', () => {
        const md = buildClaudeMdContent(null, false);
        expect(md).toContain('## General');
        expect(md).toContain('Write clean, readable code');
    });

    it('handles typecheck script name variant', () => {
        const md = buildClaudeMdContent(
            {
                scripts: { typecheck: 'tsc --noEmit' },
            },
            false,
        );
        expect(md).toContain('`npm run typecheck`');
    });
});
