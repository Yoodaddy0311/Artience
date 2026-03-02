import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as pty from 'node-pty';
import Store from 'electron-store';
import { agentManager, AGENT_PERSONAS, type StreamChunk } from './agent-manager';
import { getSkillProfile } from './skill-map';
import { ChatSessionManager } from './chat-session-manager';
import { ctoController } from './cto-controller';
import { parsePtyChunk, detectActivity, summarizeEvents, type ParsedEvent, type AgentActivity } from '../src/lib/pty-parser';
import { worktreeManager } from './worktree-manager';
import { hooksManager } from './hooks-manager';
import { registerMcpServer, MCP_BRIDGE_DIR, type McpBridge } from './mcp-artience-server';
import { loadSkills, installDefaultSkills, getAgentSkills } from './skill-manager';

console.log('[Electron] BUILD_ID: 20260302-v6 (MCP-Bridge+Job-Complete)');

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

let mainWindow: BrowserWindow;

// ── ChatSessionManager (stream-json 기반 세션) ──────────────────────────────
const chatSessionManager = new ChatSessionManager();
ctoController.init(chatSessionManager);

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

// ── Terminal process store (node-pty based for proper TTY support) ──────────

const terminals = new Map<string, pty.IPty>();
const terminalMeta = new Map<string, { cwd: string; label: string }>();
let terminalIdCounter = 0;

// ── Per-tab PTY parser state (tee analysis) ─────────────────────────────────

interface TabParserState {
    lastActivity: AgentActivity;
    events: ParsedEvent[];
    /** Whether a work cycle has started (thinking/tool_use seen since last prompt) */
    workCycleActive: boolean;
    /** Incomplete line buffer — holds partial line from previous chunk */
    lineBuffer: string;
}

const tabParserState = new Map<string, TabParserState>();

function getOrCreateParserState(tabId: string): TabParserState {
    let state = tabParserState.get(tabId);
    if (!state) {
        state = { lastActivity: 'idle', events: [], workCycleActive: false, lineBuffer: '' };
        tabParserState.set(tabId, state);
    }
    return state;
}

/**
 * Process PTY output through the parser (tee path — does NOT affect xterm rendering).
 * Sends parsed events and activity changes to the renderer.
 *
 * Handles chunk boundaries by buffering incomplete lines: if a chunk does not
 * end with a newline, the last partial line is held in `lineBuffer` and
 * prepended to the next chunk for that tab.
 */
