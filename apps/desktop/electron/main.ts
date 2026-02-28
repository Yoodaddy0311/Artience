import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as pty from 'node-pty';

let mainWindow: BrowserWindow;

// ── Terminal process store ──
const terminals = new Map<string, pty.IPty>();
let terminalIdCounter = 0;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// ── Terminal IPC handlers ──

ipcMain.handle('terminal:create', (_event, cols: number, rows: number) => {
    const id = `term-${++terminalIdCounter}`;
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const proc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: process.env.HOME || process.env.USERPROFILE || '.',
        env: process.env as Record<string, string>,
    });

    terminals.set(id, proc);

    proc.onData((data: string) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', id, data);
        }
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
        terminals.delete(id);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', id, exitCode);
        }
    });

    return id;
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
    }
});

// ── App lifecycle ──

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    for (const [, proc] of terminals) {
        proc.kill();
    }
    terminals.clear();
});
