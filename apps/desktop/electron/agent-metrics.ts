import Store from 'electron-store';

export interface TaskMetric {
    taskId: string;
    agentId: string;
    description: string;
    startedAt: number;
    completedAt?: number;
    status: 'success' | 'failure' | 'timeout';
    durationMs?: number;
}

export interface AgentMetrics {
    agentId: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    completionRate: number;
    avgDurationMs: number;
    recentTasks: TaskMetric[];
    lastActive: number;
}

interface MetricsSchema {
    agents: Record<string, AgentMetrics>;
}

const MAX_RECENT_TASKS = 50;

class AgentMetricsTracker {
    private store: Store<MetricsSchema> | null = null;

    private ensureInit(): void {
        if (this.store) return;
        this.store = new Store<MetricsSchema>({
            name: 'dokba-agent-metrics',
            defaults: {
                agents: {},
            },
        });
    }

    recordTaskStart(
        agentId: string,
        taskId: string,
        description: string,
    ): void {
        this.ensureInit();
        const agents = this.store!.get('agents');
        const metrics = agents[agentId] ?? this.emptyMetrics(agentId);

        const task: TaskMetric = {
            taskId,
            agentId,
            description,
            startedAt: Date.now(),
            status: 'timeout', // default until completed
        };

        metrics.recentTasks.push(task);
        // ring buffer: keep only the latest MAX_RECENT_TASKS
        if (metrics.recentTasks.length > MAX_RECENT_TASKS) {
            metrics.recentTasks = metrics.recentTasks.slice(-MAX_RECENT_TASKS);
        }

        metrics.totalTasks++;
        metrics.lastActive = Date.now();
        agents[agentId] = metrics;
        this.store!.set('agents', agents);
    }

    recordTaskComplete(
        agentId: string,
        taskId: string,
        status: 'success' | 'failure' | 'timeout',
    ): void {
        this.ensureInit();
        const agents = this.store!.get('agents');
        const metrics = agents[agentId];
        if (!metrics) return;

        const task = metrics.recentTasks.find(
            (t) => t.taskId === taskId && !t.completedAt,
        );
        if (task) {
            task.completedAt = Date.now();
            task.status = status;
            task.durationMs = task.completedAt - task.startedAt;
        }

        if (status === 'success') {
            metrics.completedTasks++;
        } else {
            metrics.failedTasks++;
        }

        // recalculate completion rate
        const finished = metrics.completedTasks + metrics.failedTasks;
        metrics.completionRate =
            finished > 0 ? metrics.completedTasks / finished : 0;

        // recalculate average duration from completed recent tasks
        const completedWithDuration = metrics.recentTasks.filter(
            (t) => t.durationMs != null,
        );
        metrics.avgDurationMs =
            completedWithDuration.length > 0
                ? completedWithDuration.reduce(
                      (sum, t) => sum + t.durationMs!,
                      0,
                  ) / completedWithDuration.length
                : 0;

        metrics.lastActive = Date.now();
        agents[agentId] = metrics;
        this.store!.set('agents', agents);
    }

    getMetrics(agentId: string): AgentMetrics {
        this.ensureInit();
        const agents = this.store!.get('agents');
        return agents[agentId] ?? this.emptyMetrics(agentId);
    }

    getAllMetrics(): Record<string, AgentMetrics> {
        this.ensureInit();
        return this.store!.get('agents');
    }

    getTopPerformers(limit = 10): AgentMetrics[] {
        this.ensureInit();
        const all = Object.values(this.store!.get('agents'));
        return all
            .filter((m) => m.totalTasks > 0)
            .sort((a, b) => b.completionRate - a.completionRate)
            .slice(0, limit);
    }

    private emptyMetrics(agentId: string): AgentMetrics {
        return {
            agentId,
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            completionRate: 0,
            avgDurationMs: 0,
            recentTasks: [],
            lastActive: 0,
        };
    }
}

export const agentMetrics = new AgentMetricsTracker();
