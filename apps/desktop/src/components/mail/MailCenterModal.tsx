import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    Mail,
    CheckCheck,
    AlertCircle,
    HelpCircle,
    Bell,
    FileText,
    Inbox,
} from 'lucide-react';
import { useMailStore, type MailMessage } from '../../store/useMailStore';
import { MailReportView } from './MailReportView';

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

// ── Type Badge Styles (Dark theme) ──

const TYPE_STYLES: Record<MailMessage['type'], string> = {
    report: 'bg-blue-900/40 text-blue-300 border-blue-700/40',
    error: 'bg-red-900/40 text-red-300 border-red-700/40',
    question: 'bg-purple-900/40 text-purple-300 border-purple-700/40',
    notification: 'bg-green-900/40 text-green-300 border-green-700/40',
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

// ── Mail List Item ──

const MailListItem: React.FC<{
    msg: MailMessage;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ msg, isSelected, onSelect }) => {
    return (
        <button
            onClick={onSelect}
            className={`w-full text-left px-4 py-3 border-b border-gray-700/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset ${
                isSelected
                    ? 'bg-blue-900/30 border-l-2 border-l-blue-400'
                    : 'hover:bg-gray-800/50 border-l-2 border-l-transparent'
            }`}
        >
            <div className="flex items-start gap-3">
                {/* Unread indicator */}
                <div className="pt-1.5 w-2.5 flex-shrink-0">
                    {!msg.read && (
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span
                            className={`text-sm truncate ${msg.read ? 'text-gray-400 font-medium' : 'text-gray-100 font-bold'}`}
                        >
                            {msg.fromAgentName}
                        </span>
                        <span className="text-[10px] text-gray-500 flex-shrink-0">
                            {formatTime(msg.timestamp)}
                        </span>
                    </div>
                    <p
                        className={`text-xs truncate mb-1 ${msg.read ? 'text-gray-500' : 'text-gray-300'}`}
                    >
                        {msg.subject}
                    </p>
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${TYPE_STYLES[msg.type]}`}
                        >
                            {TYPE_LABELS[msg.type]}
                        </span>
                        {msg.body && (
                            <span className="text-[10px] text-gray-600 truncate">
                                {msg.body.slice(0, 40)}
                                {msg.body.length > 40 ? '...' : ''}
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
    const filteredMessages =
        activeFilter === 'all'
            ? messages
            : messages.filter((m) => m.type === activeFilter);

    // Selected message
    const selectedMessage = selectedId
        ? (messages.find((m) => m.id === selectedId) ?? null)
        : null;

    // Auto-select first message
    useEffect(() => {
        if (!selectedMessage && filteredMessages.length > 0) {
            setSelectedId(filteredMessages[0].id);
        }
    }, [selectedMessage, filteredMessages]);

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

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-label="Mail Center"
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-[90vw] max-w-[1000px] h-[75vh] max-h-[700px] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Top Bar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/80 bg-gray-900/95">
                    <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-blue-400" />
                        <h1 className="text-base font-bold text-gray-100">
                            Mail Center
                        </h1>
                        {messages.filter((m) => !m.read).length > 0 && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
                                {messages.filter((m) => !m.read).length} unread
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={markAllRead}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark all read
                        </button>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
                            aria-label="Close mail center"
                        >
                            <X className="w-4.5 h-4.5" />
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex border-b border-gray-700/80 bg-gray-850">
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
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-colors border-b-2 ${
                                    activeFilter === tab.key
                                        ? 'text-blue-400 border-blue-400 bg-blue-900/10'
                                        : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/50'
                                }`}
                            >
                                {tab.icon}
                                {tab.label}
                                <span className="text-[10px] opacity-60">
                                    ({count})
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Content: List + Detail */}
                <div className="flex flex-1 min-h-0">
                    {/* Left: Mail List */}
                    <div className="w-[320px] flex-shrink-0 border-r border-gray-700/50 overflow-y-auto">
                        {filteredMessages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3 py-12">
                                <Mail className="w-10 h-10 opacity-30" />
                                <p className="text-sm font-medium">
                                    No messages
                                </p>
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
                    <div className="flex-1 min-w-0 p-5 overflow-hidden">
                        {selectedMessage ? (
                            <div className="h-full flex flex-col">
                                <MailReportView message={selectedMessage} />
                                {/* Delete button at bottom right */}
                                <div className="flex justify-end mt-3 pt-3 border-t border-gray-700/50">
                                    <button
                                        onClick={handleDelete}
                                        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-900/20 transition-colors"
                                    >
                                        <Bell className="w-3.5 h-3.5" />
                                        Delete Message
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-3">
                                <Mail className="w-14 h-14 opacity-20" />
                                <p className="text-sm font-medium">
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
