import React, { useState, useMemo } from 'react';
import {
    FileText,
    FileEdit,
    Clock,
    Wrench,
    CheckCircle2,
    XCircle,
    MinusCircle,
    ThumbsUp,
    MessageSquare,
    Eye,
    ExternalLink,
    Mail,
    User,
    Calendar,
} from 'lucide-react';
import { MailReportDetail } from './MailReportDetail';
import type {
    MailMessage,
    MailReport,
    MailStatus,
} from '../../store/useMailStore';
import { useMailStore } from '../../store/useMailStore';
import { FILE_ACTION_ICON } from './mail-icons';
import { formatDuration } from '../../lib/format-utils';

// ── Frontend noise filter (second pass) ──

const NOISE_RE =
    /(?:Percolating\.{3}|esc to interrupt|ctrl\+t to show tasks|\[\?2026[hl\]]|⎿|⏺|❯)/i;
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

function cleanBody(raw: string): string {
    return raw
        .replace(ANSI_RE, '')
        .split('\n')
        .filter((l) => {
            const t = l.trim();
            return t && !NOISE_RE.test(t);
        })
        .join('\n')
        .trim();
}

// ── Status Badge (Neobrutalism) ──

const STATUS_STYLES: Record<MailStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-black',
    approved: 'bg-green-100 text-green-800 border-black',
    changes_requested: 'bg-orange-100 text-orange-800 border-black',
    acknowledged: 'bg-blue-100 text-blue-800 border-black',
};

const STATUS_LABELS: Record<MailStatus, string> = {
    pending: 'Pending',
    approved: 'Approved',
    changes_requested: 'Changes Requested',
    acknowledged: 'Acknowledged',
};

// ── Main Component ──