function processPtyForParser(tabId: string, rawData: string): void {
    const state = getOrCreateParserState(tabId);

    // Prepend any buffered partial line from previous chunk
    const data = state.lineBuffer + rawData;

    // If the chunk does not end with a newline, the last segment is incomplete
    let dataToParse: string;
    if (data.length > 0 && !data.endsWith('\n') && !data.endsWith('\r')) {
        const lastNewline = Math.max(data.lastIndexOf('\n'), data.lastIndexOf('\r'));
        if (lastNewline === -1) {
            // Entire chunk is a partial line — buffer it and wait
            state.lineBuffer = data;
            return;
        }
        // Parse complete lines, buffer the trailing partial
        state.lineBuffer = data.slice(lastNewline + 1);
        dataToParse = data.slice(0, lastNewline + 1);
    } else {
        state.lineBuffer = '';
        dataToParse = data;
    }

    const parsed = parsePtyChunk(dataToParse);
    if (parsed.length === 0) return;

    for (const event of parsed) {
        // Cap event buffer at 200 to avoid unbounded growth
        if (state.events.length >= 200) {
            state.events = state.events.slice(-100);
        }
        state.events.push(event);

        // Send each parsed event to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:parsed-event', tabId, event);
        }

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

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:activity-change', tabId, newActivity);
        }

        // Mail trigger: work cycle completed (transition to success/idle after work)
        if (state.workCycleActive && (newActivity === 'success' || (newActivity === 'idle' && prevActivity !== 'idle'))) {
            state.workCycleActive = false;
            const meta = terminalMeta.get(tabId);
            const agentLabel = meta?.label || tabId;
            const summary = summarizeEvents(state.events.slice(-50));

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('mail:new-report', {
                    fromAgentId: agentLabel.toLowerCase(),
                    fromAgentName: agentLabel,
                    subject: '작업 완료 보고',
                    body: summary.slice(0, 500),
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
            const errorEvents = state.events.filter(e => e.type === 'error');
            const errorSummary = errorEvents.map(e => e.content).join('\n').slice(0, 500);

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

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');

    console.log('[Electron] app.isPackaged:', app.isPackaged);
    console.log('[Electron] __dirname:', __dirname);
    console.log('[Electron] app.getAppPath():', app.getAppPath());
    console.log('[Electron] preload path:', preloadPath);
    console.log('[Electron] preload exists:', fs.existsSync(preloadPath));

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

    mainWindow.webContents.on('preload-error', (_event: any, preloadPath: string, error: Error) => {
        console.error('[Electron] PRELOAD ERROR in', preloadPath, ':', error.message);
    });

    mainWindow.webContents.on('console-message', (_event: any, level: number, message: string) => {
        if (message.includes('[Preload]') || message.includes('[ChatSend]') || message.includes('[terminal') || level >= 3) {
            const tag = level >= 3 ? 'ERROR' : 'LOG';
            console.log(`[Renderer ${tag}]`, message);
        }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        // __dirname = dist-electron/, Vite 출력 = ../dist/index.html
        const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
        console.log('[Electron] Loading index.html from:', indexPath, '| exists:', fs.existsSync(indexPath));
        mainWindow.loadFile(indexPath);
    }

    mainWindow.webContents.openDevTools();

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

// ── Terminal IPC handlers (node-pty for full TTY support) ───────────────────

ipcMain.handle('terminal:create', (_event, cols: number, rows: number, options?: {
    cwd?: string;
    autoCommand?: string;
    shell?: string;
    label?: string;
    agentSettings?: { model?: string; permissionMode?: string; maxTurns?: number };
}) => {
    const id = `term-${++terminalIdCounter}`;
    const shell = options?.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
    const cwd = options?.cwd || process.env.HOME || process.env.USERPROFILE || '.';
    const label = options?.label || id;

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
    terminalMeta.set(id, { cwd, label });

    if (options?.autoCommand) {
        // Build the actual command with agent settings flags
        let cmd = options.autoCommand;
        const settings = options.agentSettings;
        if (settings && cmd === 'claude') {
            const flags: string[] = [];
            if (settings.model) flags.push(`--model ${settings.model}`);
            // Apply permission mode: explicit setting > preset > default
            const permMode = settings.permissionMode && settings.permissionMode !== 'default'
                ? settings.permissionMode
                : getDefaultPermissionMode(label);
            if (permMode && permMode !== 'default') {
                if (permMode === 'bypassPermissions') {
                    flags.push('--dangerously-skip-permissions');
                } else {
                    flags.push(`--permission-mode ${permMode}`);
                }
            }
            if (settings.maxTurns) flags.push(`--max-turns ${settings.maxTurns}`);
            if (flags.length > 0) {
                cmd = `claude ${flags.join(' ')}`;
            }
        }

        setTimeout(() => {
            proc.write(cmd + '\r');
        }, 1500);
    }

    proc.onData((data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Original path: send raw data to xterm (unchanged)
            mainWindow.webContents.send('terminal:data', id, data);
        }
        // Tee path: parse for structured events (does NOT affect xterm)
        processPtyForParser(id, data);
    });

    proc.onExit(({ exitCode }) => {
        terminals.delete(id);
        terminalMeta.delete(id);
        tabParserState.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', id, exitCode ?? 1);
        }
    });

    return { id, label, cwd };
});

ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    const pty = terminals.get(id);
    if (pty) {
        console.log('[terminal:write] OK → id:', id, '| data:', JSON.stringify(data).slice(0, 80));
        pty.write(data);
    } else {
        console.warn('[terminal:write] No PTY found for id:', id, '| available:', [...terminals.keys()]);
    }
});

ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) => {
    terminals.get(id)?.resize(cols, rows);
});

ipcMain.on('terminal:destroy', (_event, id: string) => {
    const proc = terminals.get(id);
    if (proc) {
        proc.kill();
        terminals.delete(id);
        terminalMeta.delete(id);
        tabParserState.delete(id);
    }
});

ipcMain.handle('terminal:list', () => {
    return Array.from(terminals.entries()).map(([id, proc]) => ({
        id,
        cwd: terminalMeta.get(id)?.cwd || '',
        label: terminalMeta.get(id)?.label || id,
        pid: proc.pid,
    }));
});

// ── Chat IPC (Agent Manager) ───────────────────────────────────────────────

// Helper: resolve agent display name from agentName key
function resolveAgentName(agentName: string): string {
    const persona = AGENT_PERSONAS[agentName.toLowerCase()];
    return persona ? `${agentName} (${persona.role})` : agentName;
}

