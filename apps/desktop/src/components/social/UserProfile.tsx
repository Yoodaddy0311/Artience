import React, { useEffect, useState } from 'react';
import { User, Briefcase, BarChart3, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { LevelProgress } from '../gamification/LevelProgress';

// ── Types ──

interface ProfileStats {
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
    avg_quality: number;
    current_streak: number;
}

interface RecentActivity {
    id: string;
    title: string;
    status: 'completed' | 'failed' | 'in_progress';
    timestamp: string;
    job_type: string;
}

interface UserProfileData {
    user_id: string;
    username: string;
    job_slot: string;
    level: number;
    xp: number;
    stats: ProfileStats;
    recent_activities: RecentActivity[];
}

// ── Status badge ──

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        completed: { bg: 'bg-green-100', text: 'text-green-700', label: '완료' },
        failed: { bg: 'bg-red-100', text: 'text-red-700', label: '실패' },
        in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: '진행 중' },
    };
    const c = config[status] || config.in_progress;
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-current ${c.bg} ${c.text}`}>
            {c.label}
        </span>
    );
};

// ── XP calculation helper ──

function xpForLevel(level: number): number {
    return level * 500;
}

// ── Main component ──

interface UserProfileProps {
    userId: string;
    className?: string;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userId, className }) => {
    const appSettings = useAppStore((s) => s.appSettings);
    const gamification = useAppStore((s) => s.gamification);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfileData | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            setLoading(true);
            try {
                // Fetch user achievements for stats
                const achRes = await fetch(`${appSettings.apiUrl}/api/ranking/achievements/${userId}`);
                const achData = achRes.ok ? await achRes.json() : { unlocked_count: 0 };

                // Fetch weekly ranking to get user's score
                const rankRes = await fetch(`${appSettings.apiUrl}/api/ranking/weekly?limit=100`);
                const rankData = rankRes.ok ? await rankRes.json() : { ranking: [] };
                const userRank = rankData.ranking?.find((r: any) => r.user_id === userId);

                // Build profile from available data
                setProfile({
                    user_id: userId,
                    username: userId,
                    job_slot: userRank?.job_type || 'general',
                    level: gamification.level,
                    xp: gamification.totalPoints,
                    stats: {
                        total_tasks: userRank?.task_count || 0,
                        completed_tasks: userRank?.task_count || 0,
                        failed_tasks: 0,
                        avg_quality: userRank?.quality_avg || 0,
                        current_streak: 0,
                    },
                    recent_activities: [],
                });
            } catch {
                setProfile(null);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [appSettings.apiUrl, userId, gamification.level, gamification.totalPoints]);

    if (loading) {
        return (
            <div className={`bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] p-8 flex items-center justify-center ${className || ''}`}>
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className={`bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] p-8 text-center ${className || ''}`}>
                <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-bold text-gray-400">프로필을 불러올 수 없습니다</p>
            </div>
        );
    }

    const totalXpForLevel = xpForLevel(profile.level);
    const currentLevelXp = profile.xp % totalXpForLevel;
    const pointsToNext = totalXpForLevel - currentLevelXp;

    return (
        <div className={`bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] overflow-hidden ${className || ''}`}>
            {/* Profile header */}
            <div className="px-5 py-4 border-b-2 border-black bg-gradient-to-r from-[#3b82f6] to-[#6366f1]">
                <div className="flex items-center gap-4">
                    {/* Avatar */}
                    <div className="w-14 h-14 bg-white border-3 border-black rounded-xl flex items-center justify-center shadow-[3px_3px_0_0_rgba(0,0,0,0.3)]">
                        <User className="w-7 h-7 text-gray-700" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-black text-lg text-white truncate">{profile.username}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <Briefcase className="w-3.5 h-3.5 text-white/70" strokeWidth={2.5} />
                            <span className="text-xs font-bold text-white/80">{profile.job_slot}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Level progress */}
            <div className="px-5 py-3 border-b border-gray-100">
                <LevelProgress
                    level={profile.level}
                    levelProgress={currentLevelXp}
                    pointsToNextLevel={pointsToNext}
                    totalPoints={profile.xp}
                    size="sm"
                    showDetails={true}
                />
            </div>

            {/* Stats grid */}
            <div className="px-5 py-4 border-b border-gray-100">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">통계</div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 bg-green-50 rounded-lg border-2 border-green-200">
                        <div className="flex items-center gap-1.5 mb-1">
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" strokeWidth={2.5} />
                            <span className="text-[9px] font-bold text-green-600 uppercase">완료</span>
                        </div>
                        <span className="text-lg font-black text-green-700 tabular-nums">
                            {profile.stats.completed_tasks}
                        </span>
                    </div>
                    <div className="p-2.5 bg-red-50 rounded-lg border-2 border-red-200">
                        <div className="flex items-center gap-1.5 mb-1">
                            <XCircle className="w-3.5 h-3.5 text-red-600" strokeWidth={2.5} />
                            <span className="text-[9px] font-bold text-red-600 uppercase">실패</span>
                        </div>
                        <span className="text-lg font-black text-red-700 tabular-nums">
                            {profile.stats.failed_tasks}
                        </span>
                    </div>
                    <div className="p-2.5 bg-blue-50 rounded-lg border-2 border-blue-200">
                        <div className="flex items-center gap-1.5 mb-1">
                            <BarChart3 className="w-3.5 h-3.5 text-blue-600" strokeWidth={2.5} />
                            <span className="text-[9px] font-bold text-blue-600 uppercase">품질</span>
                        </div>
                        <span className="text-lg font-black text-blue-700 tabular-nums">
                            {profile.stats.avg_quality.toFixed(1)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Recent activity */}
            <div className="px-5 py-4">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-3">최근 활동</div>
                {profile.recent_activities.length === 0 ? (
                    <div className="text-center py-4">
                        <Clock className="w-6 h-6 mx-auto mb-1 text-gray-300" />
                        <p className="text-xs font-bold text-gray-400">최근 활동이 없습니다</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {profile.recent_activities.slice(0, 5).map((activity) => (
                            <div
                                key={activity.id}
                                className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-black truncate">{activity.title}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        {new Date(activity.timestamp).toLocaleDateString('ko-KR')}
                                    </p>
                                </div>
                                <StatusBadge status={activity.status} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
