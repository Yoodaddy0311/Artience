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
            create: (
                cols: number,
                rows: number,
                options?: {
                    cwd?: string;
                    autoCommand?: string;
                    shell?: string;
                    label?: string;
                },
            ): Promise<{ id: string; label: string; cwd: string }> =>
                ipcRenderer.invoke('terminal:create', cols, rows, options),
            readHistory: (agentId: string): Promise<string> =>
                ipcRenderer.invoke('history:read', agentId),
            write: (id: string, data: string): void =>
                ipcRenderer.send('terminal:write', id, data),
            resize: (id: string, cols: number, rows: number): void =>
                ipcRenderer.send('terminal:resize', id, cols, rows),
            destroy: (id: string): void =>
                ipcRenderer.send('terminal:destroy', id),
            list: (): Promise<
                { id: string; cwd: string; label: string; pid: number }[]
            > => ipcRenderer.invoke('terminal:list'),
            onData: (callback: (id: string, data: string) => void) => {
                const listener = (
                    _event: Electron.IpcRendererEvent,
                    id: string,
                    data: string,
                ) => callback(id, data);
                ipcRenderer.on('terminal:data', listener);
                return () =>
                    ipcRenderer.removeListener('terminal:data', listener);
            },
            onExit: (callback: (id: string, exitCode: number) => void) => {
                const listener = (
                    _event: Electron.IpcRendererEvent,
                    id: string,
                    exitCode: number,
                ) => callback(id, exitCode);
                ipcRenderer.on('terminal:exit', listener);
                return () =>
                    ipcRenderer.removeListener('terminal:exit', listener);
            },
            onParsedEvent: (callback: (tabId: string, event: any) => void) => {
                const listener = (
                    _event: Electron.IpcRendererEvent,
                    tabId: string,
                    event: any,
                ) => callback(tabId, event);
                ipcRenderer.on('terminal:parsed-event', listener);
                return () =>
                    ipcRenderer.removeListener(
                        'terminal:parsed-event',
                        listener,
                    );
            },
            onActivityChange: (
                callback: (tabId: string, activity: string) => void,
            ) => {
                const listener = (
                    _event: Electron.IpcRendererEvent,
                    tabId: string,
                    activity: string,
                ) => callback(tabId, activity);
                ipcRenderer.on('terminal:activity-change', listener);
                return () =>
                    ipcRenderer.removeListener(
                        'terminal:activity-change',
                        listener,
                    );
            },
        },

        // ── Chat ──
        chat: {
            send: (
                agentName: string,
                message: string,
                skillId?: string,
            ): Promise<{
                success: boolean;
                text: string;
                sessionId?: string;
            }> => ipcRenderer.invoke('chat:send', agentName, message, skillId),
            sendStream: (
                agentName: string,
                message: string,
                skillId?: string,
            ): Promise<{
                success: boolean;
                text: string;
                sessionId?: string;
            }> =>
                ipcRenderer.invoke(
                    'chat:send-stream',
                    agentName,
                    message,
                    skillId,
                ),
            getSkills: (
                agentName: string,
            ): Promise<{
                skills: { id: string; label: string; description: string }[];
            }> => ipcRenderer.invoke('chat:get-skills', agentName),
            onStream: (
                callback: (agentName: string, chunk: string) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentName: string,
                    chunk: string,
                ) => callback(agentName, chunk);
                ipcRenderer.on('chat:stream', listener);
                return () =>
                    ipcRenderer.removeListener('chat:stream', listener);
            },
            onStreamEnd: (callback: (agentName: string) => void) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentName: string,
                ) => callback(agentName);
                ipcRenderer.on('chat:stream-end', listener);
                return () =>
                    ipcRenderer.removeListener('chat:stream-end', listener);
            },
            onToolUse: (
                callback: (agentName: string, toolData: string) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentName: string,
                    toolData: string,
                ) => callback(agentName, toolData);
                ipcRenderer.on('chat:tool-use', listener);
                return () =>
                    ipcRenderer.removeListener('chat:tool-use', listener);
            },
            // ── 신규: stream-event 통합 IPC ──
            onStreamEvent: (
                callback: (agentId: string, event: any) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentId: string,
                    event: any,
                ) => callback(agentId, event);
                ipcRenderer.on('chat:stream-event', listener);
                return () =>
                    ipcRenderer.removeListener('chat:stream-event', listener);
            },
            onResponseEnd: (callback: (agentId: string) => void) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentId: string,
                ) => callback(agentId);
                ipcRenderer.on('chat:response-end', listener);
                return () =>
                    ipcRenderer.removeListener('chat:response-end', listener);
            },
            sendMessage: (
                agentId: string,
                message: string,
            ): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('chat:send-message', agentId, message),
            createSession: (
                agentId: string,
                agentName: string,
                cwd: string,
                extraArgs?: string[],
            ): Promise<{
                success: boolean;
                sessionId?: string;
                error?: string;
            }> =>
                ipcRenderer.invoke(
                    'chat:create-session',
                    agentId,
                    agentName,
                    cwd,
                    extraArgs,
                ),
            closeSession: (agentName: string): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('chat:close-session', agentName),
            onSessionClosed: (
                callback: (agentId: string, code: number) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentId: string,
                    code: number,
                ) => callback(agentId, code);
                ipcRenderer.on('chat:session-closed', listener);
                return () =>
                    ipcRenderer.removeListener('chat:session-closed', listener);
            },
        },

        // ── CLI Auth ──
        cli: {
            authStatus: (): Promise<{ authenticated: boolean }> =>
                ipcRenderer.invoke('cli:auth-status'),
            authLogin: (): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('cli:auth-login'),
        },

        // ── Artibot Registry ──
        artibot: {
            getRegistry: (): Promise<unknown> =>
                ipcRenderer.invoke('artibot:get-registry'),
            rescan: (projectDir?: string): Promise<unknown> =>
                ipcRenderer.invoke('artibot:rescan', projectDir),
            executeCommand: (
                command: string,
                args: string,
            ): Promise<{ success: boolean; error?: string; text?: string }> =>
                ipcRenderer.invoke('artibot:execute-command', command, args),
            onRegistryUpdated: (callback: (registry: unknown) => void) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    registry: unknown,
                ) => callback(registry);
                ipcRenderer.on('artibot:registry-updated', listener);
                return () =>
                    ipcRenderer.removeListener(
                        'artibot:registry-updated',
                        listener,
                    );
            },
        },

        // ── Project Management ──
        project: {
            load: (): Promise<{
                success: boolean;
                data?: unknown;
                error?: string;
            }> => ipcRenderer.invoke('project:load'),
            save: (
                data: unknown,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('project:save', data),
            selectDir: (): Promise<string | null> =>
                ipcRenderer.invoke('project:selectDir'),
        },

        // ── File Import / Export / Read ──
        file: {
            import: (): Promise<{
                success: boolean;
                data?: unknown;
                filePath?: string;
                error?: string;
            }> => ipcRenderer.invoke('file:import'),
            export: (
                data: unknown,
            ): Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }> => ipcRenderer.invoke('file:export', data),
            read: (
                filePath: string,
            ): Promise<{
                success: boolean;
                content?: string;
                error?: string;
            }> => ipcRenderer.invoke('file:read', filePath),
            saveTempFile: (
                base64: string,
                filename: string,
            ): Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }> => ipcRenderer.invoke('file:saveTempFile', base64, filename),
        },

        // ── Studio ──
        studio: {
            generate: (
                prompt: string,
                projectDir?: string,
            ): Promise<{
                success: boolean;
                result?: string;
                text?: string;
                error?: string;
            }> => ipcRenderer.invoke('studio:generate', prompt, projectDir),
            getAssets: (): Promise<{
                assets: {
                    name: string;
                    path: string;
                    type: string;
                    size: number;
                }[];
            }> => ipcRenderer.invoke('studio:getAssets'),
            uploadAsset: (): Promise<{
                success: boolean;
                error?: string;
                copied: string[];
            }> => ipcRenderer.invoke('studio:uploadAsset'),
            deleteAsset: (
                filename: string,
            ): Promise<{
                success: boolean;
                error?: string;
            }> => ipcRenderer.invoke('studio:deleteAsset', filename),
            getHistory: (): Promise<{
                snapshots: { id: string; message: string; timestamp: string }[];
            }> => ipcRenderer.invoke('studio:getHistory'),
            getDiff: (
                oldId: string,
                newId: string,
            ): Promise<{ success: boolean; diff?: string }> =>
                ipcRenderer.invoke('studio:getDiff', oldId, newId),
            rollback: (
                snapshotId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('studio:rollback', snapshotId),
            onProgress: (callback: (chunk: string) => void) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    chunk: string,
                ) => callback(chunk);
                ipcRenderer.on('studio:progress', listener);
                return () =>
                    ipcRenderer.removeListener('studio:progress', listener);
            },
        },

        // ── Job Run ──
        job: {
            run: (
                recipeId: string,
                agentId: string,
            ): Promise<{ success: boolean; jobId?: string; error?: string }> =>
                ipcRenderer.invoke('job:run', recipeId, agentId),
            stop: (jobId: string): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('job:stop', jobId),
            getStatus: (): Promise<{
                jobs: {
                    id: string;
                    status: string;
                    agent: string;
                    progress: number;
                }[];
            }> => ipcRenderer.invoke('job:getStatus'),
            getArtifacts: (): Promise<{
                artifacts: {
                    name: string;
                    path: string;
                    type: string;
                    jobId: string;
                    ts: number;
                }[];
            }> => ipcRenderer.invoke('job:getArtifacts'),
            getSettings: (): Promise<{
                maxConcurrentAgents: number;
                logVerbosity: string;
                runTimeoutSeconds: number;
            }> => ipcRenderer.invoke('job:getSettings'),
            saveSettings: (
                settings: Record<string, unknown>,
            ): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('job:saveSettings', settings),
            getHistory: (): Promise<{
                history: {
                    id: string;
                    agent: string;
                    task: string;
                    status: string;
                    startedAt: string;
                    completedAt?: string;
                    resultPreview?: string;
                }[];
            }> => ipcRenderer.invoke('job:getHistory'),
            onProgress: (
                callback: (agentName: string, chunk: string) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentName: string,
                    chunk: string,
                ) => callback(agentName, chunk);
                ipcRenderer.on('job:progress', listener);
                return () =>
                    ipcRenderer.removeListener('job:progress', listener);
            },
        },

        // ── Mail (reports from agents) ──
        mail: {
            onNewReport: (
                callback: (report: {
                    fromAgentId: string;
                    fromAgentName: string;
                    subject: string;
                    body: string;
                    type: 'report' | 'error';
                    timestamp: number;
                }) => void,
            ) => {
                const listener = (_e: Electron.IpcRendererEvent, report: any) =>
                    callback(report);
                ipcRenderer.on('mail:new-report', listener);
                return () =>
                    ipcRenderer.removeListener('mail:new-report', listener);
            },
        },

        // ── Agent Team (CTO Controller) ──
        agent: {
            createTeam: (
                cwd?: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('agent:create-team', cwd),
            delegateTask: (
                agentName: string,
                task: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('agent:delegate-task', agentName, task),
            onTaskResult: (callback: (agentId: string, event: any) => void) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    agentId: string,
                    event: any,
                ) => callback(agentId, event);
                ipcRenderer.on('agent:task-result', listener);
                return () =>
                    ipcRenderer.removeListener('agent:task-result', listener);
            },
        },

        // ── Skill Manager ──
        skill: {
            list: (
                projectDir?: string,
            ): Promise<{
                success: boolean;
                skills: {
                    id: string;
                    name: string;
                    description: string;
                    path: string;
                    agent?: string;
                }[];
                error?: string;
            }> => ipcRenderer.invoke('skill:list', projectDir),
            installDefaults: (
                projectDir?: string,
            ): Promise<{
                success: boolean;
                installed: string[];
                skipped: string[];
                error?: string;
            }> => ipcRenderer.invoke('skill:install-defaults', projectDir),
            getAgentSkills: (
                agentName: string,
                projectDir?: string,
            ): Promise<{
                success: boolean;
                skills: {
                    id: string;
                    name: string;
                    description: string;
                    path: string;
                    agent?: string;
                }[];
                error?: string;
            }> =>
                ipcRenderer.invoke(
                    'skill:get-agent-skills',
                    agentName,
                    projectDir,
                ),
        },

        // ── Worktree Manager ──
        worktree: {
            create: (
                agentId: string,
                projectDir?: string,
            ): Promise<{ success: boolean; path?: string; error?: string }> =>
                ipcRenderer.invoke('worktree:create', agentId, projectDir),
            remove: (
                agentId: string,
                projectDir?: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('worktree:remove', agentId, projectDir),
            list: (
                projectDir?: string,
            ): Promise<{
                worktrees: {
                    agentId: string;
                    path: string;
                    branch: string;
                    head: string;
                }[];
            }> => ipcRenderer.invoke('worktree:list', projectDir),
        },

        // ── Hooks Manager ──
        hooks: {
            setup: (
                projectDir?: string,
            ): Promise<{
                success: boolean;
                created: boolean;
                error?: string;
            }> => ipcRenderer.invoke('hooks:setup', projectDir),
            generateClaudeMd: (
                projectDir?: string,
            ): Promise<{
                success: boolean;
                created: boolean;
                error?: string;
            }> => ipcRenderer.invoke('hooks:generate-claude-md', projectDir),
            initProject: (
                projectDir?: string,
            ): Promise<{ hooks: boolean; claudeMd: boolean }> =>
                ipcRenderer.invoke('hooks:init-project', projectDir),
        },

        // ── App Notifications (from MCP server / main process) ──
        notification: {
            onToast: (
                callback: (data: { message: string; type: string }) => void,
            ) => {
                const listener = (_e: Electron.IpcRendererEvent, data: any) =>
                    callback(data);
                ipcRenderer.on('app:toast', listener);
                return () => ipcRenderer.removeListener('app:toast', listener);
            },
        },
    });
    console.log('[Preload] dogbaApi exposed successfully');
} catch (err) {
    console.error('[Preload] FAILED to expose dogbaApi:', err);
}
