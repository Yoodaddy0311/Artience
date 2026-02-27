import React, { useState } from 'react';
import { Trophy, Award, User } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { AchievementPanel } from './AchievementPanel';
import { UserProfile } from './UserProfile';

// ── Sub-tab definitions ──

type SocialTab = 'ranking' | 'achievements' | 'profile';

const SOCIAL_TABS: { key: SocialTab; icon: React.ReactNode; label: string }[] = [
    { key: 'ranking', icon: <Trophy className="w-3.5 h-3.5 inline-block" />, label: '랭킹' },
    { key: 'achievements', icon: <Award className="w-3.5 h-3.5 inline-block" />, label: '업적' },
    { key: 'profile', icon: <User className="w-3.5 h-3.5 inline-block" />, label: '프로필' },
];

// ── Main component ──

interface SocialViewProps {
    currentUserId?: string;
}

export const SocialView: React.FC<SocialViewProps> = ({ currentUserId = 'me' }) => {
    const [activeTab, setActiveTab] = useState<SocialTab>('ranking');

    return (
        <div className="absolute inset-0 pt-4 pb-32 px-4 bg-cream-50 z-20 overflow-hidden flex gap-4">
            {/* Left: Tab navigation panel */}
            <div className="w-full max-w-md flex-shrink-0 flex flex-col bg-white rounded-2xl shadow-xl border-4 border-black overflow-hidden">
                {/* Tab Bar */}
                <div className="flex border-b-2 border-black bg-gray-50" role="tablist" aria-label="Social tabs">
                    {SOCIAL_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            role="tab"
                            aria-selected={activeTab === tab.key}
                            aria-controls={`social-tabpanel-${tab.key}`}
                            id={`social-tab-${tab.key}`}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex-1 py-2.5 text-xs font-black transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                                activeTab === tab.key
                                    ? 'bg-[#FFD100] text-black border-b-0'
                                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div
                    className="flex-1 overflow-y-auto p-4"
                    role="tabpanel"
                    id={`social-tabpanel-${activeTab}`}
                    aria-labelledby={`social-tab-${activeTab}`}
                >
                    {activeTab === 'ranking' && (
                        <Leaderboard currentUserId={currentUserId} />
                    )}
                    {activeTab === 'achievements' && (
                        <AchievementPanel userId={currentUserId} />
                    )}
                    {activeTab === 'profile' && (
                        <UserProfile userId={currentUserId} />
                    )}
                </div>
            </div>

            {/* Right: Detail / summary panel */}
            <div className="flex-1 flex flex-col bg-white rounded-3xl shadow-xl border-4 border-cream-200 overflow-hidden">
                <div className="flex-1 flex items-center justify-center p-8">
                    {activeTab === 'ranking' && (
                        <div className="text-center">
                            <Trophy className="w-16 h-16 mx-auto mb-4 text-[#FFD100] opacity-40" strokeWidth={1.5} />
                            <h3 className="font-black text-lg text-gray-300 mb-2">주간 랭킹</h3>
                            <p className="text-sm text-gray-400 max-w-xs">
                                매주 태스크 완료 수와 품질 점수를 기반으로 랭킹이 산출됩니다.
                                상위 랭커에게는 특별 보상이 주어집니다.
                            </p>
                        </div>
                    )}
                    {activeTab === 'achievements' && (
                        <div className="text-center">
                            <Award className="w-16 h-16 mx-auto mb-4 text-[#A855F7] opacity-40" strokeWidth={1.5} />
                            <h3 className="font-black text-lg text-gray-300 mb-2">업적 시스템</h3>
                            <p className="text-sm text-gray-400 max-w-xs">
                                다양한 조건을 달성하여 업적을 해금하세요.
                                업적을 모으면 특별한 보상과 칭호를 받을 수 있습니다.
                            </p>
                        </div>
                    )}
                    {activeTab === 'profile' && (
                        <div className="text-center">
                            <User className="w-16 h-16 mx-auto mb-4 text-[#3b82f6] opacity-40" strokeWidth={1.5} />
                            <h3 className="font-black text-lg text-gray-300 mb-2">내 프로필</h3>
                            <p className="text-sm text-gray-400 max-w-xs">
                                나의 활동 통계, 레벨, 업적 현황을 한눈에 확인하세요.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
