export interface StartupMetricMark {
    name: string;
    at: number;
    sinceLaunchMs: number;
    detail?: string;
}

export interface StartupMetricsSnapshot {
    launchAt: number;
    marks: StartupMetricMark[];
}

interface StartupTrackerOptions {
    now?: () => number;
}

export function createStartupMetricsTracker(
    options: StartupTrackerOptions = {},
) {
    const now = options.now ?? Date.now;
    const launchAt = now();
    const marks = new Map<string, StartupMetricMark>();

    return {
        mark(name: string, detail?: string, overwrite = false) {
            if (!overwrite) {
                const existing = marks.get(name);
                if (existing) {
                    return existing;
                }
            }

            const at = now();
            const mark: StartupMetricMark = {
                name,
                at,
                sinceLaunchMs: at - launchAt,
                detail,
            };
            marks.set(name, mark);
            return mark;
        },
        snapshot(): StartupMetricsSnapshot {
            return {
                launchAt,
                marks: Array.from(marks.values()).sort(
                    (left, right) => left.at - right.at,
                ),
            };
        },
    };
}
