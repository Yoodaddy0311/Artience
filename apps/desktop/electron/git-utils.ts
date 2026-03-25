import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface GitDiffStat {
    file: string;
    additions: number;
    deletions: number;
}

export interface GitInfo {
    branch?: string;
    commitHash?: string;
    diffStats?: GitDiffStat[];
}

function parseNumstat(stdout: string): GitDiffStat[] {
    return stdout
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
            const [add, del, file] = line.split('\t');
            return {
                file: file || '',
                additions: parseInt(add, 10) || 0,
                deletions: parseInt(del, 10) || 0,
            };
        })
        .filter((s) => s.file);
}

export async function collectGitInfo(projectDir: string): Promise<GitInfo> {
    try {
        const [branchRes, hashRes] = await Promise.all([
            execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
                cwd: projectDir,
            }),
            execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
                cwd: projectDir,
            }),
        ]);

        const branch = branchRes.stdout.trim();
        const commitHash = hashRes.stdout.trim();

        let diffStats: GitDiffStat[] = [];
        try {
            const diffRes = await execFileAsync(
                'git',
                ['diff', '--numstat', 'HEAD~1'],
                { cwd: projectDir },
            );
            diffStats = parseNumstat(diffRes.stdout);
        } catch {
            // HEAD~1 failed — likely initial commit, use diff-tree fallback
            try {
                const fallbackRes = await execFileAsync(
                    'git',
                    ['diff-tree', '--numstat', '--root', '-r', 'HEAD'],
                    { cwd: projectDir },
                );
                diffStats = parseNumstat(fallbackRes.stdout);
            } catch {
                // no git history at all
                diffStats = [];
            }
        }

        return { branch, commitHash, diffStats };
    } catch {
        return {};
    }
}
