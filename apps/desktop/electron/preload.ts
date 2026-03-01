import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Script executing...');
console.log('[Preload] contextBridge available:', !!contextBridge);
console.log('[Preload] ipcRenderer available:', !!ipcRenderer);

try {
contextBridge.exposeInMainWorld('dogbaApi', {
    // ── App ──
    app: {
        getVersion: () => process.env.npm_package_version,
    },

    // ── Terminal ──
    terminal: {
        create: (cols: number, rows: number, options?: { cwd?: string; autoCommand?: string; shell?: string; label?: string }): Promise<{ id: string; label: string; cwd: string }> =>
            ipcRenderer.invoke('terminal:create', cols, rows, options),
        write: (id: string, data: string): void =>
            ipcRenderer.send('terminal:write', id, data),
        resize: (id: string, cols: number, rows: number): void =>
            ipcRenderer.send('terminal:resize', id, cols, rows),
        destroy: (id: string): void =>
            ipcRenderer.send('terminal:destroy', id),
        list: (): Promise<{ id: string; cwd: string; label: string; pid: number }[]> =>
            ipcRenderer.invoke('terminal:list'),
        onData: (callback: (id: string, data: string) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, id: string, data: string) =>
                callback(id, data);
            ipcRenderer.on('terminal:data', listener);
            return () => ipcRenderer.removeListener('terminal:data', listener);
        },
        onExit: (callback: (id: string, exitCode: number) => void) => {
            const listener = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) =>
                callback(id, exitCode);
            ipcRenderer.on('terminal:exit', listener);
            return () => ipcRenderer.removeListener('terminal:exit', listener);
        },
    },

    // ── Chat ──
    chat: {
        send: (agentName: string, message: string, skillId?: string): Promise<{ success: boolean; text: string; sessionId?: string }> =>
            ipcRenderer.invoke('chat:send', agentName, message, skillId),
        sendStream: (agentName: string, message: string, skillId?: string): Promise<{ success: boolean; text: string; sessionId?: string }> =>
            ipcRenderer.invoke('chat:send-stream', agentName, message, skillId),
        getSkills: (agentName: string): Promise<{ skills: { id: string; label: string; description: string }[] }> =>
            ipcRenderer.invoke('chat:get-skills', agentName),
        onStream: (callback: (agentName: string, chunk: string) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, agentName: string, chunk: string) =>
                callback(agentName, chunk);
            ipcRenderer.on('chat:stream', listener);
            return () => ipcRenderer.removeListener('chat:stream', listener);
        },
        onStreamEnd: (callback: (agentName: string) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, agentName: string) =>
                callback(agentName);
            ipcRenderer.on('chat:stream-end', listener);
            return () => ipcRenderer.removeListener('chat:stream-end', listener);
        },
        onToolUse: (callback: (agentName: string, toolData: string) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, agentName: string, toolData: string) =>
                callback(agentName, toolData);
            ipcRenderer.on('chat:tool-use', listener);
            return () => ipcRenderer.removeListener('chat:tool-use', listener);
        },
        closeSession: (agentName: string): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('chat:close-session', agentName),
    },

    // ── CLI Auth ──
    cli: {
        authStatus: (): Promise<{ authenticated: boolean }> =>
            ipcRenderer.invoke('cli:auth-status'),
        authLogin: (): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('cli:auth-login'),
    },

    // ── Project Management ──
    project: {
        load: (): Promise<{ success: boolean; data?: unknown; error?: string }> =>
            ipcRenderer.invoke('project:load'),
        save: (data: unknown): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('project:save', data),
        selectDir: (): Promise<string | null> =>
            ipcRenderer.invoke('project:selectDir'),
    },

    // ── File Import / Export / Read ──
    file: {
        import: (): Promise<{ success: boolean; data?: unknown; filePath?: string; error?: string }> =>
            ipcRenderer.invoke('file:import'),
        export: (data: unknown): Promise<{ success: boolean; filePath?: string; error?: string }> =>
            ipcRenderer.invoke('file:export', data),
        read: (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
            ipcRenderer.invoke('file:read', filePath),
    },

    // ── Studio ──
    studio: {
        generate: (prompt: string, projectDir?: string): Promise<{ success: boolean; result?: string; text?: string; error?: string }> =>
            ipcRenderer.invoke('studio:generate', prompt, projectDir),
        getAssets: (): Promise<{ assets: { name: string; path: string; type: string; size: number }[] }> =>
            ipcRenderer.invoke('studio:getAssets'),
        getHistory: (): Promise<{ snapshots: { id: string; message: string; timestamp: string }[] }> =>
            ipcRenderer.invoke('studio:getHistory'),
        getDiff: (oldId: string, newId: string): Promise<{ success: boolean; diff?: string }> =>
            ipcRenderer.invoke('studio:getDiff', oldId, newId),
        rollback: (snapshotId: string): Promise<{ success: boolean; error?: string }> =>
            ipcRenderer.invoke('studio:rollback', snapshotId),
        onProgress: (callback: (chunk: string) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, chunk: string) =>
                callback(chunk);
            ipcRenderer.on('studio:progress', listener);
            return () => ipcRenderer.removeListener('studio:progress', listener);
        },
    },

    // ── Job Run ──
    job: {
        run: (recipeId: string, agentId: string): Promise<{ success: boolean; jobId?: string; error?: string }> =>
            ipcRenderer.invoke('job:run', recipeId, agentId),
        stop: (jobId: string): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('job:stop', jobId),
        getStatus: (): Promise<{ jobs: { id: string; status: string; agent: string; progress: number }[] }> =>
            ipcRenderer.invoke('job:getStatus'),
        getArtifacts: (): Promise<{ artifacts: { name: string; path: string; type: string; jobId: string; ts: number }[] }> =>
            ipcRenderer.invoke('job:getArtifacts'),
        getSettings: (): Promise<{ maxConcurrentAgents: number; logVerbosity: string; runTimeoutSeconds: number }> =>
            ipcRenderer.invoke('job:getSettings'),
        saveSettings: (settings: Record<string, unknown>): Promise<{ success: boolean }> =>
            ipcRenderer.invoke('job:saveSettings', settings),
        onProgress: (callback: (agentName: string, chunk: string) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, agentName: string, chunk: string) =>
                callback(agentName, chunk);
            ipcRenderer.on('job:progress', listener);
            return () => ipcRenderer.removeListener('job:progress', listener);
        },
    },

    // ── Mail (reports from agents) ──
    mail: {
        onNewReport: (callback: (report: { fromAgentId: string; fromAgentName: string; subject: string; body: string; type: 'report' | 'error'; timestamp: number }) => void) => {
            const listener = (_e: Electron.IpcRendererEvent, report: any) => callback(report);
            ipcRenderer.on('mail:new-report', listener);
            return () => ipcRenderer.removeListener('mail:new-report', listener);
        },
    },
});
console.log('[Preload] dogbaApi exposed successfully');
} catch (err) {
    console.error('[Preload] FAILED to expose dogbaApi:', err);
}
