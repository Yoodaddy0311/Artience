export function getProviderCliCommand(provider?: string): string {
    switch (provider?.trim().toLowerCase()) {
        case 'codex':
            return 'codex';
        case 'gemini':
            return 'gemini';
        case 'claude':
        default:
            return 'claude';
    }
}
