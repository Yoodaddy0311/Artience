import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectData, WorldObject } from '../types/project';
import { DEFAULT_PROJECT } from '../types/project';


// ── Toast Notifications ──

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

// ── App Settings ──

export type AppLanguage = 'ko' | 'en' | 'ja';

export interface AppSettings {
    projectDir: string;
    language: AppLanguage;
    autoSaveInterval: number;
    notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    projectDir: '',
    language: 'ko',
    autoSaveInterval: 30,
    notificationsEnabled: true,
};

// ── Gamification ──

export interface JobProficiency {
    jobId: string;
    level: number;
    xp: number;
    grade: string;
}

export interface GamificationState {
    level: number;
    levelTitle: string;
    levelProgress: number;
    pointsToNextLevel: number;
    totalPoints: number;
    coins: number;
    diamonds: number;
    conversations: number;
    responseRate: number;
    jobProficiencies: JobProficiency[];
    lastLevelUp: number | null;
}

const DEFAULT_GAMIFICATION: GamificationState = {
    level: 1,
    levelTitle: '입문자',
    levelProgress: 0,
    pointsToNextLevel: 1000,
    totalPoints: 0,
    coins: 0,
    diamonds: 0,
    conversations: 0,
    responseRate: 0,
    jobProficiencies: [],
    lastLevelUp: null,
};

// ── Assets ──

export interface ProjectAsset {
    id: string;
    name: string;
    type: 'image' | 'data' | 'other';
    url: string;
    size: number;
    createdAt: string;
}

// ── Run Settings ──

export type LogVerbosity = 'debug' | 'info' | 'warn' | 'error';

export interface RunSettings {
    maxConcurrentAgents: number;
    logVerbosity: LogVerbosity;
    logAutoScroll: boolean;
    runTimeoutSeconds: number;
}

const DEFAULT_RUN_SETTINGS: RunSettings = {
    maxConcurrentAgents: 5,
    logVerbosity: 'info',
    logAutoScroll: true,
    runTimeoutSeconds: 300,
};

// ── Store Interface ──

interface AppState {
    // Auth Gate
    isAuthenticated: boolean | null; // null = checking, true/false = result
    authChecking: boolean;
    checkAuth: () => Promise<void>;
    loginAuth: () => Promise<void>;

    // Agent Highlight (P2-9)
    highlightedAgentId: string | null;
    setHighlightedAgentId: (id: string | null) => void;

    // Run Settings (P2-7)
    runSettings: RunSettings;
    updateRunSettings: (patch: Partial<RunSettings>) => void;
    resetRunSettings: () => void;


    // Toast Notifications
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;

    // App Settings
    appSettings: AppSettings;
    activeView: 'town' | 'studio';
    setActiveView: (view: 'town' | 'studio') => void;
    updateAppSettings: (settings: Partial<AppSettings>) => void;
    resetAppSettings: () => void;

    // Gamification
    gamification: GamificationState;
    updateGamification: (patch: Partial<GamificationState>) => void;
    resetGamification: () => void;
    addPoints: (points: number) => void;
    addCoins: (coins: number) => void;

    // Assets
    assets: ProjectAsset[];
    setAssets: (assets: ProjectAsset[]) => void;
    addAsset: (asset: ProjectAsset) => void;
    removeAsset: (id: string) => void;

    // Project Config
    projectConfig: ProjectData;
    projectLoading: boolean;
    projectError: string | null;
    loadProject: () => Promise<void>;
    saveProject: () => Promise<void>;
    updateProjectConfig: (patch: Partial<ProjectData>) => void;
    updateWorldObject: (id: string, x: number, y: number) => void;
    updateWorldObjectProperties: (id: string, properties: Record<string, unknown>) => void;
    updateWorldObjectCorners: (id: string, corners: { x: number; y: number }[] | undefined) => void;

    // Clipboard
    clipboard: WorldObject | null;
    setClipboard: (obj: WorldObject | null) => void;

    // Undo
    undoStack: ProjectData[];
    pushUndoState: () => void;
    undo: () => void;

    resetProjectConfig: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
            undoStack: [],
            clipboard: null,
            setClipboard: (obj) => set({ clipboard: obj }),

            pushUndoState: () => {
                const currentConfig = JSON.parse(JSON.stringify(get().projectConfig));
                set((state) => {
                    const newStack = [...state.undoStack, currentConfig];
                    // keep max 50 states
                    if (newStack.length > 50) newStack.shift();
                    return { undoStack: newStack };
                });
            },

