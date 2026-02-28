import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Teammate } from './MainLayout';
import { useAppStore } from '../../store/useAppStore';
import { MessageCircle, Paperclip, Activity, Briefcase, RefreshCw } from 'lucide-react';

// ── Types ────────────────────────────────────────────────

interface ChatMessage {
    sender: string;
    text: string;
    status?: 'sending' | 'sent' | 'error';
}

interface PlatformStats {
    conversations: number;
    responseRate: number;
    activeAgents: number;
    totalJobs: number;
    successRate: number;
}

const CHAT_TIMEOUT_MS = 30_000;
const STATS_POLL_INTERVAL_MS = 10_000;

// ── Component ────────────────────────────────────────────

export const RightSidebar: React.FC<{ agent: Teammate; onClose: () => void }> = ({ agent, onClose }) => {
    const apiUrl = useAppStore((s) => s.appSettings.apiUrl);

    const [msg, setMsg] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [chats, setChats] = useState<ChatMessage[]>([
        { sender: agent.name, text: `안녕하세요! 저는 ${agent.role} 역할을 맡은 ${agent.name}입니다. 무엇을 도와드릴까요?` },
    ]);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Stats state
    const [stats, setStats] = useState<PlatformStats>({
        conversations: 0,
        responseRate: 0,
        activeAgents: 0,
        totalJobs: 0,
        successRate: 0,
    });
    const [statsRefreshing, setStatsRefreshing] = useState(false);

    // Refs for timeout and WebSocket
    const socketRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [uploading, setUploading] = useState(false);

    // ── Auto-scroll on new messages ──
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chats, isTyping]);

    // ── Reset chat history when switching agents ──
    useEffect(() => {
        setChats([{ sender: agent.name, text: `안녕하세요! ${agent.name}입니다.` }]);
        setIsTyping(false);
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, [agent.name]);

    // ── Stats polling ──
    const fetchStats = useCallback(async () => {
        setStatsRefreshing(true);
        try {
            const res = await fetch(`${apiUrl}/api/stats/`);
            if (res.ok) {
                const data: PlatformStats = await res.json();
                setStats(data);
            }
        } catch {
            // Silently fail -- stats are non-critical
        } finally {
            setStatsRefreshing(false);
        }
    }, [apiUrl]);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, STATS_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchStats]);

    // ── File upload handler ──
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setChats((prev) => [...prev, { sender: 'Me', text: `문서 업로드: ${file.name}` }]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${apiUrl}/api/documents/upload`, {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();

            setChats((prev) => [
                ...prev,
                {
                    sender: agent.name,
                    text: `문서를 성공적으로 파싱했습니다. 문서 ID: ${data.doc_id}. 발견된 엔티티: ${data.detected_entities.join(', ')}`,
                },
            ]);

            if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(
                    JSON.stringify({
                        type: 'CHAT_COMMAND',
                        text: `새 파싱 문서가 도착했습니다 (${file.name}). 분석을 시작하세요.`,
                        target_agent: 'Sera',
                    })
                );
            }
        } catch {
            setChats((prev) => [...prev, { sender: 'System', text: '문서 업로드에 실패했습니다.' }]);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── WebSocket connection ──
    useEffect(() => {
        const wsUrl = apiUrl.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsUrl}/ws/town`);
        socketRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                // FE-5: Handle CHAT_RESPONSE from backend
                if (
                    data.type === 'CHAT_RESPONSE' &&
                    data.agentId === agent.id
                ) {
                    // Clear timeout since we got a response
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                        timeoutRef.current = null;
                    }
                    setIsTyping(false);
                    setChats((prev) => [
                        ...prev,
                        { sender: agent.name, text: data.content },
                    ]);
                }

                // Existing: Handle TASK_ASSIGNED
                if (
                    data.type === 'TASK_ASSIGNED' &&
                    (data.agent === agent.name || data.agent?.toLowerCase() === agent.name.toLowerCase())
                ) {
                    if (timeoutRef.current) {
                        clearTimeout(timeoutRef.current);
                        timeoutRef.current = null;
                    }
                    setIsTyping(false);
                    setChats((prev) => [
                        ...prev,
                        {
                            sender: data.agent,
                            text:
                                data.taskContent === '작업 처리 중...'
                                    ? 'API와 통신하여 작업을 할당했습니다!'
                                    : `할당됨: ${data.taskContent}`,
                        },
                    ]);
                }
            } catch {
                // Ignore non-JSON messages
            }
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [agent.id, agent.name, apiUrl]);

    // ── Send message handler ──
    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!msg.trim()) return;

        // Show message immediately with "sending" state
        const userMessage: ChatMessage = { sender: 'Me', text: msg, status: 'sending' };
        setChats((prev) => [...prev, userMessage]);
        setIsTyping(true);
        const currentMsg = msg;
        setMsg('');

        // Electron 환경: 로컬 claude CLI 직접 실행
        const chatApi = window.dogbaApi?.chat;
        if (chatApi) {
            setChats((prev) =>
                prev.map((c, i) =>
                    i === prev.length - 1 && c.status === 'sending'
                        ? { ...c, status: 'sent' }
                        : c
                )
            );

            try {
                const result = await chatApi.send(agent.name, currentMsg);
                setIsTyping(false);
                setChats((prev) => [
                    ...prev,
                    { sender: agent.name, text: result.success ? result.text : `오류: ${result.text}` },
                ]);
            } catch {
                setIsTyping(false);
                setChats((prev) => [
                    ...prev,
                    { sender: 'System', text: 'Claude CLI 실행에 실패했습니다.' },
                ]);
            }
            return;
        }

        // 웹 환경: 기존 WebSocket 방식
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(
                JSON.stringify({
                    type: 'CHAT_COMMAND',
                    text: currentMsg,
                    target_agent: agent.name,
                })
            );

            // Mark the sent message as "sent"
            setChats((prev) =>
                prev.map((c, i) =>
                    i === prev.length - 1 && c.status === 'sending'
                        ? { ...c, status: 'sent' }
                        : c
                )
            );

            // Timeout: if no response within 30s, show "agent is busy"
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                setIsTyping(false);
                setChats((prev) => [
                    ...prev,
                    {
                        sender: 'System',
                        text: `${agent.name}이(가) 현재 바쁜 상태입니다. 잠시 후 다시 시도해주세요.`,
                    },
                ]);
                timeoutRef.current = null;
            }, CHAT_TIMEOUT_MS);
        } else {
            // WebSocket not connected
            setIsTyping(false);
            setChats((prev) =>
                prev.map((c, i) =>
                    i === prev.length - 1 && c.status === 'sending'
                        ? { ...c, status: 'error' }
                        : c
                )
            );
            setChats((prev) => [
                ...prev,
                { sender: 'System', text: '연결이 끊어졌습니다. 페이지를 새로고침해주세요.' },
            ]);
        }
    };

    return (
        <div className="w-full max-w-md h-full bg-white border-l-2 border-black flex flex-col z-20 transition-all absolute right-0 top-0">
            {/* Header */}
            <div className="p-5 border-b-2 border-black flex justify-between items-start bg-cream-50">
                <div className="flex gap-4 items-center">
                    <img
                        src={agent.avatarUrl}
                        className="w-14 h-14 bg-white rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000]"
                        alt="avatar"
                    />
                    <div>
                        <h2 className="font-black text-xl text-black leading-tight">{agent.name}</h2>
                        <p className="text-sm text-brown-600 font-bold">{agent.role}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span
                                className={`w-2.5 h-2.5 rounded-full border border-black ${
                                    agent.status === 'working' ? 'bg-green-400' : 'bg-amber-300'
                                }`}
                            />
                            <span className="text-xs text-black font-bold capitalize">
                                {agent.status === 'working' ? '업무 중' : '휴식 중'}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-white hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all text-black"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* Status Widgets */}
            <div className="p-4 grid grid-cols-2 gap-3 border-b-2 border-black bg-cream-50">
                <div className="bg-white p-4 rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000]">
                    <div className="flex items-center gap-2 mb-1">
                        <MessageCircle className="w-4 h-4" strokeWidth={2.5} />
                        <p className="text-xs font-bold text-black">대화</p>
                        {statsRefreshing && (
                            <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" strokeWidth={2} />
                        )}
                    </div>
                    <p className="text-2xl font-black text-black">
                        {stats.conversations}
                        <span className="text-sm font-bold text-gray-500 ml-1">건</span>
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000]">
                    <div className="flex items-center gap-2 mb-1">
                        <span>⚡</span>
                        <p className="text-xs font-bold text-black">응답률</p>
                    </div>
                    <p className="text-2xl font-black text-black">
                        {stats.responseRate}
                        <span className="text-sm font-bold text-gray-500 ml-1">%</span>
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000]">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4" strokeWidth={2.5} />
                        <p className="text-xs font-bold text-black">활성 에이전트</p>
                    </div>
                    <p className="text-2xl font-black text-black">
                        {stats.activeAgents}
                        <span className="text-sm font-bold text-gray-500 ml-1">명</span>
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000]">
                    <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="w-4 h-4" strokeWidth={2.5} />
                        <p className="text-xs font-bold text-black">작업</p>
                    </div>
                    <p className="text-2xl font-black text-black">
                        {stats.totalJobs}
                        <span className="text-sm font-bold text-gray-500 ml-1">건</span>
                    </p>
                    <p className="text-xs font-bold text-gray-400 mt-0.5">
                        성공률 {stats.successRate}%
                    </p>
                </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto flex flex-col gap-4 bg-white scroll-smooth">
                {chats.map((c, i) => (
                    <div
                        key={i}
                        className={`flex flex-col max-w-[85%] ${
                            c.sender === 'Me' ? 'self-end items-end' : 'self-start items-start'
                        }`}
                    >
                        <span className="text-xs font-bold text-gray-500 mb-1.5 px-1">{c.sender}</span>
                        <div
                            className={`p-3 rounded-lg text-sm leading-relaxed border-2 border-black ${
                                c.sender === 'Me'
                                    ? 'bg-yellow-300 text-black shadow-[3px_3px_0_0_#000]'
                                    : c.sender === 'System'
                                      ? 'bg-gray-100 text-gray-600 shadow-[3px_3px_0_0_#ccc] border-gray-300'
                                      : 'bg-white text-black shadow-[3px_3px_0_0_#000]'
                            }`}
                        >
                            {c.text}
                        </div>
                        {c.status === 'sending' && (
                            <span className="text-[10px] text-gray-400 mt-1 px-1">전송 중...</span>
                        )}
                        {c.status === 'error' && (
                            <span className="text-[10px] text-red-400 mt-1 px-1">전송 실패</span>
                        )}
                    </div>
                ))}
                {isTyping && (
                    <div className="flex flex-col max-w-[85%] self-start items-start">
                        <span className="text-xs font-bold text-gray-500 mb-1.5 px-1">{agent.name}</span>
                        <div className="p-3 rounded-lg bg-white border-2 border-black shadow-[3px_3px_0_0_#000] flex gap-1.5 items-center h-[46px]">
                            <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-2 h-2 bg-black rounded-full animate-bounce" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <form onSubmit={send} className="p-4 bg-white border-t-2 border-black flex flex-col gap-2">
                <div className="flex gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileUpload}
                        accept=".pdf,.docx,.xlsx"
                    />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="w-12 h-12 rounded-lg bg-white text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 shrink-0 font-bold"
                    >
                        {uploading ? '...' : <Paperclip className="w-5 h-5" strokeWidth={2.5} />}
                    </button>
                    <input
                        type="text"
                        placeholder={`${agent.name}에게 요청할 작업 입력...`}
                        className="flex-1 px-4 py-3 rounded-lg border-2 border-black focus:outline-none focus:shadow-[3px_3px_0_0_#000] transition-shadow text-sm font-bold"
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="w-12 h-12 rounded-lg bg-yellow-300 text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all shrink-0"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    );
};
