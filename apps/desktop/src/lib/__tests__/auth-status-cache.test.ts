import { describe, expect, it, vi } from 'vitest';
import { createAuthStatusCache } from '../../../electron/auth-status-cache';

describe('createAuthStatusCache', () => {
    it('dedupes inflight loads', async () => {
        let resolveLoader:
            | ((value: { authenticated: boolean }) => void)
            | null = null;
        const loader = vi.fn(
            () =>
                new Promise<{ authenticated: boolean }>((resolve) => {
                    resolveLoader = resolve;
                }),
        );

        const cache = createAuthStatusCache();

        const first = cache.get(loader);
        const second = cache.get(loader);

        expect(loader).toHaveBeenCalledTimes(1);

        expect(resolveLoader).toBeTypeOf('function');
        resolveLoader!({ authenticated: true });

        await expect(first).resolves.toEqual({ authenticated: true });
        await expect(second).resolves.toEqual({ authenticated: true });
    });

    it('uses separate ttl windows for positive and negative results', async () => {
        let now = 1_000;
        const positiveCache = createAuthStatusCache({
            now: () => now,
            positiveTtlMs: 100,
            negativeTtlMs: 20,
        });

        const positiveLoader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockResolvedValue({ authenticated: true });

        await positiveCache.get(positiveLoader);
        await positiveCache.get(positiveLoader);
        expect(positiveLoader).toHaveBeenCalledTimes(1);

        now += 101;
        await positiveCache.get(positiveLoader);
        expect(positiveLoader).toHaveBeenCalledTimes(2);

        const negativeCache = createAuthStatusCache({
            now: () => now,
            positiveTtlMs: 100,
            negativeTtlMs: 20,
        });
        const negativeLoader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockResolvedValue({ authenticated: false });

        await negativeCache.get(negativeLoader);
        await negativeCache.get(negativeLoader);
        expect(negativeLoader).toHaveBeenCalledTimes(1);

        now += 21;
        await negativeCache.get(negativeLoader);
        expect(negativeLoader).toHaveBeenCalledTimes(2);
    });

    it('invalidates cached results explicitly', async () => {
        const cache = createAuthStatusCache();
        const loader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockResolvedValue({ authenticated: true });

        await cache.get(loader);
        cache.invalidate();
        await cache.get(loader);

        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('returns cached value within TTL without calling loader again', async () => {
        let now = 0;
        const cache = createAuthStatusCache({
            now: () => now,
            positiveTtlMs: 1000,
        });
        const loader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockResolvedValue({ authenticated: true });

        await cache.get(loader);
        now += 500; // Still within TTL
        const result = await cache.get(loader);

        expect(loader).toHaveBeenCalledTimes(1);
        expect(result.authenticated).toBe(true);
    });

    it('handles loader rejection gracefully', async () => {
        const cache = createAuthStatusCache();
        const loader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockRejectedValueOnce(new Error('Network error'))
            .mockResolvedValueOnce({ authenticated: false });

        await expect(cache.get(loader)).rejects.toThrow('Network error');
        // After rejection, inflight should be cleared, allowing retry
        const result = await cache.get(loader);
        expect(result.authenticated).toBe(false);
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('negative result uses shorter TTL', async () => {
        let now = 0;
        const cache = createAuthStatusCache({
            now: () => now,
            positiveTtlMs: 1000,
            negativeTtlMs: 100,
        });
        const loader = vi
            .fn<() => Promise<{ authenticated: boolean }>>()
            .mockResolvedValue({ authenticated: false });

        await cache.get(loader);
        now += 50; // Within negative TTL
        await cache.get(loader);
        expect(loader).toHaveBeenCalledTimes(1);

        now += 60; // Past negative TTL (total 110 > 100)
        await cache.get(loader);
        expect(loader).toHaveBeenCalledTimes(2);
    });
});