            undo: () => {
                set((state) => {
                    if (state.undoStack.length === 0) return {};
                    const stack = [...state.undoStack];
                    const prevConfig = stack.pop();

                    // Immediately trigger save to filesystem so it persists
                    setTimeout(() => get().saveProject(), 0);

                    return {
                        undoStack: stack,
                        projectConfig: prevConfig,
                    };
                });
            },

            // ── Auth Gate ──
            isAuthenticated: null,
            authChecking: false,
            checkAuth: async () => {
                // Offline → skip auth gate
                if (!navigator.onLine) {
                    set({ isAuthenticated: true, authChecking: false });
                    return;
                }
                set({ authChecking: true });
                try {
                    const api = window.dogbaApi?.cli;
                    if (!api) {
                        console.warn('[checkAuth] dogbaApi.cli not available');
                        set({ isAuthenticated: false, authChecking: false });
                        return;
                    }
                    // 15-second timeout (claude auth status can be slow on first run)
                    const result = await Promise.race([
                        api.authStatus(),
                        new Promise<never>((_, reject) =>
                            setTimeout(
                                () => reject(new Error('timeout')),
                                15000,
                            ),
                        ),
                    ]);
                    console.log('[checkAuth] result:', JSON.stringify(result));
                    set({
                        isAuthenticated: result.authenticated,
                        authChecking: false,
                    });
                } catch (err) {
                    // Timeout or error → treat as unauthenticated
                    console.error('[checkAuth] error:', err);
                    set({ isAuthenticated: false, authChecking: false });
                }
            },
            loginAuth: async () => {
                try {
                    const api = window.dogbaApi?.cli;
                    if (!api) return;
                    await api.authLogin();
                    // Re-check after login attempt
                    get().checkAuth();
                } catch {
                    // ignore
                }
            },

            // ── Agent Highlight ──
            highlightedAgentId: null,
            setHighlightedAgentId: (id) => set({ highlightedAgentId: id }),

            // ── Run Settings ──
            runSettings: { ...DEFAULT_RUN_SETTINGS },
            updateRunSettings: (patch) =>
                set((state) => ({
                    runSettings: { ...state.runSettings, ...patch },
                })),
            resetRunSettings: () =>
                set({ runSettings: { ...DEFAULT_RUN_SETTINGS } }),


            // ── Toast Notifications ──
            toasts: [],

            addToast: (toast) =>
                set((state) => ({
                    toasts: [
                        ...state.toasts,
                        { ...toast, id: crypto.randomUUID() },
                    ],
                })),

            removeToast: (id) =>
                set((state) => ({
                    toasts: state.toasts.filter((t) => t.id !== id),
                })),

            // ── App Settings ──
            appSettings: { ...DEFAULT_SETTINGS },
            activeView: 'town',

            setActiveView: (view) => set({ activeView: view }),

            updateAppSettings: (settings) =>
                set((state) => ({
                    appSettings: { ...state.appSettings, ...settings },
                })),

            resetAppSettings: () =>
                set({ appSettings: { ...DEFAULT_SETTINGS } }),

            // ── Gamification ──
            gamification: { ...DEFAULT_GAMIFICATION },

            updateGamification: (patch) =>
                set((state) => ({
                    gamification: { ...state.gamification, ...patch },
                })),

            resetGamification: () =>
                set({ gamification: { ...DEFAULT_GAMIFICATION } }),

            addPoints: (points: number) =>
                set((state) => {
                    const g = state.gamification;
                    const newTotal = g.totalPoints + points;
                    let newProgress = g.levelProgress + points;
                    let newLevel = g.level;
                    let newPointsToNext = g.pointsToNextLevel;
                    let newTitle = g.levelTitle;
                    let lastLevelUp = g.lastLevelUp;

                    // Level up check
                    while (newProgress >= newPointsToNext && newLevel < 99) {
                        newProgress -= newPointsToNext;
                        newLevel++;
                        newPointsToNext = Math.floor(newPointsToNext * 1.3);
                        lastLevelUp = Date.now();
                        const titles: Record<number, string> = {
                            1: '입문자',
                            2: '학습자',
                            3: '수험생',
                            4: '우등생',
                            5: '전문가',
                            6: '마스터',
                            7: '그랜드마스터',
                            8: '레전드',
                            9: '챔피언',
                            10: '엘리트',
                        };
                        newTitle = titles[newLevel] || `Lv.${newLevel}`;
                    }

                    return {
                        gamification: {
                            ...g,
                            totalPoints: newTotal,
                            levelProgress: newProgress,
                            pointsToNextLevel: newPointsToNext,
                            level: newLevel,
                            levelTitle: newTitle,
                            lastLevelUp,
                        },
                    };
                }),

