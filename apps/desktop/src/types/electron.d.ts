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

interface DogbaArtibotApi {
    getRegistry(): Promise<unknown>;
    rescan(projectDir?: string): Promise<unknown>;
    executeCommand(
        command: string,
        args: string,
    ): Promise<{ success: boolean; error?: string; text?: string }>;
    onRegistryUpdated(callback: (registry: unknown) => void): () => void;
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
    uploadAsset(): Promise<{
        success: boolean;
        error?: string;
        copied: string[];
    }>;
    deleteAsset(
        filename: string,
    ): Promise<{ success: boolean; error?: string }>;
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

interface GitDiffResult {
    success: boolean;
    branch?: string;
    commitHash?: string;
    diffStats?: { file: string; additions: number; deletions: number }[];
    error?: string;
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
    getGitDiff(cwd?: string): Promise<GitDiffResult>;
}

interface AgentRecommendation {
    agentId: string;
    score: number;
    reason: string;
}

interface DogbaAgentApi {
    createTeam(cwd?: string): Promise<{ success: boolean; error?: string }>;
    delegateTask(
        agentName: string,
        task: string,
    ): Promise<{ success: boolean; error?: string }>;
    recommend(task: string): Promise<AgentRecommendation[]>;
    onTaskResult(callback: (agentId: string, event: any) => void): () => void;
}

interface SkillInfo {
    id: string;
    name: string;
    description: string;
    path: string;
    agent?: string;
}

interface MarketplaceSkillInfo {
    id: string;
    name: string;
    description: string;
    tags: string[];
    repoUrl: string;
    author: string;
    installed: boolean;
}

interface DogbaSkillApi {
    list(
        projectDir?: string,
    ): Promise<{ success: boolean; skills: SkillInfo[]; error?: string }>;
    installDefaults(projectDir?: string): Promise<{
        success: boolean;
        installed: string[];
        skipped: string[];
        error?: string;
    }>;
    getAgentSkills(
        agentName: string,
        projectDir?: string,
    ): Promise<{ success: boolean; skills: SkillInfo[]; error?: string }>;
    search(query: string): Promise<{
        success: boolean;
        skills: MarketplaceSkillInfo[];
        error?: string;
    }>;
    install(skillId: string): Promise<{ success: boolean; error?: string }>;
    uninstall(skillId: string): Promise<{ success: boolean; error?: string }>;
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
    list(projectDir?: string): Promise<{
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

interface ReportSummary {
    id: string;
    agentName: string;
    taskDescription: string;
    date: string;
    filePath: string;
}

interface DogbaReportApi {
    generate(
        data: any,
        projectDir?: string,
    ): Promise<{ success: boolean; filePath?: string; error?: string }>;
    list(projectDir?: string): Promise<{ reports: ReportSummary[] }>;
    get(
        filePath: string,
    ): Promise<{ success: boolean; content?: string; error?: string }>;
}

interface DogbaNotificationApi {
    onToast(
        callback: (data: { message: string; type: string }) => void,
    ): () => void;
}

interface MeetingRoundData {
    roundNumber: number;
    opinions: {
        agentId: string;
        opinion: string;
        vote: 'approve' | 'hold' | 'revise';
    }[];
    consensus: 'approved' | 'hold' | 'revision' | 'pending';
}

interface MeetingEndResult {
    status: 'completed' | 'cancelled';
    rounds: MeetingRoundData[];
    finalConsensus: 'approved' | 'hold' | 'revision' | 'pending';
}

interface DogbaMeetingApi {
    create(
        topic: string,
        participantIds: string[],
    ): Promise<{ success: boolean; meetingId?: string; error?: string }>;
    start(meetingId: string): Promise<{ success: boolean; error?: string }>;
    stop(meetingId: string): Promise<{ success: boolean; error?: string }>;
    onRoundUpdate(
        callback: (meetingId: string, round: MeetingRoundData) => void,
    ): () => void;
    onMeetingEnd(
        callback: (meetingId: string, result: MeetingEndResult) => void,
    ): () => void;
}

interface DogbaProviderApi {
    list(): Promise<{
        providers: {
            id: string;
            name: string;
            command: string;
            installed: boolean;
        }[];
    }>;
    check(id: string): Promise<{ installed: boolean; authenticated: boolean }>;
    setDefault(id: string): Promise<{ success: boolean; error?: string }>;
}

interface WorkflowPackInfo {
    id: string;
    name: string;
    description: string;
    icon: string;
    agents: string[];
    skills: string[];
}

interface DogbaWorkflowApi {
    list(): Promise<{ packs: WorkflowPackInfo[] }>;
    apply(packId: string): Promise<{
        success: boolean;
        agentsAdded: string[];
        skillsActivated: string[];
        error?: string;
    }>;
    detect(projectDir?: string): Promise<{ packId: string | null }>;
}

interface AgentRecord {
    id: string;
    name: string;
    role: string;
    personality: string;
    department?: string;
    provider?: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}

interface DogbaAgentDbApi {
    list(includeInactive?: boolean): Promise<{ agents: AgentRecord[] }>;
    get(id: string): Promise<{ agent?: AgentRecord; error?: string }>;
    create(
        agent: Omit<AgentRecord, 'createdAt' | 'updatedAt'>,
    ): Promise<{ success: boolean; agent?: AgentRecord; error?: string }>;
    update(
        id: string,
        patch: Partial<AgentRecord>,
    ): Promise<{ success: boolean; agent?: AgentRecord; error?: string }>;
}

type DirectiveType = 'ceo' | 'task' | 'normal';

interface DirectiveRouteResult {
    success: boolean;
    type: DirectiveType;
    routedTo?: string;
    error?: string;
}

interface DogbaDirectiveApi {
    route(input: string, currentTabId: string): Promise<DirectiveRouteResult>;
}

interface SessionSearchResult {
    id: string;
    label: string;
    agentName: string;
    lastActive: number;
    preview?: string;
}

interface SessionMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: number;
}

interface DogbaSessionApi {
    search(query: string): Promise<{ sessions: SessionSearchResult[] }>;
    getHistory(sessionId: string): Promise<{
        success: boolean;
        messages?: SessionMessage[];
        error?: string;
    }>;
}

interface TaskMetricRecord {
    taskId: string;
    agentId: string;
    description: string;
    startedAt: number;
    completedAt?: number;
    status: 'success' | 'failure' | 'timeout';
    durationMs?: number;
}

interface AgentMetricsRecord {
    agentId: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    completionRate: number;
    avgDurationMs: number;
    recentTasks: TaskMetricRecord[];
    lastActive: number;
}

interface DogbaMetricsApi {
    get(agentId: string): Promise<AgentMetricsRecord>;
    getAll(): Promise<Record<string, AgentMetricsRecord>>;
    topPerformers(limit?: number): Promise<AgentMetricsRecord[]>;
}

interface TeamTemplateMember {
    role: string;
    agentId: string;
    required: boolean;
}

interface TeamTemplateInfo {
    id: string;
    name: string;
    description: string;
    agents: TeamTemplateMember[];
    suggestedFor: string[];
}

interface DogbaTeamTemplateApi {
    list(): Promise<{ templates: TeamTemplateInfo[] }>;
    get(id: string): Promise<{ template?: TeamTemplateInfo; error?: string }>;
    suggest(
        description: string,
    ): Promise<{ template: TeamTemplateInfo | null }>;
    create(
        template: Omit<TeamTemplateInfo, 'id'>,
    ): Promise<{ success: boolean; id?: string; template?: TeamTemplateInfo }>;
}

type ScheduledTaskPriority = 'critical' | 'high' | 'medium' | 'low';
type ScheduledTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

interface ScheduledTaskInfo {
    id: string;
    description: string;
    priority: ScheduledTaskPriority;
    deadline?: number;
    assignedAgent?: string;
    createdAt: number;
    status: ScheduledTaskStatus;
    result?: string;
}

interface DogbaTaskQueueApi {
    enqueue(input: {
        description: string;
        priority: ScheduledTaskPriority;
        deadline?: number;
        assignedAgent?: string;
    }): Promise<{ success: boolean; taskId: string; dispatched: boolean }>;
    list(): Promise<{
        queued: ScheduledTaskInfo[];
        running: ScheduledTaskInfo[];
        completed: ScheduledTaskInfo[];
    }>;
    cancel(taskId: string): Promise<{ success: boolean }>;
    dispatch(): Promise<{
        success: boolean;
        task?: ScheduledTaskInfo;
        error?: string;
    }>;
    complete(taskId: string, result?: string): Promise<{ success: boolean }>;
    fail(taskId: string, error?: string): Promise<{ success: boolean }>;
    onDispatched(callback: (task: ScheduledTaskInfo) => void): () => void;
}

interface DogbaApi {
    app: {
        getVersion: () => string | undefined;
    };
    artibot: DogbaArtibotApi;
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
    directive: DogbaDirectiveApi;
    notification: DogbaNotificationApi;
    provider: DogbaProviderApi;
    report: DogbaReportApi;
    workflow: DogbaWorkflowApi;
    teamTemplate: DogbaTeamTemplateApi;
    meeting: DogbaMeetingApi;
    messenger: DogbaMessengerApi;
    agentDb: DogbaAgentDbApi;
    session: DogbaSessionApi;
    metrics: DogbaMetricsApi;
    taskQueue: DogbaTaskQueueApi;
}

interface IncomingMessengerMessage {
    adapterId: string;
    channel: string;
    sender: string;
    content: string;
    timestamp: number;
}

interface DogbaMessengerApi {
    connect(
        adapterId: string,
        config: Record<string, string>,
    ): Promise<{ success: boolean; error?: string }>;
    disconnect(
        adapterId: string,
    ): Promise<{ success: boolean; error?: string }>;
    send(
        adapterId: string,
        channel: string,
        message: string,
    ): Promise<{ success: boolean; error?: string }>;
    list(): Promise<{
        adapters: { id: string; name: string; connected: boolean }[];
    }>;
    onMessage(callback: (msg: IncomingMessengerMessage) => void): () => void;
}

declare global {
    interface Window {
        dogbaApi?: DogbaApi;
    }
}

export {};
