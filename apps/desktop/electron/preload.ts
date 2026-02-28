import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dogbaApi', {
    app: {
        getVersion: () => process.env.npm_package_version,
    },
    terminal: {
        create: (cols: number, rows: number): Promise<string> =>
            ipcRenderer.invoke('terminal:create', cols, rows),
        write: (id: string, data: string): void =>
            ipcRenderer.send('terminal:write', id, data),
        resize: (id: string, cols: number, rows: number): void =>
            ipcRenderer.send('terminal:resize', id, cols, rows),
        destroy: (id: string): void =>
            ipcRenderer.send('terminal:destroy', id),
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
});
