interface TerminalCreateOptions {
    cwd?: string;
    autoCommand?: string;
    shell?: string;
    label?: string;
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

interface DogbaTerminalApi {
    create(cols: number, rows: number, options?: TerminalCreateOptions): Promise<TerminalCreateResult>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    destroy(id: string): void;
    list(): Promise<TerminalInfo[]>;
    onData(callback: (id: string, data: string) => void): () => void;
    onExit(callback: (id: string, exitCode: number) => void): () => void;
}

interface AgentSkillInfo {
    id: string;
    label: string;
    description: string;
}

interface DogbaChatApi {
    send(agentName: string, message: string, skillId?: string): Promise<{ success: boolean; text: string; sessionId?: string }>;
    sendStream(agentName: string, message: string, skillId?: string): Promise<{ success: boolean; text: string; sessionId?: string }>;
    getSkills(agentName: string): Promise<{ skills: AgentSkillInfo[] }>;
    onStream(callback: (agentName: string, chunk: string) => void): () => void;
    onStreamEnd(callback: (agentName: string) => void): () => void;
    onToolUse(callback: (agentName: string, toolData: string) => void): () => void;
    closeSession(agentName: string): Promise<{ success: boolean }>;
}

interface DogbaCliApi {
    authStatus(): Promise<{ authenticated: boolean }>;
    authLogin(): Promise<{ success: boolean; error?: string }>;
}

interface DogbaProjectApi {
    load(): Promise<{ success: boolean; data?: import('../types/project').ProjectData; error?: string }>;
    save(data: import('../types/project').ProjectData): Promise<{ success: boolean; error?: string }>;
    selectDir(): Promise<string | null>;
}

interface DogbaFileApi {
    import(): Promise<{ success: boolean; data?: unknown; filePath?: string; error?: string }>;
    export(data: unknown): Promise<{ success: boolean; filePath?: string; error?: string }>;
    read(path: string): Promise<{ success: boolean; content?: string; error?: string }>;
}

interface DogbaStudioApi {
    generate(prompt: string, projectDir?: string): Promise<{ success: boolean; result?: string; text?: string; error?: string }>;
    getAssets(): Promise<{ assets: { name: string; path: string; type: string; size: number }[] }>;
    getHistory(): Promise<{ snapshots: { id: string; message: string; timestamp: string }[] }>;
    getDiff(oldId: string, newId: string): Promise<{ success: boolean; diff?: string }>;
    rollback(snapshotId: string): Promise<{ success: boolean; error?: string }>;
    onProgress(callback: (chunk: string) => void): () => void;
}

interface DogbaJobApi {
    run(recipeId: string, agentId: string): Promise<{ success: boolean; jobId?: string; error?: string }>;
    stop(jobId: string): Promise<{ success: boolean }>;
    getStatus(): Promise<{ jobs: { id: string; status: string; agent: string; progress: number }[] }>;
    getArtifacts(): Promise<{ artifacts: { name: string; path: string; type: string; jobId: string; ts: number }[] }>;
    getSettings(): Promise<{ maxConcurrentAgents: number; logVerbosity: string; runTimeoutSeconds: number }>;
    saveSettings(settings: Record<string, unknown>): Promise<{ success: boolean }>;
    onProgress(callback: (agentName: string, chunk: string) => void): () => void;
}

interface DogbaMailApi {
    onNewReport(callback: (report: {
        fromAgentId: string;
        fromAgentName: string;
        subject: string;
        body: string;
        type: 'report' | 'error';
        timestamp: number;
    }) => void): () => void;
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
}

declare global {
    interface Window {
        dogbaApi?: DogbaApi;
    }
}

export {};
