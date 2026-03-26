import {
    app,
    BrowserWindow,
    dialog,
    ipcMain,
    Tray,
    Menu,
    nativeImage,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ── EPIPE crash prevention (Windows node-pty pipe teardown) ──
// When a PTY process exits, stdout/stderr pipes may break, causing
// EPIPE on console.log which crashes the Electron main process.
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});
let fatalMainProcessRecoveryScheduled = false;

function scheduleFatalMainProcessRecovery(err: Error) {
    if (fatalMainProcessRecoveryScheduled) return;
    fatalMainProcessRecoveryScheduled = true;

    console.error('[Electron] Fatal main-process error:', err);

    const recover = () => {
        try {
            app.relaunch();
        } catch (relaunchError) {
            console.error(
                '[Electron] Failed to relaunch after fatal error:',
                relaunchError,
            );
        } finally {
            app.exit(1);
        }
    };

    if (app.isReady()) {
        dialog.showErrorBox(
            'Dokba Studio Restarting',
            `${err.name}: ${err.message}\n\nA fatal main-process error occurred. The app will restart to recover safely.`,
        );
        setTimeout(recover, 50);
        return;
    }

    setTimeout(recover, 0);
}

process.on('uncaughtException', (err) => {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED') return;
    scheduleFatalMainProcessRecovery(err);
});
process.on('unhandledRejection', (reason) => {
    console.error('[Electron] Unhandled rejection:', reason);
});
import * as os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as pty from 'node-pty';
import Store from 'electron-store';
import {
    agentManager,
    AGENT_PERSONAS,
    type StreamChunk,
} from './agent-manager';
import { getSkillProfile } from './skill-map';
import { ChatSessionManager } from './chat-session-manager';
import { ctoController } from './cto-controller';
import {
    parsePtyChunk,
    detectActivity,
    summarizeEvents,
    stripAnsi,
    isNoiseLine,
    type ParsedEvent,
    type AgentActivity,
} from '../src/lib/pty-parser';
import { worktreeManager } from './worktree-manager';
import { hooksManager } from './hooks-manager';
import { recommendAgents } from './agent-recommender';
import {
    parseDirective,
    type DirectiveType,
} from '../src/lib/directive-parser';
import { resolveAgentId } from '../src/lib/agent-directory';
import { providerRegistry } from './provider-registry';
import { reportGenerator } from './report-generator';
import { workflowPackManager } from './workflow-pack';
import { meetingManager } from './meeting-manager';
import { agentDB } from './agent-db';
import { agentMetrics } from './agent-metrics';
import { retroGenerator } from './retro-generator';
import { teamTemplateManager } from './team-template';
import { messengerBridge } from './messenger-bridge';
import { collectGitInfo } from './git-utils';
import { taskScheduler, type EnqueueInput } from './task-scheduler';
import { agentP2P, type P2PMessage } from './agent-p2p';
import {
    calculateFeedback,
    generateRecommendations,
    type FeedbackEvent,
    type FeedbackResult,
} from '../src/lib/feedback-loop';
import { createStartupMetricsTracker } from '../src/lib/startup-metrics';
import {
    registerMcpServer,
    MCP_BRIDGE_DIR,
    type McpBridge,
} from './mcp-artience-server';
import { createAuthStatusCache } from './auth-status-cache';
import { characterMemoryManager } from './character-memory';
import { characterGrowthManager } from './character-growth-manager';
import { affinityManager } from './affinity-manager';
import { jobRunner } from './job-runner';
import { heartbeatDaemon } from './heartbeat-daemon';

/** PTY noise patterns to filter from mail report bodies */
const REPORT_NOISE_RE =
    /(?:Percolating\.{3}|esc to interrupt|ctrl\+t to show tasks|\[\?2026[hl\]]|⎿|⏺|❯|\u276F)/gi;

/** Clean raw text for use in mail report body: strip ANSI, filter noise lines */
function cleanReportBody(raw: string): string {
    const stripped = stripAnsi(raw);
    return stripped
        .split('\n')
        .filter((line) => {
            const t = line.trim();
            if (!t) return false;
            if (isNoiseLine(t)) return false;
            if (REPORT_NOISE_RE.test(t)) return false;
            return true;
        })
        .join('\n')
        .trim();
}

// Dev 환경에서 Vite HMR을 위한 unsafe-eval 관련 보안 경고 무시
if (!app.isPackaged) {
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
}

const _isDev = process.env.NODE_ENV !== 'production';
import {
    loadSkills,
    installDefaultSkills,
    getAgentSkills,
    searchMarketplace,
    installSkillFromCatalog,
    uninstallSkill,
} from './skill-manager';
import {
    scanArtibotDir,
    watchArtibotDir,
    stopWatching,
    getRegistry,
} from './artibot-registry';

// Dev mode: disable ALL caches to prevent stale assets from previous builds
if (process.env.VITE_DEV_SERVER_URL) {
    app.commandLine.appendSwitch('disable-http-cache');
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
    app.commandLine.appendSwitch('js-flags', '--no-compilation-cache');
}

// ── Permission Mode Presets ─────────────────────────────────────────────────

const PERMISSION_MODE_PRESETS: Record<string, string> = {
    sera: 'plan',
    rio: 'acceptEdits',
    luna: 'acceptEdits',
    alex: 'default',
    ara: 'plan',
    miso: 'acceptEdits',
    hana: 'acceptEdits',
    duri: 'plan',
    bomi: 'acceptEdits',
    toto: 'default',
    nari: 'acceptEdits',
    ruru: 'acceptEdits',
    somi: 'default',
    choco: 'acceptEdits',
    maru: 'default',
    podo: 'plan',
    jelly: 'default',
    namu: 'plan',
    gomi: 'acceptEdits',
    ppuri: 'acceptEdits',
    dari: 'plan',
    kongbi: 'acceptEdits',
    baduk: 'default',
    tangi: 'default',
    moong: 'acceptEdits',
    dokba: 'default',
};

function getDefaultPermissionMode(agentLabel: string): string {
    return PERMISSION_MODE_PRESETS[agentLabel.toLowerCase()] || 'default';
}

const execFileAsync = promisify(execFile);
const shouldEmitVerboseRuntimeLogs = Boolean(process.env.VITE_DEV_SERVER_URL);
const POST_RENDER_INIT_DELAY_MS = 250;
const authStatusCache = createAuthStatusCache();
const startupMetrics = createStartupMetricsTracker();

function recordStartupMark(name: string, detail?: string, overwrite = false) {
    startupMetrics.mark(name, detail, overwrite);
}

recordStartupMark('main-module-loaded');

if (shouldEmitVerboseRuntimeLogs) {
    console.log('[Electron] BUILD_ID: 20260303-v8 (Hydration-Fix)');
}

let mainWindow: BrowserWindow;
let tray: Tray | null = null;

// ── ChatSessionManager (stream-json 기반 세션) ──────────────────────────────
const chatSessionManager = new ChatSessionManager();
ctoController.init(chatSessionManager);
meetingManager.init(chatSessionManager);

// ── Persistent store (electron-store) ──────────────────────────────────────

const store = new Store({
    name: 'dokba-settings',
    defaults: {
        projectData: null as Record<string, unknown> | null,
        jobSettings: {
            maxConcurrentAgents: 3,
            logVerbosity: 'normal',
            runTimeoutSeconds: 300,
        },
        jobHistory: [] as Array<{
            id: string;
            agent: string;
            task: string;
            status: string;
            startedAt: string;
            completedAt?: string;
            resultPreview?: string;
        }>,
        jobArtifacts: [] as Array<{
            name: string;
            path: string;
            type: string;
            jobId: string;
            ts: number;
        }>,
    },
});

// ── In-memory job tracking ──────────────────────────────────────────────────

interface JobRecord {
    id: string;
    status: string;
    agent: string;
    task: string;
    progress: number;
    startedAt: string;
    abortController?: AbortController;
}

const activeJobs = new Map<string, JobRecord>();
let jobIdCounter = 0;

// ── In-memory history tracking ──────────────────────────────────────────────

interface HistorySnapshot {
    id: string;
    message: string;
    timestamp: string;
    data?: string;
}

const historySnapshots: HistorySnapshot[] = [];

const DOGBA_DIR = path.join(os.homedir(), '.dogba');
const LOGS_DIR = path.join(DOGBA_DIR, 'logs');
if (!fs.existsSync(DOGBA_DIR)) fs.mkdirSync(DOGBA_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── Terminal process store (node-pty based for proper TTY support) ──────────

const terminals = new Map<string, pty.IPty>();
const terminalMeta = new Map<
    string,
    {
        cwd: string;
        label: string;
        agentId?: string;
    }
>();
let terminalIdCounter = 0;

// ── Per-tab PTY parser state (tee analysis) ─────────────────────────────────

interface TabParserState {
    lastActivity: AgentActivity;
    events: ParsedEvent[];
    /** Whether a work cycle has started (thinking/tool_use seen since last prompt) */
    workCycleActive: boolean;
    /** Incomplete line buffer — holds partial line from previous chunk */
    lineBuffer: string;
    /** Timer to flush lineBuffer when no newline arrives (ink TUI partial lines) */
    flushTimer: ReturnType<typeof setTimeout> | null;
    /** Last time any PTY output was observed for this tab */
    lastOutputAt: number;
    /** Heartbeat timer that downgrades stale active states back to idle */
    heartbeatTimer: ReturnType<typeof setTimeout> | null;
}

const tabParserState = new Map<string, TabParserState>();
const pendingTerminalOutput = new Map<string, string>();
const pendingTerminalOutputTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
>();
const pendingHistoryWrites = new Map<string, string>();
const pendingHistoryWriteTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
>();
const pendingParsedEventBatches = new Map<string, ParsedEvent[]>();
const pendingParsedEventTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
>();

function getOrCreateParserState(tabId: string): TabParserState {
    let state = tabParserState.get(tabId);
    if (!state) {
        state = {
            lastActivity: 'idle',
            events: [],
            workCycleActive: false,
            lineBuffer: '',
            flushTimer: null,
            lastOutputAt: Date.now(),
            heartbeatTimer: null,
        };
        tabParserState.set(tabId, state);
    }
    return state;
}

/** Flush timer delay for partial lines without newline (ms) */
const LINE_BUFFER_FLUSH_MS = 200;
const ACTIVITY_HEARTBEAT_MS = 12000;
const TERMINAL_OUTPUT_BATCH_MS = 16;
const HISTORY_WRITE_BATCH_MS = 120;
const PARSED_EVENT_BATCH_MS = 48;
const AUTO_COMMAND_DELAY_MS = 200;

function emitActivityChange(tabId: string, activity: AgentActivity): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
            'terminal:activity-change',
            tabId,
            activity,
        );
    }
}

function flushQueuedHistoryWrite(tabId: string): void {
    const timer = pendingHistoryWriteTimers.get(tabId);
    if (timer) {
        clearTimeout(timer);
        pendingHistoryWriteTimers.delete(tabId);
    }

    const buffered = pendingHistoryWrites.get(tabId);
    if (!buffered) return;
    pendingHistoryWrites.delete(tabId);

    const meta = terminalMeta.get(tabId);
    const agentLabel = meta?.label || tabId;
    const logFile = path.join(LOGS_DIR, `${agentLabel}_history.log`);

    fs.appendFile(logFile, buffered, (err) => {
        if (err) console.error(`Failed to write log for ${agentLabel}: `, err);
    });
}

function queueHistoryWrite(tabId: string, rawData: string): void {
    pendingHistoryWrites.set(
        tabId,
        (pendingHistoryWrites.get(tabId) || '') + rawData,
    );

    if (pendingHistoryWriteTimers.has(tabId)) {
        return;
    }

    const timer = setTimeout(() => {
        flushQueuedHistoryWrite(tabId);
    }, HISTORY_WRITE_BATCH_MS);
    pendingHistoryWriteTimers.set(tabId, timer);
}

