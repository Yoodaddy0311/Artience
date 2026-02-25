import React, { Suspense, useState, useRef } from 'react';
import { Wand2, Check, Undo2, Settings, Mail, Upload, Download, Sparkles, Home, Inbox, Bot, ClipboardList, Clock, Package, Gem } from 'lucide-react';
const AgentTown = React.lazy(() =>
    import('../agent-town/AgentTown').then(m => ({ default: m.AgentTown }))
);
import { BottomDock } from './BottomDock';
import { RightSidebar } from './RightSidebar';
import { StudioDecorator } from '../studio/StudioDecorator';
import { AssetInbox } from '../studio/AssetInbox';
import { AIBuilder } from '../studio/AIBuilder';
const DraftPreview = React.lazy(() =>
    import('../studio/DraftPreview').then(m => ({ default: m.DraftPreview }))
);
import { VersionHistory } from '../studio/VersionHistory';
import { AssetsPanel } from '../studio/AssetsPanel';
import { RunPanel } from '../run/RunPanel';
import { DEFAULT_AGENTS } from '../../types/platform';
import { LevelProgress } from '../gamification/LevelProgress';
import { SettingsModal } from './SettingsModal';
import { ToastContainer } from '../ui/Toast';
import { useAppStore } from '../../store/useAppStore';

// ── Feature Flags ──

const SHOW_GAMIFICATION = false;

// ── AgentTown Error Boundary ──

class AgentTownBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div className="p-8 text-red-500 font-bold bg-cream-50 h-full w-full whitespace-pre-wrap overflow-auto relative z-50">
                    <h1>AgentTown Crash (Caught by MainLayout Boundary)</h1>
                    <pre>{this.state.error.stack}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// ── Types ──

export interface Teammate {
    id: string;
    name: string;
    role: string;
    status: 'working' | 'resting' | 'error';
    avatarUrl: string;
}

type StudioTab = 'inbox' | 'builder' | 'draft' | 'history' | 'assets';

const STUDIO_TABS: { key: StudioTab; icon: React.ReactNode; label: string }[] = [
    { key: 'inbox', icon: <Inbox className="w-3.5 h-3.5 inline-block" />, label: 'Inbox' },
    { key: 'builder', icon: <Bot className="w-3.5 h-3.5 inline-block" />, label: 'Builder' },
    { key: 'draft', icon: <ClipboardList className="w-3.5 h-3.5 inline-block" />, label: 'Draft' },
    { key: 'history', icon: <Clock className="w-3.5 h-3.5 inline-block" />, label: 'History' },
    { key: 'assets', icon: <Package className="w-3.5 h-3.5 inline-block" />, label: 'Assets' },
];

// ── Studio Action Buttons (P2-3) ──

const StudioActions: React.FC = () => {
    const [generating, setGenerating] = useState(false);
    const [applying, setApplying] = useState(false);
    const [rollingBack, setRollingBack] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await fetch('http://localhost:8000/api/studio/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: '', scope: 'all' }),
            });
        } catch {
            // silently handle
        }
        setGenerating(false);
    };

    const handleApply = async () => {
        setApplying(true);
        try {
            await fetch('http://localhost:8000/api/studio/draft/apply', {
                method: 'POST',
            });
        } catch {
            // silently handle
        }
        setApplying(false);
    };

    const handleRollback = async () => {
        setRollingBack(true);
        try {
            const res = await fetch('http://localhost:8000/api/studio/history');
            const data = await res.json();
            if (data.snapshots && data.snapshots.length > 0) {
                const latest = data.snapshots[0];
                await fetch(`http://localhost:8000/api/studio/history/${latest.id}/rollback`, {
                    method: 'POST',
                });
            }
        } catch {
            // silently handle
        }
        setRollingBack(false);
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 min-h-[44px] px-4 bg-[#A78BFA] font-bold text-white text-[13px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
            >
                <Wand2 className="w-4 h-4" strokeWidth={2.5} />
                {generating ? '...' : 'Generate'}
            </button>
            <button
                onClick={handleApply}
                disabled={applying}
                className="flex items-center gap-1.5 min-h-[44px] px-4 bg-[#22C55E] font-bold text-white text-[13px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
            >
                <Check className="w-4 h-4" strokeWidth={2.5} />
                {applying ? '...' : 'Apply'}
            </button>
            <button
                onClick={handleRollback}
                disabled={rollingBack}
                className="flex items-center gap-1.5 min-h-[44px] px-4 bg-[#FF6B6B] font-bold text-white text-[13px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
            >
                <Undo2 className="w-4 h-4" strokeWidth={2.5} />
                {rollingBack ? '...' : 'Rollback'}
            </button>
        </div>
    );
};

