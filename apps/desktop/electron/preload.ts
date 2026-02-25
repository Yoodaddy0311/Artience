import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('dogbaApi', {
    app: {
        getVersion: () => process.env.npm_package_version,
    }
});