function flushQueuedParsedEvents(tabId: string): void {
    const timer = pendingParsedEventTimers.get(tabId);
    if (timer) {
        clearTimeout(timer);
        pendingParsedEventTimers.delete(tabId);
    }

    const batch = pendingParsedEventBatches.get(tabId);
    if (!batch || batch.length === 0) return;
    pendingParsedEventBatches.delete(tabId);

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:parsed-events', tabId, batch);
    }
}

function queueParsedEvents(tabId: string, events: ParsedEvent[]): void {
    if (events.length === 0) return;

    const pending = pendingParsedEventBatches.get(tabId) || [];
    pending.push(...events);
    pendingParsedEventBatches.set(tabId, pending);

    if (pendingParsedEventTimers.has(tabId)) {
        return;
    }

    const timer = setTimeout(() => {
        flushQueuedParsedEvents(tabId);
    }, PARSED_EVENT_BATCH_MS);
    pendingParsedEventTimers.set(tabId, timer);
}

function flushQueuedTerminalOutput(tabId: string): void {
    const timer = pendingTerminalOutputTimers.get(tabId);
    if (timer) {
        clearTimeout(timer);
        pendingTerminalOutputTimers.delete(tabId);
    }

    const buffered = pendingTerminalOutput.get(tabId);
    if (!buffered) return;
    pendingTerminalOutput.delete(tabId);

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', tabId, buffered);
    }

    processPtyForParser(tabId, buffered);
}

function queueTerminalOutput(tabId: string, rawData: string): void {
    pendingTerminalOutput.set(
        tabId,
        (pendingTerminalOutput.get(tabId) || '') + rawData,
    );

    if (pendingTerminalOutputTimers.has(tabId)) {
        return;
    }

    const timer = setTimeout(() => {
        flushQueuedTerminalOutput(tabId);
    }, TERMINAL_OUTPUT_BATCH_MS);
    pendingTerminalOutputTimers.set(tabId, timer);
}

function flushAllTerminalBuffers(tabId: string): void {
    flushQueuedTerminalOutput(tabId);
    flushQueuedHistoryWrite(tabId);
    flushQueuedParsedEvents(tabId);
}

function scheduleActivityHeartbeat(tabId: string, state: TabParserState): void {
    if (state.heartbeatTimer !== null) {
        clearTimeout(state.heartbeatTimer);
    }

    state.heartbeatTimer = setTimeout(() => {
        state.heartbeatTimer = null;

        if (!terminals.has(tabId)) return;
        if (Date.now() - state.lastOutputAt < ACTIVITY_HEARTBEAT_MS) {
            scheduleActivityHeartbeat(tabId, state);
            return;
        }

        if (state.lineBuffer.length > 0) {
            const buffered = state.lineBuffer;
            state.lineBuffer = '';
            const parsed = parsePtyChunk(buffered);
            processParsedEvents(tabId, state, parsed);
            if (
                state.lastActivity !== 'idle' &&
                state.lastActivity !== 'needs_input'
            ) {
                scheduleActivityHeartbeat(tabId, state);
            }
            return;
        }

        if (
            ['thinking', 'working', 'reading', 'typing', 'writing'].includes(
                state.lastActivity,
            )
        ) {
            state.lastActivity = 'idle';
            emitActivityChange(tabId, 'idle');
        }
    }, ACTIVITY_HEARTBEAT_MS);
}

/**
 * Process parsed events: push to event buffer, send to renderer, detect activity changes.
 * Shared by both the normal parse path and the flush-timer path.
 */
function processParsedEvents(
    tabId: string,
    state: TabParserState,
    parsed: ParsedEvent[],
): void {
    if (parsed.length === 0) return;

    queueParsedEvents(tabId, parsed);

    for (const event of parsed) {
        // Cap event buffer at 200 to avoid unbounded growth
        if (state.events.length >= 200) {
            state.events = state.events.slice(-100);
        }
        state.events.push(event);

        // Track work cycle for mail trigger
        if (event.type === 'thinking' || event.type === 'tool_use') {
            state.workCycleActive = true;
        }
    }

    // Detect activity change
    const newActivity = detectActivity(state.events);
    if (newActivity !== state.lastActivity) {
        const prevActivity = state.lastActivity;
        state.lastActivity = newActivity;

        emitActivityChange(tabId, newActivity);

        // Mail trigger: work cycle completed (transition to success/idle after work)
        if (
            state.workCycleActive &&
            (newActivity === 'success' ||
                (newActivity === 'idle' && prevActivity !== 'idle'))
        ) {
            state.workCycleActive = false;
            const meta = terminalMeta.get(tabId);
            const agentLabel = meta?.label || tabId;
            const summary = summarizeEvents(state.events.slice(-50));

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mail:new-report', {
                    fromAgentId: agentLabel.toLowerCase(),
                    fromAgentName: agentLabel,
                    subject: '작업 완료 보고',
                    body: cleanReportBody(summary).slice(0, 500),
                    type: 'report' as const,
                    timestamp: Date.now(),
                });
            }

            // Clear event buffer after report
            state.events = [];
        }

        // Error mail trigger
        if (newActivity === 'error') {
            if (state.workCycleActive) {
                state.workCycleActive = false;
            }
            const meta = terminalMeta.get(tabId);
            const agentLabel = meta?.label || tabId;
            const errorEvents = state.events.filter((e) => e.type === 'error');
            const errorSummary = errorEvents
                .map((e) => e.content)
                .join('\n')
                .slice(0, 500);

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mail:new-report', {
                    fromAgentId: agentLabel.toLowerCase(),
                    fromAgentName: agentLabel,
                    subject: '작업 오류 발생',
                    body: errorSummary || '(unknown error)',
                    type: 'error' as const,
                    timestamp: Date.now(),
                });
            }

            state.events = [];
        }
    }
}

/**
 * Process PTY output through the parser (tee path — does NOT affect xterm rendering).
 * Sends parsed events and activity changes to the renderer.
 *
 * Handles chunk boundaries by buffering incomplete lines: if a chunk does not
 * end with a newline, the last partial line is held in `lineBuffer` and
 * prepended to the next chunk for that tab.
 *
 * A flush timer ensures that partial lines (e.g. ink TUI's ⏺ thinking marker
 * sent without a trailing newline) are still parsed after a short delay,
 * preventing activity detection from being blocked indefinitely.
 */
function processPtyForParser(tabId: string, rawData: string): void {
    queueHistoryWrite(tabId, rawData);

    const state = getOrCreateParserState(tabId);
    state.lastOutputAt = Date.now();
    scheduleActivityHeartbeat(tabId, state);

    // Clear any pending flush timer — new data arrived
    if (state.flushTimer !== null) {
        clearTimeout(state.flushTimer);
        state.flushTimer = null;
    }

    // Prepend any buffered partial line from previous chunk
    const data = state.lineBuffer + rawData;

    // If the chunk does not end with a newline, the last segment is incomplete
    let dataToParse: string;
    if (data.length > 0 && !data.endsWith('\n') && !data.endsWith('\r')) {
        const lastNewline = Math.max(
            data.lastIndexOf('\n'),
            data.lastIndexOf('\r'),
        );
        if (lastNewline === -1) {
            // Entire chunk is a partial line — buffer it, schedule flush
            state.lineBuffer = data;
            state.flushTimer = setTimeout(() => {
                state.flushTimer = null;
                if (state.lineBuffer.length === 0) return;
                const buffered = state.lineBuffer;
                state.lineBuffer = '';
                const parsed = parsePtyChunk(buffered);
                processParsedEvents(tabId, state, parsed);
            }, LINE_BUFFER_FLUSH_MS);
            return;
        }
        // Parse complete lines, buffer the trailing partial
        state.lineBuffer = data.slice(lastNewline + 1);
        dataToParse = data.slice(0, lastNewline + 1);

        // Schedule flush for remaining partial line in buffer
        if (state.lineBuffer.length > 0) {
            state.flushTimer = setTimeout(() => {
                state.flushTimer = null;
                if (state.lineBuffer.length === 0) return;
                const buffered = state.lineBuffer;
                state.lineBuffer = '';
                const parsed = parsePtyChunk(buffered);
                processParsedEvents(tabId, state, parsed);
            }, LINE_BUFFER_FLUSH_MS);
        }
    } else {
        state.lineBuffer = '';
        dataToParse = data;
    }

    const parsed = parsePtyChunk(dataToParse);
    processParsedEvents(tabId, state, parsed);
}

// ── Tray ──────────────────────────────────────────────────────────────────

function createTray(): void {
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip('Artience');
    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: 'Artience 열기',
                click: () => mainWindow?.show(),
            },
            { type: 'separator' },
            { label: '종료', click: () => app.quit() },
        ]),
    );
}

// ── Window ─────────────────────────────────────────────────────────────────

async function createWindow() {
    recordStartupMark('create-window-start');
    const preloadPath = path.join(__dirname, 'preload.js');

    if (shouldEmitVerboseRuntimeLogs) {
        console.log('[Electron] app.isPackaged:', app.isPackaged);
        console.log('[Electron] __dirname:', __dirname);
        console.log('[Electron] app.getAppPath():', app.getAppPath());
        console.log('[Electron] preload path:', preloadPath);
        console.log('[Electron] preload exists:', fs.existsSync(preloadPath));
    }

    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    recordStartupMark('browser-window-created');

    mainWindow.once('ready-to-show', () => {
        recordStartupMark('window-ready-to-show', undefined, true);
    });

    mainWindow.webContents.once('did-finish-load', () => {
        recordStartupMark('window-did-finish-load', undefined, true);
    });

    mainWindow.webContents.on(
        'preload-error',
        (_event: any, preloadPath: string, error: Error) => {
            console.error(
                '[Electron] PRELOAD ERROR in',
                preloadPath,
                ':',
                error.message,
            );
        },
    );

    mainWindow.webContents.on(
        'console-message',
        (
            _event: any,
            level: number,
            message: string,
            line: number,
            sourceId: string,
        ) => {
            const msg =
                typeof message === 'string' ? message : String(message ?? '');
            if (
                level >= 3 ||
                (shouldEmitVerboseRuntimeLogs &&
                    (msg.includes('[Preload]') ||
                        msg.includes('[ChatSend]') ||
                        msg.includes('[terminal')))
            ) {
                const tag = level >= 3 ? 'ERROR' : 'LOG';
                const src = sourceId && line ? ` [${sourceId}:${line}]` : '';
                console.log(`[Renderer ${tag}]${src} `, msg);
            }
        },
    );

    if (process.env.VITE_DEV_SERVER_URL) {
        // Purge Chromium HTTP cache to prevent stale JS from previous builds
        await mainWindow.webContents.session.clearCache();
        await mainWindow.webContents.session.clearStorageData({
            storages: ['serviceworkers', 'cachestorage'],
        });
        console.log('[Electron] Dev cache + storage purged');
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        recordStartupMark('window-load-requested', 'dev-server', true);
    } else {
        // __dirname = dist-electron/, Vite 출력 = ../dist/index.html
        const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
        if (shouldEmitVerboseRuntimeLogs) {
            console.log(
                '[Electron] Loading index.html from:',
                indexPath,
                '| exists:',
                fs.existsSync(indexPath),
            );
        }
        mainWindow.loadFile(indexPath);
        recordStartupMark('window-load-requested', 'dist-file', true);
    }

    if (
        process.env.VITE_DEV_SERVER_URL &&
        process.env.DOGBA_OPEN_DEVTOOLS === '1'
    ) {
        mainWindow.webContents.openDevTools();
    }

    if (shouldEmitVerboseRuntimeLogs) {
        mainWindow.webContents.on('did-finish-load', async () => {
            try {
                const result = await mainWindow.webContents.executeJavaScript(`
JSON.stringify({
    dogbaApi: typeof window.dogbaApi,
    keys: window.dogbaApi ? Object.keys(window.dogbaApi) : [],
    chatAvailable: !!window.dogbaApi?.chat?.send,
    terminalAvailable: !!window.dogbaApi?.terminal?.create,
    cliAvailable: !!window.dogbaApi?.cli?.authStatus,
    projectAvailable: !!window.dogbaApi?.project?.load,
})
                `);
                console.log('[Electron] window.dogbaApi check:', result);
            } catch (e: any) {
                console.error('[Electron] executeJavaScript error:', e.message);
            }
        });
    }
}

