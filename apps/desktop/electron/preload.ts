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
            getGitDiff: (
                cwd?: string,
            ): Promise<{
                success: boolean;
                branch?: string;
                commitHash?: string;
                diffStats?: {
                    file: string;
                    additions: number;
                    deletions: number;
                }[];
                error?: string;
            }> => ipcRenderer.invoke('mail:getGitDiff', cwd),
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
            recommend: (
                task: string,
            ): Promise<{ agentId: string; score: number; reason: string }[]> =>
                ipcRenderer.invoke('agent:recommend', task),
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
            search: (
                query: string,
            ): Promise<{
                success: boolean;
                skills: {
                    id: string;
                    name: string;
                    description: string;
                    tags: string[];
                    repoUrl: string;
                    author: string;
                    installed: boolean;
                }[];
                error?: string;
            }> => ipcRenderer.invoke('skill:search', query),
            install: (
                skillId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('skill:install', skillId),
            uninstall: (
                skillId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('skill:uninstall', skillId),
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

        // ── Provider Registry ──
        provider: {
            list: (): Promise<{
                providers: {
                    id: string;
                    name: string;
                    command: string;
                    installed: boolean;
                }[];
            }> => ipcRenderer.invoke('provider:list'),
            check: (
                id: string,
            ): Promise<{ installed: boolean; authenticated: boolean }> =>
                ipcRenderer.invoke('provider:check', id),
            setDefault: (
                id: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('provider:set-default', id),
        },

        // ── Workflow Pack ──
        workflow: {
            list: (): Promise<{ packs: any[] }> =>
                ipcRenderer.invoke('workflow:list'),
            apply: (
                packId: string,
            ): Promise<{
                success: boolean;
                agentsAdded: string[];
                skillsActivated: string[];
                error?: string;
            }> => ipcRenderer.invoke('workflow:apply', packId),
            detect: (projectDir?: string): Promise<{ packId: string | null }> =>
                ipcRenderer.invoke('workflow:detect', projectDir),
        },

        // ── Team Template ──
        teamTemplate: {
            list: (): Promise<{ templates: any[] }> =>
                ipcRenderer.invoke('team-template:list'),
            get: (id: string): Promise<{ template?: any; error?: string }> =>
                ipcRenderer.invoke('team-template:get', id),
            suggest: (description: string): Promise<{ template: any | null }> =>
                ipcRenderer.invoke('team-template:suggest', description),
            create: (
                template: any,
            ): Promise<{
                success: boolean;
                id?: string;
                template?: any;
            }> => ipcRenderer.invoke('team-template:create', template),
        },

        // ── Report Generator ──
        report: {
            generate: (
                data: any,
                projectDir?: string,
            ): Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }> => ipcRenderer.invoke('report:generate', data, projectDir),
            list: (projectDir?: string): Promise<{ reports: any[] }> =>
                ipcRenderer.invoke('report:list', projectDir),
            get: (
                filePath: string,
            ): Promise<{
                success: boolean;
                content?: string;
                error?: string;
            }> => ipcRenderer.invoke('report:get', filePath),
        },

        // ── Meeting Manager ──
        meeting: {
            create: (
                topic: string,
                participantIds: string[],
            ): Promise<{
                success: boolean;
                meetingId?: string;
                error?: string;
            }> => ipcRenderer.invoke('meeting:create', topic, participantIds),
            start: (
                meetingId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('meeting:start', meetingId),
            stop: (
                meetingId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('meeting:stop', meetingId),
            onRoundUpdate: (
                callback: (meetingId: string, round: any) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    meetingId: string,
                    round: any,
                ) => callback(meetingId, round);
                ipcRenderer.on('meeting:round-update', listener);
                return () =>
                    ipcRenderer.removeListener(
                        'meeting:round-update',
                        listener,
                    );
            },
            onMeetingEnd: (
                callback: (meetingId: string, result: any) => void,
            ) => {
                const listener = (
                    _e: Electron.IpcRendererEvent,
                    meetingId: string,
                    result: any,
                ) => callback(meetingId, result);
                ipcRenderer.on('meeting:end', listener);
                return () =>
                    ipcRenderer.removeListener('meeting:end', listener);
            },
        },

        // ── Messenger Bridge ──
        messenger: {
            connect: (
                adapterId: string,
                config: Record<string, string>,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('messenger:connect', adapterId, config),
            disconnect: (
                adapterId: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke('messenger:disconnect', adapterId),
            send: (
                adapterId: string,
                channel: string,
                message: string,
            ): Promise<{ success: boolean; error?: string }> =>
                ipcRenderer.invoke(
                    'messenger:send',
                    adapterId,
                    channel,
                    message,
                ),
            list: (): Promise<{
                adapters: {
                    id: string;
                    name: string;
                    connected: boolean;
                }[];
            }> => ipcRenderer.invoke('messenger:list'),
            onMessage: (callback: (msg: any) => void) => {
                const listener = (_e: Electron.IpcRendererEvent, msg: any) =>
                    callback(msg);
                ipcRenderer.on('messenger:message', listener);
                return () =>
                    ipcRenderer.removeListener('messenger:message', listener);
            },
        },

        // ── Agent DB ──
        agentDb: {
            list: (includeInactive?: boolean): Promise<{ agents: any[] }> =>
                ipcRenderer.invoke('agent-db:list', includeInactive),
            get: (id: string): Promise<{ agent?: any; error?: string }> =>
                ipcRenderer.invoke('agent-db:get', id),
            create: (
                agent: any,
            ): Promise<{
                success: boolean;
                agent?: any;
                error?: string;
            }> => ipcRenderer.invoke('agent-db:create', agent),
            update: (
                id: string,
                patch: any,
            ): Promise<{
                success: boolean;
                agent?: any;
                error?: string;
            }> => ipcRenderer.invoke('agent-db:update', id, patch),
        },

        // ── Task Queue ──
        taskQueue: {
            enqueue: (input: {
                description: string;
                priority: string;
                deadline?: number;
                assignedAgent?: string;
            }): Promise<{
                success: boolean;
                taskId: string;
                dispatched: boolean;
            }> => ipcRenderer.invoke('task-queue:enqueue', input),
            list: (): Promise<{
                queued: any[];
                running: any[];
                completed: any[];
            }> => ipcRenderer.invoke('task-queue:list'),
            cancel: (taskId: string): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('task-queue:cancel', taskId),
            dispatch: (): Promise<{
                success: boolean;
                task?: any;
                error?: string;
            }> => ipcRenderer.invoke('task-queue:dispatch'),
            complete: (
                taskId: string,
                result?: string,
            ): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('task-queue:complete', taskId, result),
            fail: (
                taskId: string,
                error?: string,
            ): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('task-queue:fail', taskId, error),
            onDispatched: (callback: (task: any) => void) => {
                const listener = (_e: Electron.IpcRendererEvent, task: any) =>
                    callback(task);
                ipcRenderer.on('task-queue:dispatched', listener);
                return () =>
                    ipcRenderer.removeListener(
                        'task-queue:dispatched',
                        listener,
                    );
            },
        },

        // ── Directive Routing ──
        directive: {
            route: (
                input: string,
                currentTabId: string,
            ): Promise<{
                success: boolean;
                type: string;
                routedTo?: string;
                error?: string;
            }> => ipcRenderer.invoke('directive:route', input, currentTabId),
        },

        // ── Session History Search ──
        session: {
            search: (
                query: string,
            ): Promise<{
                sessions: {
                    id: string;
                    label: string;
                    agentName: string;
                    lastActive: number;
                    preview?: string;
                }[];
            }> => ipcRenderer.invoke('session:search', query),
            getHistory: (
                sessionId: string,
            ): Promise<{
                success: boolean;
                messages?: {
                    role: 'user' | 'assistant';
                    content: string;
                    timestamp?: number;
                }[];
                error?: string;
            }> => ipcRenderer.invoke('session:getHistory', sessionId),
        },

        // ── Agent Metrics ──
        metrics: {
            get: (agentId: string): Promise<any> =>
                ipcRenderer.invoke('metrics:get', agentId),
            getAll: (): Promise<Record<string, any>> =>
                ipcRenderer.invoke('metrics:getAll'),
            topPerformers: (limit?: number): Promise<any[]> =>
                ipcRenderer.invoke('metrics:topPerformers', limit),
        },

        // ── Agent P2P Messaging ──
        p2p: {
            send: (
                from: string,
                to: string,
                content: string,
            ): Promise<{ success: boolean; message: any }> =>
                ipcRenderer.invoke('p2p:send', from, to, content),
            inbox: (
                agentId: string,
                unreadOnly?: boolean,
            ): Promise<{ messages: any[] }> =>
                ipcRenderer.invoke('p2p:inbox', agentId, unreadOnly),
            markRead: (
                agentId: string,
                messageId: string,
            ): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('p2p:markRead', agentId, messageId),
            conversation: (
                agentA: string,
                agentB: string,
            ): Promise<{ messages: any[] }> =>
                ipcRenderer.invoke('p2p:conversation', agentA, agentB),
            clear: (agentId: string): Promise<{ success: boolean }> =>
                ipcRenderer.invoke('p2p:clear', agentId),
            onNewMessage: (callback: (msg: any) => void) => {
                const listener = (_e: Electron.IpcRendererEvent, msg: any) =>
                    callback(msg);
                ipcRenderer.on('p2p:newMessage', listener);
                return () =>
                    ipcRenderer.removeListener('p2p:newMessage', listener);
            },
        },

        // ── Retro Report ──
        retro: {
            daily: (): Promise<any> => ipcRenderer.invoke('retro:daily'),
            weekly: (): Promise<any> => ipcRenderer.invoke('retro:weekly'),
            save: (
                report: any,
                projectDir?: string,
            ): Promise<{
                success: boolean;
                filePath?: string;
                error?: string;
            }> => ipcRenderer.invoke('retro:save', report, projectDir),
        },

        // ── Feedback Loop ──
        feedback: {
            process: (event: any): Promise<any> =>
                ipcRenderer.invoke('feedback:process', event),
            getHistory: (agentId: string): Promise<{ history: any[] }> =>
                ipcRenderer.invoke('feedback:getHistory', agentId),
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
