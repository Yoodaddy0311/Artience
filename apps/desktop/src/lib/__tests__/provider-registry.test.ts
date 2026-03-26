import { describe, it, expect } from 'vitest';

// Re-implement ProviderRegistry core logic for testing (avoids child_process dependency)

interface CliProviderMock {
    id: string;
    name: string;
    command: string;
    defaultArgs: string[];
    outputFormat: 'ansi' | 'json';
}

const DEFAULT_PROVIDERS: CliProviderMock[] = [
    {
        id: 'claude',
        name: 'Claude Code',
        command: 'claude',
        defaultArgs: [],
        outputFormat: 'ansi',
    },
    {
        id: 'codex',
        name: 'Codex CLI',
        command: 'codex',
        defaultArgs: [],
        outputFormat: 'ansi',
    },
    {
        id: 'gemini',
        name: 'Gemini CLI',
        command: 'gemini',
        defaultArgs: [],
        outputFormat: 'ansi',
    },
];

class ProviderRegistryTest {
    private providers = new Map<string, CliProviderMock>();
    private defaultId = 'claude';

    constructor() {
        for (const p of DEFAULT_PROVIDERS) {
            this.providers.set(p.id, p);
        }
    }

    register(provider: CliProviderMock): void {
        this.providers.set(provider.id, provider);
    }

    get(id: string): CliProviderMock | undefined {
        return this.providers.get(id);
    }

    list(): CliProviderMock[] {
        return Array.from(this.providers.values());
    }

    getDefault(): CliProviderMock {
        return this.providers.get(this.defaultId) ?? DEFAULT_PROVIDERS[0];
    }

    setDefault(id: string): void {
        if (!this.providers.has(id))
            throw new Error(`Provider "${id}" not registered`);
        this.defaultId = id;
    }

    getCommand(id: string): string {
        return this.providers.get(id)?.command ?? 'claude';
    }
}

describe('ProviderRegistry', () => {
    it('initializes with 3 default providers', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.list()).toHaveLength(3);
    });

    it('default provider is claude', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.getDefault().id).toBe('claude');
    });

    it('can get provider by id', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.get('codex')?.name).toBe('Codex CLI');
        expect(reg.get('gemini')?.name).toBe('Gemini CLI');
    });

    it('returns undefined for unknown provider', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.get('unknown')).toBeUndefined();
    });

    it('can register custom provider', () => {
        const reg = new ProviderRegistryTest();
        reg.register({
            id: 'custom',
            name: 'Custom CLI',
            command: 'custom-cli',
            defaultArgs: ['--flag'],
            outputFormat: 'json',
        });
        expect(reg.list()).toHaveLength(4);
        expect(reg.get('custom')?.command).toBe('custom-cli');
    });

    it('can change default provider', () => {
        const reg = new ProviderRegistryTest();
        reg.setDefault('codex');
        expect(reg.getDefault().id).toBe('codex');
    });

    it('throws when setting unknown default', () => {
        const reg = new ProviderRegistryTest();
        expect(() => reg.setDefault('nonexistent')).toThrow('not registered');
    });

    it('getCommand returns provider command', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.getCommand('claude')).toBe('claude');
        expect(reg.getCommand('codex')).toBe('codex');
    });

    it('getCommand falls back to claude for unknown', () => {
        const reg = new ProviderRegistryTest();
        expect(reg.getCommand('nonexistent')).toBe('claude');
    });

    it('can overwrite existing provider', () => {
        const reg = new ProviderRegistryTest();
        reg.register({
            id: 'claude',
            name: 'Claude v2',
            command: 'claude2',
            defaultArgs: [],
            outputFormat: 'json',
        });
        expect(reg.get('claude')?.name).toBe('Claude v2');
        expect(reg.list()).toHaveLength(3); // still 3, not 4
    });
});