// ── Terminal IPC handlers (node-pty for full TTY support) ───────────────────

ipcMain.on('app:startup-mark', (_event, name: string, detail?: string) => {
    if (typeof name !== 'string' || name.length === 0) {
        return;
    }
    recordStartupMark(name, detail, true);
});

ipcMain.handle('app:get-startup-metrics', () => startupMetrics.snapshot());

ipcMain.handle(
    'terminal:create',
    (
        _event,
        cols: number,
        rows: number,
        options?: {
            cwd?: string;
            autoCommand?: string;
            shell?: string;
            label?: string;
            agentId?: string;
            agentSettings?: {
                model?: string;
                permissionMode?: string;
                maxTurns?: number;
            };
        },
    ) => {
        const id = `term-${++terminalIdCounter}`;
        const shell =
            options?.shell ||
            (process.platform === 'win32' ? 'powershell.exe' : 'bash');
        const cwd =
            options?.cwd || process.env.HOME || process.env.USERPROFILE || '.';
        const label = options?.label || id;
        const agentId = options?.agentId;

        const env = { ...process.env } as Record<string, string>;
        delete env.CLAUDECODE;
        delete env.CLAUDE_CODE_ENTRYPOINT;

        const proc = pty.spawn(shell, [], {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd,
            env,
        });

        terminals.set(id, proc);
        terminalMeta.set(id, { cwd, label, agentId });

        if (options?.autoCommand) {
            // Build the actual command with agent settings flags
            const defaultCmd = providerRegistry.getDefault().command;
            let cmd = options.autoCommand;
            const settings = options.agentSettings;
            if (settings && cmd === defaultCmd) {
                const flags: string[] = [];
                if (settings.model) flags.push(`--model ${settings.model}`);
                // Apply permission mode: explicit setting > preset > default
                const permMode =
                    settings.permissionMode &&
                    settings.permissionMode !== 'default'
                        ? settings.permissionMode
                        : getDefaultPermissionMode(label);
                if (permMode && permMode !== 'default') {
                    if (permMode === 'bypassPermissions') {
                        flags.push('--dangerously-skip-permissions');
                    } else {
                        flags.push(`--permission-mode ${permMode}`);
                    }
                }
                if (settings.maxTurns)
                    flags.push(`--max-turns ${settings.maxTurns}`);
                if (flags.length > 0) {
                    cmd = `${defaultCmd} ${flags.join(' ')} `;
                }
            }

            setTimeout(() => {
                proc.write(cmd + '\r');
            }, AUTO_COMMAND_DELAY_MS);
        }

        proc.onData((data: string) => {
            queueTerminalOutput(id, data);
        });

        proc.onExit(({ exitCode }) => {
            flushAllTerminalBuffers(id);
            terminals.delete(id);
            terminalMeta.delete(id);
            const parserState = tabParserState.get(id);
            if (
                parserState?.flushTimer !== null &&
                parserState?.flushTimer !== undefined
            ) {
                clearTimeout(parserState.flushTimer);
            }
            if (
                parserState?.heartbeatTimer !== null &&
                parserState?.heartbeatTimer !== undefined
            ) {
                clearTimeout(parserState.heartbeatTimer);
            }
            tabParserState.delete(id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('terminal:exit', id, exitCode ?? 1);
            }
        });

        return { id, label, cwd };
    },
);

ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    const pty = terminals.get(id);
    if (pty) {
        pty.write(data);
    } else {
        console.warn(
            '[terminal.write] No PTY found for id:',
            id,
            '| available:',
            [...terminals.keys()],
        );
    }
});

ipcMain.on(
    'terminal:resize',
    (_event, id: string, cols: number, rows: number) => {
        terminals.get(id)?.resize(cols, rows);
    },
);

ipcMain.on('terminal:destroy', (_event, id: string) => {
    const proc = terminals.get(id);
    if (proc) {
        flushAllTerminalBuffers(id);
        proc.kill();
        terminals.delete(id);
        terminalMeta.delete(id);
        const parserState = tabParserState.get(id);
        if (
            parserState?.flushTimer !== null &&
            parserState?.flushTimer !== undefined
        ) {
            clearTimeout(parserState.flushTimer);
        }
        if (
            parserState?.heartbeatTimer !== null &&
            parserState?.heartbeatTimer !== undefined
        ) {
            clearTimeout(parserState.heartbeatTimer);
        }
        tabParserState.delete(id);
    }
});

ipcMain.handle('terminal:list', () => {
    return Array.from(terminals.entries()).map(([id, proc]) => ({
        id,
        cwd: terminalMeta.get(id)?.cwd || '',
        label: terminalMeta.get(id)?.label || id,
        pid: proc.pid,
        agentId: terminalMeta.get(id)?.agentId,
        activity: tabParserState.get(id)?.lastActivity || 'idle',
        lastOutputAt: tabParserState.get(id)?.lastOutputAt,
    }));
});

ipcMain.handle('history:read', async (_event, agentId: string) => {
    const logFile = path.join(LOGS_DIR, `${agentId}_history.log`);
    try {
        if (fs.existsSync(logFile)) {
            // 최대 마지막 5MB만 읽기 등 제한을 둘 수 있으나, 일단 심플하게 전체/직접 읽기로 시작
            return fs.promises.readFile(logFile, 'utf-8');
        }
        return ''; // 파일이 없으면 빈 문자열 반환
    } catch (err) {
        console.error(`Error reading history for ${agentId}: `, err);
        return '';
    }
});

// ── Chat IPC (Agent Manager) ───────────────────────────────────────────────

// Helper: resolve agent display name from agentName key
function resolveAgentName(agentName: string): string {
    const persona = AGENT_PERSONAS[agentName.toLowerCase()];
    return persona ? `${agentName} (${persona.role})` : agentName;
}

// ── Chat activity dedup — skip consecutive identical activity events per agent ──
const _lastChatActivity = new Map<string, string>();

function emitChatActivity(agentId: string, activity: string): void {
    if (_lastChatActivity.get(agentId) === activity) return;
    _lastChatActivity.set(agentId, activity);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:agent-activity', agentId, activity);
    }
}

async function drainChat(
    agentName: string,
    gen: AsyncGenerator<StreamChunk>,
): Promise<{ success: boolean; text: string; sessionId?: string }> {
    let fullText = '';
    let sessionId: string | undefined;

    const agentId = agentName.toLowerCase();

    // Notify renderer that this agent started working
    emitChatActivity(agentId, 'thinking');

    try {
        for await (const chunk of gen) {
            sessionId = chunk.sessionId || sessionId;

            if (chunk.type === 'text') {
                fullText += chunk.content;
                emitChatActivity(agentId, 'typing');
                mainWindow?.webContents.send(
                    'chat:stream',
                    agentName,
                    chunk.content,
                );
            } else if (chunk.type === 'tool_use') {
                emitChatActivity(agentId, 'working');
                mainWindow?.webContents.send(
                    'chat:tool-use',
                    agentName,
                    chunk.content,
                );
            } else if (chunk.type === 'result') {
                fullText = chunk.content || fullText;
            } else if (chunk.type === 'error') {
                emitChatActivity(agentId, 'error');
                mainWindow?.webContents.send('chat:stream-end', agentName);
                mainWindow?.webContents.send('mail:new-report', {
                    fromAgentId: agentId,
                    fromAgentName: resolveAgentName(agentName),
                    subject: '작업 실패',
                    body: cleanReportBody(chunk.content).slice(0, 500),
                    type: 'error',
                    timestamp: Date.now(),
                });
                return { success: false, text: chunk.content };
            }
        }
    } catch (err: any) {
        emitChatActivity(agentId, 'error');
        mainWindow?.webContents.send('chat:stream-end', agentName);
        const errorMsg = err.message || 'Chat failed';
        mainWindow?.webContents.send('mail:new-report', {
            fromAgentId: agentId,
            fromAgentName: resolveAgentName(agentName),
            subject: '작업 실패',
            body: cleanReportBody(errorMsg).slice(0, 500),
            type: 'error',
            timestamp: Date.now(),
        });
        return { success: false, text: errorMsg };
    }

    emitChatActivity(agentId, 'success');
    mainWindow?.webContents.send('chat:stream-end', agentName);
    mainWindow?.webContents.send('mail:new-report', {
        fromAgentId: agentId,
        fromAgentName: resolveAgentName(agentName),
        subject: '작업 완료 보고',
        body: cleanReportBody(fullText).slice(0, 500),
        type: 'report',
        timestamp: Date.now(),
    });
    return { success: true, text: fullText, sessionId };
}

// Helper: resolve project directory from electron-store
function getProjectDir(): string {
    return (
        (store.get('projectData') as any)?.meta?.dir ||
        process.env.HOME ||
        process.env.USERPROFILE ||
        '.'
    );
}

// Legacy single-shot (kept for backward compat, now routed through Agent Manager)
ipcMain.handle(
    'chat:send',
    async (
        _event,
        agentName: string,
        userMessage: string,
        skillId?: string,
    ) => {
        try {
            const gen = agentManager.chat(
                agentName,
                userMessage,
                getProjectDir(),
                skillId,
            );
            return drainChat(agentName, gen);
        } catch (err: any) {
            return { success: false, text: err.message || 'chat:send failed' };
        }
    },
);

// Streaming chat
ipcMain.handle(
    'chat:send-stream',
    async (
        _event,
        agentName: string,
        userMessage: string,
        skillId?: string,
    ) => {
        console.log(
            '[Chat:send-stream] agentName:',
            agentName,
            '| message:',
            userMessage?.slice(0, 50),
            '| projectDir:',
            getProjectDir(),
        );
        try {
            const gen = agentManager.chat(
                agentName,
                userMessage,
                getProjectDir(),
                skillId,
            );
            return drainChat(agentName, gen);
        } catch (err: any) {
            console.error('[Chat:send-stream] CRITICAL ERROR:', err);
            return { success: false, text: err.message || 'Unknown error' };
        }
    },
);

// Get available skills for an agent
ipcMain.handle('chat:get-skills', (_event, agentName: string) => {
    const profile = getSkillProfile(agentName);
    if (!profile) return { skills: [] };
    return {
        skills: profile.skills.map((s) => ({
            id: s.id,
            label: s.label,
            description: s.description,
        })),
    };
});

// Close chat session (legacy Agent Manager + new ChatSessionManager)
ipcMain.handle('chat:close-session', (_e, agentName: string) => {
    agentManager.closeSession(agentName);
    chatSessionManager.closeSession(agentName);
    return { success: true };
});

// ── Chat Session IPC (ChatSessionManager — stream-json 기반) ────────────────

