import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureAgentTerminalTab } from '../agent-session';

// Mock dependencies
vi.mock('../agent-directory', () => ({
    getAgentProfile: vi.fn(),
}));

vi.mock('../provider-command', () => ({
    getProviderCliCommand: vi.fn(() => 'claude'),
}));

vi.mock('../../store/useAppStore', () => ({
    useAppStore: {
        getState: vi.fn(() => ({
            appSettings: { projectDir: '/mock/project' },
        })),
    },
}));

const mockTerminalState = {
    tabs: [] as Array<{ id: string; agentId: string; cwd?: string }>,
    activeTabId: 'tab-1',
    characterDirMap: {} as Record<string, string>,
    agentSettings: {} as Record<string, { provider?: string }>,
    setActiveTab: vi.fn(),
    setPanelVisible: vi.fn(),
    addDockAgent: vi.fn(),
    initAgentState: vi.fn(),
    setCharacterDir: vi.fn(),
    addTab: vi.fn(),
};

vi.mock('../../store/useTerminalStore', () => ({
    useTerminalStore: {
        getState: vi.fn(() => mockTerminalState),
    },
}));

// Import after mocks
import { getAgentProfile } from '../agent-directory';

const mockedGetAgentProfile = vi.mocked(getAgentProfile);

describe('ensureAgentTerminalTab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockTerminalState.tabs = [];
        mockTerminalState.characterDirMap = {};
        mockTerminalState.agentSettings = {};

        // Reset window.dogbaApi
        (globalThis as Record<string, unknown>).window = {
            dogbaApi: {
                terminal: {
                    create: vi.fn(async () => ({
                        id: 'new-tab-id',
                        cwd: '/mock/project',
                    })),
                },
                project: {
                    selectDir: vi.fn(async () => '/selected/dir'),
                },
            },
        };
    });

    it('returns null when agent profile is not found', async () => {
        mockedGetAgentProfile.mockReturnValue(undefined);
        const result = await ensureAgentTerminalTab('unknown');
        expect(result).toBeNull();
    });

    it('returns null when terminal API is not available', async () => {
        mockedGetAgentProfile.mockReturnValue({
            id: 'raccoon',
            name: 'Dokba',
            role: 'AI',
            sprite: '/test.png',
            state: 'IDLE',
            currentJobId: null,
            home: { x: 0, y: 0 },
            pos: { x: 0, y: 0 },
        });
        (globalThis as Record<string, unknown>).window = {
            dogbaApi: undefined,
        };

        const result = await ensureAgentTerminalTab('raccoon');
        expect(result).toBeNull();
    });

    it('returns existing tab when agent already has one', async () => {
        const existingTab = {
            id: 'existing-tab',
            agentId: 'raccoon',
            agentName: 'Dokba',
            label: 'Dokba',
            cwd: '/test',
            status: 'connected' as const,
        };
        mockTerminalState.tabs = [existingTab];

        mockedGetAgentProfile.mockReturnValue({
            id: 'raccoon',
            name: 'Dokba',
            role: 'AI',
            sprite: '/test.png',
            state: 'IDLE',
            currentJobId: null,
            home: { x: 0, y: 0 },
            pos: { x: 0, y: 0 },
        });

        const result = await ensureAgentTerminalTab('raccoon');
        expect(result).toBe(existingTab);
        expect(mockTerminalState.setActiveTab).toHaveBeenCalledWith(
            'existing-tab',
        );
        expect(mockTerminalState.setPanelVisible).toHaveBeenCalledWith(true);
        expect(mockTerminalState.addDockAgent).toHaveBeenCalledWith('raccoon');
        expect(mockTerminalState.initAgentState).toHaveBeenCalledWith(
            'raccoon',
        );
    });

    it('creates a new tab when none exists for agent', async () => {
        mockedGetAgentProfile.mockReturnValue({
            id: 'raccoon',
            name: 'Dokba',
            role: 'AI',
            sprite: '/test.png',
            state: 'IDLE',
            currentJobId: null,
            home: { x: 0, y: 0 },
            pos: { x: 0, y: 0 },
        });
        mockTerminalState.characterDirMap = { raccoon: '/agent/dir' };

        const result = await ensureAgentTerminalTab('raccoon');
        expect(result).not.toBeNull();
        expect(result!.id).toBe('new-tab-id');
        expect(result!.agentId).toBe('raccoon');
        expect(result!.agentName).toBe('Dokba');
        expect(result!.status).toBe('connecting');
        expect(mockTerminalState.addTab).toHaveBeenCalled();
        expect(mockTerminalState.addDockAgent).toHaveBeenCalledWith('raccoon');
    });

    it('returns null when terminal create returns no id', async () => {
        mockedGetAgentProfile.mockReturnValue({
            id: 'raccoon',
            name: 'Dokba',
            role: 'AI',
            sprite: '/test.png',
            state: 'IDLE',
            currentJobId: null,
            home: { x: 0, y: 0 },
            pos: { x: 0, y: 0 },
        });

        const win = globalThis as Record<string, unknown>;
        (win.window as Record<string, unknown>) = {
            dogbaApi: {
                terminal: {
                    create: vi.fn(async () => null),
                },
                project: { selectDir: vi.fn() },
            },
        };

        const result = await ensureAgentTerminalTab('raccoon');
        expect(result).toBeNull();
    });
});
