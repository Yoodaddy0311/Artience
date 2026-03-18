import { describe, it, expect } from 'vitest';
import {
    getAgentProfile,
    getAgentDisplayName,
    resolveAgentId,
} from '../agent-directory';

describe('getAgentProfile', () => {
    it('returns the raccoon agent profile', () => {
        const profile = getAgentProfile('raccoon');
        expect(profile).toBeDefined();
        expect(profile!.id).toBe('raccoon');
        expect(profile!.name).toBe('Dokba');
    });

    it('returns a DEFAULT_AGENTS profile by id', () => {
        const profile = getAgentProfile('a01');
        expect(profile).toBeDefined();
        expect(profile!.name).toBe('Sera');
    });

    it('returns undefined for unknown agent', () => {
        expect(getAgentProfile('nonexistent')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(getAgentProfile('')).toBeUndefined();
    });
});

describe('getAgentDisplayName', () => {
    it('returns display name for known agent', () => {
        expect(getAgentDisplayName('raccoon')).toBe('Dokba');
    });

    it('returns display name for DEFAULT_AGENTS agent', () => {
        expect(getAgentDisplayName('a01')).toBe('Sera');
        expect(getAgentDisplayName('a02')).toBe('Rio');
    });

    it('returns raw agentId as fallback for unknown agent', () => {
        expect(getAgentDisplayName('unknown-agent')).toBe('unknown-agent');
    });

    it('returns empty string when given empty string', () => {
        expect(getAgentDisplayName('')).toBe('');
    });
});

describe('resolveAgentId', () => {
    it('resolves "dokba" alias to raccoon', () => {
        expect(resolveAgentId('dokba')).toBe('raccoon');
    });

    it('resolves "cto" alias to raccoon', () => {
        expect(resolveAgentId('cto')).toBe('raccoon');
    });

    it('resolves "main" alias to raccoon', () => {
        expect(resolveAgentId('main')).toBe('raccoon');
    });

    it('resolves "raccoon" to raccoon', () => {
        expect(resolveAgentId('raccoon')).toBe('raccoon');
    });

    it('resolves agent by name (case-insensitive)', () => {
        expect(resolveAgentId('Sera')).toBe('a01');
        expect(resolveAgentId('sera')).toBe('a01');
    });

    it('resolves agent by id directly', () => {
        expect(resolveAgentId('a01')).toBe('a01');
        expect(resolveAgentId('a02')).toBe('a02');
    });

    it('strips @ prefix before resolving', () => {
        expect(resolveAgentId('@raccoon')).toBe('raccoon');
        expect(resolveAgentId('@@@dokba')).toBe('raccoon');
    });

    it('strips leading/trailing whitespace', () => {
        expect(resolveAgentId('  raccoon  ')).toBe('raccoon');
    });

    it('normalizes hyphens, underscores, and spaces', () => {
        // normalizeAgentToken removes [\s_-]+ → so "rac coon" becomes "raccoon"
        expect(resolveAgentId('rac coon')).toBe('raccoon');
    });

    it('returns undefined for null', () => {
        expect(resolveAgentId(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
        expect(resolveAgentId(undefined)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(resolveAgentId('')).toBeUndefined();
    });

    it('returns undefined for unresolvable value', () => {
        expect(resolveAgentId('nonexistent-agent')).toBeUndefined();
    });
});