ipcMain.handle(
    'chat:create-session',
    async (
        _e,
        agentId: string,
        agentName: string,
        cwd: string,
        extraArgs?: string[],
    ) => {
        try {
            const sessionId = await chatSessionManager.createSession(
                agentId,
                agentName,
                cwd,
                extraArgs,
            );
            return { success: true, sessionId };
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Failed to create session',
            };
        }
    },
);

ipcMain.handle(
    'chat:send-message',
    async (_e, agentId: string, message: string) => {
        chatSessionManager.sendMessage(agentId, message);
        return { success: true };
    },
);

// ChatSessionManager → Renderer 이벤트 전송
chatSessionManager.on('stream', (agentId: string, event: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:stream-event', agentId, event);

        // Derive agent activity from stream event type (dedup via emitChatActivity)
        const evt = event as { type?: string };
        if (evt.type === 'text') {
            emitChatActivity(agentId, 'typing');
        } else if (evt.type === 'tool_use') {
            emitChatActivity(agentId, 'working');
        } else if (evt.type === 'thinking') {
            emitChatActivity(agentId, 'thinking');
        } else if (evt.type === 'error') {
            emitChatActivity(agentId, 'error');
        }
    }
});

chatSessionManager.on('session:closed', (agentId: string, code: number) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:session-closed', agentId, code);
        emitChatActivity(agentId, code === 0 ? 'idle' : 'error');
    }
});

chatSessionManager.on('response:end', (agentId: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:response-end', agentId);
        // Note: emitChatActivity('success') removed here to avoid duplicate events.
        // - drainChat path: emits success after the for-await loop completes (not here).
        // - ChatSessionManager path: the 'stream' handler emits success when it
        //   receives a 'result' type event, which fires before 'response:end'.
    }
});

// ── CLI Auth IPC ───────────────────────────────────────────────────────────

ipcMain.handle('cli:auth-status', async () => {
    return authStatusCache.get(async () => {
        try {
            const env = { ...process.env };
            delete env.CLAUDECODE;
            if (shouldEmitVerboseRuntimeLogs) {
                console.log('[cli.auth-status] Running claude auth status...');
            }
            const { stdout } = await execFileAsync(
                'claude',
                ['auth', 'status'],
                {
                    env,
                    timeout: 10000,
                    shell: true,
                },
            );
            let data: any;
            try {
                data = JSON.parse(stdout);
            } catch (parseErr: any) {
                console.error(
                    '[cli.auth-status] parse error:',
                    parseErr.message,
                    '| raw:',
                    stdout.slice(0, 200),
                );
                return { authenticated: false };
            }
            return { authenticated: !!data.loggedIn };
        } catch (err: any) {
            console.error('[cli.auth-status] ERROR:', err.message || err);
            return { authenticated: false };
        }
    });
});

ipcMain.handle('cli:auth-login', async () => {
    try {
        const env = { ...process.env };
        delete env.CLAUDECODE;
        authStatusCache.invalidate();

        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', 'cmd', '/k', 'claude auth login'], {
                env,
                detached: true,
                stdio: 'ignore',
            });
        } else if (process.platform === 'darwin') {
            spawn(
                'open',
                ['-a', 'Terminal', '--args', 'claude', 'auth', 'login'],
                { env, detached: true, stdio: 'ignore' },
            );
        } else {
            spawn('x-terminal-emulator', ['-e', 'claude', 'auth', 'login'], {
                env,
                detached: true,
                stdio: 'ignore',
            });
        }
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// ── Project Management IPC ─────────────────────────────────────────────────

ipcMain.handle('project:load', () => {
    try {
        const data = store.get('projectData');
        return { success: true, data: data || undefined };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('project:save', (_e, data: Record<string, unknown>) => {
    try {
        store.set('projectData', data);

        // Register MCP server when project is saved with a valid directory
        const dir = (data as any)?.meta?.dir;
        if (dir) {
            registerMcpServer(dir);

            // Initialize/refresh artibot registry for the project
            scanArtibotDir(dir);
            watchArtibotDir(dir, (registry) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(
                        'artibot:registry-updated',
                        registry,
                    );
                }
            });
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('project:selectDir', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Project Directory',
    });
    const selectedDir = result.filePaths[0] || null;

    // Auto-init hooks when a project directory is selected
    if (selectedDir) {
        try {
            const initResult = hooksManager.initProject(selectedDir);
            console.log(
                `[project.selectDir] Auto-init hooks: ${JSON.stringify(initResult)}`,
            );
        } catch (err: any) {
            console.warn('[project.selectDir] Hooks init failed:', err.message);
        }
    }

    return selectedDir;
});

// ── Worktree IPC ────────────────────────────────────────────────────────────

ipcMain.handle(
    'worktree:create',
    async (_e, agentId: string, projectDir?: string) => {
        const dir = projectDir || getProjectDir();
        return worktreeManager.createWorktree(agentId, dir);
    },
);

ipcMain.handle(
    'worktree:remove',
    async (_e, agentId: string, projectDir?: string) => {
        const dir = projectDir || getProjectDir();
        return worktreeManager.removeWorktree(agentId, dir);
    },
);

ipcMain.handle('worktree:list', async (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    const worktrees = await worktreeManager.listWorktrees(dir);
    return { worktrees };
});

// ── Mail IPC ─────────────────────────────────────────────────────────────────

ipcMain.handle(
    'mail:getGitDiff',
    async (
        _e,
        cwd?: string,
    ): Promise<{
        success: boolean;
        branch?: string;
        commitHash?: string;
        diffStats?: { file: string; additions: number; deletions: number }[];
        error?: string;
    }> => {
        const dir = cwd || getProjectDir();
        try {
            const info = await collectGitInfo(dir);
            return {
                success: true,
                branch: info.branch,
                commitHash: info.commitHash,
                diffStats: info.diffStats,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err.message || 'Failed to get git diff',
            };
        }
    },
);

// ── Hooks IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('hooks:setup', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return hooksManager.setupHooks(dir);
});

ipcMain.handle('hooks:generate-claude-md', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return hooksManager.generateClaudeMd(dir);
});

ipcMain.handle('hooks:init-project', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return hooksManager.initProject(dir);
});

// ── File Import / Export IPC ───────────────────────────────────────────────

ipcMain.handle('file:import', async () => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
        ],
    });
    if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'canceled' };
    }
    try {
        const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
        const data = JSON.parse(raw);
        return { success: true, data, filePath: result.filePaths[0] };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('file:export', async (_e, data: unknown) => {
    if (!mainWindow) return { success: false, error: 'No window' };
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) {
        return { success: false, error: 'canceled' };
    }
    try {
        fs.writeFileSync(
            result.filePath,
            JSON.stringify(data, null, 2),
            'utf-8',
        );
        return { success: true, filePath: result.filePath };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('file:read', async (_e, filePath: string) => {
    try {
        const projectDir = (store.get('projectData') as any)?.meta?.dir || '.';
        const resolvedPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(projectDir, filePath);
        if (!fs.existsSync(resolvedPath)) {
            return { success: false, error: 'File not found' };
        }
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        return { success: true, content };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle(
    'file:saveTempFile',
    async (_e, base64: string, filename: string) => {
        try {
            const sanitized = path
                .basename(filename)
                .replace(/[^a-zA-Z0-9._-]/g, '_');
            const dest = path.join(
                os.tmpdir(),
                `artience-${Date.now()}-${sanitized}`,
            );
            const data = base64.replace(/^data:[^;]+;base64,/, '');
            fs.writeFileSync(dest, Buffer.from(data, 'base64'));
            return { success: true, filePath: dest };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    },
);

// ── MCP Bridge (Artience MCP Server ↔ main process) ────────────────────────

// Ring buffer for incoming messenger messages (used by getMessengerMessages)
const MAX_MESSENGER_BUFFER = 100;
const messengerMessageBuffer: {
    sender: string;
    content: string;
    timestamp: number;
    adapterId: string;
}[] = [];

messengerBridge.on(
    'message:received',
    (msg: {
        adapterId: string;
        sender: string;
        content: string;
        timestamp: number;
    }) => {
        messengerMessageBuffer.push({
            sender: msg.sender,
            content: msg.content,
            timestamp: msg.timestamp,
            adapterId: msg.adapterId,
        });
        if (messengerMessageBuffer.length > MAX_MESSENGER_BUFFER) {
            messengerMessageBuffer.splice(
                0,
                messengerMessageBuffer.length - MAX_MESSENGER_BUFFER,
            );
        }
    },
);

const mcpBridge: McpBridge = {
    getAgentStatuses() {
        return Array.from(terminals.entries()).map(([id, proc]) => {
            const meta = terminalMeta.get(id);
            const parserState = tabParserState.get(id);
            return {
                id,
                label: meta?.label || id,
                activity: parserState?.lastActivity || 'idle',
                pid: proc.pid,
            };
        });
    },

    sendMail(
        from: string,
        _to: string,
        subject: string,
        body: string,
        type: 'report' | 'error',
    ) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mail:new-report', {
                fromAgentId: from,
                fromAgentName: from,
                subject,
                body: cleanReportBody(body).slice(0, 500),
                type,
                timestamp: Date.now(),
            });
        }
    },

    notify(message: string, type: string) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:toast', { message, type });
        }
    },

    getProjectInfo() {
        const projectDir = getProjectDir();
        const agents = Object.keys(AGENT_PERSONAS);
        const activeSessions = Array.from(terminals.keys()).map((id) => {
            const meta = terminalMeta.get(id);
            return meta?.label || id;
        });
        return { dir: projectDir, agents, activeSessions };
    },

    async sendMessengerMessage(
        adapter: string,
        channel: string,
        message: string,
    ) {
        return messengerBridge.send(adapter, channel, message);
    },

    async getMessengerMessages(adapter: string, limit?: number) {
        const count = limit ?? 10;
        const filtered = messengerMessageBuffer.filter(
            (m) => m.adapterId === adapter,
        );
        const messages = filtered.slice(-count).map((m) => ({
            sender: m.sender,
            content: m.content,
            timestamp: m.timestamp,
        }));
        return { messages };
    },
};

// ── MCP Bridge File Watcher (serves standalone MCP server requests) ─────────

let mcpBridgeWatcher: ReturnType<typeof setInterval> | null = null;

function startMcpBridgeWatcher(): void {
    if (mcpBridgeWatcher) return;

    // Ensure bridge directory exists
    if (!fs.existsSync(MCP_BRIDGE_DIR)) {
        fs.mkdirSync(MCP_BRIDGE_DIR, { recursive: true });
    }

    mcpBridgeWatcher = setInterval(async () => {
        try {
            const files = fs.readdirSync(MCP_BRIDGE_DIR);
            const reqFiles = files.filter((f) => f.endsWith('.req.json'));

            for (const reqFile of reqFiles) {
                const reqPath = path.join(MCP_BRIDGE_DIR, reqFile);
                const resPath = reqPath.replace('.req.json', '.res.json');

                try {
                    const raw = fs.readFileSync(reqPath, 'utf-8');
                    const request = JSON.parse(raw) as {
                        id: string;
                        method: string;
                        args: Record<string, unknown>;
                        timestamp: number;
                    };

                    // Skip stale requests (older than 10 seconds)
                    if (Date.now() - request.timestamp > 10000) {
                        try {
                            fs.unlinkSync(reqPath);
                        } catch {
                            /* ignore */
                        }
                        continue;
                    }

                    let result: unknown;
                    try {
                        switch (request.method) {
                            case 'getAgentStatuses':
                                result = mcpBridge.getAgentStatuses();
                                break;
                            case 'sendMail':
                                mcpBridge.sendMail(
                                    request.args.from as string,
                                    request.args.to as string,
                                    request.args.subject as string,
                                    request.args.body as string,
                                    request.args.type as 'report' | 'error',
                                );
                                result = { sent: true };
                                break;
                            case 'notify':
                                mcpBridge.notify(
                                    request.args.message as string,
                                    request.args.type as string,
                                );
                                result = { notified: true };
                                break;
                            case 'getProjectInfo':
                                result = mcpBridge.getProjectInfo();
                                break;
                            case 'sendMessengerMessage':
                                result = await mcpBridge.sendMessengerMessage(
                                    request.args.adapter as string,
                                    request.args.channel as string,
                                    request.args.message as string,
                                );
                                break;
                            case 'getMessengerMessages':
                                result = await mcpBridge.getMessengerMessages(
                                    request.args.adapter as string,
                                    request.args.limit as number | undefined,
                                );
                                break;
                            default:
                                result = null;
                        }
                        fs.writeFileSync(
                            resPath,
                            JSON.stringify({ id: request.id, result }),
                            'utf-8',
                        );
                    } catch (err: any) {
                        fs.writeFileSync(
                            resPath,
                            JSON.stringify({
                                id: request.id,
                                error: err.message,
                            }),
                            'utf-8',
                        );
                    }
                } catch {
                    // Couldn't read/parse request file — skip
                }
            }
        } catch {
            // Bridge dir not readable — skip this cycle
        }
    }, 1000); // Poll every 1s
}

function stopMcpBridgeWatcher(): void {
    if (mcpBridgeWatcher) {
        clearInterval(mcpBridgeWatcher);
        mcpBridgeWatcher = null;
    }
}

// ── Skill IPC ───────────────────────────────────────────────────────────────

ipcMain.handle('skill:list', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    try {
        const skills = loadSkills(dir);
        return { success: true, skills };
    } catch (err: any) {
        return { success: false, skills: [], error: err.message };
    }
});