export const MailReportView: React.FC<{ message: MailMessage }> = ({
    message,
}) => {
    const updateStatus = useMailStore((s) => s.updateStatus);
    const [comment, setComment] = useState('');
    const [showCommentInput, setShowCommentInput] = useState(false);
    const [showDetail, setShowDetail] = useState(false);

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

    const cleaned = useMemo(
        () => (message.body ? cleanBody(message.body) : ''),
        [message.body],
    );

    return (
        <div className="flex flex-col gap-4 h-full overflow-y-auto">
            {/* Email-style Header */}
            <div className="bg-white rounded-xl border-2 border-black shadow-[3px_3px_0_0_#000]">
                {/* Top bar: subject + status */}
                <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black/10">
                    <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <h2 className="text-base font-black text-black truncate">
                            {message.subject}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {report && (
                            <button
                                onClick={() => setShowDetail(true)}
                                className="flex items-center gap-1 text-[10px] font-black px-3 py-1 rounded-lg border-2 border-black bg-yellow-100 text-black shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                            >
                                <ExternalLink className="w-3 h-3" />
                                Detail
                            </button>
                        )}
                        <span
                            className={`text-[10px] font-black px-3 py-1 rounded-lg border-2 ${STATUS_STYLES[status]}`}
                        >
                            {STATUS_LABELS[status]}
                        </span>
                    </div>
                </div>
                {/* Meta fields: From, Date */}
                <div className="px-4 py-2 space-y-1 text-xs">
                    <div className="flex items-center gap-2 text-gray-600">
                        <User className="w-3 h-3 flex-shrink-0" />
                        <span className="font-bold text-gray-500 w-10">
                            From
                        </span>
                        <span className="font-black text-black">
                            {message.fromAgentName}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        <span className="font-bold text-gray-500 w-10">
                            Date
                        </span>
                        <span className="font-bold text-gray-700">
                            {new Date(message.timestamp).toLocaleString(
                                'ko-KR',
                            )}
                        </span>
                    </div>
                </div>
            </div>

            {/* Body (cleaned, email-style card) */}
            {cleaned && (
                <div className="bg-white rounded-xl p-5 border-2 border-black shadow-[2px_2px_0_0_#000]">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed font-medium">
                        {cleaned}
                    </p>
                </div>
            )}

            {/* Report Section */}
            {report && <ReportDetails report={report} />}

            {/* Detail Modal */}
            {showDetail && (
                <MailReportDetail
                    message={message}
                    onClose={() => setShowDetail(false)}
                />
            )}

            {/* Action Buttons */}
            <div className="border-t-2 border-black/10 pt-4 mt-auto">
                {showCommentInput && (
                    <div className="mb-3">
                        <textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Describe the changes you'd like..."
                            className="w-full bg-white border-2 border-black rounded-xl px-3 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFD100] focus:ring-offset-2 resize-none"
                            rows={3}
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() =>
                                    handleAction('changes_requested')
                                }
                                disabled={!comment.trim()}
                                className="px-3 py-1.5 bg-orange-100 text-orange-800 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40"
                            >
                                Submit Request
                            </button>
                            <button
                                onClick={() => {
                                    setShowCommentInput(false);
                                    setComment('');
                                }}
                                className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
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
                            className="flex items-center gap-1.5 px-4 py-2 bg-green-100 text-green-800 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_0_#000]"
                        >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            Approve
                        </button>
                        <button
                            onClick={() => handleAction('changes_requested')}
                            disabled={status === 'changes_requested'}
                            className="flex items-center gap-1.5 px-4 py-2 bg-orange-100 text-orange-800 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_0_#000]"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Request Changes
                        </button>
                        <button
                            onClick={() => handleAction('acknowledged')}
                            disabled={status === 'acknowledged'}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-100 text-blue-800 text-xs font-black border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[2px_2px_0_0_#000]"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            Acknowledge
                        </button>
                    </div>
                )}

                {/* Action History */}
                {(message.actions ?? []).length > 0 && (
                    <div className="mt-3 space-y-1">
                        {(message.actions ?? []).map((action, i) => (
                            <div
                                key={i}
                                className="text-xs text-gray-500 flex items-center gap-1.5"
                            >
                                <span className="text-gray-600 font-bold">
                                    {new Date(
                                        action.timestamp,
                                    ).toLocaleTimeString('ko-KR')}
                                </span>
                                <span className="capitalize font-bold text-black">
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

// ── Report Details Sub-Component (Neobrutalism) ──

const ReportDetails: React.FC<{ report: MailReport }> = ({ report }) => {
    return (
        <div className="space-y-3">
            {/* Summary */}
            <div className="bg-blue-50 rounded-xl p-4 border-2 border-black">
                <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-black text-black">Summary</h3>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                    {report.summary}
                </p>
            </div>

            {/* Tools Used */}
            {report.toolsUsed.length > 0 && (
                <div className="bg-purple-50 rounded-xl p-4 border-2 border-black">
                    <div className="flex items-center gap-2 mb-2">
                        <Wrench className="w-4 h-4 text-purple-600" />
                        <h3 className="text-sm font-black text-black">
                            Tools Used
                        </h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {report.toolsUsed.map((tool) => (
                            <span
                                key={tool}
                                className="px-2 py-0.5 bg-white text-purple-800 text-xs font-bold rounded-md border-2 border-black"
                            >
                                {tool}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Changed Files */}
            {report.changedFiles.length > 0 && (
                <div className="bg-yellow-50 rounded-xl p-4 border-2 border-black">
                    <div className="flex items-center gap-2 mb-2">
                        <FileEdit className="w-4 h-4 text-yellow-700" />
                        <h3 className="text-sm font-black text-black">
                            Changed Files
                        </h3>
                        <span className="text-[10px] font-black text-gray-500 bg-white px-1.5 py-0.5 rounded border-2 border-black">
                            {report.changedFiles.length}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {report.changedFiles.map((file) => (
                            <div
                                key={file.path}
                                className="flex items-center gap-2 text-xs bg-white rounded-lg px-2 py-1.5 border border-black/20"
                            >
                                {FILE_ACTION_ICON[file.action]}
                                <span className="text-black font-mono font-bold truncate flex-1">
                                    {file.path}
                                </span>
                                <span className="text-green-700 font-mono font-bold flex-shrink-0">
                                    +{file.linesAdded}
                                </span>
                                <span className="text-red-700 font-mono font-bold flex-shrink-0">
                                    -{file.linesRemoved}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Test Results */}
            {report.testResults && (
                <div className="bg-green-50 rounded-xl p-4 border-2 border-black">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <h3 className="text-sm font-black text-black">
                            Test Results
                        </h3>
                    </div>
                    <div className="flex gap-4 mb-3">
                        <div className="flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-green-800 font-black">
                                {report.testResults.passed} passed
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                            <span className="text-red-800 font-black">
                                {report.testResults.failed} failed
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <MinusCircle className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-600 font-black">
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
                            <div className="w-full h-3 bg-white rounded-full overflow-hidden border-2 border-black">
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
                        <p className="text-xs font-bold text-gray-600 mt-2">
                            Coverage: {report.testResults.coverage}%
                        </p>
                    )}
                </div>
            )}

            {/* Duration */}
            {report.duration != null && (
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border-2 border-black/20">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Duration: {formatDuration(report.duration)}</span>
                </div>
            )}
        </div>
    );
};
