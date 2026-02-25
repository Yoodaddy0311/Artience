import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../useAppStore';
import type { AiBuilderMessage, ProjectAsset } from '../useAppStore';

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
    // Manually clear non-resettable slices
    useAppStore.setState({
        toasts: [],
        assets: [],
        highlightedAgentId: null,
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
            expect(appSettings.apiUrl).toBe('http://localhost:8000');
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
            expect(appSettings.apiUrl).toBe('http://localhost:8000');
            expect(appSettings.autoSaveInterval).toBe(30);
        });

        it('should update multiple settings at once', () => {
            const { updateAppSettings } = useAppStore.getState();
            updateAppSettings({
                apiUrl: 'https://api.example.com',
                notificationsEnabled: false,
            });

            const { appSettings } = useAppStore.getState();
            expect(appSettings.apiUrl).toBe('https://api.example.com');
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
});