ipcMain.handle('skill:install-defaults', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    try {
        const result = installDefaultSkills(dir);
        return { success: true, ...result };
    } catch (err: any) {
        return {
            success: false,
            installed: [],
            skipped: [],
            error: err.message,
        };
    }
});

ipcMain.handle(
    'skill:get-agent-skills',
    (_e, agentName: string, projectDir?: string) => {
        const dir = projectDir || getProjectDir();
        try {
            const skills = getAgentSkills(agentName, dir);
            return { success: true, skills };
        } catch (err: any) {
            return { success: false, skills: [], error: err.message };
        }
    },
);

// ── Skill Marketplace IPC ───────────────────────────────────────────────────

ipcMain.handle('skill:search', (_e, query: string) => {
    const dir = getProjectDir();
    try {
        const results = searchMarketplace(query, dir);
        return { success: true, skills: results };
    } catch (err: any) {
        return { success: false, skills: [], error: err.message };
    }
});

ipcMain.handle('skill:install', async (_e, skillId: string) => {
    const dir = getProjectDir();
    return installSkillFromCatalog(skillId, dir);
});

ipcMain.handle('skill:uninstall', (_e, skillId: string) => {
    const dir = getProjectDir();
    return uninstallSkill(skillId, dir);
});

// ── Workflow Pack IPC ──────────────────────────────────────────────────────

ipcMain.handle('workflow:list', () => {
    return { packs: workflowPackManager.list() };
});

ipcMain.handle('workflow:apply', (_e, packId: string) => {
    return workflowPackManager.apply(packId);
});

ipcMain.handle('workflow:detect', async (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    const packId = await workflowPackManager.detect(dir);
    return { packId };
});

// ── Team Template IPC ──────────────────────────────────────────────────────

ipcMain.handle('team-template:list', () => {
    return { templates: teamTemplateManager.listTemplates() };
});

ipcMain.handle('team-template:get', (_e, id: string) => {
    const template = teamTemplateManager.getTemplate(id);
    if (!template) return { error: `Template not found: ${id}` };
    return { template };
});

ipcMain.handle('team-template:suggest', (_e, description: string) => {
    const template = teamTemplateManager.suggestTemplate(description);
    return { template };
});

ipcMain.handle(
    'team-template:create',
    (_e, template: Omit<import('./team-template').TeamTemplate, 'id'>) => {
        const id = teamTemplateManager.createCustomTemplate(template);
        const created = teamTemplateManager.getTemplate(id);
        return { success: true, id, template: created };
    },
);

// ── Studio IPC (Agent Manager) ─────────────────────────────────────────────

ipcMain.handle(
    'studio:generate',
    async (_e, prompt: string, projectDir?: string) => {
        const dir =
            projectDir || (store.get('projectData') as any)?.meta?.dir || '.';
        const gen = agentManager.chat('luna', prompt, dir);

        let fullText = '';
        let sessionId: string | undefined;
        try {
            for await (const chunk of gen) {
                sessionId = chunk.sessionId || sessionId;
                if (chunk.type === 'text') {
                    fullText += chunk.content;
                    mainWindow?.webContents.send(
                        'studio:progress',
                        chunk.content,
                    );
                } else if (chunk.type === 'result') {
                    fullText = chunk.content || fullText;
                } else if (chunk.type === 'error') {
                    return {
                        success: false,
                        error: chunk.content,
                        result: '',
                        text: '',
                    };
                }
            }
        } catch (err: any) {
            return { success: false, error: err.message, result: '', text: '' };
        }

        // Save to history
        const snapId = `snap-${Date.now()}`;
        historySnapshots.unshift({
            id: snapId,
            message: prompt.slice(0, 100),
            timestamp: new Date().toISOString(),
            data: fullText,
        });
        if (historySnapshots.length > 50) historySnapshots.length = 50;

        return { success: true, result: fullText, text: fullText, sessionId };
    },
);

ipcMain.handle('studio:uploadAsset', async () => {
    if (!mainWindow) return { success: false, error: 'No window', copied: [] };
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            {
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
            },
        ],
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'canceled', copied: [] };
    }

    const isoDir = path.join(getProjectDir(), 'public', 'sprites', 'iso');
    if (!fs.existsSync(isoDir)) fs.mkdirSync(isoDir, { recursive: true });

    const copied: string[] = [];
    try {
        for (const filePath of result.filePaths) {
            const fileName = path.basename(filePath);
            const destPath = path.join(isoDir, fileName);
            fs.copyFileSync(filePath, destPath);
            copied.push(fileName);
        }
        return { success: true, copied };
    } catch (err: any) {
        return { success: false, error: err.message, copied };
    }
});

