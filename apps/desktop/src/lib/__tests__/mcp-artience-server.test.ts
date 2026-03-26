import { describe, it, expect } from 'vitest';
import { TOOLS } from '../../../electron/mcp-artience-server';

describe('MCP Artience Server tool definitions', () => {
    it('defines exactly 6 tools', () => {
        expect(TOOLS).toHaveLength(6);
    });

    it('all tools have required fields', () => {
        for (const tool of TOOLS) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.inputSchema).toBeDefined();
            expect(tool.inputSchema.type).toBe('object');
            expect(tool.inputSchema.properties).toBeDefined();
        }
    });

    it('includes artience_notify tool', () => {
        const notify = TOOLS.find((t) => t.name === 'artience_notify');
        expect(notify).toBeDefined();
        expect(notify!.inputSchema.properties).toHaveProperty('message');
        expect(notify!.inputSchema.properties).toHaveProperty('type');
        expect(notify!.inputSchema.required).toContain('message');
    });

    it('includes artience_agent_status tool', () => {
        const status = TOOLS.find((t) => t.name === 'artience_agent_status');
        expect(status).toBeDefined();
        expect(status!.inputSchema.properties).toHaveProperty('agentId');
    });

    it('includes artience_send_mail tool', () => {
        const mail = TOOLS.find((t) => t.name === 'artience_send_mail');
        expect(mail).toBeDefined();
    });

    it('includes artience_project_info tool', () => {
        const info = TOOLS.find((t) => t.name === 'artience_project_info');
        expect(info).toBeDefined();
    });

    it('includes messenger tools', () => {
        const send = TOOLS.find((t) => t.name === 'artience_messenger_send');
        const receive = TOOLS.find(
            (t) => t.name === 'artience_messenger_receive',
        );
        expect(send).toBeDefined();
        expect(receive).toBeDefined();
    });

    it('notify type has correct enum values', () => {
        const notify = TOOLS.find((t) => t.name === 'artience_notify')!;
        const typeField = notify.inputSchema.properties.type;
        expect(typeField.enum).toEqual(['info', 'success', 'warning', 'error']);
    });

    it('all tool names start with artience_', () => {
        for (const tool of TOOLS) {
            expect(tool.name).toMatch(/^artience_/);
        }
    });

    it('no duplicate tool names', () => {
        const names = TOOLS.map((t) => t.name);
        expect(new Set(names).size).toBe(names.length);
    });
});
