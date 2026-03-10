import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X,
    Mail,
    CheckCheck,
    AlertCircle,
    HelpCircle,
    FileText,
    Inbox,
    Trash2,
} from 'lucide-react';
import { useMailStore, type MailMessage } from '../../store/useMailStore';
import { MailReportView } from './MailReportView';
import { DEFAULT_AGENTS } from '../../types/platform';
import { assetPath } from '../../lib/assetPath';

// ── Sender Name → Profile Sprite Lookup ──

const SENDER_SPRITE_MAP = new Map<string, string>();
// Dokba (CTO) — not in DEFAULT_AGENTS
SENDER_SPRITE_MAP.set('dokba', '/assets/characters/dokba_profile.png');
for (const agent of DEFAULT_AGENTS) {
    SENDER_SPRITE_MAP.set(agent.name.toLowerCase(), agent.sprite);
}

function getSenderSprite(senderName: string): string | null {
    return SENDER_SPRITE_MAP.get(senderName.toLowerCase()) ?? null;
}

// ── Filter Tabs ──

type FilterTab = 'all' | 'report' | 'error' | 'question';

const FILTER_TABS: {
    key: FilterTab;
    label: string;
    icon: React.ReactNode;
}[] = [
    { key: 'all', label: 'All', icon: <Inbox className="w-3.5 h-3.5" /> },
    {
        key: 'report',
        label: 'Reports',
        icon: <FileText className="w-3.5 h-3.5" />,
    },
    {
        key: 'error',
        label: 'Errors',
        icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    {
        key: 'question',
        label: 'Questions',
        icon: <HelpCircle className="w-3.5 h-3.5" />,
    },
];

// ── Type Badge Styles (Neobrutalism) ──

const TYPE_STYLES: Record<MailMessage['type'], string> = {
    report: 'bg-blue-100 text-blue-800 border-black',
    error: 'bg-red-100 text-red-800 border-black',
    question: 'bg-purple-100 text-purple-800 border-black',
    notification: 'bg-green-100 text-green-800 border-black',
};

const TYPE_LABELS: Record<MailMessage['type'], string> = {
    report: 'Report',
    error: 'Error',
    question: 'Question',
    notification: 'Notice',
};

// ── Time Formatting ──

function formatTime(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── Sender Avatar ──

const SenderAvatar: React.FC<{ name: string }> = ({ name }) => {
    const sprite = getSenderSprite(name);
    if (sprite) {
        return (
            <div className="w-8 h-8 flex-shrink-0 rounded-full border-2 border-black overflow-hidden bg-[#E8DAFF]">
                <img
                    src={assetPath(sprite)}
                    alt={name}
                    className="w-full h-full object-contain"
                />
            </div>
        );
    }
    // Fallback: initial letter avatar
    const initial = (name[0] ?? '?').toUpperCase();
    return (
        <div className="w-8 h-8 flex-shrink-0 rounded-full border-2 border-black bg-gray-200 flex items-center justify-center">
            <span className="text-xs font-black text-black">{initial}</span>
        </div>
    );
};

// ── Mail List Item ──

const MailListItem: React.FC<{
    msg: MailMessage;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ msg, isSelected, onSelect }) => {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left p-3 rounded-lg border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                isSelected
                    ? 'border-black bg-[#FFF8E7] shadow-[2px_2px_0_0_#000]'
                    : 'border-transparent hover:border-black/20 hover:bg-cream-50'
            }`}
        >
            <div className="flex items-start gap-2.5">
                {/* Sender profile avatar */}
                <div className="pt-0.5 flex-shrink-0 relative">
                    <SenderAvatar name={msg.fromAgentName} />
                    {/* Unread indicator overlay */}
                    {!msg.read && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                            className={`text-sm truncate ${msg.read ? 'text-gray-500 font-medium' : 'text-black font-black'}`}
                        >
                            {msg.fromAgentName}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">
                            {formatTime(msg.timestamp)}
                        </span>
                    </div>
                    <p
                        className={`text-xs truncate mb-1.5 ${msg.read ? 'text-gray-400' : 'text-gray-700 font-bold'}`}
                    >
                        {msg.subject}
                    </p>
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-[10px] font-black px-1.5 py-0.5 rounded border-2 ${TYPE_STYLES[msg.type]}`}
                        >
                            {TYPE_LABELS[msg.type]}
                        </span>
                        {msg.body && (
                            <span className="text-[10px] text-gray-400 truncate">
                                {msg.body.slice(0, 40)}
                                {(msg.body?.length ?? 0) > 40 ? '...' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
};

// ── Mail Center Modal ──

export const MailCenterModal: React.FC<{ onClose: () => void }> = ({
    onClose,
}) => {
    const messages = useMailStore((s) => s.messages);
    const markAsRead = useMailStore((s) => s.markAsRead);
    const markAllRead = useMailStore((s) => s.markAllRead);
    const deleteMessage = useMailStore((s) => s.deleteMessage);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

    // ESC key handler
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        },
        [onClose],
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Filter messages
    const filteredMessages = useMemo(
        () =>
            activeFilter === 'all'
                ? messages
                : messages.filter((m) => m.type === activeFilter),
        [messages, activeFilter],
    );

    // Selected message
    const selectedMessage = selectedId
        ? (messages.find((m) => m.id === selectedId) ?? null)
        : null;

    // Auto-select first message
    const firstFilteredId = filteredMessages[0]?.id ?? null;
    useEffect(() => {
        if (!selectedId && firstFilteredId) {
            setSelectedId(firstFilteredId);
        }
    }, [selectedId, firstFilteredId]);

    const handleSelect = (msg: MailMessage) => {
        setSelectedId(msg.id);
        if (!msg.read) {
            markAsRead(msg.id);
        }
    };

    const handleDelete = () => {
        if (selectedId) {
            deleteMessage(selectedId);
            setSelectedId(null);
        }
    };

    // Backdrop click
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const unreadCount = messages.filter((m) => !m.read).length;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-label="Mail Center"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Modal */}
            <div className="relative w-[90vw] max-w-[1000px] h-[75vh] max-h-[700px] bg-white border-4 border-black rounded-2xl shadow-[8px_8px_0_0_#000] flex flex-col overflow-hidden">
                {/* Top Bar — Black */}
                <div className="flex items-center justify-between px-5 py-3 border-b-4 border-black bg-black">
                    <div className="flex items-center gap-3">
                        <Mail
                            className="w-5 h-5 text-white"
                            strokeWidth={2.5}
                        />
                        <h1 className="text-base font-black text-white">
                            Mail Center
                        </h1>
                        {unreadCount > 0 && (
                            <span className="text-xs bg-white text-black px-2.5 py-0.5 rounded-full font-black border-2 border-white/20">
                                {unreadCount} unread
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={markAllRead}
                            className="flex items-center gap-1.5 text-xs font-bold text-black bg-white border-2 border-white/20 rounded-lg px-3 py-1.5 shadow-[2px_2px_0_0_rgba(255,255,255,0.2)] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_rgba(255,255,255,0.3)] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            All Read
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center bg-white/10 border-2 border-white/20 rounded-lg text-white hover:bg-white/20 active:bg-white/5 transition-all"
                            aria-label="Close mail center"
                        >
                            <X className="w-4 h-4" strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* Filter Tabs — Black base */}
                <div className="flex border-b-2 border-black bg-gray-900">
                    {FILTER_TABS.map((tab) => {
                        const count =
                            tab.key === 'all'
                                ? messages.length
                                : messages.filter((m) => m.type === tab.key)
                                      .length;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    setActiveFilter(tab.key);
                                    setSelectedId(null);
                                }}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black transition-all border-b-2 ${
                                    activeFilter === tab.key
                                        ? 'text-black bg-white border-black'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                <span className="text-[10px] font-bold opacity-60">
                                    ({count})
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Content: List + Detail */}
                <div className="flex flex-1 min-h-0">
                    {/* Left: Mail List */}
                    <div className="w-[340px] flex-shrink-0 border-r-2 border-black overflow-y-auto bg-cream-50 p-2 space-y-1">
                        {filteredMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-12">
                                <Mail className="w-10 h-10 opacity-30" />
                                <p className="text-sm font-bold">No messages</p>
                            </div>
                        ) : (
                            filteredMessages.map((msg) => (
                                <MailListItem
                                    key={msg.id}
                                    msg={msg}
                                    isSelected={selectedId === msg.id}
                                    onSelect={() => handleSelect(msg)}
                                />
                            ))
                        )}
                    </div>

                    {/* Right: Detail View */}
                    <div className="flex-1 min-w-0 p-5 overflow-hidden bg-white">
                        {selectedMessage ? (
                            <div className="h-full flex flex-col">
                                <MailReportView message={selectedMessage} />
                                {/* Delete button at bottom right */}
                                <div className="flex justify-end mt-3 pt-3 border-t-2 border-black/10">
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border-2 border-black rounded-lg px-3 py-1.5 shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                                <div className="w-16 h-16 border-2 border-dashed border-black/20 rounded-2xl flex items-center justify-center">
                                    <Mail className="w-8 h-8 opacity-30" />
                                </div>
                                <p className="text-sm font-bold">
                                    Select a message to view details
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
