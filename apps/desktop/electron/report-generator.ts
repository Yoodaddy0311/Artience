import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { formatDurationKo as formatDuration } from '../src/lib/format-utils';
import { collectGitInfo as collectGitInfoShared } from './git-utils';

const execFileAsync = promisify(execFile);

export interface ReportData {
    agentId: string;
    agentName: string;
    taskDescription: string;
    summary: string;
    changedFiles: {
        file: string;
        action: 'created' | 'modified' | 'deleted';
    }[];
    testResults?: { passed: number; failed: number; skipped: number };
    codeSnippets?: { file: string; language: string; code: string }[];
    duration: number; // ms
    gitBranch?: string;
    commitHash?: string;
    diffStats?: { file: string; additions: number; deletions: number }[];
    architecture?: {
        nodes: { id: string; label: string; type?: string }[];
        edges: { from: string; to: string; label?: string }[];
    };
}

export interface ReportSummary {
    id: string;
    agentName: string;
    taskDescription: string;
    date: string;
    filePath: string;
}

function toTaskSlug(description: string): string {
    return description
        .replace(/[^a-zA-Z0-9가-힣\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 30);
}

function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const mi = pad(date.getMinutes());
    return `${y}-${mo}-${d}_${h}-${mi}`;
}

function formatDateReadable(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const mo = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const mi = pad(date.getMinutes());
    return `${y}-${mo}-${d} ${h}:${mi}`;
}

function generateDependencyMermaid(
    changedFiles: { file: string; action: string }[],
): string {
    if (changedFiles.length === 0) return '';

    const groups = new Map<
        string,
        { file: string; action: string; id: string }[]
    >();
    let nodeIndex = 0;

    for (const cf of changedFiles) {
        const dir = path.dirname(cf.file) || '.';
        const basename = path.basename(cf.file);
        const id = String.fromCharCode(65 + nodeIndex); // A, B, C, ...
        nodeIndex++;
        if (!groups.has(dir)) groups.set(dir, []);
        groups.get(dir)!.push({ file: basename, action: cf.action, id });
    }

    const lines: string[] = ['graph TD'];

    for (const [dir, nodes] of groups) {
        const safeName = dir.replace(/[^a-zA-Z0-9_]/g, '_');
        lines.push(`    subgraph ${safeName}["${dir}"]`);
        for (const n of nodes) {
            const cls =
                n.action === 'created'
                    ? ':::created'
                    : n.action === 'deleted'
                      ? ':::deleted'
                      : ':::modified';
            lines.push(`        ${n.id}["${n.file}"]${cls}`);
        }
        lines.push('    end');
    }

    lines.push('    classDef created fill:#d4edda');
    lines.push('    classDef modified fill:#cce5ff');
    lines.push('    classDef deleted fill:#f8d7da');

    return lines.join('\n');
}

function generateArchitectureMermaid(arch: {
    nodes: { id: string; label: string; type?: string }[];
    edges: { from: string; to: string; label?: string }[];
}): string {
    const lines: string[] = ['flowchart TD'];
    for (const node of arch.nodes) {
        lines.push(`    ${node.id}["${node.label}"]`);
    }
    for (const edge of arch.edges) {
        const label = edge.label ? `-->|${edge.label}|` : '-->';
        lines.push(`    ${edge.from} ${label} ${edge.to}`);
    }
    return lines.join('\n');
}

class ReportGenerator {
    private reportsDir(projectDir: string): string {
        return path.join(projectDir, '.reports');
    }