ipcMain.handle('studio:deleteAsset', async (_e, filename: string) => {
    try {
        const isoDir = path.join(getProjectDir(), 'public', 'sprites', 'iso');
        const filePath = path.join(isoDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('studio:getAssets', async () => {
    try {
        const isoDir = path.join(getProjectDir(), 'public', 'sprites', 'iso');
        if (!fs.existsSync(isoDir)) return { assets: [] };

        const files = fs.readdirSync(isoDir, { withFileTypes: true });
        const assets = files
            .filter((f) => f.isFile())
            .map((f) => {
                const filePath = path.join(isoDir, f.name);
                const stat = fs.statSync(filePath);
                const ext = path.extname(f.name).toLowerCase();
                const type = [
                    '.png',
                    '.jpg',
                    '.jpeg',
                    '.gif',
                    '.webp',
                    '.svg',
                ].includes(ext)
                    ? 'image'
                    : 'data';
                return {
                    name: f.name,
                    path: `/sprites/iso/${f.name}`,
                    type,
                    size: stat.size,
                };
            });
        return { assets };
    } catch {
        return { assets: [] };
    }
});

ipcMain.handle('studio:getHistory', () => {
    return {
        snapshots: historySnapshots.map((s) => ({
            id: s.id,
            message: s.message,
            timestamp: s.timestamp,
        })),
    };
});

ipcMain.handle('studio:getDiff', (_e, oldId: string, newId: string) => {
    const oldSnap = historySnapshots.find((s) => s.id === oldId);
    const newSnap = historySnapshots.find((s) => s.id === newId);
    if (!oldSnap || !newSnap) return { success: false, diff: '[]' };

    // Compute simple diff between snapshot data
    const changes: Array<{
        path: string;
        type: 'added' | 'removed' | 'modified';
        oldValue?: string;
        newValue?: string;
    }> = [];
    try {
        const oldData = oldSnap.data ? JSON.parse(oldSnap.data) : {};
        const newData = newSnap.data ? JSON.parse(newSnap.data) : {};
        // Shallow key diff
        const allKeys = new Set([
            ...Object.keys(oldData),
            ...Object.keys(newData),
        ]);
        for (const key of allKeys) {
            const oldVal = JSON.stringify(oldData[key]);
            const newVal = JSON.stringify(newData[key]);
            if (!(key in oldData)) {
                changes.push({
                    path: key,
                    type: 'added',
                    newValue: newVal?.slice(0, 100),
                });
            } else if (!(key in newData)) {
                changes.push({
                    path: key,
                    type: 'removed',
                    oldValue: oldVal?.slice(0, 100),
                });
            } else if (oldVal !== newVal) {
                changes.push({
                    path: key,
                    type: 'modified',
                    oldValue: oldVal?.slice(0, 100),
                    newValue: newVal?.slice(0, 100),
                });
            }
        }
    } catch {
        // Data wasn't JSON — compare as plain text
        if (oldSnap.data !== newSnap.data) {
            changes.push({
                path: 'content',
                type: 'modified',
                oldValue: oldSnap.data?.slice(0, 100),
                newValue: newSnap.data?.slice(0, 100),
            });
        }
    }

    return { success: true, diff: JSON.stringify({ changes, oldId, newId }) };
});

ipcMain.handle('studio:rollback', async (_e, snapshotId: string) => {
    const snap = historySnapshots.find((s) => s.id === snapshotId);
    if (!snap) return { success: false, error: 'Snapshot not found' };

    const projectDir = getProjectDir();
    try {
        // Save current state as a new snapshot before rollback
        const backupId = `snap-${Date.now()}`;
        historySnapshots.unshift({
            id: backupId,
            message: `[backup] before rollback to ${snap.message}`,
            timestamp: new Date().toISOString(),
            data: historySnapshots[0]?.data,
        });
        if (historySnapshots.length > 50) historySnapshots.length = 50;

        // If the snapshot has generated data, write it back to draft.json
        if (snap.data) {
            const draftDir = path.join(projectDir, 'generated');
            if (!fs.existsSync(draftDir)) {
                fs.mkdirSync(draftDir, { recursive: true });
            }
            fs.writeFileSync(
                path.join(draftDir, 'draft.json'),
                snap.data,
                'utf-8',
            );
        }

        // Attempt git stash as safety net
        try {
            await execFileAsync(
                'git',
                ['stash', 'push', '-m', `artience-rollback-${snapshotId}`],
                {
                    cwd: projectDir,
                    timeout: 10000,
                    shell: true,
                },
            );
        } catch {
            // git stash may fail if no git repo or no changes — that's fine
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// ── Job Run IPC (Agent Manager) ────────────────────────────────────────────

// Helper: save job to persistent history
function saveJobToHistory(record: JobRecord, resultPreview?: string): void {
    const history = (store.get('jobHistory') || []) as Array<
        Record<string, unknown>
    >;
    history.unshift({
        id: record.id,
        agent: record.agent,
        task: record.task,
        status: record.status,
        startedAt: record.startedAt,
        completedAt: new Date().toISOString(),
        resultPreview: resultPreview?.slice(0, 300),
    });
    // Cap at 100 entries
    if (history.length > 100) history.length = 100;
    store.set('jobHistory', history);
}

// Helper: save artifact reference
function saveJobArtifact(
    jobId: string,
    name: string,
    filePath: string,
    type: string,
): void {
    const artifacts = (store.get('jobArtifacts') || []) as Array<
        Record<string, unknown>
    >;
    artifacts.unshift({ name, path: filePath, type, jobId, ts: Date.now() });
    if (artifacts.length > 200) artifacts.length = 200;
    store.set('jobArtifacts', artifacts);
}

ipcMain.handle(
    'job:run',
    async (
        _e,
        agentNameOrRecipeId: string,
        taskOrAgentId: string,
        projectDir?: string,
    ) => {
        const dir =
            projectDir || (store.get('projectData') as any)?.meta?.dir || '.';
        const jobId = `job-${++jobIdCounter}`;

        const record: JobRecord = {
            id: jobId,
            status: 'running',
            agent: agentNameOrRecipeId,
            task: taskOrAgentId,
            progress: 0,
            startedAt: new Date().toISOString(),
        };
        activeJobs.set(jobId, record);

        const gen = agentManager.chat(agentNameOrRecipeId, taskOrAgentId, dir);

        let fullText = '';
        let sessionId: string | undefined;
        try {
            for await (const chunk of gen) {
                sessionId = chunk.sessionId || sessionId;
                if (chunk.type === 'text') {
                    fullText += chunk.content;
                    mainWindow?.webContents.send(
                        'job:progress',
                        agentNameOrRecipeId,
                        chunk.content,
                    );
                } else if (chunk.type === 'tool_use') {
                    mainWindow?.webContents.send(
                        'job:progress',
                        agentNameOrRecipeId,
                        `[tool] ${chunk.content} `,
                    );
                } else if (chunk.type === 'result') {
                    fullText = chunk.content || fullText;
                } else if (chunk.type === 'error') {
                    record.status = 'failed';
                    saveJobToHistory(record, chunk.content);
                    mainWindow?.webContents.send('mail:new-report', {
                        fromAgentId: agentNameOrRecipeId.toLowerCase(),
                        fromAgentName: resolveAgentName(agentNameOrRecipeId),
                        subject: `작업 실패(${jobId})`,
                        body: cleanReportBody(chunk.content).slice(0, 500),
                        type: 'error',
                        timestamp: Date.now(),
                    });
                    return { success: false, jobId, error: chunk.content };
                }
            }
        } catch (err: any) {
            record.status = 'failed';
            const errorMsg = err.message || 'Job failed';
            saveJobToHistory(record, errorMsg);
            mainWindow?.webContents.send('mail:new-report', {
                fromAgentId: agentNameOrRecipeId.toLowerCase(),
                fromAgentName: resolveAgentName(agentNameOrRecipeId),
                subject: `작업 실패(${jobId})`,
                body: cleanReportBody(errorMsg).slice(0, 500),
                type: 'error',
                timestamp: Date.now(),
            });
            return { success: false, jobId, error: err.message };
        }

        record.status = 'completed';
        record.progress = 100;
        saveJobToHistory(record, fullText);

        // Save result as artifact if substantial
        if (fullText.length > 50) {
            try {
                const artifactDir = path.join(
                    dir,
                    'generated',
                    'job-artifacts',
                );
                if (!fs.existsSync(artifactDir))
                    fs.mkdirSync(artifactDir, { recursive: true });
                const artifactPath = path.join(artifactDir, `${jobId}.txt`);
                fs.writeFileSync(artifactPath, fullText, 'utf-8');
                saveJobArtifact(
                    jobId,
                    `${agentNameOrRecipeId} -result.txt`,
                    artifactPath,
                    'text',
                );
            } catch {
                // Artifact save failed — not critical
            }
        }

        mainWindow?.webContents.send('mail:new-report', {
            fromAgentId: agentNameOrRecipeId.toLowerCase(),
            fromAgentName: resolveAgentName(agentNameOrRecipeId),
            subject: `작업 완료 보고(${jobId})`,
            body: cleanReportBody(fullText).slice(0, 500),
            type: 'report',
            timestamp: Date.now(),
        });
        return { success: true, jobId, text: fullText, sessionId };
    },
);

ipcMain.handle('job:stop', (_e, jobId: string) => {
    const record = activeJobs.get(jobId);
    if (record) {
        record.status = 'stopped';
        record.abortController?.abort();
        saveJobToHistory(record, 'Stopped by user');
    }
    return { success: true };
});

ipcMain.handle('job:getStatus', () => {
    const jobs = Array.from(activeJobs.values()).map((j) => ({
        id: j.id,
        status: j.status,
        agent: j.agent,
        progress: j.progress,
    }));
    return { jobs };
});

ipcMain.handle('job:getArtifacts', () => {
    const artifacts = (store.get('jobArtifacts') || []) as Array<{
        name: string;
        path: string;
        type: string;
        jobId: string;
        ts: number;
    }>;
    return { artifacts };
});

ipcMain.handle('job:getSettings', () => {
    const settings = store.get('jobSettings') as any;
    return {
        maxConcurrentAgents: settings?.maxConcurrentAgents ?? 3,
        logVerbosity: settings?.logVerbosity ?? 'normal',
        runTimeoutSeconds: settings?.runTimeoutSeconds ?? 300,
    };
});

ipcMain.handle('job:saveSettings', (_e, settings: Record<string, unknown>) => {
    store.set('jobSettings', settings);
    return { success: true };
});

ipcMain.handle('job:getHistory', () => {
    const history = (store.get('jobHistory') || []) as Array<{
        id: string;
        agent: string;
        task: string;
        status: string;
        startedAt: string;
        completedAt?: string;
        resultPreview?: string;
    }>;
    return { history };
});

// ── Agent Team IPC (CTO Controller) ─────────────────────────────────────────

ipcMain.handle(
    'agent:create-team',
    async (_e, cwd?: string, seedTask?: string, preferredAgents?: string[]) => {
        const dir = cwd || getProjectDir();
        return ctoController.createTeamSession(dir, seedTask, preferredAgents);
    },
);

ipcMain.handle(
    'agent:delegate-task',
    async (_e, agentName: string, task: string) => {
        return ctoController.delegateTask(agentName, task);
    },
);

// agent:task-result is emitted via chat:stream-event when CTO session
// produces subagent-related output. The renderer can detect subagent
// events from the stream event type/content.

ipcMain.handle('agent:recommend', async (_e, taskDescription: string) => {
    return recommendAgents(taskDescription);
});

// ── Task Queue IPC ──────────────────────────────────────────────────────────

ipcMain.handle('task-queue:enqueue', async (_e, input: EnqueueInput) => {
    const id = taskScheduler.enqueue(input);

    // Auto-dispatch: try to run immediately if under concurrency limit
    const dispatched = taskScheduler.dispatch();
    if (dispatched) {
        if (ctoController.isTeamActive()) {
            const agent = dispatched.assignedAgent ?? 'auto';
            const result = await ctoController.delegateTask(
                agent,
                dispatched.description,
            );
            if (!result.success) {
                taskScheduler.markFailed(dispatched.id, result.error);
            }
        } else {
            mainWindow?.webContents?.send('task-queue:dispatched', dispatched);
        }
    }

    return { success: true, taskId: id, dispatched: dispatched?.id === id };
});

ipcMain.handle('task-queue:list', () => {
    return {
        queued: taskScheduler.getQueue(),
        running: taskScheduler.getRunning(),
        completed: taskScheduler.getCompleted(),
    };
});

ipcMain.handle('task-queue:cancel', (_e, taskId: string) => {
    const cancelled = taskScheduler.cancel(taskId);
    return { success: cancelled };
});

ipcMain.handle('task-queue:dispatch', async () => {
    const task = taskScheduler.dispatch();
    if (!task) {
        return {
            success: false,
            error: 'No tasks to dispatch or at concurrency limit',
        };
    }

    if (ctoController.isTeamActive()) {
        const agent = task.assignedAgent ?? 'auto';
        const result = await ctoController.delegateTask(
            agent,
            task.description,
        );
        if (!result.success) {
            taskScheduler.markFailed(task.id, result.error);
            return { success: false, error: result.error };
        }
    } else {
        mainWindow?.webContents?.send('task-queue:dispatched', task);
    }

    return { success: true, task };
});

ipcMain.handle('task-queue:complete', (_e, taskId: string, result?: string) => {
    taskScheduler.markComplete(taskId, result);
    return { success: true };
});

ipcMain.handle('task-queue:fail', (_e, taskId: string, error?: string) => {
    taskScheduler.markFailed(taskId, error);
    return { success: true };
});

// ── Directive Routing IPC ───────────────────────────────────────────────────

ipcMain.handle(
    'directive:route',
    async (
        _e,
        input: string,
        _currentTabId: string,
    ): Promise<{
        success: boolean;
        type: DirectiveType;
        routedTo?: string;
        error?: string;
    }> => {
        const directive = parseDirective(input);

        if (directive.type === 'normal') {
            return { success: true, type: 'normal' };
        }

        if (directive.type === 'ceo') {
            const dir = getProjectDir();
            const teamResult = await ctoController.createTeamSession(
                dir,
                directive.content,
                directive.targetAgent ? [directive.targetAgent] : undefined,
            );
            if (!teamResult.success) {
                return {
                    success: false,
                    type: 'ceo',
                    error: teamResult.error,
                };
            }

            if (directive.targetAgent) {
                await ctoController.delegateTask(
                    directive.targetAgent,
                    directive.content,
                );
            } else {
                ctoController.sendMessage(directive.content);
            }

            return {
                success: true,
                type: 'ceo',
                routedTo: directive.targetAgent ?? 'dokba',
            };
        }

        // type === 'task'
        if (directive.targetAgent) {
            const routedAgentId =
                resolveAgentId(directive.targetAgent) || directive.targetAgent;
            return {
                success: true,
                type: 'task',
                routedTo: routedAgentId,
            };
        }

        // Auto-recommend best agent
        const recommendations = recommendAgents(directive.content, 1);
        if (recommendations.length === 0) {
            return {
                success: false,
                type: 'task',
                error: 'No suitable agent found for this task',
            };
        }

        const bestAgent = recommendations[0];
        return {
            success: true,
            type: 'task',
            routedTo: bestAgent.agentId,
        };
    },
);

// ── Meeting Manager IPC ─────────────────────────────────────────────────────

ipcMain.handle(
    'meeting:create',
    (_e, topic: string, participantIds: string[]) => {
        return meetingManager.createMeeting(topic, participantIds);
    },
);

ipcMain.handle('meeting:start', async (_e, meetingId: string) => {
    return meetingManager.startMeeting(meetingId);
});

ipcMain.handle('meeting:stop', (_e, meetingId: string) => {
    return meetingManager.stopMeeting(meetingId);
});

// MeetingManager → Renderer event forwarding
meetingManager.on('consensus:reached', (meetingId: string, round: unknown) => {
    mainWindow?.webContents?.send('meeting:round-update', meetingId, round);
});

meetingManager.on(
    'opinion:received',
    (meetingId: string, _opinion: unknown) => {
        // Forward individual opinions as partial round updates
        const meeting = meetingManager.getMeeting(meetingId);
        if (meeting && meeting.rounds.length > 0) {
            const currentRound = meeting.rounds[meeting.rounds.length - 1];
            mainWindow?.webContents?.send(
                'meeting:round-update',
                meetingId,
                currentRound,
            );
        }
    },
);

meetingManager.on('meeting:end', (meetingId: string, result: unknown) => {
    mainWindow?.webContents?.send('meeting:end', meetingId, result);
});

meetingManager.on('mail:report', (report: unknown) => {
    mainWindow?.webContents?.send('mail:new-report', report);
});

// ── Messenger Bridge IPC ─────────────────────────────────────────────────────

ipcMain.handle(
    'messenger:connect',
    async (_e, adapterId: string, config: Record<string, string>) => {
        return messengerBridge.connect(adapterId, config);
    },
);

ipcMain.handle('messenger:disconnect', async (_e, adapterId: string) => {
    return messengerBridge.disconnect(adapterId);
});

ipcMain.handle(
    'messenger:send',
    async (_e, adapterId: string, channel: string, message: string) => {
        return messengerBridge.send(adapterId, channel, message);
    },
);

ipcMain.handle('messenger:list', () => {
    return { adapters: messengerBridge.listAdapters() };
});

// MessengerBridge → Renderer forwarding handled in app.whenReady (with tray balloon)

// ── Provider Registry IPC ───────────────────────────────────────────────────

ipcMain.handle('provider:list', async () => {
    const all = providerRegistry.list();
    const available = await providerRegistry.checkAvailability();
    const availableIds = new Set(available.map((p) => p.id));
    return {
        providers: all.map((p) => ({
            id: p.id,
            name: p.name,
            command: p.command,
            installed: availableIds.has(p.id),
        })),
    };
});

ipcMain.handle('provider:check', async (_e, id: string) => {
    const provider = providerRegistry.get(id);
    if (!provider) return { installed: false, authenticated: false };
    const installed = await provider.isInstalled();
    const authenticated = installed ? await provider.authCheck() : false;
    return { installed, authenticated };
});

ipcMain.handle('provider:set-default', (_e, id: string) => {
    try {
        providerRegistry.setDefault(id);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// ── Artibot Registry IPC ────────────────────────────────────────────────────

ipcMain.handle('artibot:get-registry', () => {
    return getRegistry();
});

ipcMain.handle('artibot:rescan', (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return scanArtibotDir(dir);
});

ipcMain.handle(
    'artibot:execute-command',
    async (_e, command: string, args: string) => {
        const registry = getRegistry();
        if (!registry) return { success: false, error: 'Registry not loaded' };

        // Find command routing from artibot.config.json taskBased
        const cmdDef = registry.commands.find((c) => c.command === command);
        if (!cmdDef)
            return { success: false, error: `Unknown command: ${command} ` };

        console.log(
            `[artibot: execute - command] ${command} → agent: ${cmdDef.agent}, args: ${args} `,
        );

        // Route to appropriate handler
        switch (command) {
            case 'team': {
                const dir = args || getProjectDir();
                return ctoController.createTeamSession(dir);
            }
            default: {
                // General agent-based task execution
                const dir = getProjectDir();
                const gen = agentManager.chat(
                    cmdDef.agent,
                    args || `Execute ${command} task`,
                    dir,
                );
                const result = await drainChat(cmdDef.agent, gen);
                return { success: result.success, text: result.text };
            }
        }
    },
);

// ── Report IPC ──────────────────────────────────────────────────────────────

ipcMain.handle(
    'report:generate',
    async (_e, data: any, projectDir?: string) => {
        const dir = projectDir || getProjectDir();
        return reportGenerator.generateReport(data, dir);
    },
);

ipcMain.handle('report:list', async (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    const reports = await reportGenerator.getReports(dir);
    return { reports };
});

ipcMain.handle('report:get', async (_e, filePath: string) => {
    try {
        const content = await reportGenerator.getReport(filePath);
        return { success: true, content };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// ── Agent DB IPC ────────────────────────────────────────────────────────────

ipcMain.handle('agent-db:list', (_e, includeInactive?: boolean) => {
    return { agents: agentDB.getAll(includeInactive ?? false) };
});

ipcMain.handle('agent-db:get', (_e, id: string) => {
    const agent = agentDB.get(id);
    if (!agent) return { error: `Agent '${id}' not found` };
    return { agent };
});

ipcMain.handle('agent-db:create', (_e, agent: any) => {
    try {
        const created = agentDB.create(agent);
        return { success: true, agent: created };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('agent-db:update', (_e, id: string, patch: any) => {
    const updated = agentDB.update(id, patch);
    if (!updated) return { success: false, error: `Agent '${id}' not found` };
    return { success: true, agent: updated };
});

// ── Agent Metrics IPC ─────────────────────────────────────────────────────

ipcMain.handle('metrics:get', (_e, agentId: string) => {
    return agentMetrics.getMetrics(agentId);
});

ipcMain.handle('metrics:getAll', () => {
    return agentMetrics.getAllMetrics();
});

ipcMain.handle('metrics:topPerformers', (_e, limit?: number) => {
    return agentMetrics.getTopPerformers(limit);
});

// ── Session History Search ─────────────────────────────────────────────────

const sessionSearchStore = new Store({
    name: 'dokba-chat-sessions',
    defaults: { sessionIds: {} as Record<string, string> },
});

ipcMain.handle('session:search', async (_e, query: string) => {
    const sessionIds = (sessionSearchStore.get('sessionIds') || {}) as Record<
        string,
        string
    >;
    const q = (query || '').toLowerCase().trim();
    if (!q) return { sessions: [] };

    const results: {
        id: string;
        label: string;
        agentName: string;
        lastActive: number;
        preview?: string;
    }[] = [];

    for (const [agentId, sessionId] of Object.entries(sessionIds)) {
        const label = terminalMeta.get(agentId)?.label || agentId;
        const agentName = agentId;

        if (
            label.toLowerCase().includes(q) ||
            agentName.toLowerCase().includes(q)
        ) {
            let preview: string | undefined;
            let lastActive = 0;
            try {
                const sessionsDir = path.join(
                    os.homedir(),
                    '.claude',
                    'projects',
                );
                if (fs.existsSync(sessionsDir)) {
                    const projectDirs = fs.readdirSync(sessionsDir);
                    for (const projDir of projectDirs) {
                        const sessionFile = path.join(
                            sessionsDir,
                            projDir,
                            sessionId + '.jsonl',
                        );
                        if (fs.existsSync(sessionFile)) {
                            const stat = fs.statSync(sessionFile);
                            lastActive = stat.mtimeMs;
                            const content = fs.readFileSync(
                                sessionFile,
                                'utf-8',
                            );
                            const lines = content.trim().split('\n');
                            for (let i = lines.length - 1; i >= 0; i--) {
                                try {
                                    const parsed = JSON.parse(lines[i]);
                                    if (
                                        parsed.type === 'assistant' &&
                                        parsed.message?.content
                                    ) {
                                        const textBlocks =
                                            parsed.message.content.filter(
                                                (b: any) => b.type === 'text',
                                            );
                                        if (textBlocks.length > 0) {
                                            preview = textBlocks[0].text.slice(
                                                0,
                                                120,
                                            );
                                            break;
                                        }
                                    }
                                } catch {
                                    // skip unparseable lines
                                }
                            }
                            break;
                        }
                    }
                }
            } catch {
                // graceful fallback
            }

            results.push({
                id: sessionId,
                label,
                agentName,
                lastActive,
                preview,
            });
        }
    }

    results.sort((a, b) => b.lastActive - a.lastActive);
    return { sessions: results };
});

ipcMain.handle('session:getHistory', async (_e, sessionId: string) => {
    try {
        const sessionsDir = path.join(os.homedir(), '.claude', 'projects');
        if (!fs.existsSync(sessionsDir)) {
            return { success: false, error: 'No sessions directory found' };
        }

        let sessionFile: string | null = null;
        const projectDirs = fs.readdirSync(sessionsDir);
        for (const projDir of projectDirs) {
            const candidate = path.join(
                sessionsDir,
                projDir,
                sessionId + '.jsonl',
            );
            if (fs.existsSync(candidate)) {
                sessionFile = candidate;
                break;
            }
        }

        if (!sessionFile) {
            return {
                success: false,
                error: `Session file not found for ${sessionId}`,
            };
        }

        const content = fs.readFileSync(sessionFile, 'utf-8');
        const lines = content.trim().split('\n');
        const messages: {
            role: 'user' | 'assistant';
            content: string;
            timestamp?: number;
        }[] = [];

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === 'human' || parsed.type === 'assistant') {
                    const textBlocks = (parsed.message?.content || []).filter(
                        (b: any) => b.type === 'text',
                    );
                    if (textBlocks.length > 0) {
                        messages.push({
                            role:
                                parsed.type === 'human' ? 'user' : 'assistant',
                            content: textBlocks
                                .map((b: any) => b.text)
                                .join('\n'),
                            timestamp: parsed.timestamp
                                ? new Date(parsed.timestamp).getTime()
                                : undefined,
                        });
                    }
                }
            } catch {
                // skip unparseable lines
            }
        }

        return { success: true, messages };
    } catch (err: any) {
        return { success: false, error: err.message || String(err) };
    }
});

// ── Agent P2P Messaging IPC ────────────────────────────────────────────────

ipcMain.handle(
    'p2p:send',
    async (_e, from: string, to: string, content: string) => {
        const msg = agentP2P.send(from, to, content);
        return { success: true, message: msg };
    },
);

ipcMain.handle(
    'p2p:inbox',
    async (_e, agentId: string, unreadOnly?: boolean) => {
        return { messages: agentP2P.getInbox(agentId, unreadOnly) };
    },
);

ipcMain.handle(
    'p2p:markRead',
    async (_e, agentId: string, messageId: string) => {
        return { success: agentP2P.markRead(agentId, messageId) };
    },
);

ipcMain.handle(
    'p2p:conversation',
    async (_e, agentA: string, agentB: string) => {
        return { messages: agentP2P.getConversation(agentA, agentB) };
    },
);

ipcMain.handle('p2p:clear', async (_e, agentId: string) => {
    agentP2P.clearInbox(agentId);
    return { success: true };
});

agentP2P.on('message', (_from: string, _to: string, msg: P2PMessage) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('p2p:newMessage', msg);
    }
});

// ── Feedback Loop IPC ──────────────────────────────────────────────────────

const FEEDBACK_MAX_HISTORY = 20;
const MAX_FEEDBACK_AGENTS = 50;
const feedbackHistory = new Map<string, FeedbackResult[]>();

ipcMain.handle('feedback:process', async (_e, event: FeedbackEvent) => {
    const result = calculateFeedback(event);

    // Get existing history for this agent
    const agentHistory = feedbackHistory.get(event.agentId) || [];

    // Generate recommendations using history
    result.recommendations = generateRecommendations(agentHistory, event);

    // Prepend to history (newest first), cap at max
    agentHistory.unshift(result);
    if (agentHistory.length > FEEDBACK_MAX_HISTORY) {
        agentHistory.length = FEEDBACK_MAX_HISTORY;
    }
    feedbackHistory.set(event.agentId, agentHistory);

    // Cap number of tracked agents to prevent unbounded Map growth
    if (feedbackHistory.size > MAX_FEEDBACK_AGENTS) {
        const oldest = feedbackHistory.keys().next().value;
        if (oldest) feedbackHistory.delete(oldest);
    }

    return result;
});

ipcMain.handle('feedback:getHistory', async (_e, agentId: string) => {
    return { history: feedbackHistory.get(agentId) || [] };
});

// ── App lifecycle ──────────────────────────────────────────────────────────

let postRenderInitializationStarted = false;

function runPostRenderInitialization() {
    if (postRenderInitializationStarted) {
        return;
    }
    postRenderInitializationStarted = true;
    recordStartupMark('post-render-init-start', undefined, true);

    createTray();

    agentDB.init();
    agentDB.seed();
    teamTemplateManager.init();

    messengerBridge.on('message:received', (msg: any) => {
        if (tray) {
            tray.displayBalloon({
                title: `${msg.adapterId}: ${msg.sender}`,
                content: (msg.content || '').slice(0, 200),
            });
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('messenger:message', msg);
        }
    });

    setImmediate(() => {
        startMcpBridgeWatcher();

        const projectDir = getProjectDir();
        if (projectDir && projectDir !== '.') {
            registerMcpServer(projectDir);
            scanArtibotDir(projectDir);
            watchArtibotDir(projectDir, (registry) => {
                console.log(
                    '[artibot-registry] Registry updated, notifying renderer',
                );
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(
                        'artibot:registry-updated',
                        registry,
                    );
                }
            });
        }

        recordStartupMark('post-render-init-finished', undefined, true);
    });
}

function schedulePostRenderInitialization() {
    if (!mainWindow || postRenderInitializationStarted) {
        return;
    }

    const schedule = () => {
        recordStartupMark('post-render-init-scheduled', undefined, true);
        setTimeout(runPostRenderInitialization, POST_RENDER_INIT_DELAY_MS);
    };

    if (mainWindow.webContents.isLoadingMainFrame()) {
        mainWindow.webContents.once('did-finish-load', schedule);
        return;
    }

    schedule();
}

app.whenReady().then(async () => {
    recordStartupMark('app-ready', undefined, true);
    // Window creation is critical-path — do it first
    await createWindow();
    recordStartupMark('create-window-resolved', undefined, true);

    // Everything below is non-blocking — run in parallel after window shows
    schedulePostRenderInitialization();
});

// ── Retro Report IPC ──────────────────────────────────────────────────────

ipcMain.handle('retro:daily', () => {
    return retroGenerator.generateDaily();
});

ipcMain.handle('retro:weekly', () => {
    return retroGenerator.generateWeekly();
});

ipcMain.handle('retro:save', (_e, report: any, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return retroGenerator.saveReport(report, dir);
});

// ── Character Memory IPC ────────────────────────────────────────────────────

ipcMain.handle('characterMemory:getCore', (_e, agentId: string) => {
    return characterMemoryManager.getCore(agentId);
});

ipcMain.handle(
    'characterMemory:updateCore',
    (_e, agentId: string, updates: any) => {
        return characterMemoryManager.updateCore(agentId, updates);
    },
);

ipcMain.handle(
    'characterMemory:getDailyLog',
    (_e, agentId: string, date?: string) => {
        return characterMemoryManager.getDailyLog(agentId, date);
    },
);

ipcMain.handle(
    'characterMemory:appendTask',
    (_e, agentId: string, entry: any) => {
        return characterMemoryManager.appendTaskEntry(agentId, entry);
    },
);

ipcMain.handle(
    'characterMemory:appendInteraction',
    (_e, agentId: string, interaction: any) => {
        return characterMemoryManager.appendInteraction(agentId, interaction);
    },
);

ipcMain.handle('characterMemory:getKnowledge', (_e, agentId: string) => {
    return characterMemoryManager.getKnowledge(agentId);
});

ipcMain.handle(
    'characterMemory:searchKnowledge',
    (_e, agentId: string, keyword: string) => {
        return characterMemoryManager.searchKnowledge(agentId, keyword);
    },
);

ipcMain.handle('characterMemory:buildContext', (_e, agentId: string) => {
    return characterMemoryManager.buildContextPacket(agentId);
});

ipcMain.handle('characterMemory:getStats', (_e, agentId: string) => {
    return characterMemoryManager.getMemoryStats(agentId);
});

ipcMain.handle('characterMemory:triggerPromotion', (_e, agentId: string) => {
    return characterMemoryManager.triggerPromotion(agentId);
});

ipcMain.handle('characterMemory:resetMemory', (_e, agentId: string) => {
    return characterMemoryManager.resetMemory(agentId);
});

ipcMain.handle('characterMemory:exportMemory', (_e, agentId: string) => {
    return characterMemoryManager.exportMemory(agentId);
});

// ── Character Growth IPC ────────────────────────────────────────────────────

ipcMain.handle('characterGrowth:getSheet', (_e, agentId: string) => {
    return characterGrowthManager.getSheet(agentId);
});

ipcMain.handle('characterGrowth:getAllSheets', () => {
    return characterGrowthManager.getAllSheets();
});

ipcMain.handle(
    'characterGrowth:addExp',
    (_e, agentId: string, amount: number) => {
        return characterGrowthManager.addExp(agentId, amount);
    },
);

ipcMain.handle(
    'characterGrowth:applyActivity',
    (_e, agentId: string, activity: string, toolName?: string) => {
        return characterGrowthManager.applyActivityGains(
            agentId,
            activity,
            toolName,
        );
    },
);

ipcMain.handle(
    'characterGrowth:allocateStat',
    (_e, agentId: string, statKey: string) => {
        return characterGrowthManager.allocateStatPoint(
            agentId,
            statKey as any,
        );
    },
);

ipcMain.handle(
    'characterGrowth:allocateSpec',
    (_e, agentId: string, specKey: string) => {
        return characterGrowthManager.allocateSpecPoint(
            agentId,
            specKey as any,
        );
    },
);

ipcMain.handle('characterGrowth:autoAllocate', (_e, agentId: string) => {
    return characterGrowthManager.autoAllocate(agentId);
});

ipcMain.handle(
    'characterGrowth:equipSkill',
    (_e, agentId: string, skillId: string) => {
        return characterGrowthManager.equipSkill(agentId, skillId);
    },
);

ipcMain.handle(
    'characterGrowth:unequipSkill',
    (_e, agentId: string, skillId: string) => {
        return characterGrowthManager.unequipSkill(agentId, skillId);
    },
);

ipcMain.handle('characterGrowth:runSkillDetection', (_e, agentId: string) => {
    return characterGrowthManager.runSkillDetection(agentId, []);
});

ipcMain.handle('characterGrowth:getLevelInfo', (_e, agentId: string) => {
    return characterGrowthManager.getLevelInfo(agentId);
});

ipcMain.handle('characterGrowth:getLevelUpHistory', () => {
    return characterGrowthManager.getLevelUpHistory();
});

// ── Affinity IPC ────────────────────────────────────────────────────────────

ipcMain.handle('affinity:getMatrix', () => {
    return affinityManager.getMatrix();
});

ipcMain.handle('affinity:getScore', (_e, fromId: string, toId: string) => {
    return affinityManager.getScore(fromId, toId);
});

ipcMain.handle('affinity:recordEvent', (_e, event: any) => {
    return affinityManager.recordEvent(event);
});

ipcMain.handle('affinity:getRelationships', (_e, agentId: string) => {
    return affinityManager.getAgentRelationships(agentId);
});

ipcMain.handle('affinity:getTopPairs', (_e, limit?: number) => {
    return affinityManager.getTopPairs(limit);
});

ipcMain.handle(
    'affinity:getSynergyBonus',
    (_e, fromId: string, toId: string) => {
        return affinityManager.getSynergyBonus(fromId, toId);
    },
);

ipcMain.handle('affinity:calculateTeamSynergy', (_e, agentIds: string[]) => {
    return affinityManager.calculateTeamSynergy(agentIds);
});

ipcMain.handle('affinity:applyDecay', () => {
    return affinityManager.applyDecay();
});

ipcMain.handle('affinity:resetPair', (_e, fromId: string, toId: string) => {
    return affinityManager.resetPair(fromId, toId);
});

// ── Job Runner IPC ──────────────────────────────────────────────────────────

ipcMain.handle('jobRunner:getDefinition', (_e, jobId: string) => {
    return jobRunner.getDefinition(jobId);
});

ipcMain.handle('jobRunner:getAllDefinitions', () => {
    return jobRunner.getAllDefinitions();
});

ipcMain.handle('jobRunner:getDefinitionsByCategory', (_e, category: string) => {
    return jobRunner.getDefinitionsByCategory(category);
});

ipcMain.handle('jobRunner:saveDefinition', (_e, definition: any) => {
    jobRunner.saveDefinition(definition);
    return { success: true };
});

ipcMain.handle('jobRunner:deleteDefinition', (_e, jobId: string) => {
    return jobRunner.deleteDefinition(jobId);
});

ipcMain.handle(
    'jobRunner:startRun',
    (_e, jobId: string, inputs: Record<string, unknown>) => {
        return jobRunner.startRun(jobId, inputs);
    },
);

ipcMain.handle('jobRunner:getActiveRun', (_e, runId: string) => {
    return jobRunner.getActiveRun(runId);
});

ipcMain.handle('jobRunner:getAllActiveRuns', () => {
    return jobRunner.getAllActiveRuns();
});

ipcMain.handle('jobRunner:getRunProgress', (_e, runId: string) => {
    return jobRunner.getRunProgress(runId);
});

ipcMain.handle('jobRunner:cancelRun', (_e, runId: string) => {
    jobRunner.cancelRun(runId);
    return { success: true };
});

ipcMain.handle('jobRunner:getHistory', (_e, limit?: number) => {
    return jobRunner.getHistory(limit);
});

ipcMain.handle('jobRunner:getSettings', () => {
    return jobRunner.getSettings();
});

ipcMain.handle('jobRunner:updateSettings', (_e, settings: any) => {
    jobRunner.updateSettings(settings);
    return { success: true };
});

ipcMain.handle(
    'jobRunner:checkCanRun',
    (_e, jobId: string, characterLevel: number) => {
        return jobRunner.checkCanRun(jobId, characterLevel);
    },
);

// ── Heartbeat Daemon IPC ────────────────────────────────────────────────────

ipcMain.handle('heartbeat:start', (_e, agentId: string) => {
    return heartbeatDaemon.start(agentId);
});

ipcMain.handle('heartbeat:stop', (_e, agentId: string) => {
    return heartbeatDaemon.stop(agentId);
});

ipcMain.handle('heartbeat:stopAll', () => {
    return heartbeatDaemon.stopAll();
});

ipcMain.handle('heartbeat:getStatus', (_e, agentId: string) => {
    return heartbeatDaemon.getStatus(agentId);
});

ipcMain.handle('heartbeat:runOnce', async (_e, agentId: string) => {
    return heartbeatDaemon.runOnce(agentId);
});

ipcMain.handle('heartbeat:getConfig', (_e, agentId: string) => {
    return heartbeatDaemon.getConfig(agentId);
});

ipcMain.handle('heartbeat:setConfig', (_e, agentId: string, config: any) => {
    return heartbeatDaemon.setConfig(agentId, config);
});

ipcMain.handle(
    'heartbeat:setAutonomy',
    (_e, agentId: string, level: number) => {
        return heartbeatDaemon.setAutonomy(agentId, level as any);
    },
);

ipcMain.handle('heartbeat:getLogs', (_e, agentId: string, limit?: number) => {
    return heartbeatDaemon.getLogs(agentId, limit);
});

ipcMain.handle('heartbeat:getStats', (_e, agentId: string) => {
    return heartbeatDaemon.getStats(agentId);
});

ipcMain.handle('heartbeat:getAllStats', () => {
    return heartbeatDaemon.getAllStats();
});

ipcMain.handle('heartbeat:getPendingApprovals', () => {
    return heartbeatDaemon.getPendingApprovals();
});

ipcMain.handle('heartbeat:approve', (_e, approvalId: string) => {
    return heartbeatDaemon.approve(approvalId);
});

ipcMain.handle(
    'heartbeat:reject',
    (_e, approvalId: string, _reason?: string) => {
        return heartbeatDaemon.reject(approvalId);
    },
);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Stop MCP bridge watcher
    stopMcpBridgeWatcher();
    // Stop artibot file watcher
    stopWatching();
    // Clean up terminals
    for (const [id, proc] of terminals) {
        try {
            proc.kill();
        } catch (_) {
            /* ignore */
        }
        terminals.delete(id);
    }
    terminalMeta.clear();
    tabParserState.clear();
    // Clean up chat sessions
    chatSessionManager.closeAll();
    // Clean up messenger adapters
    messengerBridge.disconnectAll().catch(() => {});
});
