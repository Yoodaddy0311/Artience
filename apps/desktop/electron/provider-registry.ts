import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface CliProvider {
    id: string;
    name: string;
    command: string;
    defaultArgs: string[];
    outputFormat: 'ansi' | 'json';
    authCheck: () => Promise<boolean>;
    isInstalled: () => Promise<boolean>;
}

function checkInstalled(command: string): () => Promise<boolean> {
    return async () => {
        const which = process.platform === 'win32' ? 'where' : 'which';
        try {
            await execFileAsync(which, [command]);
            return true;
        } catch {
            return false;
        }
    };
}

function checkAuth(command: string): () => Promise<boolean> {
    return async () => {
        try {
            await execFileAsync(command, ['--version']);
            return true;
        } catch {
            return false;
        }
    };
}

const DEFAULT_PROVIDERS: CliProvider[] = [
    {
        id: 'claude',
        name: 'Claude Code',
        command: 'claude',
        defaultArgs: [],
        outputFormat: 'ansi',
        authCheck: checkAuth('claude'),
        isInstalled: checkInstalled('claude'),
    },
    {
        id: 'codex',
        name: 'Codex CLI',
        command: 'codex',
        defaultArgs: [],
        outputFormat: 'ansi',
        authCheck: checkAuth('codex'),
        isInstalled: checkInstalled('codex'),
    },
    {
        id: 'gemini',
        name: 'Gemini CLI',
        command: 'gemini',
        defaultArgs: [],
        outputFormat: 'ansi',
        authCheck: checkAuth('gemini'),
        isInstalled: checkInstalled('gemini'),
    },
];

class ProviderRegistry {
    private providers = new Map<string, CliProvider>();
    private defaultId = 'claude';

    constructor() {
        for (const p of DEFAULT_PROVIDERS) {
            this.providers.set(p.id, p);
        }
    }

    register(provider: CliProvider): void {
        this.providers.set(provider.id, provider);
    }

    get(id: string): CliProvider | undefined {
        return this.providers.get(id);
    }

    list(): CliProvider[] {
        return Array.from(this.providers.values());
    }

    getDefault(): CliProvider {
        return this.providers.get(this.defaultId) ?? DEFAULT_PROVIDERS[0];
    }

    setDefault(id: string): void {
        if (!this.providers.has(id)) {
            throw new Error(`Provider "${id}" not registered`);
        }
        this.defaultId = id;
    }

    async checkAvailability(): Promise<CliProvider[]> {
        const results = await Promise.all(
            this.list().map(async (p) => ({
                provider: p,
                installed: await p.isInstalled(),
            })),
        );
        return results.filter((r) => r.installed).map((r) => r.provider);
    }

    getCommand(id: string): string {
        const provider = this.providers.get(id);
        return provider?.command ?? 'claude';
    }
}

export const providerRegistry = new ProviderRegistry();