// ── Main Layout ──

export const MainLayout: React.FC = () => {
    const gamification = useAppStore((s) => s.gamification);
    const addToast = useAppStore((s) => s.addToast);
    const appSettings = useAppStore((s) => s.appSettings);

    // BottomDock team state (reactive, enables re-render on status changes)
    const [teamForDock] = useState<Teammate[]>(() =>
        DEFAULT_AGENTS.slice(0, 10).map(a => ({
            id: a.id,
            name: a.name,
            role: a.role,
            status: a.state === 'ERROR' ? 'error' : a.state === 'IDLE' ? 'resting' : 'working',
            avatarUrl: a.sprite,
        }))
    );
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

    // P2-8: Both views rendered simultaneously, toggled via CSS display
    const [activeView, setActiveView] = useState<'town' | 'studio'>('town');

    const [showRunPanel, setShowRunPanel] = useState(false);
    const [studioTab, setStudioTab] = useState<StudioTab>('inbox');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const importInputRef = useRef<HTMLInputElement>(null);

    // P2-20: Import with toast notification (replaces alert + reload)
    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${appSettings.apiUrl}/api/studio/import/project`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) throw new Error('Import failed');
            addToast({ type: 'success', message: '프로젝트를 가져왔습니다.' });
        } catch {
            addToast({ type: 'error', message: '가져오기에 실패했습니다.' });
        }
        // Reset input so the same file can be re-imported
        if (importInputRef.current) {
            importInputRef.current.value = '';
        }
    };

    // P2-21: Export with fetch + Blob download (replaces window.open)
    const handleExport = async () => {
        try {
            const res = await fetch(`${appSettings.apiUrl}/api/studio/export/project`);
            if (!res.ok) throw new Error('Export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dokba-project-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addToast({ type: 'success', message: '프로젝트를 내보냈습니다.' });
        } catch {
            addToast({ type: 'error', message: '내보내기에 실패했습니다.' });
        }
    };

    const selectedAgent = teamForDock.find(a => a.id === selectedAgentId) || null;

    return (
        <div className="flex w-full h-screen bg-cream-50 overflow-hidden font-sans relative text-brown-800">

            {/* Background/Workspace Layer */}
            <div className="flex-1 relative bg-cream-100">
                {/* P2-8: Town view - always mounted, hidden via CSS when studio active */}
                <div
                    className="absolute inset-0"
                    style={{ display: activeView === 'town' ? 'block' : 'none' }}
                >
                    <AgentTownBoundary>
                        <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-amber-50">Loading Agent Town...</div>}>
                            <AgentTown />
                        </Suspense>
                    </AgentTownBoundary>
                </div>

                {/* P2-8: Studio view - always mounted, hidden via CSS when town active */}
                <div
                    className="absolute inset-0 pt-4 pb-32 px-4 bg-cream-50 z-20 overflow-hidden"
                    style={{ display: activeView === 'studio' ? 'flex' : 'none' }}
                >
                    {/* Left: Studio Tools Panel */}
                    <div className="w-full max-w-sm flex-shrink-0 flex flex-col bg-white rounded-2xl shadow-xl border-4 border-black overflow-hidden">
                        {/* Tab Bar with Assets tab (P2-6) */}
                        <div className="flex border-b-2 border-black bg-gray-50" role="tablist" aria-label="Studio tabs">
                            {STUDIO_TABS.map(tab => (
                                <button
                                    key={tab.key}
                                    role="tab"
                                    aria-selected={studioTab === tab.key}
                                    aria-controls={`studio-tabpanel-${tab.key}`}
                                    id={`studio-tab-${tab.key}`}
                                    onClick={() => setStudioTab(tab.key)}
                                    className={`flex-1 py-2.5 text-xs font-black transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${studioTab === tab.key
                                        ? 'bg-[#FFD100] text-black border-b-0'
                                        : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                                        }`}
                                >
                                    {tab.icon} {tab.label}
                                </button>
                            ))}
                        </div>
                        {/* Tab Content */}
                        <div className="flex-1 overflow-hidden" role="tabpanel" id={`studio-tabpanel-${studioTab}`} aria-labelledby={`studio-tab-${studioTab}`}>
                            {studioTab === 'inbox' && <AssetInbox />}
                            {studioTab === 'builder' && <AIBuilder onDraftGenerated={() => setStudioTab('draft')} />}
                            {studioTab === 'draft' && (
                                <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-cream-50">Loading Draft Preview...</div>}>
                                    <DraftPreview />
                                </Suspense>
                            )}
                            {studioTab === 'history' && <VersionHistory />}
                            {studioTab === 'assets' && <AssetsPanel />}
                        </div>
                    </div>
                    {/* Right: Asset Gallery */}
                    <div className="flex-1 ml-4 bg-white rounded-3xl shadow-xl border-4 border-cream-200 overflow-hidden">
                        <StudioDecorator />
                    </div>
                </div>

                {/* Game HUD Overlay (v4 Brutalism + Artience Guide) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 flex flex-col justify-between">

                    {/* Top HUD Area */}
                    <div className="p-6 flex justify-between items-start w-full">

                        {/* Top-Left Profile HUD */}
                        <div className="flex flex-col gap-4 pointer-events-auto">
                            {/* P3-4/DS-9: Gamification elements hidden by feature flag */}
                            {SHOW_GAMIFICATION && (
                                <div className="bg-white border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl p-4 w-[360px] hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000] transition-all">
                                    <LevelProgress
                                        level={gamification.level}
                                        levelTitle={gamification.levelTitle}
                                        levelProgress={gamification.levelProgress}
                                        pointsToNextLevel={gamification.pointsToNextLevel}
                                        totalPoints={gamification.totalPoints}
                                    />
                                </div>
                            )}

                            {/* Settings / Mail Icons (Target: 44x44px, radius: 8px) */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="w-[44px] h-[44px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg flex items-center justify-center hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                                <button className="w-[44px] h-[44px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg flex items-center justify-center hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all">
                                    <Mail className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Top-Right Currency HUD + Controls */}
                        <div className="flex flex-col gap-4 items-end pointer-events-auto">
                            {/* P3-4/DS-9: Gamification currency panels hidden by feature flag */}
                            {SHOW_GAMIFICATION && (
                                <>
                                    {/* Coins Panel - DA-7: uses store */}
                                    <div className="flex items-center bg-white border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl p-2 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000] transition-all">
                                        <div className="w-10 h-10 bg-[#FFD100] border-4 border-black rounded-lg flex items-center justify-center rotate-3">
                                            <span className="font-bold text-black text-[20px] leading-[1.48]">W</span>
                                        </div>
                                        <span className="font-bold text-black text-[20px] leading-[1.48] px-4 min-w-[120px] text-right">
                                            {gamification.coins.toLocaleString()}
                                        </span>
                                        <button className="w-[44px] h-[44px] bg-[#FFD100] border-4 border-black rounded-lg font-bold text-black text-[20px] leading-[1.48] flex items-center justify-center hover:bg-black hover:text-white transition-colors">
                                            +
                                        </button>
                                    </div>

                                    {/* Diamonds Panel - DA-7: uses store */}
                                    <div className="flex items-center bg-white border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl p-2 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000] transition-all">
                                        <div className="w-10 h-10 bg-[#A0E8AF] border-4 border-black rounded-lg flex items-center justify-center -rotate-3">
                                            <Gem className="w-5 h-5 text-emerald-700" strokeWidth={2.5} />
                                        </div>
                                        <span className="font-bold text-black text-[20px] leading-[1.48] px-4 min-w-[120px] text-right">
                                            {gamification.diamonds.toLocaleString()}
                                        </span>
                                        <button className="w-[44px] h-[44px] bg-[#A0E8AF] border-4 border-black rounded-lg font-bold text-black text-[20px] leading-[1.48] flex items-center justify-center hover:bg-black hover:text-white transition-colors">
                                            +
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* P2-3: Studio mode Generate/Apply/Rollback buttons */}
                            {activeView === 'studio' && (
                                <StudioActions />
                            )}

                            {/* View Toggles & Export/Import */}
                            <div className="flex gap-3 mt-2">
                                <input type="file" accept=".zip" ref={importInputRef} onChange={handleImport} className="hidden" />
                                <button
                                    onClick={() => importInputRef.current?.click()}
                                    className="flex items-center gap-1 min-h-[44px] px-5 bg-white font-semibold text-black text-[15px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase"
                                >
                                    <Upload className="w-4 h-4" /> Import
                                </button>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-1 min-h-[44px] px-5 bg-white font-semibold text-black text-[15px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase"
                                >
                                    <Download className="w-4 h-4" /> Export
                                </button>
                                <button
                                    onClick={() => setActiveView(activeView === 'town' ? 'studio' : 'town')}
                                    className={`flex items-center gap-1 min-h-[44px] px-5 font-semibold text-black text-[15px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase ${activeView === 'town' ? 'bg-[#FF9F1C]' : 'bg-white'}`}
                                >
                                    {activeView === 'town' ? <><Sparkles className="w-4 h-4" /> Studio</> : <><Home className="w-4 h-4" /> Town</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom-Right Game Actions (Neo-Brutalism) */}
                    {/* P3-4/DS-9: Game HUD hidden in studio mode and by feature flag */}
                    {SHOW_GAMIFICATION && activeView !== 'studio' && (
                        <div className="absolute bottom-6 right-6 flex gap-6 pointer-events-auto items-end">

                            <button onClick={() => setShowRunPanel(!showRunPanel)} className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src="/assets/ui/management.png" alt="관리" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-white text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">팀 관리</span>
                            </button>

                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-[#E8DAFF] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src="/assets/ui/achievements.png" alt="업적" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-[#E8DAFF] text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">업적도감</span>
                            </button>

                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-[#9DE5DC] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src="/assets/ui/delivery.png" alt="배달" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-[#9DE5DC] text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">스케줄</span>
                            </button>

                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform origin-bottom ml-2">
                                <div className="w-[88px] h-[88px] bg-[#FF7D7D] border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-2 group-active:shadow-none">
                                    <img src="/assets/ui/shop.png" alt="상점" className="w-[56px] h-[56px] object-contain" />
                                </div>
                                <span className="bg-[#FFD100] text-black text-[15px] leading-[1.48] font-bold px-6 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg uppercase tracking-normal">상점</span>
                            </button>
                        </div>
                    )}

                    {/* Non-gamification: Run Panel button shown when gamification is off */}
                    {!SHOW_GAMIFICATION && activeView !== 'studio' && (
                        <div className="absolute bottom-6 right-6 flex gap-4 pointer-events-auto items-end">
                            <button onClick={() => setShowRunPanel(!showRunPanel)} className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src="/assets/ui/management.png" alt="관리" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-white text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">팀 관리</span>
                            </button>
                        </div>
                    )}

                </div>
            </div>

            {/* Run Panel (Right) */}
            {showRunPanel && (
                <RunPanel onClose={() => setShowRunPanel(false)} />
            )}

            {/* Agent Chat Sidebar (Right) */}
            {!showRunPanel && selectedAgent && (
                <RightSidebar
                    agent={selectedAgent}
                    onClose={() => setSelectedAgentId(null)}
                />
            )}

            {/* Bottom Dock */}
            <BottomDock
                team={teamForDock}
                selectedId={selectedAgentId}
                onSelect={setSelectedAgentId}
            />

            {/* Application Modals */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
};
