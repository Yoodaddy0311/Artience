import React, { useState } from 'react';
import { X, CheckCheck, Mail, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useMailStore, type MailMessage } from '../../store/useMailStore';

// ── Type Badge ──

const TYPE_STYLES: Record<MailMessage['type'], string> = {
    report: 'bg-blue-100 text-blue-700',
    error: 'bg-red-100 text-red-700',
    question: 'bg-purple-100 text-purple-700',
    notification: 'bg-green-100 text-green-700',
};

const TYPE_LABELS: Record<MailMessage['type'], string> = {
    report: 'Report',
    error: 'Error',
    question: 'Question',
    notification: 'Notice',
};

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

// ── Mail Card ──

const MailCard: React.FC<{
    msg: MailMessage;
    expanded: boolean;
    onToggle: () => void;
}> = ({ msg, expanded, onToggle }) => {
    const markAsRead = useMailStore((s) => s.markAsRead);
    const deleteMessage = useMailStore((s) => s.deleteMessage);

    const handleToggle = () => {
        if (!msg.read) markAsRead(msg.id);
        onToggle();
    };

    return (
        <div
            className={`border-3 border-black rounded-xl transition-all ${
                msg.read ? 'bg-gray-50' : 'bg-blue-50/60'
            }`}
        >
            <button
                onClick={handleToggle}
                className="w-full flex items-start gap-3 p-3 text-left hover:bg-black/5 rounded-xl transition-colors"
            >
                {/* Unread dot */}
                <div className="pt-1.5 w-3 flex-shrink-0">
                    {!msg.read && (
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm truncate">
                            {msg.fromAgentName}
                        </span>
                        <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TYPE_STYLES[msg.type]}`}
                        >
                            {TYPE_LABELS[msg.type]}
                        </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">
                        {msg.subject}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {formatTime(msg.timestamp)}
                    </p>
                </div>

                {/* Expand icon */}
                <div className="pt-1 flex-shrink-0 text-gray-400">
                    {expanded ? (
                        <ChevronUp className="w-4 h-4" />
                    ) : (
                        <ChevronDown className="w-4 h-4" />
                    )}
                </div>
            </button>

            {/* Expanded body */}
            {expanded && (
                <div className="px-4 pb-3 border-t-2 border-black/10">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap pt-3 leading-relaxed">
                        {msg.body}
                    </p>
                    <div className="flex justify-end mt-3">
                        <button
                            onClick={() => deleteMessage(msg.id)}
                            className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-700 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Mail Inbox ──

export const MailInbox: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const messages = useMailStore((s) => s.messages);
    const markAllRead = useMailStore((s) => s.markAllRead);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    return (
        <div className="w-[400px] h-full flex flex-col bg-white border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl overflow-hidden flex-shrink-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-4 border-black bg-[#FFD100]">
                <h2 className="font-black text-lg tracking-tight flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Mailbox
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={markAllRead}
                        className="flex items-center gap-1 text-xs font-bold bg-white border-2 border-black rounded-lg px-2.5 py-1.5 hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] active:translate-y-0 active:shadow-none transition-all"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                        All Read
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 bg-white border-2 border-black rounded-lg flex items-center justify-center hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] active:translate-y-0 active:shadow-none transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Mail List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3 py-12">
                        <Mail className="w-12 h-12 opacity-30" />
                        <p className="font-bold text-sm">No new reports</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <MailCard
                            key={msg.id}
                            msg={msg}
                            expanded={expandedId === msg.id}
                            onToggle={() =>
                                setExpandedId(
                                    expandedId === msg.id ? null : msg.id,
                                )
                            }
                        />
                    ))
                )}
            </div>
        </div>
    );
};
