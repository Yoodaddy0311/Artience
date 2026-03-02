import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectData } from '../types/project';
import { DEFAULT_PROJECT } from '../types/project';

// ── AI Builder Messages ──

export interface AiBuilderMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

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
    isAuthenticated: boolean | null;  // null = checking, true/false = result
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

    // AI Builder Messages
    aiBuilderMessages: AiBuilderMessage[];
    addAiBuilderMessage: (message: AiBuilderMessage) => void;
    clearAiBuilderMessages: () => void;

    // Toast Notifications
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;

    // App Settings
    appSettings: AppSettings;
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
    resetProjectConfig: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set, get) => ({
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
                        set({ isAuthenticated: false, authChecking: false });
                        return;
                    }
                    // 3-second timeout
                    const result = await Promise.race([
                        api.authStatus(),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error('timeout')), 3000),
                        ),
                    ]);
                    set({ isAuthenticated: result.authenticated, authChecking: false });
                } catch {
                    // Timeout or error → treat as unauthenticated
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

            // ── AI Builder Messages ──
            aiBuilderMessages: [],

            addAiBuilderMessage: (message) =>
                set((state) => ({
                    aiBuilderMessages: [...state.aiBuilderMessages, message],
                })),

            clearAiBuilderMessages: () =>
                set({ aiBuilderMessages: [] }),

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
                            1: '입문자', 2: '학습자', 3: '수험생', 4: '우등생', 5: '전문가',
                            6: '마스터', 7: '그랜드마스터', 8: '레전드', 9: '챔피언', 10: '엘리트',
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
                        set({ projectConfig: result.data, projectLoading: false });
                    } else {
                        set({ projectConfig: { ...DEFAULT_PROJECT }, projectLoading: false });
                    }
                } catch (err) {
                    set({
                        projectLoading: false,
                        projectError: err instanceof Error ? err.message : 'Failed to load project',
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
                    if (!result.success) throw new Error(result.error || 'Failed to save');
                    set({ projectLoading: false });
                } catch (err) {
                    set({
                        projectLoading: false,
                        projectError: err instanceof Error ? err.message : 'Failed to save project',
                    });
                }
            },

            updateProjectConfig: (patch) =>
                set((state) => ({
                    projectConfig: { ...state.projectConfig, ...patch },
                })),

            resetProjectConfig: () =>
                set({ projectConfig: { ...DEFAULT_PROJECT }, projectError: null }),
        }),
        {
            name: 'dogba-app-store',
            partialize: (state) => ({
                aiBuilderMessages: state.aiBuilderMessages,
                appSettings: state.appSettings,
                gamification: state.gamification,
                projectConfig: state.projectConfig,
            }),
        },
    ),
);
