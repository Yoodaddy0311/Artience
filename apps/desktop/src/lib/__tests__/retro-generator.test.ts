import { describe, it, expect } from 'vitest';
import {
    formatDateISO,
    type RetroReport,
} from '../../../electron/retro-generator';

// Re-implement filterTasksByPeriod for testing (private in class)
function filterTasksByPeriod(
    tasks: { startedAt: number; completedAt?: number }[],
    startMs: number,
    endMs: number,
) {
    return tasks.filter((t) => {
        const ts = t.completedAt ?? t.startedAt;
        return ts >= startMs && ts <= endMs;
    });
}

// Re-implement toMarkdown header logic for testing
function buildRetroHeader(report: RetroReport): string {
    const periodLabel = report.period === 'daily' ? '일간' : '주간';
    return `# ${periodLabel} 회고 리포트`;
}

describe('formatDateISO', () => {
    it('formats date as ISO date string', () => {
        const d = new Date('2026-03-15T14:30:00Z');
        expect(formatDateISO(d)).toBe('2026-03-15');
    });

    it('returns 10-character string', () => {
        expect(formatDateISO(new Date()).length).toBe(10);
    });

    it('matches YYYY-MM-DD pattern', () => {
        expect(formatDateISO(new Date())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('filterTasksByPeriod', () => {
    it('filters tasks within time range', () => {
        const tasks = [
            { startedAt: 100, completedAt: 200 },
            { startedAt: 300, completedAt: 400 },
            { startedAt: 500, completedAt: 600 },
        ];
        const result = filterTasksByPeriod(tasks, 150, 450);
        expect(result).toHaveLength(2);
    });

    it('uses completedAt when available', () => {
        const tasks = [
            { startedAt: 50, completedAt: 250 }, // completedAt=250 is in range
        ];
        expect(filterTasksByPeriod(tasks, 200, 300)).toHaveLength(1);
    });

    it('falls back to startedAt when completedAt is undefined', () => {
        const tasks = [{ startedAt: 250 }];
        expect(filterTasksByPeriod(tasks, 200, 300)).toHaveLength(1);
    });

    it('returns empty for no matching tasks', () => {
        const tasks = [{ startedAt: 100, completedAt: 200 }];
        expect(filterTasksByPeriod(tasks, 500, 600)).toHaveLength(0);
    });

    it('handles empty task list', () => {
        expect(filterTasksByPeriod([], 0, 1000)).toEqual([]);
    });
});

describe('RetroReport structure', () => {
    it('daily report header', () => {
        const report: RetroReport = {
            period: 'daily',
            startDate: '2026-03-15',
            endDate: '2026-03-15',
            summary: {
                totalTasks: 5,
                completedTasks: 4,
                failedTasks: 1,
                activeAgents: ['rio'],
            },
            agentHighlights: [],
            recommendations: [],
        };
        expect(buildRetroHeader(report)).toBe('# 일간 회고 리포트');
    });

    it('weekly report header', () => {
        const report: RetroReport = {
            period: 'weekly',
            startDate: '2026-03-09',
            endDate: '2026-03-15',
            summary: {
                totalTasks: 20,
                completedTasks: 18,
                failedTasks: 2,
                activeAgents: ['rio', 'luna'],
            },
            agentHighlights: [],
            recommendations: [],
        };
        expect(buildRetroHeader(report)).toBe('# 주간 회고 리포트');
    });
});

// Re-implement recommendation logic for testing
function generateRecommendations(
    agentData: {
        agentId: string;
        completionRate: number;
        avgMs: number;
        failRate: number;
    }[],
    totalTasks: number,
    completedTasks: number,
): string[] {
    const recs: string[] = [];
    for (const a of agentData) {
        if (a.completionRate < 0.5) {
            recs.push(
                `${a.agentId} 에이전트 태스크 배분 재검토 (완료율 ${Math.round(a.completionRate * 100)}%)`,
            );
        }
        if (a.avgMs > 300000) {
            recs.push(`${a.agentId} 에이전트 태스크 복잡도 조정`);
        }
        if (a.failRate > 0.3) {
            recs.push(`${a.agentId} 에이전트 에러 패턴 분석 필요`);
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

describe('generateRecommendations logic', () => {
    it('flags agents with low completion rate', () => {
        const recs = generateRecommendations(
            [
                {
                    agentId: 'rio',
                    completionRate: 0.3,
                    avgMs: 1000,
                    failRate: 0.1,
                },
            ],
            10,
            7,
        );
        expect(
            recs.some((r) => r.includes('rio') && r.includes('재검토')),
        ).toBe(true);
    });

    it('flags agents with high avg duration', () => {
        const recs = generateRecommendations(
            [
                {
                    agentId: 'luna',
                    completionRate: 0.9,
                    avgMs: 500000,
                    failRate: 0,
                },
            ],
            10,
            9,
        );
        expect(
            recs.some((r) => r.includes('luna') && r.includes('복잡도')),
        ).toBe(true);
    });

    it('flags agents with high fail rate', () => {
        const recs = generateRecommendations(
            [
                {
                    agentId: 'ara',
                    completionRate: 0.6,
                    avgMs: 1000,
                    failRate: 0.5,
                },
            ],
            10,
            6,
        );
        expect(recs.some((r) => r.includes('ara') && r.includes('에러'))).toBe(
            true,
        );
    });

    it('praises good team performance', () => {
        const recs = generateRecommendations(
            [
                {
                    agentId: 'rio',
                    completionRate: 0.95,
                    avgMs: 5000,
                    failRate: 0.05,
                },
            ],
            10,
            9,
        );
        expect(recs).toContain('팀 성과 우수 — 전체 완료율 80% 이상');
    });

    it('notes when no tasks recorded', () => {
        const recs = generateRecommendations([], 0, 0);
        expect(recs).toContain('해당 기간에 기록된 태스크가 없습니다');
    });
});
