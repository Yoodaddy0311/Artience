import React, { useState } from 'react';
import {
    FileText,
    FilePlus,
    FileEdit,
    Trash2,
    Clock,
    Wrench,
    CheckCircle2,
    XCircle,
    MinusCircle,
    ThumbsUp,
    MessageSquare,
    Eye,
} from 'lucide-react';
import type {
    MailMessage,
    MailReport,
    MailChangedFile,
    MailStatus,
} from '../../store/useMailStore';
import { useMailStore } from '../../store/useMailStore';

// ── Status Badge ──

const STATUS_STYLES: Record<MailStatus, string> = {
    pending: 'bg-yellow-900/40 text-yellow-300 border-yellow-600/50',
    approved: 'bg-green-900/40 text-green-300 border-green-600/50',
    changes_requested: 'bg-orange-900/40 text-orange-300 border-orange-600/50',
    acknowledged: 'bg-blue-900/40 text-blue-300 border-blue-600/50',
};

const STATUS_LABELS: Record<MailStatus, string> = {
    pending: 'Pending',
    approved: 'Approved',
    changes_requested: 'Changes Requested',
    acknowledged: 'Acknowledged',
};

// ── File Action Icon ──

const FILE_ACTION_ICON: Record<MailChangedFile['action'], React.ReactNode> = {
    created: <FilePlus className="w-3.5 h-3.5 text-green-400" />,
    modified: <FileEdit className="w-3.5 h-3.5 text-yellow-400" />,
    deleted: <Trash2 className="w-3.5 h-3.5 text-red-400" />,
};

// ── Format Duration ──

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainSec = seconds % 60;
    return `${minutes}m ${remainSec}s`;
}

// ── Main Component ──

