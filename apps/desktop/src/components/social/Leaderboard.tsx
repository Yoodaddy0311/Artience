import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, ChevronDown, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

// ── Types ──

interface RankingEntry {
    rank: number;
    user_id: string;
    score: number;
    task_count: number;
    quality_avg: number;
    job_type: string;
    week: string;
}

// ── Job type tabs ──

const JOB_TABS = [
    { key: 'all', label: '전체' },
    { key: 'PM', label: 'PM' },
    { key: 'backend', label: '백엔드' },
    { key: 'frontend', label: '프론트엔드' },
    { key: 'data', label: '데이터' },
    { key: 'qa', label: 'QA' },
    { key: 'devops', label: 'DevOps' },
    { key: 'design', label: '디자인' },
];

// ── Rank badge component ──

const RankBadge: React.FC<{ rank: number }> = ({ rank }) => {
    if (rank === 1) {
        return (
            <div className="w-8 h-8 bg-[#FFD100] border-2 border-black rounded-lg flex items-center justify-center shadow-[2px_2px_0_0_#000]">
                <Crown className="w-4 h-4 text-black" strokeWidth={3} />
            </div>
        );
    }
    if (rank === 2) {
        return (
            <div className="w-8 h-8 bg-gray-200 border-2 border-black rounded-lg flex items-center justify-center shadow-[2px_2px_0_0_#000]">
                <Medal className="w-4 h-4 text-gray-600" strokeWidth={3} />
            </div>
        );
    }
    if (rank === 3) {
        return (
            <div className="w-8 h-8 bg-amber-200 border-2 border-black rounded-lg flex items-center justify-center shadow-[2px_2px_0_0_#000]">
                <Medal className="w-4 h-4 text-amber-700" strokeWidth={3} />
            </div>
        );
    }
    return (
        <div className="w-8 h-8 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center">
            <span className="text-xs font-black text-gray-500">{rank}</span>
        </div>
    );
};

// ── Main component ──

interface LeaderboardProps {
    currentUserId?: string;
    className?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ currentUserId, className }) => {
    const appSettings = useAppStore((s) => s.appSettings);
    const [ranking, setRanking] = useState<RankingEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all');
    const [week, setWeek] = useState<string | null>(null);

    useEffect(() => {
        const fetchRanking = async () => {
            setLoading(true);
            try {
                const jobPath = activeTab === 'all' ? '' : `/${activeTab}`;
                const params = new URLSearchParams();
                if (week) params.set('week', week);
                const url = `${appSettings.apiUrl}/api/ranking/weekly${jobPath}?${params.toString()}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setRanking(data.ranking || []);
                if (data.week && !week) setWeek(data.week);
            } catch {
                setRanking([]);
            } finally {
                setLoading(false);
            }
        };
        fetchRanking();
    }, [appSettings.apiUrl, activeTab, week]);

    return (
        <div className={`bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] overflow-hidden ${className || ''}`}>
            {/* Header */}
            <div className="px-5 py-4 border-b-2 border-black bg-[#FFD100] flex items-center gap-3">
                <Trophy className="w-6 h-6 text-black" strokeWidth={3} />
                <h2 className="font-black text-lg text-black">주간 랭킹</h2>
                {week && (
                    <span className="ml-auto text-xs font-bold text-black/60 bg-white px-2 py-1 rounded-md border-2 border-black">
                        {week}
                    </span>
                )}
            </div>

            {/* Job type tabs */}
            <div className="flex border-b-2 border-black overflow-x-auto bg-gray-50">
                {JOB_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-shrink-0 px-3 py-2 text-xs font-black transition-all ${
                            activeTab === tab.key
                                ? 'bg-black text-white'
                                : 'text-gray-500 hover:text-black hover:bg-gray-100'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Ranking table */}
            <div className="max-h-80 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : ranking.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Trophy className="w-10 h-10 mb-2 opacity-30" />
                        <span className="text-sm font-bold">아직 랭킹 데이터가 없습니다</span>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase">순위</th>
                                <th className="px-4 py-2 text-left text-[10px] font-black text-gray-400 uppercase">유저</th>
                                <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase">점수</th>
                                <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase">태스크</th>
                                <th className="px-4 py-2 text-right text-[10px] font-black text-gray-400 uppercase">품질</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ranking.map((entry) => {
                                const isMe = currentUserId === entry.user_id;
                                return (
                                    <tr
                                        key={`${entry.user_id}-${entry.rank}`}
                                        className={`border-b border-gray-100 transition-colors ${
                                            isMe
                                                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <td className="px-4 py-2.5">
                                            <RankBadge rank={entry.rank} />
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <span className={`text-sm font-black ${isMe ? 'text-blue-700' : 'text-black'}`}>
                                                {entry.user_id}
                                                {isMe && (
                                                    <span className="ml-1.5 text-[10px] font-bold text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">
                                                        ME
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className="text-sm font-black text-black tabular-nums">
                                                {entry.score.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className="text-xs font-bold text-gray-500 tabular-nums">
                                                {entry.task_count}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className={`text-xs font-bold tabular-nums ${
                                                entry.quality_avg >= 90
                                                    ? 'text-green-600'
                                                    : entry.quality_avg >= 70
                                                    ? 'text-yellow-600'
                                                    : 'text-red-600'
                                            }`}>
                                                {entry.quality_avg.toFixed(1)}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
