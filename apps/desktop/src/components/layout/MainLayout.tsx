import React, { Suspense, useState, useRef, useCallback, useEffect } from 'react';
import { Wand2, Check, Undo2, Settings, Mail, Upload, Download, Sparkles, Home, Inbox, Bot, ClipboardList, Clock, Package, Gem } from 'lucide-react';
const AgentTown = React.lazy(() =>
    import('../agent-town/AgentTown').then(m => ({ default: m.AgentTown }))
);
const TerminalPanel = React.lazy(() =>
    import('../terminal/TerminalPanel').then(m => ({ default: m.TerminalPanel }))
);
import { BottomDock } from './BottomDock';
// import { RightSidebar } from './RightSidebar'; // Phase 2에서 재설계 예정
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
import { assetPath } from '../../lib/assetPath';
import { ToastContainer } from '../ui/Toast';
import { InspectorCard } from '../agent-town/InspectorCard';
import { useAppStore } from '../../store/useAppStore';
import { useMailStore } from '../../store/useMailStore';
import { MailInbox } from '../mail/MailInbox';

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

// ── Studio Action Buttons (IPC stubs) ──

const StudioActions: React.FC = () => {
    const addToast = useAppStore((s) => s.addToast);
    const [generating, setGenerating] = useState(false);
    const [applying, setApplying] = useState(false);
    const [rollingBack, setRollingBack] = useState(false);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            const api = window.dogbaApi?.studio;
            if (!api) throw new Error('Studio API not available');
            const result = await api.generate('');
            if (!result.success) throw new Error(result.error || 'Generation failed');
        } catch {
            addToast({ type: 'error', message: 'Draft generation failed.' });
        }
        setGenerating(false);
    };

    const handleApply = async () => {
        setApplying(true);
        try {
            const api = window.dogbaApi?.studio;
            if (!api) throw new Error('Studio API not available');
            // TODO: implement apply via IPC
        } catch {
            addToast({ type: 'error', message: 'Failed to apply draft.' });
        }
        setApplying(false);
    };

    const handleRollback = async () => {
        setRollingBack(true);
        try {
            const api = window.dogbaApi?.studio;
            if (!api) throw new Error('Studio API not available');
            const history = await api.getHistory();
            if (history.snapshots.length > 0) {
                const result = await api.rollback(history.snapshots[0].id);
                if (!result.success) throw new Error(result.error || 'Rollback failed');
            }
        } catch {
            addToast({ type: 'error', message: 'Rollback failed.' });
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
    const highlightedAgentId = useAppStore((s) => s.highlightedAgentId);
    const setHighlightedAgentId = useAppStore((s) => s.setHighlightedAgentId);
    const inspectedAgent = highlightedAgentId
        ? DEFAULT_AGENTS.find((a) => a.id === highlightedAgentId) ?? null
        : null;

    const [activeView, setActiveView] = useState<'town' | 'studio'>('town');

    const [showRunPanel, setShowRunPanel] = useState(false);
    const [studioTab, setStudioTab] = useState<StudioTab>('inbox');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const isInboxOpen = useMailStore((s) => s.isInboxOpen);
    const toggleInbox = useMailStore((s) => s.toggleInbox);
    const mailUnreadCount = useMailStore((s) => s.unreadCount);
    const setInboxOpen = useMailStore((s) => s.setInboxOpen);
    const importInputRef = useRef<HTMLInputElement>(null);

    // Subscribe to mail:new-report IPC → feed into useMailStore
    useEffect(() => {
        const unsub = window.dogbaApi?.mail?.onNewReport((report) => {
            useMailStore.getState().addMessage(report);
        });
        return () => { unsub?.(); };
    }, []);

    // Terminal split drag-resize
    const [terminalHeight, setTerminalHeight] = useState(300);
    const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        dragRef.current = { startY: e.clientY, startHeight: terminalHeight };

        const handleMove = (ev: MouseEvent) => {
            if (!dragRef.current) return;
            const diff = dragRef.current.startY - ev.clientY;
            const newHeight = Math.max(150, Math.min(window.innerHeight * 0.6, dragRef.current.startHeight + diff));
            setTerminalHeight(newHeight);
        };

        const handleUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    }, [terminalHeight]);

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const api = window.dogbaApi?.file;
            if (!api) throw new Error('File API not available');
            // TODO: implement import via IPC (read file, parse, load project)
            addToast({ type: 'success', message: '프로젝트를 가져왔습니다.' });
        } catch {
            addToast({ type: 'error', message: '가져오기에 실패했습니다.' });
        }
        if (importInputRef.current) {
            importInputRef.current.value = '';
        }
    };

    const handleExport = async () => {
        try {
            const api = window.dogbaApi?.project;
            if (!api) throw new Error('Project API not available');
            // TODO: implement export via IPC (save project to file dialog)
            addToast({ type: 'success', message: '프로젝트를 내보냈습니다.' });
        } catch {
            addToast({ type: 'error', message: '내보내기에 실패했습니다.' });
        }
    };

    return (
        <div className="flex w-full h-screen bg-cream-50 overflow-hidden font-sans relative text-brown-800">

            {/* Background/Workspace Layer */}
            <div className="flex-1 relative bg-cream-100">
                {/* flex-col split: top AgentTown + bottom Terminal */}
                <div className="flex flex-col h-full">
                    {/* Top: AgentTown / Studio */}
                    <div className="relative" style={{ flex: '1 1 0', minHeight: '200px' }}>
                        {/* Town view */}
                        <div
                            className="absolute inset-0"
                            style={{ display: activeView === 'town' ? 'block' : 'none' }}
                        >
                            <AgentTownBoundary>
                                <Suspense fallback={<div className="w-full h-full flex items-center justify-center bg-amber-50">Loading Agent Town...</div>}>
                                    <AgentTown />
                                </Suspense>
                            </AgentTownBoundary>
                            {inspectedAgent && (
                                <InspectorCard
                                    agent={inspectedAgent}
                                    onClose={() => setHighlightedAgentId(null)}
                                />
                            )}
                        </div>

                        {/* Studio view */}
                        <div
                            className="absolute inset-0 pt-4 pb-32 px-4 bg-cream-50 z-20 overflow-hidden"
                            style={{ display: activeView === 'studio' ? 'flex' : 'none' }}
                        >
                            {/* Left: Studio Tools Panel */}
                            <div className="w-full max-w-sm flex-shrink-0 flex flex-col bg-white rounded-2xl shadow-xl border-4 border-black overflow-hidden">
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

                        {/* Game HUD Overlay */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 flex flex-col justify-between">

                    {/* Top HUD Area */}
                    <div className="p-6 flex justify-between items-start w-full">

                        {/* Top-Left Profile HUD */}
                        <div className="flex flex-col gap-4 pointer-events-auto">
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

                            {/* Settings / Terminal / Mail Icons */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="w-[44px] h-[44px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg flex items-center justify-center hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => { toggleInbox(); if (!isInboxOpen) setShowRunPanel(false); }}
                                    className={`relative w-[44px] h-[44px] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg flex items-center justify-center hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all ${isInboxOpen ? 'bg-[#FFD100]' : 'bg-white'}`}
                                >
                                    <Mail className="w-5 h-5" />
                                    {mailUnreadCount > 0 && (
                                        <span className="absolute -top-2 -right-2 min-w-[20px] h-5 bg-red-500 text-white text-[11px] font-black rounded-full flex items-center justify-center px-1 border-2 border-black">
                                            {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Top-Right Controls */}
                        <div className="flex flex-col gap-4 items-end pointer-events-auto">
                            {SHOW_GAMIFICATION && (
                                <>
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
                                    className={`flex items-center gap-1 min-h-[44px] px-5 font-semibold text-black text-[15px] leading-[1.48] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all uppercase ${activeView === 'studio' ? 'bg-[#FF9F1C]' : 'bg-white'}`}
                                >
                                    {activeView === 'studio' ? <><Home className="w-4 h-4" /> Town</> : <><Sparkles className="w-4 h-4" /> Studio</>}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Bottom-Right Game Actions */}
                    {SHOW_GAMIFICATION && activeView !== 'studio' && (
                        <div className="absolute bottom-6 right-6 flex gap-6 pointer-events-auto items-end">
                            <button onClick={() => setShowRunPanel(!showRunPanel)} className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src={assetPath("/assets/ui/management.png")} alt="관리" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-white text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">팀 관리</span>
                            </button>
                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-[#E8DAFF] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src={assetPath("/assets/ui/achievements.png")} alt="업적" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-[#E8DAFF] text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">업적도감</span>
                            </button>
                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-[#9DE5DC] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src={assetPath("/assets/ui/delivery.png")} alt="배달" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-[#9DE5DC] text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">스케줄</span>
                            </button>
                            <button className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform origin-bottom ml-2">
                                <div className="w-[88px] h-[88px] bg-[#FF7D7D] border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-2 group-active:shadow-none">
                                    <img src={assetPath("/assets/ui/shop.png")} alt="상점" className="w-[56px] h-[56px] object-contain" />
                                </div>
                                <span className="bg-[#FFD100] text-black text-[15px] leading-[1.48] font-bold px-6 py-2 border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg uppercase tracking-normal">상점</span>
                            </button>
                        </div>
                    )}

                    {!SHOW_GAMIFICATION && activeView !== 'studio' && (
                        <div className="absolute bottom-6 right-6 flex gap-4 pointer-events-auto items-end">
                            <button onClick={() => setShowRunPanel(!showRunPanel)} className="group flex flex-col items-center gap-3 hover:-translate-y-2 transition-transform">
                                <div className="w-[68px] h-[68px] bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-2xl flex items-center justify-center overflow-hidden transition-all group-active:translate-y-1 group-active:shadow-none">
                                    <img src={assetPath("/assets/ui/management.png")} alt="관리" className="w-[48px] h-[48px] object-contain" />
                                </div>
                                <span className="bg-white text-black text-[12px] leading-[1.48] font-bold px-4 py-1.5 border-4 border-black shadow-[2px_2px_0_0_#000] rounded-lg">팀 관리</span>
                            </button>
                        </div>
                    )}

                        </div>
                    </div>{/* end Top: AgentTown / Studio */}

                    {/* Drag Handle */}
                    <div
                        className="h-2 bg-gray-200 hover:bg-[#E8DAFF] cursor-row-resize border-y border-black flex items-center justify-center transition-colors"
                        onMouseDown={handleDragStart}
                    >
                        <div className="w-12 h-1 bg-gray-400 rounded-full" />
                    </div>

                    {/* Bottom: TerminalPanel */}
                    <div style={{ height: `${terminalHeight}px`, minHeight: '150px' }}>
                        <Suspense fallback={<div className="w-full h-full bg-[#1e1e2e] flex items-center justify-center text-white text-sm">Loading Terminal...</div>}>
                            <TerminalPanel />
                        </Suspense>
                    </div>
                </div>{/* end flex-col split */}
            </div>

            {/* Run Panel (Right) */}
            {showRunPanel && !isInboxOpen && (
                <RunPanel onClose={() => setShowRunPanel(false)} />
            )}

            {/* Mail Inbox (Right) */}
            {isInboxOpen && (
                <MailInbox onClose={() => setInboxOpen(false)} />
            )}


            {/* Bottom Dock */}
            <BottomDock />

            {/* Application Modals */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
};