export const MailReportView: React.FC<{ message: MailMessage }> = ({
    message,
}) => {
    const updateStatus = useMailStore((s) => s.updateStatus);
    const [comment, setComment] = useState('');
    const [showCommentInput, setShowCommentInput] = useState(false);

    const { report, status } = message;

    const handleAction = (newStatus: MailStatus) => {
        if (newStatus === 'changes_requested' && !showCommentInput) {
            setShowCommentInput(true);
            return;
        }
        updateStatus(
            message.id,
            newStatus,
            newStatus === 'changes_requested' ? comment : undefined,
        );
        setComment('');
        setShowCommentInput(false);
    };

    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
            {/* Header with Status */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-gray-100">
                        {message.subject}
                    </h2>
                    <p className="text-xs text-gray-400 mt-1">
                        From {message.fromAgentName} --{' '}
                        {new Date(message.timestamp).toLocaleString('ko-KR')}
                    </p>
                </div>
                <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border ${STATUS_STYLES[status]}`}
                >
                    {STATUS_LABELS[status]}
                </span>
            </div>

            {/* Body (plain text fallback) */}
            {message.body && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {message.body}
                    </p>
                </div>
            )}

            {/* Report Section */}
            {report && <ReportDetails report={report} />}

            {/* Action Buttons */}
            <div className="border-t border-gray-700/50 pt-4 mt-auto">
                {showCommentInput && (
                    <div className="mb-3">
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Describe the changes you'd like..."
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none"
                            rows={3}
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() =>
                                    handleAction('changes_requested')
                                }
                                disabled={!comment.trim()}
                                className="px-3 py-1.5 bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-500 transition-colors disabled:opacity-40"
                            >
                                Submit Request
                            </button>
                            <button
                                onClick={() => {
                                    setShowCommentInput(false);
                                    setComment('');
                                }}
                                className="px-3 py-1.5 bg-gray-700 text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {!showCommentInput && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleAction('approved')}
                            disabled={status === 'approved'}
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-700/80 text-green-100 text-xs font-bold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            Approve
                        </button>
                        <button
                            onClick={() => handleAction('changes_requested')}
                            disabled={status === 'changes_requested'}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-700/80 text-orange-100 text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Request Changes
                        </button>
                        <button
                            onClick={() => handleAction('acknowledged')}
                            disabled={status === 'acknowledged'}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700/80 text-blue-100 text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Acknowledge
                        </button>
                    </div>
                )}

                {/* Action History */}
                {message.actions.length > 0 && (
                    <div className="mt-3 space-y-1">
                        {message.actions.map((action, i) => (
                            <div
                                key={i}
                                className="text-xs text-gray-500 flex items-center gap-1.5"
                            >
                                <span className="text-gray-600">
                                    {new Date(
                                        action.timestamp,
                                    ).toLocaleTimeString('ko-KR')}
                                </span>
                                <span className="capitalize">
                                    {action.type.replace('_', ' ')}
                                </span>
                                {action.comment && (
                                    <span className="text-gray-500 italic truncate">
                                        -- "{action.comment}"
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Report Details Sub-Component ──

const ReportDetails: React.FC<{ report: MailReport }> = ({ report }) => {
    return (
        <div className="space-y-3">
            {/* Summary */}
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-bold text-gray-200">Summary</h3>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">
                    {report.summary}
                </p>
            </div>

            {/* Tools Used */}
            {report.toolsUsed.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <Wrench className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-gray-200">
                            Tools Used
                        </h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {report.toolsUsed.map((tool) => (
                            <span
                                key={tool}
                                className="px-2 py-0.5 bg-purple-900/30 text-purple-300 text-xs rounded-md border border-purple-700/30"
                            >
                                {tool}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Changed Files */}
            {report.changedFiles.length > 0 && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-2">
                        <FileEdit className="w-4 h-4 text-yellow-400" />
                        <h3 className="text-sm font-bold text-gray-200">
                            Changed Files
                        </h3>
                        <span className="text-xs text-gray-500">
                            ({report.changedFiles.length})
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {report.changedFiles.map((file) => (
                            <div
                                key={file.path}
                                className="flex items-center gap-2 text-xs"
                            >
                                {FILE_ACTION_ICON[file.action]}
                                <span className="text-gray-300 font-mono truncate flex-1">
                                    {file.path}
                                </span>
                                <span className="text-green-400 font-mono flex-shrink-0">
                                    +{file.linesAdded}
                                </span>
                                <span className="text-red-400 font-mono flex-shrink-0">
                                    -{file.linesRemoved}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Test Results */}
            {report.testResults && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <h3 className="text-sm font-bold text-gray-200">
                            Test Results
                        </h3>
                    </div>
                    <div className="flex gap-4 mb-3">
                        <div className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                            <span className="text-green-300 font-bold">
                                {report.testResults.passed} passed
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-red-300 font-bold">
                                {report.testResults.failed} failed
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <MinusCircle className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-400 font-bold">
                                {report.testResults.skipped} skipped
                            </span>
                        </div>
                    </div>
                    {/* Progress bar */}
                    {(() => {
                        const total =
                            report.testResults.passed +
                            report.testResults.failed +
                            report.testResults.skipped;
                        const passPercent =
                            total > 0
                                ? (report.testResults.passed / total) * 100
                                : 0;
                        const failPercent =
                            total > 0
                                ? (report.testResults.failed / total) * 100
                                : 0;
                        return (
                            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full flex">
                                    <div
                                        className="bg-green-500 h-full"
                                        style={{ width: `${passPercent}%` }}
                                    />
                                    <div
                                        className="bg-red-500 h-full"
                                        style={{ width: `${failPercent}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })()}
                    {report.testResults.coverage != null && (
                        <p className="text-xs text-gray-400 mt-2">
                            Coverage: {report.testResults.coverage}%
                        </p>
                    )}
                </div>
            )}

            {/* Duration */}
            {report.duration != null && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Duration: {formatDuration(report.duration)}</span>
                </div>
            )}
        </div>
    );
};