            addCoins: (coins: number) =>
                set((state) => ({
                    gamification: {
                        ...state.gamification,
                        coins: state.gamification.coins + coins,
                    },
                })),

            // ── Assets ──
            assets: [],

            setAssets: (assets) => set({ assets }),

            addAsset: (asset) =>
                set((state) => ({
                    assets: [...state.assets, asset],
                })),

            removeAsset: (id) =>
                set((state) => ({
                    assets: state.assets.filter((a) => a.id !== id),
                })),

            // ── Project Config ──
            projectConfig: { ...DEFAULT_PROJECT },
            projectLoading: false,
            projectError: null,

            loadProject: async () => {
                const api = window.dogbaApi?.project;
                if (!api) {
                    set({ projectLoading: false });
                    return;
                }
                set({ projectLoading: true, projectError: null });
                try {
                    const result = await api.load();
                    if (result.success && result.data) {
                        // Hotfix: Inject default objects if empty (for legacy saves)
                        if (!result.data.world.layers.objects || result.data.world.layers.objects.length === 0) {
                            result.data.world.layers.objects = DEFAULT_PROJECT.world.layers.objects;
                        }

                        set({
                            projectConfig: result.data,
                            projectLoading: false,
                        });
                    } else {
                        set({
                            projectConfig: { ...DEFAULT_PROJECT },
                            projectLoading: false,
                        });
                    }
                } catch (err) {
                    set({
                        projectLoading: false,
                        projectError:
                            err instanceof Error
                                ? err.message
                                : 'Failed to load project',
                    });
                }
            },

            saveProject: async () => {
                const api = window.dogbaApi?.project;
                if (!api) return;
                set({ projectLoading: true, projectError: null });
                try {
                    const config = get().projectConfig;
                    const result = await api.save(config);
                    if (!result.success)
                        throw new Error(result.error || 'Failed to save');
                    set({ projectLoading: false });
                } catch (err) {
                    set({
                        projectLoading: false,
                        projectError:
                            err instanceof Error
                                ? err.message
                                : 'Failed to save project',
                    });
                }
            },

            updateProjectConfig: (patch) => {
                get().pushUndoState();
                set((state) => ({
                    projectConfig: { ...state.projectConfig, ...patch },
                }));
            },

            updateWorldObject: (id, x, y) => {
                get().pushUndoState();
                set((state) => {
                    const layers = state.projectConfig.world.layers;
                    const objects = layers.objects.map((obj) =>
                        obj.id === id ? { ...obj, x, y } : obj
                    );
                    return {
                        projectConfig: {
                            ...state.projectConfig,
                            world: {
                                ...state.projectConfig.world,
                                layers: { ...layers, objects },
                            },
                        },
                    };
                });
            },

            updateWorldObjectProperties: (id, properties) => {
                get().pushUndoState();
                set((state) => {
                    const layers = state.projectConfig.world.layers;
                    const objects = layers.objects.map((obj) =>
                        obj.id === id
                            ? { ...obj, properties: { ...obj.properties, ...properties } }
                            : obj
                    );
                    return {
                        projectConfig: {
                            ...state.projectConfig,
                            world: {
                                ...state.projectConfig.world,
                                layers: { ...layers, objects },
                            },
                        },
                    };
                });
            },

            updateWorldObjectCorners: (id, corners) => {
                get().pushUndoState();
                set((state) => {
                    const layers = state.projectConfig.world.layers;
                    const objects = layers.objects.map((obj) =>
                        obj.id === id
                            ? { ...obj, properties: { ...obj.properties, corners } }
                            : obj
                    );
                    return {
                        projectConfig: {
                            ...state.projectConfig,
                            world: {
                                ...state.projectConfig.world,
                                layers: { ...layers, objects },
                            },
                        },
                    };
                });
            },

            resetProjectConfig: () =>
                set({
                    projectConfig: { ...DEFAULT_PROJECT },
                    projectError: null,
                }),
        }),
        {
            name: 'dogba-app-store',
            partialize: (state) => ({
                appSettings: state.appSettings,
                gamification: state.gamification,
                projectConfig: state.projectConfig,
            }),
            onRehydrateStorage: () => (state) => {
                // Inject default building objects if persisted state has none
                if (state && state.projectConfig) {
                    const objects = state.projectConfig.world?.layers?.objects;
                    if (!objects || objects.length === 0) {
                        state.projectConfig.world.layers.objects =
                            DEFAULT_PROJECT.world.layers.objects;
                    }
                }
            },
        },
    ),
);
