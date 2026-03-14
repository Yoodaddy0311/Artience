import React, { useState, useEffect } from 'react';
import {
    X,
    GitBranch,
    Hash,
    FileText,
    Wrench,
    Clock,
    CheckCircle2,
    XCircle,
    MinusCircle,
    FileEdit,
} from 'lucide-react';
import type { MailMessage, DiffStat } from '../../store/useMailStore';

import { formatDuration } from '../../lib/format-utils';
import { FILE_ACTION_ICON } from './mail-icons';

// ── Diff Bar Chart ──

const DiffBar: React.FC<{ stat: DiffStat; maxLines: number }> = ({
    stat,
    maxLines,
}) => {
    const total = stat.additions + stat.deletions;
    const barWidth = maxLines > 0 ? Math.max((total / maxLines) * 100, 4) : 4;
    const addRatio = total > 0 ? (stat.additions / total) * 100 : 50;

    return (
        <div className="flex items-center gap-2 text-xs py-1">
            <span className="font-mono font-bold text-black truncate w-[200px] shrink-0">
                {stat.file}
            </span>
            <div
                className="h-3 flex rounded-sm overflow-hidden border border-black/20"
                style={{ width: `${barWidth}%`, minWidth: '20px' }}
            >
                <div
                    className="bg-green-500 h-full"
                    style={{ width: `${addRatio}%` }}
                />
                <div
                    className="bg-red-500 h-full"
                    style={{ width: `${100 - addRatio}%` }}
                />
            </div>
            <span className="text-green-700 font-mono font-bold shrink-0">
                +{stat.additions}
            </span>
            <span className="text-red-700 font-mono font-bold shrink-0">
                -{stat.deletions}
            </span>
        </div>
    );
};

// ── Main Component ──

interface MailReportDetailProps {
    message: MailMessage;
    onClose: () => void;
}

export const MailReportDetail: React.FC<MailReportDetailProps> = ({
    message,
    onClose,
}) => {
    const report = message.report;
    const [liveDiff, setLiveDiff] = useState<DiffStat[] | null>(null);
    const [liveBranch, setLiveBranch] = useState<string | null>(null);
    const [liveHash, setLiveHash] = useState<string | null>(null);

    // Fetch live git diff if report doesn't have diffStats
    useEffect(() => {
        if (report?.diffStats && report.diffStats.length > 0) return;
        const api = window.dogbaApi?.mail;
        if (!api?.getGitDiff) return;

        api.getGitDiff().then((res) => {
            if (res.success) {
                setLiveDiff(res.diffStats ?? []);
                setLiveBranch(res.branch ?? null);
                setLiveHash(res.commitHash ?? null);
            }
        });
    }, [report]);

    if (!report) return null;

    const branch = report.gitBranch || liveBranch;
    const commitHash = report.commitHash || liveHash;
    const diffStats = report.diffStats ?? liveDiff ?? [];
    const maxLines = Math.max(
        ...diffStats.map((s) => s.additions + s.deletions),
        1,
    );

    const totalAdded = diffStats.reduce((s, d) => s + d.additions, 0);
    const totalRemoved = diffStats.reduce((s, d) => s + d.deletions, 0);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Report Detail"
        >
            <div className="absolute inset-0 bg-black/40" />

            <div className="relative w-[85vw] max-w-[800px] max-h-[80vh] bg-white border-4 border-black rounded-2xl shadow-[8px_8px_0_0_#000] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b-4 border-black bg-black">
                    <div className="flex items-center gap-3">
                        <FileText
                            className="w-5 h-5 text-white"
                            strokeWidth={2.5}
                        />
                        <h1 className="text-base font-black text-white truncate">
                            {message.subject}
                        </h1>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 border-2 border-white/20 rounded-lg text-white hover:bg-white/20 transition-all"
                        aria-label="Close detail"
                    >
                        <X className="w-4 h-4" strokeWidth={3} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Git Info Row */}
                    {(branch || commitHash) && (
                        <div className="flex items-center gap-3 flex-wrap">
                            {branch && (
                                <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-800 text-xs font-black px-3 py-1.5 rounded-lg border-2 border-black">
                                    <GitBranch className="w-3.5 h-3.5" />
                                    {branch}
                                </span>
                            )}
                            {commitHash && (
                                <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-mono font-bold px-3 py-1.5 rounded-lg border-2 border-black">
                                    <Hash className="w-3.5 h-3.5" />
                                    {commitHash}
                                </span>
                            )}
                            {report.duration != null && (
                                <span className="inline-flex items-center gap-1.5 bg-gray-50 text-gray-600 text-xs font-bold px-3 py-1.5 rounded-lg border-2 border-black/20">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatDuration(report.duration)}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Summary */}
                    <div className="bg-blue-50 rounded-xl p-4 border-2 border-black">
                        <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-black text-black">
                                Summary
                            </h3>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
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

                    {/* Diff Stats Visualization */}
                    {diffStats.length > 0 && (
                        <div className="bg-yellow-50 rounded-xl p-4 border-2 border-black">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <FileEdit className="w-4 h-4 text-yellow-700" />
                                    <h3 className="text-sm font-black text-black">
                                        Diff Stats
                                    </h3>
                                    <span className="text-[10px] font-black text-gray-500 bg-white px-1.5 py-0.5 rounded border-2 border-black">
                                        {diffStats.length} files
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs font-bold">
                                    <span className="text-green-700">
                                        +{totalAdded}
                                    </span>
                                    <span className="text-red-700">
                                        -{totalRemoved}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-0.5">
                                {diffStats.map((stat) => (
                                    <DiffBar
                                        key={stat.file}
                                        stat={stat}
                                        maxLines={maxLines}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Changed Files */}
                    {report.changedFiles.length > 0 && (
                        <div className="bg-gray-50 rounded-xl p-4 border-2 border-black">
                            <div className="flex items-center gap-2 mb-2">
                                <FileEdit className="w-4 h-4 text-gray-600" />
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
                                        <span className="text-green-700 font-mono font-bold shrink-0">
                                            +{file.linesAdded}
                                        </span>
                                        <span className="text-red-700 font-mono font-bold shrink-0">
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
                            {(() => {
                                const total =
                                    report.testResults.passed +
                                    report.testResults.failed +
                                    report.testResults.skipped;
                                const passPercent =
                                    total > 0
                                        ? (report.testResults.passed / total) *
                                          100
                                        : 0;
                                const failPercent =
                                    total > 0
                                        ? (report.testResults.failed / total) *
                                          100
                                        : 0;
                                return (
                                    <div className="w-full h-3 bg-white rounded-full overflow-hidden border-2 border-black">
                                        <div className="h-full flex">
                                            <div
                                                className="bg-green-500 h-full"
                                                style={{
                                                    width: `${passPercent}%`,
                                                }}
                                            />
                                            <div
                                                className="bg-red-500 h-full"
                                                style={{
                                                    width: `${failPercent}%`,
                                                }}
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
                </div>
            </div>
        </div>
    );
};
