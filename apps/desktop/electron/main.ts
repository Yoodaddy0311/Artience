import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import * as pty from 'node-pty';
import Store from 'electron-store';
import { agentManager, AGENT_PERSONAS, type StreamChunk } from './agent-manager';
import { getSkillProfile } from './skill-map';

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow;

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
    },
});

// ── In-memory job tracking ──────────────────────────────────────────────────

interface JobRecord {
    id: string;
    status: string;
    agent: string;
    progress: number;
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
        if (message.includes('[Preload]') || level >= 3) {
            const tag = level >= 3 ? 'ERROR' : 'LOG';
            console.log(`[Renderer ${tag}]`, message);
        }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
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

ipcMain.handle('terminal:create', (_event, cols: number, rows: number, options?: { cwd?: string; autoCommand?: string; shell?: string; label?: string }) => {
    const id = `term-${++terminalIdCounter}`;
    const shell = options?.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
    const cwd = options?.cwd || process.env.HOME || process.env.USERPROFILE || '.';
    const label = options?.label || id;

    const env = { ...process.env } as Record<string, string>;
    delete env.CLAUDECODE;

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
        setTimeout(() => {
            proc.write(options.autoCommand + '\r');
        }, 500);
    }

    proc.onData((data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', id, data);
        }
    });

    proc.onExit(({ exitCode }) => {
        terminals.delete(id);
        terminalMeta.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', id, exitCode ?? 1);
        }
    });

    return { id, label, cwd };
});

ipcMain.on('terminal:write', (_event, id: string, data: string) => {
    terminals.get(id)?.write(data);
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

// Legacy single-shot (kept for backward compat, now routed through Agent Manager)
ipcMain.handle('chat:send', async (_event, agentName: string, userMessage: string, skillId?: string) => {
    const projectDir = (store.get('project') as any)?.dir || '.';
    const gen = agentManager.chat(agentName, userMessage, projectDir, skillId);
    return drainChat(agentName, gen);
});

// Streaming chat
ipcMain.handle('chat:send-stream', async (_event, agentName: string, userMessage: string, skillId?: string) => {
    const projectDir = (store.get('project') as any)?.dir || '.';
    const gen = agentManager.chat(agentName, userMessage, projectDir, skillId);
    return drainChat(agentName, gen);
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

// Close chat session
ipcMain.handle('chat:close-session', (_e, agentName: string) => {
    agentManager.closeSession(agentName);
    return { success: true };
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
    return result.filePaths[0] || null;
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
    return { success: true, diff: JSON.stringify({ changes: [], oldId, newId }) };
});

ipcMain.handle('studio:rollback', (_e, snapshotId: string) => {
    const snap = historySnapshots.find(s => s.id === snapshotId);
    if (!snap) return { success: false, error: 'Snapshot not found' };
    return { success: true };
});

// ── Job Run IPC (Agent Manager) ────────────────────────────────────────────

ipcMain.handle('job:run', async (_e, agentNameOrRecipeId: string, taskOrAgentId: string, projectDir?: string) => {
    const dir = projectDir || (store.get('projectData') as any)?.meta?.dir || '.';
    const jobId = `job-${++jobIdCounter}`;

    const record: JobRecord = { id: jobId, status: 'running', agent: taskOrAgentId, progress: 0 };
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
    return { artifacts: [] };
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

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Clean up terminals
    for (const [id, proc] of terminals) {
        try { proc.kill(); } catch (_) { /* ignore */ }
        terminals.delete(id);
    }
    terminalMeta.clear();
});
