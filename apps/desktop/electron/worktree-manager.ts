/**
 * Worktree Manager — git worktree per agent for isolated workspaces.
 *
 * Each agent gets its own worktree branch under `.claude/worktrees/{agentId}`,
 * allowing parallel edits without merge conflicts.
 *
 * Uses `git worktree add/remove/list` via child_process.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execFileAsync = promisify(execFile);

// ── Types ──────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
    agentId: string;
    path: string;
    branch: string;
    head: string;
}

// ── Worktree Manager ───────────────────────────────────────────────────────

class WorktreeManager {
    /** Validate agentId to prevent path traversal / command injection */
    private validateAgentId(agentId: string): boolean {
        return /^[a-zA-Z0-9_-]+$/.test(agentId) && agentId.length <= 64;
    }

    /**
     * Create a git worktree for an agent.
     * Branch: `agent/{agentId}`, Path: `.claude/worktrees/{agentId}`
     */
    async createWorktree(agentId: string, projectDir: string): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            if (!this.validateAgentId(agentId)) {
                return { success: false, error: 'Invalid agentId: must be alphanumeric, hyphens, or underscores only' };
            }

            // Verify git repo
            if (!this.isGitRepo(projectDir)) {
                return { success: false, error: 'Not a git repository' };
            }

            const worktreePath = this.getWorktreePath(agentId, projectDir);
            const branch = `agent/${agentId}`;

            // Already exists? Verify it's actually a git worktree
            if (fs.existsSync(worktreePath)) {
                const dotGit = path.join(worktreePath, '.git');
                if (fs.existsSync(dotGit)) {
                    return { success: true, path: worktreePath };
                }
                // Directory exists but is not a worktree — remove and recreate
                fs.rmSync(worktreePath, { recursive: true, force: true });
            }

            // Ensure parent directory exists
            const parentDir = path.dirname(worktreePath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }

            // Create worktree with new branch based on HEAD
            await execFileAsync('git', ['worktree', 'add', '-b', branch, worktreePath, 'HEAD'], {
                cwd: projectDir,
                timeout: 30000,
            });

            console.log(`[WorktreeManager] Created worktree for ${agentId} at ${worktreePath}`);
            return { success: true, path: worktreePath };
        } catch (err: any) {
            // Branch already exists — try without -b
            if (err.message?.includes('already exists')) {
                try {
                    const worktreePath = this.getWorktreePath(agentId, projectDir);
                    const branch = `agent/${agentId}`;
                    await execFileAsync('git', ['worktree', 'add', worktreePath, branch], {
                        cwd: projectDir,
                        timeout: 30000,
                    });
                    console.log(`[WorktreeManager] Attached existing branch for ${agentId}`);
                    return { success: true, path: worktreePath };
                } catch (innerErr: any) {
                    return { success: false, error: innerErr.message };
                }
            }
            console.error(`[WorktreeManager] Failed to create worktree for ${agentId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * Remove a worktree for an agent.
     */
    async removeWorktree(agentId: string, projectDir: string): Promise<{ success: boolean; error?: string }> {
        try {
            const worktreePath = this.getWorktreePath(agentId, projectDir);

            if (!fs.existsSync(worktreePath)) {
                return { success: true }; // Already gone
            }

            await execFileAsync('git', ['worktree', 'remove', worktreePath, '--force'], {
                cwd: projectDir,
                timeout: 15000,
            });

            console.log(`[WorktreeManager] Removed worktree for ${agentId}`);
            return { success: true };
        } catch (err: any) {
            console.error(`[WorktreeManager] Failed to remove worktree for ${agentId}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    /**
     * List all active worktrees in the project.
     */
    async listWorktrees(projectDir: string): Promise<WorktreeInfo[]> {
        try {
            if (!this.isGitRepo(projectDir)) return [];

            const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
                cwd: projectDir,
                timeout: 10000,
            });

            const worktrees: WorktreeInfo[] = [];
            const entries = stdout.split('\n\n').filter(Boolean);

            for (const entry of entries) {
                const lines = entry.trim().split('\n');
                let wtPath = '';
                let head = '';
                let branch = '';

                for (const line of lines) {
                    if (line.startsWith('worktree ')) {
                        wtPath = line.slice(9).trim();
                    } else if (line.startsWith('HEAD ')) {
                        head = line.slice(5).trim();
                    } else if (line.startsWith('branch ')) {
                        branch = line.slice(7).trim();
                    }
                }

                // Only include agent worktrees
                if (branch.includes('agent/')) {
                    const agentId = branch.replace(/^refs\/heads\/agent\//, '');
                    worktrees.push({ agentId, path: wtPath, branch, head });
                }
            }

            return worktrees;
        } catch (err: any) {
            console.error('[WorktreeManager] Failed to list worktrees:', err.message);
            return [];
        }
    }

    /**
     * Get the worktree path for an agent.
     */
    getWorktreePath(agentId: string, projectDir: string): string {
        return path.join(projectDir, '.claude', 'worktrees', agentId);
    }

    /**
     * Check if a directory is a git repository.
     */
    private isGitRepo(dir: string): boolean {
        return fs.existsSync(path.join(dir, '.git'));
    }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const worktreeManager = new WorktreeManager();
