import { describe, it, expect, beforeEach } from 'vitest';
import { TaskScheduler } from '../../../electron/task-scheduler';
import type { TaskPriority } from '../../../electron/task-scheduler';

describe('TaskScheduler', () => {
    let scheduler: TaskScheduler;

    beforeEach(() => {
        scheduler = new TaskScheduler();
    });

    describe('enqueue', () => {
        it('returns a task ID', () => {
            const id = scheduler.enqueue({
                description: 'test task',
                priority: 'medium',
            });
            expect(id).toBeTruthy();
            expect(id.startsWith('tq-')).toBe(true);
        });

        it('adds task to queue', () => {
            scheduler.enqueue({ description: 'task 1', priority: 'low' });
            expect(scheduler.getQueue()).toHaveLength(1);
        });

        it('queued task has status "queued"', () => {
            scheduler.enqueue({ description: 'task', priority: 'medium' });
            expect(scheduler.getQueue()[0].status).toBe('queued');
        });
    });

    describe('dequeue', () => {
        it('returns null for empty queue', () => {
            expect(scheduler.dequeue()).toBeNull();
        });

        it('returns highest priority task first', () => {
            scheduler.enqueue({ description: 'low', priority: 'low' });
            scheduler.enqueue({
                description: 'critical',
                priority: 'critical',
            });
            scheduler.enqueue({ description: 'high', priority: 'high' });

            const task = scheduler.dequeue();
            expect(task!.description).toBe('critical');
        });

        it('removes task from queue', () => {
            scheduler.enqueue({ description: 'task', priority: 'medium' });
            scheduler.dequeue();
            expect(scheduler.getQueue()).toHaveLength(0);
        });
    });

    describe('priority ordering', () => {
        it('orders critical > high > medium > low', () => {
            const priorities: TaskPriority[] = [
                'low',
                'medium',
                'high',
                'critical',
            ];
            for (const p of priorities) {
                scheduler.enqueue({ description: p, priority: p });
            }

            const order = [];
            let task;
            while ((task = scheduler.dequeue()) !== null) {
                order.push(task.description);
            }

            expect(order).toEqual(['critical', 'high', 'medium', 'low']);
        });

        it('uses deadline as tiebreaker (earlier deadline first)', () => {
            scheduler.enqueue({
                description: 'later',
                priority: 'high',
                deadline: Date.now() + 60000,
            });
            scheduler.enqueue({
                description: 'sooner',
                priority: 'high',
                deadline: Date.now() + 10000,
            });

            const task = scheduler.dequeue();
            expect(task!.description).toBe('sooner');
        });

        it('tasks without deadline come after tasks with deadline (same priority)', () => {
            scheduler.enqueue({
                description: 'no deadline',
                priority: 'high',
            });
            scheduler.enqueue({
                description: 'has deadline',
                priority: 'high',
                deadline: Date.now() + 60000,
            });

            const task = scheduler.dequeue();
            expect(task!.description).toBe('has deadline');
        });
    });

    describe('cancel', () => {
        it('removes task from queue', () => {
            const id = scheduler.enqueue({
                description: 'cancel me',
                priority: 'low',
            });
            expect(scheduler.cancel(id)).toBe(true);
            expect(scheduler.getQueue()).toHaveLength(0);
        });

        it('returns false for non-existent task', () => {
            expect(scheduler.cancel('nonexistent')).toBe(false);
        });
    });

    describe('dispatch', () => {
        it('moves task from queue to running', () => {
            scheduler.enqueue({ description: 'task', priority: 'medium' });
            const task = scheduler.dispatch();
            expect(task).toBeTruthy();
            expect(task!.status).toBe('running');
            expect(scheduler.getQueue()).toHaveLength(0);
            expect(scheduler.getRunning()).toHaveLength(1);
        });

        it('respects concurrency limit', () => {
            scheduler.maxConcurrent = 2;
            scheduler.enqueue({ description: 't1', priority: 'high' });
            scheduler.enqueue({ description: 't2', priority: 'high' });
            scheduler.enqueue({ description: 't3', priority: 'high' });

            scheduler.dispatch();
            scheduler.dispatch();
            const third = scheduler.dispatch();

            expect(third).toBeNull();
            expect(scheduler.getRunning()).toHaveLength(2);
            expect(scheduler.getQueue()).toHaveLength(1);
        });

        it('returns null for empty queue', () => {
            expect(scheduler.dispatch()).toBeNull();
        });
    });

    describe('markComplete', () => {
        it('moves task from running to completed', () => {
            scheduler.enqueue({ description: 'task', priority: 'medium' });
            const task = scheduler.dispatch()!;
            scheduler.markComplete(task.id, 'done');

            expect(scheduler.getRunning()).toHaveLength(0);
            expect(scheduler.getCompleted()).toHaveLength(1);
            expect(scheduler.getCompleted()[0].status).toBe('completed');
            expect(scheduler.getCompleted()[0].result).toBe('done');
        });
    });

    describe('markFailed', () => {
        it('moves task from running to completed with failed status', () => {
            scheduler.enqueue({ description: 'task', priority: 'medium' });
            const task = scheduler.dispatch()!;
            scheduler.markFailed(task.id, 'error occurred');

            expect(scheduler.getRunning()).toHaveLength(0);
            expect(scheduler.getCompleted()).toHaveLength(1);
            expect(scheduler.getCompleted()[0].status).toBe('failed');
            expect(scheduler.getCompleted()[0].result).toBe('error occurred');
        });
    });

    describe('maxConcurrent', () => {
        it('defaults to 3', () => {
            expect(scheduler.maxConcurrent).toBe(3);
        });

        it('clamps to minimum 1', () => {
            scheduler.maxConcurrent = 0;
            expect(scheduler.maxConcurrent).toBe(1);
        });

        it('clamps to maximum 10', () => {
            scheduler.maxConcurrent = 100;
            expect(scheduler.maxConcurrent).toBe(10);
        });
    });

    describe('completed history cap', () => {
        it('caps completed list at 50', () => {
            scheduler.maxConcurrent = 10;
            for (let i = 0; i < 55; i++) {
                scheduler.enqueue({
                    description: `task-${i}`,
                    priority: 'low',
                });
            }
            for (let i = 0; i < 55; i++) {
                const task = scheduler.dispatch();
                if (task) scheduler.markComplete(task.id);
            }
            expect(scheduler.getCompleted().length).toBeLessThanOrEqual(50);
        });
    });
});
