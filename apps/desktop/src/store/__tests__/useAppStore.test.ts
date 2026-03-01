import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../useAppStore';
import type { AiBuilderMessage, ProjectAsset } from '../useAppStore';
import { DEFAULT_PROJECT } from '../../types/project';
import type { ProjectData } from '../../types/project';

/**
 * Reset the Zustand store to its initial state before each test.
 * This ensures test isolation by clearing all accumulated state.
 */
function resetStore() {
    const { getState } = useAppStore;
    getState().resetAppSettings();
    getState().resetRunSettings();
    getState().resetGamification();
    getState().clearAiBuilderMessages();
    getState().resetProjectConfig();
    // Manually clear non-resettable slices
    useAppStore.setState({
        toasts: [],
        assets: [],
        highlightedAgentId: null,
        projectLoading: false,
        projectError: null,
    });
}

describe('useAppStore', () => {
    beforeEach(() => {
        resetStore();
    });

    // ── Toast Notifications ──

    describe('addToast / removeToast', () => {
        it('should add a toast and auto-generate an id', () => {
            const { addToast } = useAppStore.getState();
            addToast({ type: 'success', message: 'Saved!' });

            const { toasts } = useAppStore.getState();
            expect(toasts).toHaveLength(1);
            expect(toasts[0].type).toBe('success');
            expect(toasts[0].message).toBe('Saved!');
            expect(toasts[0].id).toBeDefined();
            expect(typeof toasts[0].id).toBe('string');
        });

        it('should add multiple toasts in order', () => {
            const { addToast } = useAppStore.getState();
            addToast({ type: 'info', message: 'First' });
            addToast({ type: 'error', message: 'Second' });

            const { toasts } = useAppStore.getState();
            expect(toasts).toHaveLength(2);
            expect(toasts[0].message).toBe('First');
            expect(toasts[1].message).toBe('Second');
        });

        it('should remove a toast by id', () => {
            const { addToast } = useAppStore.getState();
            addToast({ type: 'info', message: 'Will be removed' });
            addToast({ type: 'success', message: 'Will remain' });

            const toastId = useAppStore.getState().toasts[0].id;
            useAppStore.getState().removeToast(toastId);

            const { toasts } = useAppStore.getState();
            expect(toasts).toHaveLength(1);
            expect(toasts[0].message).toBe('Will remain');
        });

        it('should not throw when removing a non-existent toast id', () => {
            const { removeToast } = useAppStore.getState();
            expect(() => removeToast('non-existent-id')).not.toThrow();
        });

        it('should preserve optional duration field', () => {
            const { addToast } = useAppStore.getState();
            addToast({ type: 'info', message: 'Timed', duration: 3000 });

            const { toasts } = useAppStore.getState();
            expect(toasts[0].duration).toBe(3000);
        });
    });

    // ── App Settings ──

    describe('updateAppSettings / resetAppSettings', () => {
        it('should have correct default settings', () => {
            const { appSettings } = useAppStore.getState();
            expect(appSettings.projectDir).toBe('');
            expect(appSettings.language).toBe('ko');
            expect(appSettings.autoSaveInterval).toBe(30);
            expect(appSettings.notificationsEnabled).toBe(true);
        });

        it('should partially update app settings', () => {
            const { updateAppSettings } = useAppStore.getState();
            updateAppSettings({ language: 'en' });

            const { appSettings } = useAppStore.getState();
            expect(appSettings.language).toBe('en');
            // Other fields should remain unchanged
            expect(appSettings.projectDir).toBe('');
            expect(appSettings.autoSaveInterval).toBe(30);
        });

        it('should update multiple settings at once', () => {
            const { updateAppSettings } = useAppStore.getState();
            updateAppSettings({
                projectDir: '/home/user/project',
                notificationsEnabled: false,
            });

            const { appSettings } = useAppStore.getState();
            expect(appSettings.projectDir).toBe('/home/user/project');
            expect(appSettings.notificationsEnabled).toBe(false);
        });

        it('should reset settings to defaults', () => {
            const { updateAppSettings, resetAppSettings } = useAppStore.getState();
            updateAppSettings({ language: 'ja', autoSaveInterval: 60 });
            resetAppSettings();

            const { appSettings } = useAppStore.getState();
            expect(appSettings.language).toBe('ko');
            expect(appSettings.autoSaveInterval).toBe(30);
        });
    });

    // ── Run Settings ──

    describe('updateRunSettings / resetRunSettings', () => {
        it('should have correct default run settings', () => {
            const { runSettings } = useAppStore.getState();
            expect(runSettings.maxConcurrentAgents).toBe(5);
            expect(runSettings.logVerbosity).toBe('info');
            expect(runSettings.logAutoScroll).toBe(true);
            expect(runSettings.runTimeoutSeconds).toBe(300);
        });

        it('should partially update run settings', () => {
            const { updateRunSettings } = useAppStore.getState();
            updateRunSettings({ logVerbosity: 'debug' });

            const { runSettings } = useAppStore.getState();
            expect(runSettings.logVerbosity).toBe('debug');
            expect(runSettings.maxConcurrentAgents).toBe(5);
        });

        it('should reset run settings to defaults', () => {
            const { updateRunSettings, resetRunSettings } = useAppStore.getState();
            updateRunSettings({ maxConcurrentAgents: 10, logAutoScroll: false });
            resetRunSettings();

            const { runSettings } = useAppStore.getState();
            expect(runSettings.maxConcurrentAgents).toBe(5);
            expect(runSettings.logAutoScroll).toBe(true);
        });
    });

    // ── AI Builder Messages ──

    describe('addAiBuilderMessage / clearAiBuilderMessages', () => {
        it('should start with an empty messages array', () => {
            const { aiBuilderMessages } = useAppStore.getState();
            expect(aiBuilderMessages).toEqual([]);
        });

        it('should add a message', () => {
            const msg: AiBuilderMessage = {
                id: 'msg-1',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now(),
            };
            useAppStore.getState().addAiBuilderMessage(msg);

            const { aiBuilderMessages } = useAppStore.getState();
            expect(aiBuilderMessages).toHaveLength(1);
            expect(aiBuilderMessages[0]).toEqual(msg);
        });

        it('should add multiple messages in order', () => {
            const msg1: AiBuilderMessage = {
                id: 'msg-1',
                role: 'user',
                content: 'Hi',
                timestamp: 1000,
            };
            const msg2: AiBuilderMessage = {
                id: 'msg-2',
                role: 'assistant',
                content: 'Hello!',
                timestamp: 2000,
            };
            const { addAiBuilderMessage } = useAppStore.getState();
            addAiBuilderMessage(msg1);
            addAiBuilderMessage(msg2);

            const { aiBuilderMessages } = useAppStore.getState();
            expect(aiBuilderMessages).toHaveLength(2);
            expect(aiBuilderMessages[0].id).toBe('msg-1');
            expect(aiBuilderMessages[1].id).toBe('msg-2');
        });

        it('should clear all messages', () => {
            const msg: AiBuilderMessage = {
                id: 'msg-1',
                role: 'system',
                content: 'Init',
                timestamp: 1000,
            };
            useAppStore.getState().addAiBuilderMessage(msg);
            useAppStore.getState().clearAiBuilderMessages();

            const { aiBuilderMessages } = useAppStore.getState();
            expect(aiBuilderMessages).toEqual([]);
        });
    });

    // ── Highlighted Agent ──

    describe('setHighlightedAgentId', () => {
        it('should default to null', () => {
            const { highlightedAgentId } = useAppStore.getState();
            expect(highlightedAgentId).toBeNull();
        });

        it('should set an agent id', () => {
            useAppStore.getState().setHighlightedAgentId('a01');
            expect(useAppStore.getState().highlightedAgentId).toBe('a01');
        });

        it('should clear the highlighted agent by setting null', () => {
            useAppStore.getState().setHighlightedAgentId('a01');
            useAppStore.getState().setHighlightedAgentId(null);
            expect(useAppStore.getState().highlightedAgentId).toBeNull();
        });

        it('should replace the previously highlighted agent', () => {
            useAppStore.getState().setHighlightedAgentId('a01');
            useAppStore.getState().setHighlightedAgentId('a02');
            expect(useAppStore.getState().highlightedAgentId).toBe('a02');
        });
    });

    // ── Assets ──

    describe('addAsset / removeAsset / setAssets', () => {
        const asset1: ProjectAsset = {
            id: 'asset-1',
            name: 'logo.png',
            type: 'image',
            url: '/uploads/logo.png',
            size: 1024,
            createdAt: '2025-01-01T00:00:00Z',
        };

        const asset2: ProjectAsset = {
            id: 'asset-2',
            name: 'data.csv',
            type: 'data',
            url: '/uploads/data.csv',
            size: 2048,
            createdAt: '2025-01-02T00:00:00Z',
        };

        it('should start with an empty assets array', () => {
            const { assets } = useAppStore.getState();
            expect(assets).toEqual([]);
        });

        it('should add an asset', () => {
            useAppStore.getState().addAsset(asset1);

            const { assets } = useAppStore.getState();
            expect(assets).toHaveLength(1);
            expect(assets[0]).toEqual(asset1);
        });

        it('should add multiple assets', () => {
            useAppStore.getState().addAsset(asset1);
            useAppStore.getState().addAsset(asset2);

            const { assets } = useAppStore.getState();
            expect(assets).toHaveLength(2);
            expect(assets[0].id).toBe('asset-1');
            expect(assets[1].id).toBe('asset-2');
        });

        it('should remove an asset by id', () => {
            useAppStore.getState().addAsset(asset1);
            useAppStore.getState().addAsset(asset2);
            useAppStore.getState().removeAsset('asset-1');

            const { assets } = useAppStore.getState();
            expect(assets).toHaveLength(1);
            expect(assets[0].id).toBe('asset-2');
        });

        it('should not throw when removing a non-existent asset id', () => {
            useAppStore.getState().addAsset(asset1);
            expect(() => useAppStore.getState().removeAsset('non-existent')).not.toThrow();
            expect(useAppStore.getState().assets).toHaveLength(1);
        });

        it('should set the entire assets array', () => {
            useAppStore.getState().addAsset(asset1);
            useAppStore.getState().setAssets([asset2]);

            const { assets } = useAppStore.getState();
            expect(assets).toHaveLength(1);
            expect(assets[0]).toEqual(asset2);
        });

        it('should set assets to an empty array', () => {
            useAppStore.getState().addAsset(asset1);
            useAppStore.getState().setAssets([]);

            const { assets } = useAppStore.getState();
            expect(assets).toEqual([]);
        });
    });

    // ── Project Config ──

    describe('projectConfig / updateProjectConfig / resetProjectConfig', () => {
        it('should have DEFAULT_PROJECT as initial projectConfig', () => {
            const { projectConfig } = useAppStore.getState();
            expect(projectConfig.version).toBe('1.0.0');
            expect(projectConfig.meta.id).toBe('default-project');
            expect(projectConfig.meta.name).toBe('기본 오피스');
            expect(projectConfig.agents).toEqual([]);
            expect(projectConfig.recipes).toEqual([]);
        });

        it('should default projectLoading to false', () => {
            expect(useAppStore.getState().projectLoading).toBe(false);
        });

        it('should default projectError to null', () => {
            expect(useAppStore.getState().projectError).toBeNull();
        });

        it('should partially update project config with updateProjectConfig', () => {
            useAppStore.getState().updateProjectConfig({
                version: '2.0.0',
            });

            const { projectConfig } = useAppStore.getState();
            expect(projectConfig.version).toBe('2.0.0');
            // Other fields should remain unchanged
            expect(projectConfig.meta.id).toBe('default-project');
        });

        it('should update nested meta via spread', () => {
            const { projectConfig } = useAppStore.getState();
            useAppStore.getState().updateProjectConfig({
                meta: { ...projectConfig.meta, name: 'My Custom Office' },
            });

            const updated = useAppStore.getState().projectConfig;
            expect(updated.meta.name).toBe('My Custom Office');
            expect(updated.meta.id).toBe('default-project');
        });

        it('should update agents array', () => {
            const newAgents = [
                {
                    id: 'a01',
                    name: 'Sera',
                    role: 'Developer',
                    personality: 'Diligent',
                    sprite: '/sprites/sera.png',
                    skills: ['typescript', 'react'],
                },
            ];
            useAppStore.getState().updateProjectConfig({ agents: newAgents });

            const { projectConfig } = useAppStore.getState();
            expect(projectConfig.agents).toHaveLength(1);
            expect(projectConfig.agents[0].name).toBe('Sera');
        });

        it('should reset project config to defaults', () => {
            useAppStore.getState().updateProjectConfig({ version: '3.0.0' });
            useAppStore.getState().resetProjectConfig();

            const { projectConfig } = useAppStore.getState();
            expect(projectConfig.version).toBe('1.0.0');
            expect(projectConfig.meta.id).toBe('default-project');
        });

        it('should clear projectError on reset', () => {
            useAppStore.setState({ projectError: 'some error' });
            useAppStore.getState().resetProjectConfig();

            expect(useAppStore.getState().projectError).toBeNull();
        });
    });

    describe('loadProject', () => {
        it('should stay at defaults when no IPC is available', async () => {
            // No dogbaApi on window => loadProject exits early
            await useAppStore.getState().loadProject();

            expect(useAppStore.getState().projectLoading).toBe(false);
            expect(useAppStore.getState().projectConfig.meta.id).toBe('default-project');
        });

        it('should load project from IPC when available', async () => {
            const mockProject = {
                ...DEFAULT_PROJECT,
                version: '2.0.0',
                meta: { ...DEFAULT_PROJECT.meta, name: 'Loaded Project' },
            };

            (window as any).dogbaApi = {
                project: {
                    load: vi.fn().mockResolvedValueOnce({ success: true, data: mockProject }),
                    save: vi.fn(),
                    getDir: vi.fn(),
                    setDir: vi.fn(),
                },
            };

            await useAppStore.getState().loadProject();

            expect(useAppStore.getState().projectLoading).toBe(false);
            expect(useAppStore.getState().projectConfig.meta.name).toBe('Loaded Project');
            expect(useAppStore.getState().projectError).toBeNull();

            delete (window as any).dogbaApi;
        });
    });

    describe('saveProject', () => {
        it('should do nothing when no IPC is available', async () => {
            await useAppStore.getState().saveProject();
            // Should not throw or set error
        });

        it('should save project via IPC when available', async () => {
            useAppStore.getState().updateProjectConfig({ version: '5.0.0' });

            const saveFn = vi.fn().mockResolvedValueOnce({ success: true });
            (window as any).dogbaApi = {
                project: {
                    load: vi.fn(),
                    save: saveFn,
                    getDir: vi.fn(),
                    setDir: vi.fn(),
                },
            };

            await useAppStore.getState().saveProject();

            expect(saveFn).toHaveBeenCalled();
            const savedData = saveFn.mock.calls[0][0];
            expect(savedData.version).toBe('5.0.0');

            expect(useAppStore.getState().projectLoading).toBe(false);
            expect(useAppStore.getState().projectError).toBeNull();

            delete (window as any).dogbaApi;
        });

        it('should set projectError on save failure', async () => {
            (window as any).dogbaApi = {
                project: {
                    load: vi.fn(),
                    save: vi.fn().mockRejectedValueOnce(new Error('Save failed')),
                    getDir: vi.fn(),
                    setDir: vi.fn(),
                },
            };

            await useAppStore.getState().saveProject();

            expect(useAppStore.getState().projectLoading).toBe(false);
            expect(useAppStore.getState().projectError).toBe('Save failed');

            delete (window as any).dogbaApi;
        });
    });
});
