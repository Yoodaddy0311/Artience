import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecFileAsync = vi.fn();

// In jsdom environment, Node.js built-in `util` cannot be dynamically imported
// via importOriginal. Instead, mock child_process with __promisify__ on execFile
// so that the real util.promisify picks it up, and also mock util.promisify
// directly as a simple function factory.
vi.mock('child_process', () => {
    const execFileFn = Object.assign(
        (...args: unknown[]) => {
            const cb = args[args.length - 1];
            if (typeof cb === 'function') cb(null, '', '');
        },
        { __promisify__: mockExecFileAsync },
    );
    return { default: { execFile: execFileFn }, execFile: execFileFn };
});

vi.mock('util', () => ({
    default: { promisify: () => mockExecFileAsync },
    promisify: () => mockExecFileAsync,
}));

describe('collectGitInfo', () => {
    let collectGitInfo: (projectDir: string) => Promise<{
        branch?: string;
        commitHash?: string;
        diffStats?: { file: string; additions: number; deletions: number }[];
    }>;

    beforeEach(async () => {
        vi.resetModules();
        mockExecFileAsync.mockReset();
        const mod = await import('../../../electron/git-utils');
        collectGitInfo = mod.collectGitInfo;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns branch, commitHash, and diffStats for normal repo', async () => {
        mockExecFileAsync
            // git rev-parse --abbrev-ref HEAD
            .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
            // git rev-parse --short HEAD
            .mockResolvedValueOnce({ stdout: 'abc1234\n', stderr: '' })
            // git diff --numstat HEAD~1
            .mockResolvedValueOnce({
                stdout: '10\t2\tsrc/index.ts\n3\t1\tREADME.md\n',
                stderr: '',
            });

        const result = await collectGitInfo('/fake/project');

        expect(result.branch).toBe('main');
        expect(result.commitHash).toBe('abc1234');
        expect(result.diffStats).toEqual([
            { file: 'src/index.ts', additions: 10, deletions: 2 },
            { file: 'README.md', additions: 3, deletions: 1 },
        ]);
    });

    it('falls back to diff-tree/show for initial commit (HEAD~1 fails)', async () => {
        mockExecFileAsync
            // branch
            .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
            // commitHash
            .mockResolvedValueOnce({ stdout: 'def5678\n', stderr: '' })
            // git diff --numstat HEAD~1 fails (initial commit)
            .mockRejectedValueOnce(
                new Error('fatal: ambiguous argument HEAD~1'),
            )
            // fallback: git diff-tree
            .mockResolvedValueOnce({
                stdout: '5\t0\tpackage.json\n12\t0\tsrc/main.ts\n',
                stderr: '',
            });

        const result = await collectGitInfo('/fake/project');

        expect(result.branch).toBe('main');
        expect(result.commitHash).toBe('def5678');
        expect(result.diffStats).toEqual([
            { file: 'package.json', additions: 5, deletions: 0 },
            { file: 'src/main.ts', additions: 12, deletions: 0 },
        ]);
    });

    it('returns empty object when git is not available', async () => {
        mockExecFileAsync.mockRejectedValue(new Error('spawn git ENOENT'));

        const result = await collectGitInfo('/not-a-git-repo');

        expect(result).toEqual({});
    });

    it('handles binary files with dash numstat entries', async () => {
        mockExecFileAsync
            // branch
            .mockResolvedValueOnce({ stdout: 'feature/img\n', stderr: '' })
            // commitHash
            .mockResolvedValueOnce({ stdout: '999aaaa\n', stderr: '' })
            // numstat with binary file (shown as - - filename)
            .mockResolvedValueOnce({
                stdout: '-\t-\tlogo.png\n7\t1\tstyle.css\n',
                stderr: '',
            });

        const result = await collectGitInfo('/fake/project');

        expect(result.branch).toBe('feature/img');
        expect(result.commitHash).toBe('999aaaa');
        expect(result.diffStats).toBeDefined();

        const binaryEntry = result.diffStats!.find(
            (d) => d.file === 'logo.png',
        );
        // Binary files should have 0/0 additions/deletions (parsed from '-')
        expect(binaryEntry).toBeDefined();
        expect(binaryEntry!.additions).toBe(0);
        expect(binaryEntry!.deletions).toBe(0);

        const cssEntry = result.diffStats!.find((d) => d.file === 'style.css');
        expect(cssEntry).toEqual({
            file: 'style.css',
            additions: 7,
            deletions: 1,
        });
    });

    it('returns empty object when branch fetch fails (Promise.all rejects)', async () => {
        mockExecFileAsync
            // branch fails — Promise.all rejects, outer catch returns {}
            .mockRejectedValueOnce(new Error('not on any branch'));

        const result = await collectGitInfo('/fake/project');

        expect(result).toEqual({});
    });

    it('handles empty diff output', async () => {
        mockExecFileAsync
            .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'ccc3333\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: '', stderr: '' });

        const result = await collectGitInfo('/fake/project');

        expect(result.branch).toBe('main');
        expect(result.commitHash).toBe('ccc3333');
        expect(result.diffStats).toEqual([]);
    });
});
