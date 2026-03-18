import { describe, expect, it } from 'vitest';
import {
    extractSlashCommand,
    isNativeClaudeSlashCommand,
    shouldRouteViaPlatform,
    type ArtibotCommandRoute,
} from '../terminal-command-routing';

const artibotCommands: ArtibotCommandRoute[] = [
    { command: 'team', agent: 'orchestrator' },
    { command: 'plan', agent: 'planner' },
    { command: 'content', agent: 'content-marketer' },
];

describe('terminal-command-routing', () => {
    it('extracts slash commands from user input', () => {
        expect(extractSlashCommand('/team build this')).toBe('team');
        expect(extractSlashCommand(' /plan next step')).toBe('plan');
        expect(extractSlashCommand('hello')).toBeNull();
    });

    it('treats native Claude slash commands as raw terminal commands', () => {
        expect(isNativeClaudeSlashCommand('team')).toBe(true);
        expect(isNativeClaudeSlashCommand('review')).toBe(true);
        expect(isNativeClaudeSlashCommand('plan')).toBe(false);
    });

    it('routes non-native artibot slash commands via platform IPC', () => {
        expect(
            shouldRouteViaPlatform('/plan release scope', artibotCommands),
        ).toBe(true);
        expect(
            shouldRouteViaPlatform('/content write copy', artibotCommands),
        ).toBe(true);
    });

    it('keeps overlapping native commands on the raw CLI path', () => {
        expect(shouldRouteViaPlatform('/team status', artibotCommands)).toBe(
            false,
        );
        expect(
            shouldRouteViaPlatform('/review src/foo.ts', artibotCommands),
        ).toBe(false);
    });
});
