import { describe, it, expect } from 'vitest';

// Test messenger-bridge adapter registry and message handling logic
// (avoids Electron net / electron-store dependencies)

interface IncomingMessage {
    adapterId: string;
    channel: string;
    sender: string;
    content: string;
    timestamp: number;
}

interface AdapterInfo {
    id: string;
    name: string;
    connected: boolean;
}

// Re-implement adapter registry logic
class AdapterRegistryTest {
    private adapters = new Map<string, AdapterInfo>();

    register(info: AdapterInfo): void {
        this.adapters.set(info.id, info);
    }

    get(id: string): AdapterInfo | undefined {
        return this.adapters.get(id);
    }

    list(): AdapterInfo[] {
        return [...this.adapters.values()];
    }
}

describe('MessengerBridge adapter registry logic', () => {
    it('registers and retrieves adapters', () => {
        const reg = new AdapterRegistryTest();
        reg.register({ id: 'discord', name: 'Discord', connected: false });
        reg.register({ id: 'slack', name: 'Slack', connected: false });
        expect(reg.list()).toHaveLength(2);
        expect(reg.get('discord')?.name).toBe('Discord');
    });

    it('returns undefined for unknown adapter', () => {
        const reg = new AdapterRegistryTest();
        expect(reg.get('teams')).toBeUndefined();
    });

    it('lists adapters with connection status', () => {
        const reg = new AdapterRegistryTest();
        reg.register({ id: 'discord', name: 'Discord', connected: true });
        reg.register({ id: 'slack', name: 'Slack', connected: false });
        const connected = reg.list().filter((a) => a.connected);
        expect(connected).toHaveLength(1);
        expect(connected[0].id).toBe('discord');
    });

    it('overwrites adapter on re-register', () => {
        const reg = new AdapterRegistryTest();
        reg.register({ id: 'discord', name: 'Discord', connected: false });
        reg.register({ id: 'discord', name: 'Discord v2', connected: true });
        expect(reg.list()).toHaveLength(1);
        expect(reg.get('discord')?.name).toBe('Discord v2');
    });
});

// Test channel parsing (Discord channel string format)
function parseChannelList(channels: string): string[] {
    return channels
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
}

describe('MessengerBridge channel parsing', () => {
    it('parses comma-separated channels', () => {
        expect(parseChannelList('123,456,789')).toEqual(['123', '456', '789']);
    });

    it('trims whitespace', () => {
        expect(parseChannelList(' 123 , 456 ')).toEqual(['123', '456']);
    });

    it('filters empty entries', () => {
        expect(parseChannelList('123,,456,')).toEqual(['123', '456']);
    });

    it('handles single channel', () => {
        expect(parseChannelList('123')).toEqual(['123']);
    });

    it('handles empty string', () => {
        expect(parseChannelList('')).toEqual([]);
    });
});

// Test IncomingMessage structure
describe('IncomingMessage structure', () => {
    it('has all required fields', () => {
        const msg: IncomingMessage = {
            adapterId: 'discord',
            channel: '123',
            sender: 'user1',
            content: 'hello',
            timestamp: Date.now(),
        };
        expect(msg.adapterId).toBe('discord');
        expect(msg.content).toBe('hello');
        expect(msg.timestamp).toBeGreaterThan(0);
    });
});
