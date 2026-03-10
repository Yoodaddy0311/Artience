import React, {
    useRef,
    useEffect,
    useCallback,
    useState,
    useMemo,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../store/useTerminalStore';
import { DEFAULT_AGENTS } from '../../types/platform';
import { assetPath } from '../../lib/assetPath';
import { ChatInput } from './ChatInput';
import type { ParsedEvent } from '../../lib/pty-parser';
import type { ViewMode } from '../../store/useTerminalStore';
import { useTimelineStore } from '../../store/useTimelineStore';

// ── 상대 시간 포맷 ──
function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5) return '방금';
    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return `${Math.floor(diff / 86400)}일 전`;
}

// ── 복사 버튼 ──
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [text]);

    return (
        <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 shrink-0"
            title="복사"
        >
            {copied ? (
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-green-500"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            ) : (
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
            )}
        </button>
    );
};

// ── 채팅 메시지 버블 ──
const ChatBubble: React.FC<{
    event: ParsedEvent;
    agentSprite?: string;
    agentName?: string;
}> = ({ event, agentSprite, agentName }) => {
    const [collapsed, setCollapsed] = useState(true);

    switch (event.type) {
        case 'prompt':
            return (
                <div className="flex items-center gap-2 my-3 px-2">
                    <div className="flex-1 h-px bg-gray-300" />
                    <span className="text-[10px] font-bold text-gray-400 shrink-0">
                        입력 대기 중...
                    </span>
                    <div className="flex-1 h-px bg-gray-300" />
                </div>
            );

        case 'text':
            return (
                <div className="flex gap-2 items-end max-w-[85%] group">
                    {agentSprite && (
                        <div className="w-7 h-7 border-2 border-black rounded-lg bg-[#E8DAFF] p-0.5 flex items-center justify-center shrink-0">
                            <img
                                src={assetPath(agentSprite)}
                                alt=""
                                className="w-5 h-5 object-contain"
                            />
                        </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                        {agentName && (
                            <span className="text-[10px] font-bold text-gray-500 ml-1">
                                {agentName}
                            </span>
                        )}
                        <div className="relative bg-white border-2 border-black rounded-2xl shadow-[2px_2px_0_0_#000] px-3 py-2">
                            <p className="text-sm text-black whitespace-pre-wrap break-words">
                                {event.content}
                            </p>
                            <div className="absolute -top-1 -right-1">
                                <CopyButton text={event.content} />
                            </div>
                        </div>
                        <span className="text-[9px] text-gray-400 ml-1">
                            {relativeTime(event.timestamp)}
                        </span>
                    </div>
                </div>
            );

        case 'thinking':
            return (
                <div className="max-w-[85%] ml-9">
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-700 transition-colors mb-0.5"
                    >
                        <span
                            className="transform transition-transform"
                            style={{
                                transform: collapsed
                                    ? 'rotate(0deg)'
                                    : 'rotate(90deg)',
                            }}
                        >
                            ▶
                        </span>
                        thinking...
                    </button>
                    {!collapsed && (
                        <div className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2">
                            <p className="text-xs text-gray-600 italic whitespace-pre-wrap break-words">
                                {event.content}
                            </p>
                        </div>
                    )}
                    <span className="text-[9px] text-gray-400 ml-1">
                        {relativeTime(event.timestamp)}
                    </span>
                </div>
            );

        case 'tool_use':
            return (
                <div className="max-w-[85%] ml-9">
                    <div className="bg-[#FFD100]/10 border-2 border-[#FFD100] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">⚡</span>
                            <span className="text-[11px] font-black text-black">
                                {event.toolName || 'tool'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">
                            {event.content}
                        </p>
                    </div>
                    <span className="text-[9px] text-gray-400 ml-1">
                        {relativeTime(event.timestamp)}
                    </span>
                </div>
            );

        case 'tool_result': {
            return (
                <div className="max-w-[85%] ml-9 group">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCollapsed(!collapsed)}
                            className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-700 transition-colors mb-0.5"
                        >
                            <span
                                className="transform transition-transform"
                                style={{
                                    transform: collapsed
                                        ? 'rotate(0deg)'
                                        : 'rotate(90deg)',
                                }}
                            >
                                ▶
                            </span>
                            결과 보기
                        </button>
                        <CopyButton text={event.content} />
                    </div>
                    {!collapsed && (
                        <div className="bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 overflow-x-auto">
                            <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">
                                {event.content}
                            </pre>
                        </div>
                    )}
                    <span className="text-[9px] text-gray-400 ml-1">
                        {relativeTime(event.timestamp)}
                    </span>
                </div>
            );
        }

        case 'error':
            return (
                <div className="max-w-[85%] ml-9">
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">✕</span>
                            <span className="text-[11px] font-black text-red-600">
                                Error
                            </span>
                        </div>
                        <p className="text-xs text-red-700 whitespace-pre-wrap break-words">
                            {event.content}
                        </p>
                    </div>
                    <span className="text-[9px] text-gray-400 ml-1">
                        {relativeTime(event.timestamp)}
                    </span>
                </div>
            );

        default:
            return null;
    }
};

// ── 이미지 경로 감지 ──
const IMAGE_PATH_RE =
    /(?:^|\s)((?:[A-Za-z]:[\\\/]|[\/~])[\w\s.\-\\\/]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/gi;

function extractImagePaths(text: string): string[] {
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = IMAGE_PATH_RE.exec(text)) !== null) {
        matches.push(m[1].trim());
    }
    IMAGE_PATH_RE.lastIndex = 0;
    return matches;
}

function toFileUrl(p: string): string {
    // Windows backslash → forward slash
    const normalized = p.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return `file://${normalized}`;
    return `file:///${normalized}`; // e.g. C:/foo → file:///C:/foo
}

// ── 사용자 입력 버블 (오른쪽 정렬) ──
const UserBubble: React.FC<{ content: string; timestamp: number }> = ({
    content,
    timestamp,
}) => {
    const imagePaths = useMemo(() => extractImagePaths(content), [content]);

    return (
        <div className="flex justify-end">
            <div className="max-w-[75%] flex flex-col items-end gap-0.5">
                <div className="bg-[#E8DAFF] border-2 border-black rounded-2xl px-3 py-2">
                    <p className="text-sm text-black whitespace-pre-wrap break-words">
                        {content}
                    </p>
                    {imagePaths.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {imagePaths.map((p, i) => (
                                <img
                                    key={i}
                                    src={toFileUrl(p)}
                                    alt=""
                                    className="max-w-[200px] max-h-[120px] rounded-lg border border-black/20 object-contain"
                                    onError={(e) => {
                                        (
                                            e.target as HTMLImageElement
                                        ).style.display = 'none';
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
                <span className="text-[9px] text-gray-400 mr-1">
                    {relativeTime(timestamp)}
                </span>
            </div>
        </div>
    );
};

// ── 채팅 뷰 전체 ──
const ChatView: React.FC<{
    messages: ParsedEvent[];
    agentSprite?: string;
    agentName?: string;
}> = ({ messages, agentSprite, agentName }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // 자동 스크롤
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length, autoScroll]);

    // 스크롤 위치 감지 — 사용자가 위로 스크롤하면 자동스크롤 해제
    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        setAutoScroll(scrollHeight - scrollTop - clientHeight < 60);
    }, []);

    if (messages.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-cream-50">
                <div className="text-center">
                    {agentSprite && (
                        <div className="w-12 h-12 border-2 border-black rounded-xl bg-[#E8DAFF] p-1 flex items-center justify-center mx-auto mb-3">
                            <img
                                src={assetPath(agentSprite)}
                                alt=""
                                className="w-9 h-9 object-contain"
                            />
                        </div>
                    )}
                    <p className="text-sm font-bold text-black">
                        메시지를 입력하면 여기에 대화가 표시됩니다
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        Claude Code 세션과 실시간으로 동기화됩니다
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto bg-cream-50 px-3 py-3 space-y-2"
        >
            {messages.map((event, i) => {
                // 사용자 입력은 오른쪽 정렬 버블
                if (event.toolName === '__user_input__') {
                    return (
                        <UserBubble
                            key={i}
                            content={event.content}
                            timestamp={event.timestamp}
                        />
                    );
                }
                // prompt 구분선
                if (event.type === 'prompt') {
                    return <ChatBubble key={i} event={event} />;
                }
                // 에이전트 메시지 (왼쪽 정렬)
                return (
                    <ChatBubble
                        key={i}
                        event={event}
                        agentSprite={agentSprite}
                        agentName={agentName}
                    />
                );
            })}

            {/* 자동 스크롤 해제 시 "최신으로" 버튼 */}
            {!autoScroll && (
                <button
                    onClick={() => {
                        setAutoScroll(true);
                        scrollRef.current?.scrollTo({
                            top: scrollRef.current.scrollHeight,
                            behavior: 'smooth',
                        });
                    }}
                    className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 text-[10px] font-bold bg-white border-2 border-black rounded-full shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] transition-all"
                >
                    ↓ 최신 메시지
                </button>
            )}
        </div>
    );
};

// ── 뷰 모드 토글 버튼 ──
const ViewModeToggle: React.FC<{
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    hasAgent: boolean;
}> = ({ mode, onChange, hasAgent }) => {
    if (!hasAgent) return null;

    return (
        <div className="flex items-center bg-gray-100 border-2 border-black rounded-full p-0.5">
            <button
                onClick={() => onChange('terminal')}
                className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full transition-all ${
                    mode === 'terminal'
                        ? 'bg-[#E8DAFF] border border-black shadow-[1px_1px_0_0_#000] text-black'
                        : 'text-gray-500 hover:text-black'
                }`}
            >
                터미널
            </button>
            <button
                onClick={() => onChange('chat')}
                className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full transition-all ${
                    mode === 'chat'
                        ? 'bg-[#E8DAFF] border border-black shadow-[1px_1px_0_0_#000] text-black'
                        : 'text-gray-500 hover:text-black'
                }`}
            >
                채팅
            </button>
        </div>
    );
};

// Stable empty array reference (avoids infinite re-render from [] !== [])
const STABLE_EMPTY_MESSAGES: ParsedEvent[] = [];

// ── TerminalPanel 메인 컴포넌트 ──
export const TerminalPanel: React.FC = () => {
    // Selective subscriptions to avoid infinite re-render from parsedMessages/agentActivity churn
    const tabs = useTerminalStore((s) => s.tabs);
    const activeTabId = useTerminalStore((s) => s.activeTabId);
    const addTab = useTerminalStore((s) => s.addTab);
    const removeTab = useTerminalStore((s) => s.removeTab);
    const setActiveTab = useTerminalStore((s) => s.setActiveTab);
    const updateTab = useTerminalStore((s) => s.updateTab);
    const viewMode = useTerminalStore((s) => s.viewMode);
    const setViewMode = useTerminalStore((s) => s.setViewMode);
    const setPanelVisible = useTerminalStore((s) => s.setPanelVisible);
    const panelFullscreen = useTerminalStore((s) => s.panelFullscreen);
    const togglePanelFullscreen = useTerminalStore(
        (s) => s.togglePanelFullscreen,
    );

    const xtermMapRef = useRef<
        Map<string, { terminal: Terminal; fitAddon: FitAddon }>
    >(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalAreaRef = useRef<HTMLDivElement>(null);

    const activeTab = tabs.find((t) => t.id === activeTabId);
    const activeAgent = activeTab?.agentId
        ? activeTab.agentId === 'raccoon'
            ? {
                  id: 'raccoon',
                  name: 'Dokba',
                  role: 'AI 어시스턴트',
                  sprite: '/assets/characters/dokba_profile.png',
              }
            : DEFAULT_AGENTS.find((a) => a.id === activeTab.agentId)
        : null;

    // 현재 에이전트 활동 상태 (selective subscription)
    const activeAgentId = activeTab?.agentId;
    const currentActivity = useTerminalStore((s) =>
        activeAgentId ? s.agentActivity[activeAgentId] : undefined,
    );

    // 현재 탭의 뷰 모드 (기본: terminal)
    const currentViewMode: ViewMode = activeTabId
        ? viewMode[activeTabId] || 'terminal'
        : 'terminal';

    // 현재 탭의 채팅 메시지 (selective subscription — stable empty ref to avoid infinite re-render)
    const currentMessages = useTerminalStore(
        useCallback(
            (s: { parsedMessages: Record<string, ParsedEvent[]> }) => {
                if (!activeTabId) return STABLE_EMPTY_MESSAGES;
                return s.parsedMessages[activeTabId] || STABLE_EMPTY_MESSAGES;
            },
            [activeTabId],
        ),
    );

    // ── ChatInput onSubmit 콜백: PTY write(50ms split) + parsedMessages 추가 ──
    const handleChatSubmit = useCallback((msg: string) => {
        const state = useTerminalStore.getState();
        const currentTab = state.tabs.find((t) => t.id === state.activeTabId);
        if (!currentTab) return;

        const tabId = currentTab.id;
        const api = window.dogbaApi?.terminal;
        if (!api) return;

        // 채팅 모드에서 사용자 입력을 parsedMessages에 추가 (UserBubble)
        const currentMode = state.viewMode[tabId] || 'terminal';
        if (currentMode === 'chat') {
            state.addParsedEvent(tabId, {
                type: 'text',
                content: msg,
                timestamp: Date.now(),
                toolName: '__user_input__',
            });
        }

        // Claude Code ink TUI: 텍스트와 \r을 분리 전송해야 함
        api.write(tabId, msg);
        setTimeout(() => {
            api.write(tabId, '\r');
        }, 50);
    }, []);

    // Create a new terminal tab via IPC
    const handleAddTab = useCallback(async () => {
        const api = window.dogbaApi?.terminal;
        if (!api) return;
        try {
            const result = await api.create(80, 24, { label: 'Terminal' });
            addTab({
                id: result.id,
                label: result.label,
                cwd: result.cwd,
                status: 'connecting',
            });
        } catch (e) {
            if (import.meta.env.DEV)
                console.error('Failed to create terminal:', e);
        }
    }, [addTab]);

    // Close a terminal tab
    const handleCloseTab = useCallback(
        (id: string) => {
            const api = window.dogbaApi?.terminal;
            if (api) api.destroy(id);
            const entry = xtermMapRef.current.get(id);
            if (entry) {
                entry.terminal.dispose();
                xtermMapRef.current.delete(id);
            }
            removeTab(id);
        },
        [removeTab],
    );

    // ── Terminal IPC listeners — xterm write + parsed events ──
    useEffect(() => {
        const api = window.dogbaApi?.terminal;
        if (!api) return;

        // Raw data → xterm (unchanged)
        const unsubData = api.onData((id: string, data: string) => {
            const entry = xtermMapRef.current.get(id);
            if (entry) entry.terminal.write(data);
        });

        const unsubExit = api.onExit((id: string, _exitCode: number) => {
            updateTab(id, { status: 'exited' });
        });

        // Parsed events from PTY parser (tee path from main process)
        const unsubParsed = api.onParsedEvent?.(
            (tabId: string, event: ParsedEvent) => {
                useTerminalStore.getState().addParsedEvent(tabId, event);

                // team_update 이벤트 → 캐릭터 자동 매핑
                if (event.type === 'team_update') {
                    const store = useTerminalStore.getState();
                    if (event.teamMembers && event.teamMembers.length > 0) {
                        store.setActiveTeamMembers(event.teamMembers);
                    } else {
                        store.clearActiveTeam();
                    }
                }
            },
        );

        // Activity changes → agentActivity store (for badge + AgentTown)
        const unsubActivity = api.onActivityChange?.(
            (tabId: string, activity: string) => {
                // Map tabId to agentId through the tabs list
                const state = useTerminalStore.getState();
                const tab = state.tabs.find((t) => t.id === tabId);
                if (tab?.agentId) {
                    const typedActivity =
                        activity as import('../../lib/pty-parser').AgentActivity;
                    state.setAgentActivity(tab.agentId, typedActivity);

                    // Record timeline entry for Gantt view
                    const lastToolEvent = (state.parsedMessages[tabId] ?? [])
                        .slice(-5)
                        .reverse()
                        .find(
                            (e: ParsedEvent) =>
                                e.type === 'tool_use' && e.toolName,
                        );
                    const tls = useTimelineStore.getState();
                    tls.recordTransition(
                        tab.agentId,
                        typedActivity,
                        lastToolEvent?.toolName,
                    );

                    // Propagate timeline to team members
                    const teamMembers = state.activeTeamMembers;
                    if (teamMembers && Object.keys(teamMembers).length > 0) {
                        for (const memberAgentId of Object.values(
                            teamMembers,
                        )) {
                            if (memberAgentId === tab.agentId) continue;
                            tls.recordTransition(
                                memberAgentId,
                                typedActivity,
                                lastToolEvent?.toolName,
                            );
                        }
                    }
                }
            },
        );

        return () => {
            unsubData();
            unsubExit();
            unsubParsed?.();
            unsubActivity?.();
        };
    }, [updateTab]);

    // Create xterm instances for new tabs, dispose removed ones
    useEffect(() => {
        for (const tab of tabs) {
            if (xtermMapRef.current.has(tab.id)) continue;

            const terminal = new Terminal({
                theme: {
                    background: '#1e1e2e',
                    foreground: '#cdd6f4',
                    cursor: '#f5e0dc',
                },
                fontFamily: '"Cascadia Code", "Fira Code", monospace',
                fontSize: 14,
                cursorBlink: true,
                allowProposedApi: true,
            });
            const fitAddon = new FitAddon();
            terminal.loadAddon(fitAddon);

            terminal.onData((data) => {
                window.dogbaApi?.terminal?.write(tab.id, data);
            });

            terminal.onResize(({ cols, rows }) => {
                window.dogbaApi?.terminal?.resize(tab.id, cols, rows);
            });

            xtermMapRef.current.set(tab.id, { terminal, fitAddon });
        }

        // Cleanup instances for removed tabs
        const tabIds = new Set(tabs.map((t) => t.id));
        for (const [id, entry] of xtermMapRef.current) {
            if (!tabIds.has(id)) {
                entry.terminal.dispose();
                xtermMapRef.current.delete(id);
            }
        }
    }, [tabs]);

    // Ref callback to mount xterm into DOM
    const mountTerminal = useCallback(
        (id: string, el: HTMLDivElement | null) => {
            if (!el) return;
            const entry = xtermMapRef.current.get(id);
            if (!entry) return;
            if (el.querySelector('.xterm')) return;
            entry.terminal.open(el);
            // 레이아웃 완료 후 fit (마진 반영)
            requestAnimationFrame(() => {
                entry.fitAddon.fit();
                entry.terminal.focus();
            });
            updateTab(id, { status: 'connected' });
        },
        [updateTab],
    );

    // Re-fit active tab when it changes, and refocus
    useEffect(() => {
        if (!activeTabId) return;
        // 터미널 모드일 때만 fit
        const mode = viewMode[activeTabId] || 'terminal';
        if (mode !== 'terminal') return;
        const entry = xtermMapRef.current.get(activeTabId);
        if (entry) {
            requestAnimationFrame(() => {
                entry.fitAddon.fit();
                entry.terminal.focus();
            });
        }
    }, [activeTabId, viewMode]);

    // 뷰 모드 전환 시 터미널 refit
    useEffect(() => {
        if (!activeTabId) return;
        const mode = viewMode[activeTabId] || 'terminal';
        if (mode === 'terminal') {
            const entry = xtermMapRef.current.get(activeTabId);
            if (entry) {
                requestAnimationFrame(() => {
                    entry.fitAddon.fit();
                    entry.terminal.focus();
                });
            }
        }
    }, [activeTabId, viewMode]);

    // ResizeObserver for terminal inner area (마진 안쪽 실제 크기 기준)
    useEffect(() => {
        const target = terminalAreaRef.current;
        if (!target) return;
        const observer = new ResizeObserver(() => {
            if (activeTabId) {
                const mode = viewMode[activeTabId] || 'terminal';
                if (mode === 'terminal') {
                    const entry = xtermMapRef.current.get(activeTabId);
                    if (entry) entry.fitAddon.fit();
                }
            }
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, [activeTabId, viewMode]);

    // Empty state
    if (tabs.length === 0) {
        return (
            <div className="w-full h-full bg-cream-50 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-3xl mb-3">{'👇'}</p>
                    <p className="text-black text-sm font-bold">
                        캐릭터를 클릭하여 시작하세요
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                        하단 독바에서 캐릭터를 선택하면 Claude Code 세션이
                        시작됩니다
                    </p>
                    <button
                        onClick={handleAddTab}
                        className="mt-4 px-4 py-2 bg-white text-black text-xs font-bold border-2 border-black shadow-[3px_3px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[5px_5px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        + 일반 터미널
                    </button>
                </div>
            </div>
        );
    }

    // 활동 상태 뱃지 (pill)
    const activityBadge = (() => {
        switch (currentActivity) {
            case 'working':
            case 'thinking':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#FFD100] text-black border border-black rounded-full animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-black" />
                        {currentActivity === 'working' ? 'working' : 'thinking'}
                    </span>
                );
            case 'success':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#A0E8AF] text-black border border-black rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-black" />
                        done
                    </span>
                );
            case 'error':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#FF6B6B] text-white border border-black rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        error
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-300 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        idle
                    </span>
                );
        }
    })();

    return (
        <div
            ref={containerRef}
            className="w-full h-full flex flex-col bg-white"
        >
            {/* 헤더: 캐릭터 정보 + 상태 + 뷰 토글 */}
            <div className="flex items-center bg-white border-b-2 border-black h-[44px] shrink-0 px-3">
                {activeAgent ? (
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 border-2 border-black rounded-lg bg-[#E8DAFF] p-0.5 flex items-center justify-center">
                            <img
                                src={assetPath(activeAgent.sprite)}
                                alt={activeAgent.name}
                                className="w-6 h-6 object-contain"
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-black text-black leading-tight">
                                {activeAgent.name}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                                {activeAgent.role}
                            </span>
                        </div>
                        <div className="ml-2">{activityBadge}</div>
                    </div>
                ) : (
                    <span className="text-sm text-black font-black">
                        Terminal
                    </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {/* 뷰 모드 토글 */}
                    {activeTabId && (
                        <ViewModeToggle
                            mode={currentViewMode}
                            onChange={(mode) => setViewMode(activeTabId, mode)}
                            hasAgent={!!activeTab?.agentId}
                        />
                    )}
                    {activeTab && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[200px]">
                            {activeTab.cwd}
                        </span>
                    )}
                    {/* 전체 화면 토글 버튼 */}
                    <button
                        onClick={togglePanelFullscreen}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-black"
                        title={panelFullscreen ? '패널 축소' : '패널 전체 화면'}
                    >
                        {panelFullscreen ? (
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="4 14 10 14 10 20" />
                                <polyline points="20 10 14 10 14 4" />
                                <line x1="14" y1="10" x2="21" y2="3" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        ) : (
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        )}
                    </button>
                    {/* 패널 닫기 버튼 */}
                    <button
                        onClick={() => setPanelVisible(false)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:bg-red-100 transition-all text-black font-black text-sm"
                        title="패널 닫기"
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* 탭 바 (멀티탭일 때) */}
            {tabs.length > 1 && (
                <div className="flex items-center gap-1.5 bg-gray-50 border-b-2 border-black px-2 py-1 shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                                tab.id === activeTabId
                                    ? 'bg-[#E8DAFF] border-2 border-black shadow-[2px_2px_0_0_#000] text-black'
                                    : 'bg-white border border-gray-300 text-gray-500 hover:border-black'
                            }`}
                        >
                            <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                    tab.status === 'connected'
                                        ? 'bg-green-400'
                                        : tab.status === 'connecting'
                                          ? 'bg-yellow-400'
                                          : 'bg-red-400'
                                }`}
                            />
                            {tab.label}
                            <span
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleCloseTab(tab.id);
                                }}
                                className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-500 font-black"
                            >
                                x
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* 메인 콘텐츠 영역 — 터미널 or 채팅 */}
            {currentViewMode === 'chat' && activeTab?.agentId ? (
                /* 채팅 뷰 */
                <ChatView
                    messages={currentMessages}
                    agentSprite={activeAgent?.sprite}
                    agentName={activeAgent?.name}
                />
            ) : (
                /* 터미널 영역 — 밝은 배경 + 마진으로 여백, 안쪽만 다크 */
                <div className="flex-1 flex min-h-0 bg-cream-50">
                    <div
                        ref={terminalAreaRef}
                        className="flex-1 min-h-0 m-3 rounded-xl border-2 border-black overflow-hidden relative"
                    >
                        {tabs.map((tab) => (
                            <div
                                key={tab.id}
                                ref={(el) => mountTerminal(tab.id, el)}
                                className="absolute inset-0"
                                style={{
                                    display:
                                        tab.id === activeTabId
                                            ? 'block'
                                            : 'none',
                                }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 입력창 (에이전트 탭일 때만) */}
            {activeTab?.agentId && activeTabId && (
                <ChatInput
                    tabId={activeTabId}
                    agentSprite={activeAgent?.sprite}
                    onSubmit={handleChatSubmit}
                    disabled={activeTab.status === 'exited'}
                />
            )}
        </div>
    );
};
