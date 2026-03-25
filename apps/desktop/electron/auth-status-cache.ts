export interface AuthStatusResult {
    authenticated: boolean;
}

interface AuthStatusCacheOptions {
    now?: () => number;
    positiveTtlMs?: number;
    negativeTtlMs?: number;
}

export function createAuthStatusCache(options: AuthStatusCacheOptions = {}) {
    const now = options.now ?? Date.now;
    const positiveTtlMs = options.positiveTtlMs ?? 60_000;
    const negativeTtlMs = options.negativeTtlMs ?? 10_000;

    let cached: {
        value: AuthStatusResult;
        expiresAt: number;
    } | null = null;
    let inflight: Promise<AuthStatusResult> | null = null;

    return {
        async get(
            loader: () => Promise<AuthStatusResult>,
        ): Promise<AuthStatusResult> {
            const timestamp = now();
            if (cached && cached.expiresAt > timestamp) {
                return cached.value;
            }

            if (inflight) {
                return inflight;
            }

            inflight = loader()
                .then((value) => {
                    cached = {
                        value,
                        expiresAt:
                            now() +
                            (value.authenticated
                                ? positiveTtlMs
                                : negativeTtlMs),
                    };
                    return value;
                })
                .finally(() => {
                    inflight = null;
                });

            return inflight;
        },

        invalidate() {
            cached = null;
            inflight = null;
        },
    };
}