    private ensureDir(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async generateReport(
        data: ReportData,
        projectDir: string,
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            const dir = this.reportsDir(projectDir);
            this.ensureDir(dir);

            const now = new Date();
            const slug = toTaskSlug(data.taskDescription);
            const filename = `${formatDate(now)}_${data.agentName}_${slug}.md`;
            const filePath = path.join(dir, filename);

            const actionIcon: Record<string, string> = {
                created: '🆕',
                modified: '✏️',
                deleted: '🗑️',
            };

            // Build diff lookup
            const diffMap = new Map<
                string,
                { additions: number; deletions: number }
            >();
            if (data.diffStats) {
                for (const d of data.diffStats) {
                    diffMap.set(d.file, {
                        additions: d.additions,
                        deletions: d.deletions,
                    });
                }
            }

            // Changed files table
            let changedFilesTable = '';
            if (data.changedFiles.length > 0) {
                changedFilesTable =
                    '| 파일 | 동작 | 추가 | 삭제 |\n|------|------|------|------|\n';
                for (const cf of data.changedFiles) {
                    const diff = diffMap.get(cf.file);
                    const icon = actionIcon[cf.action] || '';
                    const add = diff ? `+${diff.additions}` : '-';
                    const del = diff ? `-${diff.deletions}` : '-';
                    changedFilesTable += `| ${cf.file} | ${icon} ${cf.action} | ${add} | ${del} |\n`;
                }
            } else {
                changedFilesTable = '변경된 파일이 없습니다.\n';
            }

            // Test results
            let testSection = '';
            if (data.testResults) {
                const { passed, failed, skipped } = data.testResults;
                testSection = `\n## 테스트 결과\n\n> ✅ ${passed} passed | ❌ ${failed} failed | ⏭ ${skipped} skipped\n`;
            }

            // Code snippets
            let snippetSection = '';
            if (data.codeSnippets && data.codeSnippets.length > 0) {
                snippetSection = '\n## 코드 스니펫\n';
                for (const s of data.codeSnippets) {
                    snippetSection += `\n### ${s.file}\n\n\`\`\`${s.language}\n${s.code}\n\`\`\`\n`;
                }
            }

            // Mermaid architecture / dependency diagram
            let mermaidSection = '';
            if (data.architecture) {
                const archMermaid = generateArchitectureMermaid(
                    data.architecture,
                );
                mermaidSection += `\n## 아키텍처\n\n\`\`\`mermaid\n${archMermaid}\n\`\`\`\n`;
            }
            if (data.changedFiles.length > 0) {
                const depMermaid = generateDependencyMermaid(data.changedFiles);
                if (depMermaid) {
                    mermaidSection += `\n## 변경 파일 다이어그램\n\n\`\`\`mermaid\n${depMermaid}\n\`\`\`\n`;
                }
            }

            const md = `# 작업 리포트: ${data.taskDescription}

| 항목 | 내용 |
|------|------|
| **에이전트** | ${data.agentName} |
| **날짜** | ${formatDateReadable(now)} |
| **소요시간** | ${formatDuration(data.duration)} |
| **브랜치** | ${data.gitBranch || 'N/A'} |
| **커밋** | ${data.commitHash || 'N/A'} |

## 요약

${data.summary}

## 변경 파일

${changedFilesTable}${testSection}${snippetSection}${mermaidSection}`;

            fs.writeFileSync(filePath, md, 'utf-8');
            return { success: true, filePath };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async getReports(projectDir: string): Promise<ReportSummary[]> {
        const dir = this.reportsDir(projectDir);
        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

        const summaries: ReportSummary[] = [];
        for (const file of files) {
            // Pattern: YYYY-MM-DD_HH-mm_agentName_taskSlug.md
            const match = file.match(
                /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2})_([^_]+)_(.+)\.md$/,
            );
            if (!match) continue;

            const [, dateStr, agentName, taskSlug] = match;
            const filePath = path.join(dir, file);

            // Extract taskDescription from first line of file
            let taskDescription = taskSlug.replace(/-/g, ' ');
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const titleMatch = content.match(/^# 작업 리포트: (.+)$/m);
                if (titleMatch) {
                    taskDescription = titleMatch[1];
                }
            } catch {
                // fallback to slug-based name
            }

            summaries.push({
                id: file.replace('.md', ''),
                agentName,
                taskDescription,
                date: dateStr
                    .replace('_', ' ')
                    .replace(/-/g, (m, offset) => (offset > 10 ? ':' : m)),
                filePath,
            });
        }

        // Sort newest first
        summaries.sort((a, b) => b.date.localeCompare(a.date));
        return summaries;
    }

    async getReport(filePath: string): Promise<string> {
        return fs.readFileSync(filePath, 'utf-8');
    }

    async deleteReport(filePath: string): Promise<void> {
        fs.unlinkSync(filePath);
    }

    async collectGitInfo(projectDir: string): Promise<{
        branch?: string;
        commitHash?: string;
        diffStats?: { file: string; additions: number; deletions: number }[];
    }> {
        return collectGitInfoShared(projectDir);
    }
}

export const reportGenerator = new ReportGenerator();
