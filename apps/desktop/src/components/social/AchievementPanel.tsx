import React, { useEffect, useState } from 'react';
import {
    Award, Flame, Trophy, Crown, CalendarCheck, Users, Star, Zap, CheckCircle,
    Footprints, Loader2, Lock,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

// ── Types ──

interface AchievementData {
    id: string;
    name: string;
    description: string;
    icon: string;
    condition_type?: string;
    condition_value?: number;
    unlocked_at?: string | null;
}

// ── Icon mapping ──

const ICON_MAP: Record<string, React.FC<{ className?: string; strokeWidth?: number }>> = {
    footprints: Footprints,
    flame: Flame,
    trophy: Trophy,
    crown: Crown,
    'calendar-check': CalendarCheck,
    award: Award,
    users: Users,
    star: Star,
    zap: Zap,
    'check-circle': CheckCircle,
};

// ── Achievement card ──

const AchievementCard: React.FC<{
    achievement: AchievementData;
    unlocked: boolean;
}> = ({ achievement, unlocked }) => {
    const IconComponent = ICON_MAP[achievement.icon] || Award;

    return (
        <div
            className={`relative p-4 rounded-xl border-2 transition-all ${
                unlocked
                    ? 'border-black bg-white shadow-[3px_3px_0_0_#000] hover:-translate-y-1 hover:shadow-[5px_5px_0_0_#000]'
                    : 'border-gray-200 bg-gray-50 opacity-60'
            }`}
        >
            {/* Lock overlay for locked achievements */}
            {!unlocked && (
                <div className="absolute top-2 right-2">
                    <Lock className="w-3.5 h-3.5 text-gray-400" strokeWidth={2.5} />
                </div>
            )}

            {/* Icon */}
            <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                    unlocked
                        ? 'bg-[#FFD100] border-2 border-black shadow-[2px_2px_0_0_#000]'
                        : 'bg-gray-200 border-2 border-gray-300'
                }`}
            >
                <IconComponent
                    className={`w-5 h-5 ${unlocked ? 'text-black' : 'text-gray-400'}`}
                    strokeWidth={2.5}
                />
            </div>

            {/* Name */}
            <h4 className={`text-sm font-black mb-1 ${unlocked ? 'text-black' : 'text-gray-400'}`}>
                {achievement.name}
            </h4>

            {/* Description */}
            <p className={`text-[11px] font-medium leading-tight ${unlocked ? 'text-gray-600' : 'text-gray-400'}`}>
                {achievement.description}
            </p>

            {/* Unlock date */}
            {unlocked && achievement.unlocked_at && (
                <div className="mt-2 text-[10px] font-bold text-green-600">
                    {new Date(achievement.unlocked_at).toLocaleDateString('ko-KR')} 해금
                </div>
            )}
        </div>
    );
};

// ── Main component ──

interface AchievementPanelProps {
    userId?: string;
    className?: string;
}

export const AchievementPanel: React.FC<AchievementPanelProps> = ({ userId, className }) => {
    const appSettings = useAppStore((s) => s.appSettings);
    const [allAchievements, setAllAchievements] = useState<AchievementData[]>([]);
    const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
    const [unlockedMap, setUnlockedMap] = useState<Map<string, AchievementData>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch all achievements
                const allRes = await fetch(`${appSettings.apiUrl}/api/ranking/achievements`);
                if (!allRes.ok) throw new Error(`HTTP ${allRes.status}`);
                const allData = await allRes.json();
                setAllAchievements(allData.achievements || []);

                // Fetch user achievements if userId provided
                if (userId) {
                    const userRes = await fetch(`${appSettings.apiUrl}/api/ranking/achievements/${userId}`);
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        const unlocked = userData.unlocked || [];
                        setUnlockedIds(new Set(unlocked.map((a: AchievementData) => a.id)));
                        setUnlockedMap(new Map(unlocked.map((a: AchievementData) => [a.id, a])));
                    }
                }
            } catch {
                // Use empty state on error
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [appSettings.apiUrl, userId]);

    const unlockedCount = unlockedIds.size;
    const totalCount = allAchievements.length;

    return (
        <div className={`bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] overflow-hidden ${className || ''}`}>
            {/* Header */}
            <div className="px-5 py-4 border-b-2 border-black bg-[#E8DAFF] flex items-center gap-3">
                <Award className="w-6 h-6 text-black" strokeWidth={3} />
                <h2 className="font-black text-lg text-black">업적</h2>
                <span className="ml-auto text-xs font-black text-black/60 bg-white px-2 py-1 rounded-md border-2 border-black">
                    {unlockedCount} / {totalCount}
                </span>
            </div>

            {/* Progress bar */}
            <div className="px-5 py-3 border-b border-gray-100">
                <div className="w-full h-3 bg-gray-100 rounded-full border-2 border-black overflow-hidden">
                    <div
                        className="h-full bg-[#A855F7] transition-all duration-500"
                        style={{ width: totalCount > 0 ? `${(unlockedCount / totalCount) * 100}%` : '0%' }}
                    />
                </div>
            </div>

            {/* Grid */}
            <div className="p-4 max-h-96 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                ) : allAchievements.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                        <Award className="w-10 h-10 mb-2 opacity-30" />
                        <span className="text-sm font-bold">업적 데이터를 불러올 수 없습니다</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {allAchievements.map((ach) => {
                            const unlocked = unlockedIds.has(ach.id);
                            const merged = unlocked && unlockedMap.has(ach.id)
                                ? { ...ach, ...unlockedMap.get(ach.id)! }
                                : ach;
                            return (
                                <AchievementCard
                                    key={ach.id}
                                    achievement={merged}
                                    unlocked={unlocked}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
