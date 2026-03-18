import { describe, expect, it } from 'vitest';
import { createStartupMetricsTracker } from '../startup-metrics';

describe('createStartupMetricsTracker', () => {
    it('records first mark timestamps relative to launch', () => {
        let tick = 1000;
        const tracker = createStartupMetricsTracker({
            now: () => tick,
        });

        tick = 1015;
        tracker.mark('main-ready');
        tick = 1030;
        tracker.mark('shell-visible');

        expect(tracker.snapshot()).toEqual({
            launchAt: 1000,
            marks: [
                {
                    name: 'main-ready',
                    at: 1015,
                    sinceLaunchMs: 15,
                    detail: undefined,
                },
                {
                    name: 'shell-visible',
                    at: 1030,
                    sinceLaunchMs: 30,
                    detail: undefined,
                },
            ],
        });
    });

    it('keeps the first mark unless overwrite is enabled', () => {
        let tick = 2000;
        const tracker = createStartupMetricsTracker({
            now: () => tick,
        });

        tick = 2010;
        tracker.mark('phase', 'first');
        tick = 2040;
        tracker.mark('phase', 'second');
        tick = 2075;
        tracker.mark('phase', 'third', true);

        expect(tracker.snapshot().marks).toEqual([
            {
                name: 'phase',
                at: 2075,
                sinceLaunchMs: 75,
                detail: 'third',
            },
        ]);
    });
});
