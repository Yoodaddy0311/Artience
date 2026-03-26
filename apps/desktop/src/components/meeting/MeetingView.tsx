/**
 * MeetingView — 미팅 라운드별 의견 타임라인 UI.
 *
 * 각 라운드: 참가자 아바타 + 의견 말풍선 + 투표 배지
 * 합의 상태: approved=green, hold=yellow, revision=red
 * 진행 중 라운드: pulse 애니메이션
 */

import {
    useMeetingStore,
    type MeetingRound,
    type MeetingOpinion,
} from '../../store/useMeetingStore';

// ── Vote badge colors ──────────────────────────────────────────────────────

const VOTE_STYLES: Record<string, string> = {
    approve: 'bg-green-500/20 text-green-400 border-green-500/30',
    hold: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    revise: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const CONSENSUS_STYLES: Record<string, { bg: string; label: string }> = {
    approved: {
        bg: 'bg-green-500/20 border-green-500/40 text-green-400',
        label: 'Approved',
    },
    hold: {
        bg: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400',
        label: 'Hold',
    },
    revision: {
        bg: 'bg-red-500/20 border-red-500/40 text-red-400',
        label: 'Revision Needed',
    },
    pending: {
        bg: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
        label: 'Pending...',
    },
};

// ── Opinion bubble ─────────────────────────────────────────────────────────

function OpinionBubble({ opinion }: { opinion: MeetingOpinion }) {
    const voteStyle = VOTE_STYLES[opinion.vote] || VOTE_STYLES.hold;
    const initial = opinion.agentId.charAt(0).toUpperCase();

    return (
        <div className="flex items-start gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold text-white/80 shrink-0">
                {initial}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white/70">
                        {opinion.agentId}
                    </span>
                    <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${voteStyle}`}
                    >
                        {opinion.vote}
                    </span>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">
                    {opinion.opinion}
                </p>
            </div>
        </div>
    );
}

// ── Round section ──────────────────────────────────────────────────────────

function RoundSection({
    round,
    isActive,
}: {
    round: MeetingRound;
    isActive: boolean;
}) {
    const consensusInfo =
        CONSENSUS_STYLES[round.consensus] || CONSENSUS_STYLES.pending;

    return (
        <div className="border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white/80">
                    Round {round.roundNumber}
                    {isActive && (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-400 animate-pulse ml-2 align-middle" />
                    )}
                </h3>
                <span
                    className={`text-xs px-3 py-1 rounded-full border ${consensusInfo.bg}`}
                >
                    {consensusInfo.label}
                </span>
            </div>

            <div className="space-y-1 divide-y divide-white/5">
                {round.opinions.map((op) => (
                    <OpinionBubble key={op.agentId} opinion={op} />
                ))}
            </div>

            {round.opinions.length === 0 && isActive && (
                <p className="text-xs text-white/40 text-center py-4">
                    Collecting opinions...
                </p>
            )}
        </div>
    );
}

// ── Status header ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
    waiting: { text: 'Waiting', color: 'text-gray-400' },
    in_progress: { text: 'In Progress', color: 'text-blue-400' },
    completed: { text: 'Completed', color: 'text-green-400' },
    cancelled: { text: 'Cancelled', color: 'text-red-400' },
};

// ── Main component ─────────────────────────────────────────────────────────

export default function MeetingView({ meetingId }: { meetingId: string }) {
    const meeting = useMeetingStore((s) =>
        s.meetings.find((m) => m.id === meetingId),
    );

    if (!meeting) {
        return (
            <div className="p-4 text-white/40 text-sm text-center">
                Meeting not found
            </div>
        );
    }

    const statusInfo = STATUS_LABELS[meeting.status] || STATUS_LABELS.waiting;
    const isInProgress = meeting.status === 'in_progress';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-base font-semibold text-white/90 truncate">
                        {meeting.topic}
                    </h2>
                    <span className={`text-xs font-medium ${statusInfo.color}`}>
                        {statusInfo.text}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                    <span>{meeting.participants.length} participants</span>
                    <span>|</span>
                    <span>
                        {meeting.rounds.length} round
                        {meeting.rounds.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {/* Rounds timeline */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {meeting.rounds.map((round, idx) => (
                    <RoundSection
                        key={round.roundNumber}
                        round={round}
                        isActive={
                            isInProgress && idx === meeting.rounds.length - 1
                        }
                    />
                ))}

                {meeting.rounds.length === 0 && (
                    <div className="text-center text-white/30 text-sm py-8">
                        {isInProgress ? 'Starting meeting...' : 'No rounds yet'}
                    </div>
                )}
            </div>
        </div>
    );
}