async function drainChat(agentName: string, gen: AsyncGenerator<StreamChunk>): Promise<{ success: boolean; text: string; sessionId?: string }> {
    let fullText = '';
    let sessionId: string | undefined;

    try {
        for await (const chunk of gen) {
            sessionId = chunk.sessionId || sessionId;

            if (chunk.type === 'text') {
                fullText += chunk.content;
                mainWindow?.webContents.send('chat:stream', agentName, chunk.content);
            } else if (chunk.type === 'tool_use') {
                mainWindow?.webContents.send('chat:tool-use', agentName, chunk.content);
            } else if (chunk.type === 'result') {
                fullText = chunk.content || fullText;
            } else if (chunk.type === 'error') {
                mainWindow?.webContents.send('chat:stream-end', agentName);
                mainWindow?.webContents.send('mail:new-report', {
                    fromAgentId: agentName.toLowerCase(),
                    fromAgentName: resolveAgentName(agentName),
                    subject: '작업 실패',
                    body: chunk.content.slice(0, 500),
                    type: 'error',
                    timestamp: Date.now(),
                });
                return { success: false, text: chunk.content };
            }
        }
    } catch (err: any) {
        mainWindow?.webContents.send('chat:stream-end', agentName);
        const errorMsg = err.message || 'Chat failed';
        mainWindow?.webContents.send('mail:new-report', {
            fromAgentId: agentName.toLowerCase(),
            fromAgentName: resolveAgentName(agentName),
            subject: '작업 실패',
            body: errorMsg.slice(0, 500),
            type: 'error',
            timestamp: Date.now(),
        });
        return { success: false, text: errorMsg };
    }

    mainWindow?.webContents.send('chat:stream-end', agentName);
    mainWindow?.webContents.send('mail:new-report', {
        fromAgentId: agentName.toLowerCase(),
        fromAgentName: resolveAgentName(agentName),
        subject: '작업 완료 보고',
        body: fullText.slice(0, 500),
        type: 'report',
        timestamp: Date.now(),
    });
    return { success: true, text: fullText, sessionId };
}

// Helper: resolve project directory from electron-store
function getProjectDir(): string {
    return (store.get('projectData') as any)?.meta?.dir || process.env.HOME || process.env.USERPROFILE || '.';
}

// Legacy single-shot (kept for backward compat, now routed through Agent Manager)
ipcMain.handle('chat:send', async (_event, agentName: string, userMessage: string, skillId?: string) => {
    const gen = agentManager.chat(agentName, userMessage, getProjectDir(), skillId);
    return drainChat(agentName, gen);
});

// Streaming chat
ipcMain.handle('chat:send-stream', async (_event, agentName: string, userMessage: string, skillId?: string) => {
    console.log('[Chat:send-stream] agentName:', agentName, '| message:', userMessage?.slice(0, 50), '| projectDir:', getProjectDir());
    try {
        const gen = agentManager.chat(agentName, userMessage, getProjectDir(), skillId);
        return drainChat(agentName, gen);
    } catch (err: any) {
        console.error('[Chat:send-stream] CRITICAL ERROR:', err);
        return { success: false, text: err.message || 'Unknown error' };
    }
});

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

ipcMain.handle('chat:create-session', async (_e, agentId: string, agentName: string, cwd: string, extraArgs?: string[]) => {
    try {
        const sessionId = await chatSessionManager.createSession(agentId, agentName, cwd, extraArgs);
        return { success: true, sessionId };
    } catch (err: any) {
        return { success: false, error: err.message || 'Failed to create session' };
    }
});

ipcMain.handle('chat:send-message', async (_e, agentId: string, message: string) => {
    chatSessionManager.sendMessage(agentId, message);
    return { success: true };
});

// ChatSessionManager → Renderer 이벤트 전송
chatSessionManager.on('stream', (agentId: string, event: unknown) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:stream-event', agentId, event);
    }
});

chatSessionManager.on('session:closed', (agentId: string, code: number) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:session-closed', agentId, code);
    }
});

chatSessionManager.on('response:end', (agentId: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat:response-end', agentId);
    }
});

// ── CLI Auth IPC ───────────────────────────────────────────────────────────

ipcMain.handle('cli:auth-status', async () => {
    try {
        const env = { ...process.env };
        delete env.CLAUDECODE;
        const { stdout } = await execFileAsync('claude', ['auth', 'status'], {
            env,
            timeout: 10000,
            shell: true,
        });
        const data = JSON.parse(stdout);
        return { authenticated: !!data.loggedIn };
    } catch {
        return { authenticated: false };
    }
});

