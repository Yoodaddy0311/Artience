import React, { useState, useRef, useEffect } from 'react';
import { Teammate } from './MainLayout';
import { MessageCircle, Paperclip, Activity } from 'lucide-react';
import { assetPath } from '../../lib/assetPath';

// ── Types ────────────────────────────────────────────────

interface ChatMessage {
    sender: string;
    text: string;
    status?: 'sending' | 'sent' | 'error';
}

// ── Component ────────────────────────────────────────────

export const RightSidebar: React.FC<{ agent: Teammate; onClose: () => void }> = ({ agent, onClose }) => {
    const [msg, setMsg] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [chats, setChats] = useState<ChatMessage[]>([
        { sender: agent.name, text: `안녕하세요! 저는 ${agent.role} 역할을 맡은 ${agent.name}입니다. 무엇을 도와드릴까요?` },
    ]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // Streaming text state
    const [streamingText, setStreamingText] = useState('');

    // ── Auto-scroll on new messages ──
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [chats, isTyping, streamingText]);

    // ── Reset chat history when switching agents ──
    useEffect(() => {
        setChats([{ sender: agent.name, text: `안녕하세요! ${agent.name}입니다.` }]);
        setIsTyping(false);
        setStreamingText('');
    }, [agent.name]);

    // ── Streaming listener for Electron ──
    useEffect(() => {
        const chatApi = window.dogbaApi?.chat;
        if (!chatApi) return;

        const unsubStream = chatApi.onStream((agentName, chunk) => {
            if (agentName === agent.name) {
                setStreamingText((prev) => prev + chunk);
            }
        });

        const unsubEnd = chatApi.onStreamEnd((agentName) => {
            if (agentName === agent.name) {
                setStreamingText((prev) => {
                    if (prev) {
                        setChats((chats) => [...chats, { sender: agent.name, text: prev }]);
                    }
                    return '';
                });
                setIsTyping(false);
            }
        });

        return () => {
            unsubStream();
            unsubEnd();
        };
    }, [agent.name]);

    // ── File upload handler (local via IPC) ──
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setChats((prev) => [...prev, { sender: 'Me', text: `문서 업로드: ${file.name}` }]);

        try {
            // TODO: implement local file processing via dogbaApi.file
            setChats((prev) => [
                ...prev,
                { sender: agent.name, text: `문서 "${file.name}"을 받았습니다. 분석을 시작합니다.` },
            ]);
        } catch {
            setChats((prev) => [...prev, { sender: 'System', text: '문서 업로드에 실패했습니다.' }]);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ── Send message handler ──
    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!msg.trim()) return;

        const userMessage: ChatMessage = { sender: 'Me', text: msg, status: 'sending' };
        setChats((prev) => [...prev, userMessage]);
        setIsTyping(true);
        const currentMsg = msg;
        setMsg('');

        // Electron: streaming claude CLI
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
                setStreamingText('');
                const result = await chatApi.sendStream(agent.name, currentMsg);
                if (!result.success) {
                    setIsTyping(false);
                    setChats((prev) => [
                        ...prev,
                        { sender: 'System', text: `오류: ${result.text}` },
                    ]);
                }
            } catch {
                setIsTyping(false);
                setStreamingText('');
                setChats((prev) => [
                    ...prev,
                    { sender: 'System', text: 'Claude CLI 실행에 실패했습니다.' },
                ]);
            }
            return;
        }

        // No API available
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
            { sender: 'System', text: 'Claude Code가 연결되지 않았습니다. 설정에서 인증을 확인해주세요.' },
        ]);
    };

    return (
        <div className="w-full max-w-md h-full bg-white border-l-2 border-black flex flex-col z-20 transition-all absolute right-0 top-0">
            {/* Header */}
            <div className="p-5 border-b-2 border-black flex justify-between items-start bg-cream-50">
                <div className="flex gap-4 items-center">
                    <img
                        src={assetPath(agent.avatarUrl)}
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
                    </div>
                    <p className="text-2xl font-black text-black">
                        {chats.length}
                        <span className="text-sm font-bold text-gray-500 ml-1">건</span>
                    </p>
                </div>
                <div className="bg-white p-4 rounded-lg border-2 border-black shadow-[4px_4px_0_0_#000]">
                    <div className="flex items-center gap-2 mb-1">
                        <Activity className="w-4 h-4" strokeWidth={2.5} />
                        <p className="text-xs font-bold text-black">상태</p>
                    </div>
                    <p className="text-lg font-black text-black">
                        {agent.status === 'working' ? '활성' : '대기'}
                    </p>
                </div>
            </div>

            {/* Chat Area */}
            <div ref={scrollRef} className="flex-1 p-5 overflow-y-auto flex flex-col gap-4 bg-white scroll-smooth">
                {chats.map((c, i) => (
                    <div key={i} className={`flex flex-col max-w-[85%] ${c.sender === 'Me' ? 'self-end items-end' : 'self-start items-start'}`}>
                        <span className="text-xs font-bold text-gray-500 mb-1.5 px-1">{c.sender}</span>
                        <div className={`p-3 rounded-lg text-sm leading-relaxed border-2 border-black ${c.sender === 'Me' ? 'bg-yellow-300 text-black shadow-[3px_3px_0_0_#000]' : c.sender === 'System' ? 'bg-gray-100 text-gray-600 shadow-[3px_3px_0_0_#ccc] border-gray-300' : 'bg-white text-black shadow-[3px_3px_0_0_#000]'}`}>
                            {c.text}
                        </div>
                        {c.status === 'sending' && <span className="text-[10px] text-gray-400 mt-1 px-1">전송 중...</span>}
                        {c.status === 'error' && <span className="text-[10px] text-red-400 mt-1 px-1">전송 실패</span>}
                    </div>
                ))}
                {isTyping && streamingText && (
                    <div className="flex flex-col max-w-[85%] self-start items-start">
                        <span className="text-xs font-bold text-gray-500 mb-1.5 px-1">{agent.name}</span>
                        <div className="p-3 rounded-lg bg-white border-2 border-black shadow-[3px_3px_0_0_#000] text-sm leading-relaxed">
                            {streamingText}
                            <span className="inline-block w-2 h-4 bg-black animate-pulse ml-0.5" />
                        </div>
                    </div>
                )}
                {isTyping && !streamingText && (
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
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.xlsx" />
                    <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="w-12 h-12 rounded-lg bg-white text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50 shrink-0 font-bold">
                        {uploading ? '...' : <Paperclip className="w-5 h-5" strokeWidth={2.5} />}
                    </button>
                    <input type="text" placeholder={`${agent.name}에게 요청할 작업 입력...`} className="flex-1 px-4 py-3 rounded-lg border-2 border-black focus:outline-none focus:shadow-[3px_3px_0_0_#000] transition-shadow text-sm font-bold" value={msg} onChange={(e) => setMsg(e.target.value)} />
                    <button type="submit" className="w-12 h-12 rounded-lg bg-yellow-300 text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </form>
        </div>
    );
};
