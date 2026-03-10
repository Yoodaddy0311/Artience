import { describe, it, expect } from 'vitest';
import { easeInOutQuad } from '../animal-runtime';

describe('easeInOutQuad', () => {
    it('returns 0 at t=0', () => {
        expect(easeInOutQuad(0)).toBe(0);
    });

    it('returns 1 at t=1', () => {
        expect(easeInOutQuad(1)).toBe(1);
    });

    it('returns 0.5 at t=0.5', () => {
        expect(easeInOutQuad(0.5)).toBe(0.5);
    });

    it('is below 0.5 for t < 0.5 (ease-in)', () => {
        expect(easeInOutQuad(0.25)).toBeLessThan(0.5);
    });

    it('is above 0.5 for t > 0.5 (ease-out)', () => {
        expect(easeInOutQuad(0.75)).toBeGreaterThan(0.5);
    });

    it('is monotonically increasing', () => {
        const steps = 20;
        let prev = easeInOutQuad(0);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const val = easeInOutQuad(t);
            expect(val).toBeGreaterThanOrEqual(prev);
            prev = val;
        }
    });

    it('is symmetric around t=0.5', () => {
        const steps = 10;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const low = easeInOutQuad(t);
            const high = easeInOutQuad(1 - t);
            expect(low + high).toBeCloseTo(1, 10);
        }
    });
});