ipcMain.handle('cli:auth-login', async () => {
    try {
        const env = { ...process.env };
        delete env.CLAUDECODE;

        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', 'cmd', '/k', 'claude auth login'], { env, detached: true, stdio: 'ignore' });
        } else if (process.platform === 'darwin') {
            spawn('open', ['-a', 'Terminal', '--args', 'claude', 'auth', 'login'], { env, detached: true, stdio: 'ignore' });
        } else {
            spawn('x-terminal-emulator', ['-e', 'claude', 'auth', 'login'], { env, detached: true, stdio: 'ignore' });
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
        if (dir) { registerMcpServer(dir); }

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
            console.log(`[project:selectDir] Auto-init hooks: ${JSON.stringify(initResult)}`);
        } catch (err: any) {
            console.warn('[project:selectDir] Hooks init failed:', err.message);
        }
    }

    return selectedDir;
});

// ── Worktree IPC ────────────────────────────────────────────────────────────

ipcMain.handle('worktree:create', async (_e, agentId: string, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return worktreeManager.createWorktree(agentId, dir);
});

ipcMain.handle('worktree:remove', async (_e, agentId: string, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    return worktreeManager.removeWorktree(agentId, dir);
});

ipcMain.handle('worktree:list', async (_e, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    const worktrees = await worktreeManager.listWorktrees(dir);
    return { worktrees };
});

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
        filters: [
            { name: 'JSON', extensions: ['json'] },
        ],
    });
    if (result.canceled || !result.filePath) {
        return { success: false, error: 'canceled' };
    }
    try {
        fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
        return { success: true, filePath: result.filePath };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('file:read', async (_e, filePath: string) => {
    try {
        const projectDir = (store.get('projectData') as any)?.meta?.dir || '.';
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath);
        if (!fs.existsSync(resolvedPath)) {
            return { success: false, error: 'File not found' };
        }
        const content = fs.readFileSync(resolvedPath, 'utf-8');
        return { success: true, content };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('file:saveTempFile', async (_e, base64: string, filename: string) => {
    try {
        const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const dest = path.join(os.tmpdir(), `artience-${Date.now()}-${sanitized}`);
        const data = base64.replace(/^data:[^;]+;base64,/, '');
        fs.writeFileSync(dest, Buffer.from(data, 'base64'));
        return { success: true, filePath: dest };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// ── MCP Bridge (Artience MCP Server ↔ main process) ────────────────────────

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

    sendMail(from: string, to: string, subject: string, body: string, type: 'report' | 'error') {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('mail:new-report', {
                fromAgentId: from,
                fromAgentName: from,
                subject,
                body: body.slice(0, 500),
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
        const activeSessions = Array.from(terminals.keys()).map(id => {
            const meta = terminalMeta.get(id);
            return meta?.label || id;
        });
        return { dir: projectDir, agents, activeSessions };
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

    mcpBridgeWatcher = setInterval(() => {
        try {
            const files = fs.readdirSync(MCP_BRIDGE_DIR);
            const reqFiles = files.filter(f => f.endsWith('.req.json'));

            for (const reqFile of reqFiles) {
                const reqPath = path.join(MCP_BRIDGE_DIR, reqFile);
                const resPath = reqPath.replace('.req.json', '.res.json');

                try {
                    const raw = fs.readFileSync(reqPath, 'utf-8');
                    const request = JSON.parse(raw) as { id: string; method: string; args: Record<string, unknown>; timestamp: number };

                    // Skip stale requests (older than 10 seconds)
                    if (Date.now() - request.timestamp > 10000) {
                        try { fs.unlinkSync(reqPath); } catch { /* ignore */ }
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
                                mcpBridge.notify(request.args.message as string, request.args.type as string);
                                result = { notified: true };
                                break;
                            case 'getProjectInfo':
                                result = mcpBridge.getProjectInfo();
                                break;
                            default:
                                result = null;
                        }
                        fs.writeFileSync(resPath, JSON.stringify({ id: request.id, result }), 'utf-8');
                    } catch (err: any) {
                        fs.writeFileSync(resPath, JSON.stringify({ id: request.id, error: err.message }), 'utf-8');
                    }
                } catch {
                    // Couldn't read/parse request file — skip
                }
            }
        } catch {
            // Bridge dir not readable — skip this cycle
        }
    }, 100); // Poll every 100ms
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
        return { success: false, installed: [], skipped: [], error: err.message };
    }
});

ipcMain.handle('skill:get-agent-skills', (_e, agentName: string, projectDir?: string) => {
    const dir = projectDir || getProjectDir();
    try {
        const skills = getAgentSkills(agentName, dir);
        return { success: true, skills };
    } catch (err: any) {
        return { success: false, skills: [], error: err.message };
    }
});

// ── Studio IPC (Agent Manager) ─────────────────────────────────────────────

ipcMain.handle('studio:generate', async (_e, prompt: string, projectDir?: string) => {
    const dir = projectDir || (store.get('projectData') as any)?.meta?.dir || '.';
    const gen = agentManager.chat('luna', prompt, dir);

    let fullText = '';
    let sessionId: string | undefined;
    try {
        for await (const chunk of gen) {
            sessionId = chunk.sessionId || sessionId;
            if (chunk.type === 'text') {
                fullText += chunk.content;
                mainWindow?.webContents.send('studio:progress', chunk.content);
            } else if (chunk.type === 'result') {
                fullText = chunk.content || fullText;
            } else if (chunk.type === 'error') {
                return { success: false, error: chunk.content, result: '', text: '' };
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

    return { success: true, result: fullText, text: fullText, sessionId };
});

ipcMain.handle('studio:getAssets', async () => {
    try {
        const projectDir = (store.get('projectData') as any)?.meta?.dir || '';
        if (!projectDir) return { assets: [] };
        const assetsDir = path.join(projectDir, 'assets');
        if (!fs.existsSync(assetsDir)) return { assets: [] };

        const files = fs.readdirSync(assetsDir, { withFileTypes: true });
        const assets = files
            .filter(f => f.isFile())
            .map(f => {
                const filePath = path.join(assetsDir, f.name);
                const stat = fs.statSync(filePath);
                const ext = path.extname(f.name).toLowerCase();
                const type = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext) ? 'image' : 'data';
                return { name: f.name, path: filePath, type, size: stat.size };
            });
        return { assets };
    } catch {
        return { assets: [] };
    }
});

ipcMain.handle('studio:getHistory', () => {
    return { snapshots: historySnapshots.map(s => ({ id: s.id, message: s.message, timestamp: s.timestamp })) };
});

ipcMain.handle('studio:getDiff', (_e, oldId: string, newId: string) => {
    const oldSnap = historySnapshots.find(s => s.id === oldId);
    const newSnap = historySnapshots.find(s => s.id === newId);
    if (!oldSnap || !newSnap) return { success: false, diff: '[]' };

    // Compute simple diff between snapshot data
    const changes: Array<{ path: string; type: 'added' | 'removed' | 'modified'; oldValue?: string; newValue?: string }> = [];
    try {
        const oldData = oldSnap.data ? JSON.parse(oldSnap.data) : {};
        const newData = newSnap.data ? JSON.parse(newSnap.data) : {};
        // Shallow key diff
        const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
        for (const key of allKeys) {
            const oldVal = JSON.stringify(oldData[key]);
            const newVal = JSON.stringify(newData[key]);
            if (!(key in oldData)) {
                changes.push({ path: key, type: 'added', newValue: newVal?.slice(0, 100) });
            } else if (!(key in newData)) {
                changes.push({ path: key, type: 'removed', oldValue: oldVal?.slice(0, 100) });
            } else if (oldVal !== newVal) {
                changes.push({ path: key, type: 'modified', oldValue: oldVal?.slice(0, 100), newValue: newVal?.slice(0, 100) });
            }
        }
    } catch {
        // Data wasn't JSON — compare as plain text
        if (oldSnap.data !== newSnap.data) {
            changes.push({ path: 'content', type: 'modified', oldValue: oldSnap.data?.slice(0, 100), newValue: newSnap.data?.slice(0, 100) });
        }
    }

    return { success: true, diff: JSON.stringify({ changes, oldId, newId }) };
});

ipcMain.handle('studio:rollback', async (_e, snapshotId: string) => {
    const snap = historySnapshots.find(s => s.id === snapshotId);
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

        // If the snapshot has generated data, write it back to draft.json
        if (snap.data) {
            const draftDir = path.join(projectDir, 'generated');
            if (!fs.existsSync(draftDir)) {
                fs.mkdirSync(draftDir, { recursive: true });
            }
            fs.writeFileSync(path.join(draftDir, 'draft.json'), snap.data, 'utf-8');
        }

        // Attempt git stash as safety net
        try {
            await execFileAsync('git', ['stash', 'push', '-m', `artience-rollback-${snapshotId}`], {
                cwd: projectDir,
                timeout: 10000,
                shell: true,
            });
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
    const history = (store.get('jobHistory') || []) as Array<Record<string, unknown>>;
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
function saveJobArtifact(jobId: string, name: string, filePath: string, type: string): void {
    const artifacts = (store.get('jobArtifacts') || []) as Array<Record<string, unknown>>;
    artifacts.unshift({ name, path: filePath, type, jobId, ts: Date.now() });
    if (artifacts.length > 200) artifacts.length = 200;
    store.set('jobArtifacts', artifacts);
}

ipcMain.handle('job:run', async (_e, agentNameOrRecipeId: string, taskOrAgentId: string, projectDir?: string) => {
    const dir = projectDir || (store.get('projectData') as any)?.meta?.dir || '.';
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
                mainWindow?.webContents.send('job:progress', agentNameOrRecipeId, chunk.content);
            } else if (chunk.type === 'tool_use') {
                mainWindow?.webContents.send('job:progress', agentNameOrRecipeId, `[tool] ${chunk.content}`);
            } else if (chunk.type === 'result') {
                fullText = chunk.content || fullText;
            } else if (chunk.type === 'error') {
                record.status = 'failed';
                saveJobToHistory(record, chunk.content);
                mainWindow?.webContents.send('mail:new-report', {
                    fromAgentId: agentNameOrRecipeId.toLowerCase(),
                    fromAgentName: resolveAgentName(agentNameOrRecipeId),
                    subject: `작업 실패 (${jobId})`,
                    body: chunk.content.slice(0, 500),
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
            subject: `작업 실패 (${jobId})`,
            body: errorMsg.slice(0, 500),
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
            const artifactDir = path.join(dir, 'generated', 'job-artifacts');
            if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
            const artifactPath = path.join(artifactDir, `${jobId}.txt`);
            fs.writeFileSync(artifactPath, fullText, 'utf-8');
            saveJobArtifact(jobId, `${agentNameOrRecipeId}-result.txt`, artifactPath, 'text');
        } catch {
            // Artifact save failed — not critical
        }
    }

    mainWindow?.webContents.send('mail:new-report', {
        fromAgentId: agentNameOrRecipeId.toLowerCase(),
        fromAgentName: resolveAgentName(agentNameOrRecipeId),
        subject: `작업 완료 보고 (${jobId})`,
        body: fullText.slice(0, 500),
        type: 'report',
        timestamp: Date.now(),
    });
    return { success: true, jobId, text: fullText, sessionId };
});

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
    const jobs = Array.from(activeJobs.values()).map(j => ({
        id: j.id,
        status: j.status,
        agent: j.agent,
        progress: j.progress,
    }));
    return { jobs };
});

ipcMain.handle('job:getArtifacts', () => {
    const artifacts = (store.get('jobArtifacts') || []) as Array<{
        name: string; path: string; type: string; jobId: string; ts: number;
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
        id: string; agent: string; task: string; status: string;
        startedAt: string; completedAt?: string; resultPreview?: string;
    }>;
    return { history };
});

// ── Agent Team IPC (CTO Controller) ─────────────────────────────────────────

ipcMain.handle('agent:create-team', async (_e, cwd?: string) => {
    const dir = cwd || getProjectDir();
    return ctoController.createTeamSession(dir);
});

ipcMain.handle('agent:delegate-task', async (_e, agentName: string, task: string) => {
    return ctoController.delegateTask(agentName, task);
});

// agent:task-result is emitted via chat:stream-event when CTO session
// produces subagent-related output. The renderer can detect subagent
// events from the stream event type/content.

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();

    // Start MCP bridge file watcher (serves standalone MCP server requests)
    startMcpBridgeWatcher();

    // Register MCP server in project .mcp.json (standalone mode uses FileBridge)
    const projectDir = getProjectDir();
    if (projectDir && projectDir !== '.') {
        registerMcpServer(projectDir);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Stop MCP bridge watcher
    stopMcpBridgeWatcher();
    // Clean up terminals
    for (const [id, proc] of terminals) {
        try { proc.kill(); } catch (_) { /* ignore */ }
        terminals.delete(id);
    }
    terminalMeta.clear();
    tabParserState.clear();
    // Clean up chat sessions
    chatSessionManager.closeAll();
});
