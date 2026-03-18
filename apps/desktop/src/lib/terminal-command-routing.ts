export interface ArtibotCommandRoute {
    command: string;
    agent: string;
}

const NATIVE_CLAUDE_SLASH_COMMANDS = new Set([
    'compact',
    'clear',
    'help',
    'bug',
    'memory',
    'review',
    'init',
    'config',
    'mcp',
    'cost',
    'vim',
    'doctor',
    'status',
    'terminal-setup',
    'login',
    'logout',
    'team',
]);

export function extractSlashCommand(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const firstToken = trimmed.split(/\s+/, 1)[0];
    const command = firstToken.slice(1).trim().toLowerCase();
    return command || null;
}

export function isNativeClaudeSlashCommand(command: string | null): boolean {
    if (!command) return false;
    return NATIVE_CLAUDE_SLASH_COMMANDS.has(command.toLowerCase());
}

export function shouldRouteViaPlatform(
    input: string,
    artibotCommands: ArtibotCommandRoute[],
): boolean {
    const slashCommand = extractSlashCommand(input);
    if (!slashCommand) return false;
    if (isNativeClaudeSlashCommand(slashCommand)) return false;

    return artibotCommands.some(
        (commandDef) => commandDef.command.toLowerCase() === slashCommand,
    );
}
