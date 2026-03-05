interface TerminalCreateOptions {
    cwd?: string;
    autoCommand?: string;
    shell?: string;
    label?: string;
    agentSettings?: {
        model?: string;
        permissionMode?: string;
        maxTurns?: number;
    };
}

interface TerminalCreateResult {
    id: string;
    label: string;
    cwd: string;
}

interface TerminalInfo {
    id: string;
    cwd: string;
    label: string;
    pid: number;
}

interface ParsedEvent {
    type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'prompt';
    content: string;
    toolName?: string;
    timestamp: number;
}

type AgentActivity = 'idle' | 'thinking' | 'working' | 'success' | 'error';

interface DogbaTerminalApi {
    create(
        cols: number,
        rows: number,
        options?: TerminalCreateOptions,
    ): Promise<TerminalCreateResult>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    destroy(id: string): void;
    readHistory(agentId: string): Promise<string>;
    list(): Promise<TerminalInfo[]>;
    onData(callback: (id: string, data: string) => void): () => void;
    onExit(callback: (id: string, exitCode: number) => void): () => void;
    onParsedEvent(
        callback: (tabId: string, event: ParsedEvent) => void,
    ): () => void;
    onActivityChange(
        callback: (tabId: string, activity: AgentActivity) => void,
    ): () => void;
}

interface AgentSkillInfo {
    id: string;
    label: string;
    description: string;
}

interface ChatStreamEvent {
    type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error';
    content: string;
    partial?: boolean;
    toolName?: string;
    toolUseId?: string;
}

interface DogbaChatApi {
    send(
        agentName: string,
        message: string,
        skillId?: string,
    ): Promise<{ success: boolean; text: string; sessionId?: string }>;
    sendStream(
        agentName: string,
        message: string,
        skillId?: string,
    ): Promise<{ success: boolean; text: string; sessionId?: string }>;
    getSkills(agentName: string): Promise<{ skills: AgentSkillInfo[] }>;
    onStream(callback: (agentName: string, chunk: string) => void): () => void;
    onStreamEnd(callback: (agentName: string) => void): () => void;
    onToolUse(
        callback: (agentName: string, toolData: string) => void,
    ): () => void;
    // 신규: stream-event 통합 IPC
    onStreamEvent(
        callback: (agentId: string, event: ChatStreamEvent) => void,
    ): () => void;
    onResponseEnd(callback: (agentId: string) => void): () => void;
    createSession(
        agentId: string,
        agentName: string,
        cwd: string,
        extraArgs?: string[],
    ): Promise<{ success: boolean; sessionId?: string; error?: string }>;
    sendMessage(
        agentId: string,
        message: string,
    ): Promise<{ success: boolean }>;
    closeSession(agentId: string): Promise<{ success: boolean }>;
    onSessionClosed(
        callback: (agentId: string, code: number) => void,
    ): () => void;
}

interface DogbaCliApi {
    authStatus(): Promise<{ authenticated: boolean }>;
    authLogin(): Promise<{ success: boolean; error?: string }>;
}

interface DogbaProjectApi {
    load(): Promise<{
        success: boolean;
        data?: import('../types/project').ProjectData;
        error?: string;
    }>;
    save(
        data: import('../types/project').ProjectData,
    ): Promise<{ success: boolean; error?: string }>;
    selectDir(): Promise<string | null>;
}

interface DogbaFileApi {
    import(): Promise<{
        success: boolean;
        data?: unknown;
        filePath?: string;
        error?: string;
    }>;
    export(
        data: unknown,
    ): Promise<{ success: boolean; filePath?: string; error?: string }>;
    read(
        path: string,
    ): Promise<{ success: boolean; content?: string; error?: string }>;
    saveTempFile(
        base64: string,
        filename: string,
    ): Promise<{ success: boolean; filePath?: string; error?: string }>;
}

interface DogbaStudioApi {
    generate(
        prompt: string,
        projectDir?: string,
    ): Promise<{
        success: boolean;
        result?: string;
        text?: string;
        error?: string;
    }>;
    getAssets(): Promise<{
        assets: { name: string; path: string; type: string; size: number }[];
    }>;
    uploadAsset(): Promise<{ success: boolean; error?: string; copied: string[] }>;
    deleteAsset(filename: string): Promise<{ success: boolean; error?: string }>;
    getHistory(): Promise<{
        snapshots: { id: string; message: string; timestamp: string }[];
    }>;
    getDiff(
        oldId: string,
        newId: string,
    ): Promise<{ success: boolean; diff?: string }>;
    rollback(snapshotId: string): Promise<{ success: boolean; error?: string }>;
    onProgress(callback: (chunk: string) => void): () => void;
}

