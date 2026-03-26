import * as fs from 'fs';
import * as path from 'path';
import {
    agentMetrics,
    type AgentMetrics,
    type TaskMetric,
} from './agent-metrics';
import { formatDurationKo as formatDuration } from '../src/lib/format-utils';

export interface RetroReport {
    period: 'daily' | 'weekly';
    startDate: string;
    endDate: string;
    summary: {
        totalTasks: number;
        completedTasks: number;
        failedTasks: number;
        activeAgents: string[];
    };
    agentHighlights: {
        agentId: string;
        tasksCompleted: number;
        avgDuration: number;
        bestTask?: string;
    }[];
    recommendations: string[];
}

export function formatDateISO(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function formatDateReadable(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

class RetroGenerator {
    private filterTasksByPeriod(
        tasks: TaskMetric[],
        startMs: number,
        endMs: number,
    ): TaskMetric[] {
        return tasks.filter((t) => {
            const ts = t.completedAt ?? t.startedAt;
            return ts >= startMs && ts <= endMs;
        });
    }

    private buildReport(
        period: 'daily' | 'weekly',
        startMs: number,
        endMs: number,
    ): RetroReport {
        const allMetrics = agentMetrics.getAllMetrics();
        const startDate = formatDateISO(new Date(startMs));
        const endDate = formatDateISO(new Date(endMs));

        let totalTasks = 0;
        let completedTasks = 0;
        let failedTasks = 0;
        const activeAgents: string[] = [];
        const highlights: RetroReport['agentHighlights'] = [];

        for (const [agentId, metrics] of Object.entries(allMetrics)) {
            const periodTasks = this.filterTasksByPeriod(
                metrics.recentTasks,
                startMs,
                endMs,
            );
            if (periodTasks.length === 0) continue;

            activeAgents.push(agentId);

            const completed = periodTasks.filter((t) => t.status === 'success');
            const failed = periodTasks.filter(
                (t) => t.status === 'failure' || t.status === 'timeout',
            );

            totalTasks += periodTasks.length;
            completedTasks += completed.length;
            failedTasks += failed.length;

            const durations = completed
                .filter((t) => t.durationMs != null)
                .map((t) => t.durationMs!);
            const avgDuration =
                durations.length > 0
                    ? durations.reduce((a, b) => a + b, 0) / durations.length
                    : 0;

            // Best task = fastest completed
            let bestTask: string | undefined;
            if (durations.length > 0) {
                const fastest = completed
                    .filter((t) => t.durationMs != null)
                    .sort((a, b) => a.durationMs! - b.durationMs!)[0];
                if (fastest) {
                    bestTask = fastest.description;
                }
            }

            highlights.push({
                agentId,
                tasksCompleted: completed.length,
                avgDuration,
                bestTask,
            });
        }

        // Sort highlights by tasks completed (desc)
        highlights.sort((a, b) => b.tasksCompleted - a.tasksCompleted);

        const recommendations = this.generateRecommendations(
            allMetrics,
            startMs,
            endMs,
            totalTasks,
            completedTasks,
            failedTasks,
        );

        return {
            period,
            startDate,
            endDate,
            summary: { totalTasks, completedTasks, failedTasks, activeAgents },
            agentHighlights: highlights,
            recommendations,
        };
    }

    private generateRecommendations(
        allMetrics: Record<string, AgentMetrics>,
        startMs: number,
        endMs: number,
        totalTasks: number,
        completedTasks: number,
        _failedTasks: number,
    ): string[] {
        const recs: string[] = [];

        for (const [agentId, metrics] of Object.entries(allMetrics)) {
            const periodTasks = this.filterTasksByPeriod(
                metrics.recentTasks,
                startMs,
                endMs,
            );
            if (periodTasks.length === 0) continue;

            const completed = periodTasks.filter(
                (t) => t.status === 'success',
            ).length;
            const failed = periodTasks.filter(
                (t) => t.status === 'failure' || t.status === 'timeout',
            ).length;
            const completionRate =
                periodTasks.length > 0 ? completed / periodTasks.length : 0;

            if (completionRate < 0.5) {
                recs.push(
                    `${agentId} 에이전트 태스크 배분 재검토 (완료율 ${Math.round(completionRate * 100)}%)`,
                );
            }

            const durations = periodTasks
                .filter((t) => t.durationMs != null)
                .map((t) => t.durationMs!);
            const avgMs =
                durations.length > 0
                    ? durations.reduce((a, b) => a + b, 0) / durations.length
                    : 0;

            if (avgMs > 300000) {
                recs.push(
                    `${agentId} 에이전트 태스크 복잡도 조정 (평균 ${formatDuration(avgMs)})`,
                );
            }

            if (periodTasks.length > 0 && failed / periodTasks.length > 0.3) {
                recs.push(
                    `${agentId} 에이전트 에러 패턴 분석 필요 (실패율 ${Math.round((failed / periodTasks.length) * 100)}%)`,
                );
            }
        }

        if (
            totalTasks > 0 &&
            completedTasks / totalTasks > 0.8 &&
            recs.length === 0
        ) {
            recs.push('팀 성과 우수 — 전체 완료율 80% 이상');
        }

        if (totalTasks === 0) {
            recs.push('해당 기간에 기록된 태스크가 없습니다');
        }

        return recs;
    }

    generateDaily(): RetroReport {
        const now = new Date();
        const startOfDay = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        return this.buildReport('daily', startOfDay.getTime(), now.getTime());
    }

    generateWeekly(): RetroReport {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - dayOfWeek,
        );
        return this.buildReport('weekly', startOfWeek.getTime(), now.getTime());
    }

    toMarkdown(report: RetroReport): string {
        const periodLabel = report.period === 'daily' ? '일간' : '주간';
        const lines: string[] = [];

        lines.push(`# ${periodLabel} 회고 리포트`);
        lines.push('');
        lines.push(`| 항목 | 내용 |`);
        lines.push(`|------|------|`);
        lines.push(`| **기간** | ${report.startDate} ~ ${report.endDate} |`);
        lines.push(`| **생성일시** | ${formatDateReadable(new Date())} |`);
        lines.push(`| **총 태스크** | ${report.summary.totalTasks} |`);
        lines.push(`| **완료** | ${report.summary.completedTasks} |`);
        lines.push(`| **실패** | ${report.summary.failedTasks} |`);
        lines.push(
            `| **활성 에이전트** | ${report.summary.activeAgents.length}명 |`,
        );
        lines.push('');

        if (report.agentHighlights.length > 0) {
            lines.push('## 에이전트별 성과');
            lines.push('');
            lines.push(
                '| 에이전트 | 완료 | 평균 소요시간 | 최고 성과 태스크 |',
            );
            lines.push('|----------|------|---------------|-----------------|');
            for (const h of report.agentHighlights) {
                lines.push(
                    `| ${h.agentId} | ${h.tasksCompleted} | ${formatDuration(h.avgDuration)} | ${h.bestTask || '-'} |`,
                );
            }
            lines.push('');
        }

        if (report.recommendations.length > 0) {
            lines.push('## 개선 제안');
            lines.push('');
            for (const rec of report.recommendations) {
                lines.push(`- ${rec}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    saveReport(
        report: RetroReport,
        projectDir: string,
    ): { success: boolean; filePath?: string; error?: string } {
        try {
            const dir = path.join(projectDir, '.reports');
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const md = this.toMarkdown(report);
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
            const filename = `${dateStr}_retro_${report.period}.md`;
            const filePath = path.join(dir, filename);

            fs.writeFileSync(filePath, md, 'utf-8');
            return { success: true, filePath };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

export const retroGenerator = new RetroGenerator();
