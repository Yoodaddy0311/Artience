import { describe, it, expect } from 'vitest';
import { getProviderCliCommand } from '../provider-command';

describe('getProviderCliCommand', () => {
    it('returns "codex" for codex provider', () => {
        expect(getProviderCliCommand('codex')).toBe('codex');
    });

    it('returns "gemini" for gemini provider', () => {
        expect(getProviderCliCommand('gemini')).toBe('gemini');
    });

    it('returns "claude" for claude provider', () => {
        expect(getProviderCliCommand('claude')).toBe('claude');
    });

    it('returns "claude" as default for unknown provider', () => {
        expect(getProviderCliCommand('openai')).toBe('claude');
        expect(getProviderCliCommand('gpt4')).toBe('claude');
    });

    it('returns "claude" for undefined provider', () => {
        expect(getProviderCliCommand(undefined)).toBe('claude');
    });

    it('returns "claude" for empty string', () => {
        expect(getProviderCliCommand('')).toBe('claude');
    });

    it('is case-insensitive', () => {
        expect(getProviderCliCommand('CODEX')).toBe('codex');
        expect(getProviderCliCommand('Gemini')).toBe('gemini');
        expect(getProviderCliCommand('CLAUDE')).toBe('claude');
    });

    it('trims whitespace', () => {
        expect(getProviderCliCommand('  codex  ')).toBe('codex');
        expect(getProviderCliCommand('  gemini  ')).toBe('gemini');
    });
});
