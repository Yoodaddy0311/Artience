/**
 * Hooks Manager — auto-generate .claude/settings.json and CLAUDE.md for projects.
 *
 * When a project directory is selected, this manager:
 * 1. Creates `.claude/settings.json` with useful hooks (prettier, activity logging)
 * 2. Generates `.claude/CLAUDE.md` with project-specific instructions
 *    (only if the file doesn't already exist)
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

interface ClaudeSettings {
    hooks?: {
        PostToolUse?: Array<{
            matcher: string;
            command: string;
        }>;
        Stop?: Array<{
            command: string;
        }>;
    };
    permissions?: {
        allow?: string[];
    };
}

interface PackageJson {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
}

// ── Hooks Manager ──────────────────────────────────────────────────────────

class HooksManager {
    /**
     * Setup hooks for a project directory.
     * Creates .claude/settings.json if it doesn't exist.
     */
    setupHooks(projectDir: string): { success: boolean; created: boolean; error?: string } {
        try {
            const claudeDir = path.join(projectDir, '.claude');
            const settingsPath = path.join(claudeDir, 'settings.json');

            // Already exists — don't overwrite
            if (fs.existsSync(settingsPath)) {
                return { success: true, created: false };
            }

            // Ensure .claude directory
            if (!fs.existsSync(claudeDir)) {
                fs.mkdirSync(claudeDir, { recursive: true });
            }

            const settings: ClaudeSettings = {
                hooks: {
                    PostToolUse: [],
                    Stop: [],
                },
                permissions: {
                    allow: [],
                },
            };

            // Detect prettier and add hook
            if (this.hasDependency(projectDir, 'prettier')) {
                settings.hooks!.PostToolUse!.push({
                    matcher: 'Edit|Write|MultiEdit',
                    command: 'npx prettier --write "$FILEPATH" 2>/dev/null || true',
                });
            }

            // Activity logging hook (cross-platform: node -e instead of date -Iseconds)
            const logPath = path.join(claudeDir, 'activity.log').replace(/\\/g, '/');
            settings.hooks!.Stop!.push({
                command: `node -e "require('fs').appendFileSync('${logPath}', new Date().toISOString() + ' STOP\\n')"`,
            });

            // Common safe permissions
            settings.permissions!.allow = [
                'Bash(npm test:*)',
                'Bash(npx vitest:*)',
                'Bash(npx tsc:*)',
                'Bash(git status:*)',
                'Bash(git diff:*)',
                'Bash(git log:*)',
            ];

            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
            console.log(`[HooksManager] Created settings.json at ${settingsPath}`);

            return { success: true, created: true };
        } catch (err: any) {
            console.error('[HooksManager] Failed to setup hooks:', err.message);
            return { success: false, created: false, error: err.message };
        }
    }

    /**
     * Generate CLAUDE.md with project-specific instructions.
     * Only creates if the file doesn't already exist.
     */
    generateClaudeMd(projectDir: string): { success: boolean; created: boolean; error?: string } {
        try {
            const claudeMdPath = path.join(projectDir, 'CLAUDE.md');

            // Don't overwrite existing
            if (fs.existsSync(claudeMdPath)) {
                return { success: true, created: false };
            }

            const pkg = this.readPackageJson(projectDir);
            const content = this.buildClaudeMdContent(pkg, projectDir);

            fs.writeFileSync(claudeMdPath, content, 'utf-8');
            console.log(`[HooksManager] Created CLAUDE.md at ${claudeMdPath}`);

            return { success: true, created: true };
        } catch (err: any) {
            console.error('[HooksManager] Failed to generate CLAUDE.md:', err.message);
            return { success: false, created: false, error: err.message };
        }
    }

    /**
     * Run both setupHooks and generateClaudeMd for a project.
     */
    initProject(projectDir: string): { hooks: boolean; claudeMd: boolean } {
        const hooksResult = this.setupHooks(projectDir);
        const claudeMdResult = this.generateClaudeMd(projectDir);

        return {
            hooks: hooksResult.success,
            claudeMd: claudeMdResult.success,
        };
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private readPackageJson(projectDir: string): PackageJson | null {
        try {
            const pkgPath = path.join(projectDir, 'package.json');
            if (!fs.existsSync(pkgPath)) return null;
            return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        } catch {
            return null;
        }
    }

    private hasDependency(projectDir: string, dep: string): boolean {
        const pkg = this.readPackageJson(projectDir);
        if (!pkg) return false;
        return !!(pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]);
    }

    private buildClaudeMdContent(pkg: PackageJson | null, projectDir: string): string {
        const lines: string[] = [
            '# Project Instructions',
            '',
        ];

        // Project name
        if (pkg?.name) {
            lines.push(`Project: ${pkg.name}`, '');
        }

        // Build commands
        lines.push('## Build & Test Commands', '');

        if (pkg?.scripts) {
            if (pkg.scripts.build) lines.push(`- Build: \`npm run build\``);
            if (pkg.scripts.dev) lines.push(`- Dev: \`npm run dev\``);
            if (pkg.scripts.test) lines.push(`- Test: \`npm test\``);
            if (pkg.scripts['test:watch']) lines.push(`- Test watch: \`npm run test:watch\``);
            if (pkg.scripts.lint) lines.push(`- Lint: \`npm run lint\``);
            if (pkg.scripts['type-check'] || pkg.scripts.typecheck) {
                lines.push(`- Type check: \`npm run ${pkg.scripts['type-check'] ? 'type-check' : 'typecheck'}\``);
            }
        }

        // Detect TypeScript
        if (pkg?.devDependencies?.typescript || pkg?.dependencies?.typescript) {
            lines.push(`- TypeScript check: \`npx tsc --noEmit\``);
        }

        lines.push('');

        // Framework detection
        const frameworks: string[] = [];
        const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };

        if (allDeps['react']) frameworks.push('React');
        if (allDeps['next']) frameworks.push('Next.js');
        if (allDeps['vue']) frameworks.push('Vue');
        if (allDeps['svelte']) frameworks.push('Svelte');
        if (allDeps['express']) frameworks.push('Express');
        if (allDeps['fastify']) frameworks.push('Fastify');
        if (allDeps['electron']) frameworks.push('Electron');
        if (allDeps['vitest']) frameworks.push('Vitest');
        if (allDeps['jest']) frameworks.push('Jest');
        if (allDeps['tailwindcss'] || allDeps['@tailwindcss/vite']) frameworks.push('Tailwind CSS');

        if (frameworks.length > 0) {
            lines.push('## Tech Stack', '');
            lines.push(frameworks.join(', '), '');
        }

        // Git info
        const gitDir = path.join(projectDir, '.git');
        if (fs.existsSync(gitDir)) {
            lines.push('## Git', '');
            lines.push('- Use conventional commits (feat:, fix:, refactor:, etc.)');
            lines.push('- Run tests before committing');
            lines.push('');
        }

        // General instructions
        lines.push('## General', '');
        lines.push('- Write clean, readable code');
        lines.push('- Follow existing code style and patterns');
        lines.push('- Add tests for new features');
        lines.push('- Keep changes focused and minimal');
        lines.push('');

        return lines.join('\n');
    }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const hooksManager = new HooksManager();