interface DogbaJobApi {
    run(
        recipeId: string,
        agentId: string,
    ): Promise<{ success: boolean; jobId?: string; error?: string }>;
    stop(jobId: string): Promise<{ success: boolean }>;
    getStatus(): Promise<{
        jobs: { id: string; status: string; agent: string; progress: number }[];
    }>;
    getArtifacts(): Promise<{
        artifacts: {
            name: string;
            path: string;
            type: string;
            jobId: string;
            ts: number;
        }[];
    }>;
    getSettings(): Promise<{
        maxConcurrentAgents: number;
        logVerbosity: string;
        runTimeoutSeconds: number;
    }>;
    saveSettings(
        settings: Record<string, unknown>,
    ): Promise<{ success: boolean }>;
    getHistory(): Promise<{
        history: {
            id: string;
            agent: string;
            task: string;
            status: string;
            startedAt: string;
            completedAt?: string;
            resultPreview?: string;
        }[];
    }>;
    onProgress(
        callback: (agentName: string, chunk: string) => void,
    ): () => void;
}

interface DogbaMailApi {
    onNewReport(
        callback: (report: {
            fromAgentId: string;
            fromAgentName: string;
            subject: string;
            body: string;
            type: 'report' | 'error';
            timestamp: number;
        }) => void,
    ): () => void;
}

interface DogbaAgentApi {
    createTeam(cwd?: string): Promise<{ success: boolean; error?: string }>;
    delegateTask(
        agentName: string,
        task: string,
    ): Promise<{ success: boolean; error?: string }>;
    onTaskResult(callback: (agentId: string, event: any) => void): () => void;
}

interface SkillInfo {
    id: string;
    name: string;
    description: string;
    path: string;
    agent?: string;
}

interface DogbaSkillApi {
    list(
        projectDir?: string,
    ): Promise<{ success: boolean; skills: SkillInfo[]; error?: string }>;
    installDefaults(
        projectDir?: string,
    ): Promise<{
        success: boolean;
        installed: string[];
        skipped: string[];
        error?: string;
    }>;
    getAgentSkills(
        agentName: string,
        projectDir?: string,
    ): Promise<{ success: boolean; skills: SkillInfo[]; error?: string }>;
}

interface DogbaWorktreeApi {
    create(
        agentId: string,
        projectDir?: string,
    ): Promise<{ success: boolean; path?: string; error?: string }>;
    remove(
        agentId: string,
        projectDir?: string,
    ): Promise<{ success: boolean; error?: string }>;
    list(
        projectDir?: string,
    ): Promise<{
        worktrees: {
            agentId: string;
            path: string;
            branch: string;
            head: string;
        }[];
    }>;
}

interface DogbaHooksApi {
    setup(
        projectDir?: string,
    ): Promise<{ success: boolean; created: boolean; error?: string }>;
    generateClaudeMd(
        projectDir?: string,
    ): Promise<{ success: boolean; created: boolean; error?: string }>;
    initProject(
        projectDir?: string,
    ): Promise<{ hooks: boolean; claudeMd: boolean }>;
}

interface DogbaNotificationApi {
    onToast(
        callback: (data: { message: string; type: string }) => void,
    ): () => void;
}

interface DogbaApi {
    app: {
        getVersion: () => string | undefined;
    };
    terminal: DogbaTerminalApi;
    chat: DogbaChatApi;
    cli: DogbaCliApi;
    project: DogbaProjectApi;
    file: DogbaFileApi;
    studio: DogbaStudioApi;
    job: DogbaJobApi;
    mail: DogbaMailApi;
    agent: DogbaAgentApi;
    skill: DogbaSkillApi;
    worktree: DogbaWorktreeApi;
    hooks: DogbaHooksApi;
    notification: DogbaNotificationApi;
}

declare global {
    interface Window {
        dogbaApi?: DogbaApi;
    }
}

export { };
