/**
 * Task Scheduler — priority-based task queue with concurrency control.
 *
 * Manages a queue of tasks sorted by priority and deadline,
 * dispatching them to CTO Controller or directly to agent PTYs.
 * Does NOT modify CTO Controller's delegateTask() — only calls it.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};

export interface ScheduledTask {
    id: string;
    description: string;
    priority: TaskPriority;
    deadline?: number; // unix timestamp, optional
    assignedAgent?: string; // specific agent id (omit for auto-recommend)
    createdAt: number;
    status: 'queued' | 'running' | 'completed' | 'failed';
    result?: string;
}

export type EnqueueInput = Omit<ScheduledTask, 'id' | 'createdAt' | 'status'>;

// ── TaskScheduler ──────────────────────────────────────────────────────────

export class TaskScheduler {
    private queue: ScheduledTask[] = [];
    private running: ScheduledTask[] = [];
    private completed: ScheduledTask[] = [];
    private _maxConcurrent = 3;

    get maxConcurrent(): number {
        return this._maxConcurrent;
    }

    set maxConcurrent(value: number) {
        this._maxConcurrent = Math.max(1, Math.min(value, 10));
    }

    /**
     * Add a task to the queue. Returns the generated task ID.
     */
    enqueue(input: EnqueueInput): string {
        const task: ScheduledTask = {
            ...input,
            id: `tq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            status: 'queued',
        };
        this.queue.push(task);
        this.sortQueue();
        console.log(
            `[TaskScheduler] Enqueued task ${task.id} (priority=${task.priority})`,
        );
        return task.id;
    }

    /**
     * Remove and return the highest-priority task from the queue.
     * Returns null if the queue is empty.
     */
    dequeue(): ScheduledTask | null {
        if (this.queue.length === 0) return null;
        this.sortQueue();
        return this.queue.shift() ?? null;
    }

    /**
     * Cancel a queued task. Returns false if the task is not in the queue.
     */
    cancel(taskId: string): boolean {
        const idx = this.queue.findIndex((t) => t.id === taskId);
        if (idx === -1) return false;
        this.queue.splice(idx, 1);
        console.log(`[TaskScheduler] Cancelled task ${taskId}`);
        return true;
    }

    /**
     * Get all queued tasks (not yet running).
     */
    getQueue(): ScheduledTask[] {
        return [...this.queue];
    }

    /**
     * Get all currently running tasks.
     */
    getRunning(): ScheduledTask[] {
        return [...this.running];
    }

    /**
     * Get completed/failed tasks (last 50).
     */
    getCompleted(): ScheduledTask[] {
        return [...this.completed];
    }

    /**
     * Mark a running task as completed.
     */
    markComplete(taskId: string, result?: string): void {
        const idx = this.running.findIndex((t) => t.id === taskId);
        if (idx === -1) return;
        const task = this.running.splice(idx, 1)[0];
        task.status = 'completed';
        task.result = result;
        this.completed.push(task);
        // Cap completed history
        if (this.completed.length > 50) this.completed.shift();
        console.log(`[TaskScheduler] Task ${taskId} completed`);
    }

    /**
     * Mark a running task as failed.
     */
    markFailed(taskId: string, error?: string): void {
        const idx = this.running.findIndex((t) => t.id === taskId);
        if (idx === -1) return;
        const task = this.running.splice(idx, 1)[0];
        task.status = 'failed';
        task.result = error;
        this.completed.push(task);
        if (this.completed.length > 50) this.completed.shift();
        console.log(`[TaskScheduler] Task ${taskId} failed: ${error}`);
    }

    /**
     * Try to dispatch the next queued task if under concurrency limit.
     * Returns the task that was moved to running state, or null.
     */
    dispatch(): ScheduledTask | null {
        if (this.running.length >= this._maxConcurrent) {
            console.log(
                `[TaskScheduler] At concurrency limit (${this.running.length}/${this._maxConcurrent})`,
            );
            return null;
        }
        const task = this.dequeue();
        if (!task) return null;
        task.status = 'running';
        this.running.push(task);
        console.log(
            `[TaskScheduler] Dispatched task ${task.id} (running=${this.running.length}/${this._maxConcurrent})`,
        );
        return task;
    }

    /**
     * Sort queue by priority (descending), then deadline (ascending, nulls last),
     * then createdAt (ascending).
     */
    private sortQueue(): void {
        this.queue.sort((a, b) => {
            // Higher priority first
            const pa = PRIORITY_WEIGHT[a.priority];
            const pb = PRIORITY_WEIGHT[b.priority];
            if (pa !== pb) return pb - pa;

            // Earlier deadline first; no deadline goes last
            const da = a.deadline ?? Infinity;
            const db = b.deadline ?? Infinity;
            if (da !== db) return da - db;

            // Earlier createdAt first
            return a.createdAt - b.createdAt;
        });
    }
}

// ── Singleton export ───────────────────────────────────────────────────────

export const taskScheduler = new TaskScheduler();
