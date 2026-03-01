import React, { useState, useEffect, useRef } from 'react';
import type { AgentProfile, Job, Recipe, AgentState } from '../../types/platform';
import { DEFAULT_AGENTS, DEFAULT_RECIPES } from '../../types/platform';
import { useAppStore, type LogVerbosity } from '../../store/useAppStore';
import { Activity, Search, FolderOpen, Image, FileText, Package } from 'lucide-react';
import { assetPath } from '../../lib/assetPath';

type SettingsSyncStatus = 'idle' | 'saving' | 'saved' | 'error';

type RunTab = 'agents' | 'jobs' | 'artifacts' | 'settings';

// State color map per .ref/Specs/State_machine.md
const STATE_COLORS: Record<AgentState, string> = {
    IDLE: 'bg-gray-500',
    WALK: 'bg-blue-500',
    THINKING: 'bg-yellow-500',
    RUNNING: 'bg-green-600',
    SUCCESS: 'bg-emerald-500',
    ERROR: 'bg-red-600',
    NEEDS_INPUT: 'bg-purple-500',
};

const STATE_LABELS: Record<AgentState, string> = {
    IDLE: '대기',
    WALK: '이동',
    THINKING: '고민 중',
    RUNNING: '실행 중',
    SUCCESS: '성공',
    ERROR: '오류',
    NEEDS_INPUT: '입력 대기',
};

export const RunPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [tab, setTab] = useState<RunTab>('agents');
    const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
    const [agents, setAgents] = useState<AgentProfile[]>(DEFAULT_AGENTS);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [recipes] = useState<Recipe[]>(DEFAULT_RECIPES);

    // P2-9: Canvas highlight store
    const setHighlightedAgentId = useAppStore((s) => s.setHighlightedAgentId);

    // P2-7: Run settings from store
    const runSettings = useAppStore((s) => s.runSettings);
    const updateRunSettings = useAppStore((s) => s.updateRunSettings);

    // FE-4: Settings sync status
    const [settingsSyncStatus, setSettingsSyncStatus] = useState<SettingsSyncStatus>('idle');
    const settingsInitializedRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Settings are stored locally via Zustand persist — no IPC needed
    useEffect(() => {
        settingsInitializedRef.current = true;
    }, []);

    // Settings are persisted locally via Zustand — show brief "saved" feedback on change
    useEffect(() => {
        if (!settingsInitializedRef.current) return;

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            setSettingsSyncStatus('saved');
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
            savedTimerRef.current = setTimeout(() => setSettingsSyncStatus('idle'), 2000);
        }, 500);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, [
        runSettings.maxConcurrentAgents,
        runSettings.logVerbosity,
        runSettings.runTimeoutSeconds,
    ]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        };
    }, []);

    // R-4: Artifacts mock data
    const [artifacts, setArtifacts] = useState<{ name: string; path: string; type: string; jobId: string; ts: number }[]>([]);
    const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({ image: true, document: true, archive: true, other: true });


    const runRecipe = async (recipeId: string) => {
        const recipe = recipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const idle = agents.filter(a => a.state === 'IDLE');
        const agent = idle[Math.floor(Math.random() * idle.length)] || agents[0];
        const jobApi = window.dogbaApi?.job;
        if (!jobApi) return;
        try {
            const result = await jobApi.run(agent.name, `${recipe.command} ${recipe.args.join(' ')}`);
            if (result.success) {
                setJobs(prev => [...prev, {
                    id: `job-${Date.now()}`,
                    recipeId: recipe.id,
                    recipeName: recipe.name,
                    assignedAgentId: agent.id,
                    state: 'SUCCESS' as const,
                    startedAt: Date.now(),
                    endedAt: Date.now(),
                    exitCode: 0,
                    logs: [],
                }]);
            }
        } catch (e) { if (import.meta.env.DEV) console.error(e); }
    };

    const stopJob = (jobId: string) => {
        setJobs(prev => prev.map(j =>
            j.id === jobId ? { ...j, state: 'CANCELED' as const, endedAt: Date.now() } : j
        ));
    };


    // P1-11: Open artifact path via shell (Electron local file)
    const downloadFile = async (_path: string, _filename: string) => {
        // TODO: implement via dogbaApi.file.read or shell.openPath
        if (import.meta.env.DEV) console.log('Download artifact:', _path, _filename);
    };

    // Count agents by state
    const stateCounts = agents.reduce((acc, a) => {
        acc[a.state] = (acc[a.state] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="w-full max-w-md h-full bg-white border-l-4 border-black shadow-[-6px_0_0_0_#000] flex flex-col z-20 transition-all absolute right-0 top-0" style={{ fontFamily: "'Pretendard', sans-serif" }}>
            {/* Header */}
            <div className="p-4 border-b-2 border-black flex justify-between items-center bg-[#FFD100]">
                <h2 className="font-black text-lg text-black flex items-center gap-1.5"><Activity className="w-5 h-5 inline-block" strokeWidth={2.5} /> Run 관제 패널</h2>
                <button onClick={onClose} aria-label="Close panel" className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>

            {/* Tab Buttons (Neo-Brutalist) */}
            <div className="flex border-b-2 border-black bg-white" role="tablist" aria-label="Run panel tabs">
                {([['agents', `에이전트 (${agents.length})`], ['jobs', 'Jobs'], ['artifacts', '산출물'], ['settings', '설정']] as [RunTab, string][]).map(([key, label]) => (
                    <button key={key} role="tab" aria-selected={tab === key} aria-controls={`run-tabpanel-${key}`} id={`run-tab-${key}`} onClick={() => setTab(key)} className={`flex-1 py-3 text-xs font-black transition-all border-r-2 border-black last:border-r-0 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${tab === key ? 'text-black bg-[#E8DAFF]' : 'text-gray-500 hover:bg-gray-50'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
                {/* ─── Agents Tab ─── */}
                {tab === 'agents' && (
                    <div className="p-3 space-y-1.5">
                        {/* State Summary Bar */}
                        <div className="flex gap-2 flex-wrap mb-3 p-2 bg-gray-50 rounded-lg border-2 border-black">
                            {Object.entries(stateCounts).map(([state, count]) => (
                                <span key={state} className={`text-xs font-bold px-2 py-1 rounded-md border border-black ${STATE_COLORS[state as AgentState]} ${state === 'THINKING' ? 'text-black' : 'text-white'} shadow-[1px_1px_0_0_#000]`}>
                                    {STATE_LABELS[state as AgentState]} {count}
                                </span>
                            ))}
                        </div>

                        {agents.map(agent => (
                            <div key={agent.id} className="flex flex-col gap-2 p-2.5 rounded-lg hover:bg-gray-50 transition-colors border-2 border-transparent hover:border-black cursor-pointer" onClick={() => setSelectedAgentId(prev => prev === agent.id ? null : agent.id)}>
                                <div className="flex items-center gap-3">
                                    <img src={assetPath(agent.sprite)} alt={agent.name} className="w-10 h-10 rounded-lg bg-gray-100 object-contain border-2 border-black" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sm text-black">{agent.name}</span>
                                            <span className={`w-2 h-2 rounded-full ${STATE_COLORS[agent.state]}`}></span>
                                        </div>
                                        <span className="text-xs text-gray-500 truncate block">{agent.role}</span>
                                    </div>
                                    <span className={`text-xs font-black px-2 py-1 rounded-md border-2 border-black shadow-[1px_1px_0_0_#000] ${agent.state === 'IDLE' ? 'bg-gray-100 text-gray-600' : agent.state === 'RUNNING' ? 'bg-green-100 text-green-700' : agent.state === 'THINKING' ? 'bg-yellow-100 text-yellow-700' : agent.state === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : agent.state === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {STATE_LABELS[agent.state]}
                                    </span>
                                </div>
                                {selectedAgentId === agent.id && (
                                    <div className="mt-1 p-3 bg-white border-2 border-black rounded-lg shadow-[inset_2px_2px_0_0_#00000010]">
                                        <h4 className="text-[11px] font-black text-black uppercase mb-2 flex items-center gap-2">
                                            <Search className="w-3.5 h-3.5 inline-block" strokeWidth={2.5} /><span>최근 로깅 내역</span>
                                        </h4>
                                        <div className="bg-[#1e1e2e] rounded border-2 border-black p-2 text-[10px] font-mono leading-tight max-h-32 overflow-y-auto w-full">
                                            {(() => {
                                                const agentJobs = jobs.filter(j => j.assignedAgentId === agent.id);
                                                if (agentJobs.length === 0) return <span className="text-gray-500">실행된 작업 내역이 없습니다.</span>;
                                                return agentJobs.slice(-5).map((j, idx) => (
                                                    <div key={idx} className={`py-0.5 ${j.state === 'ERROR' ? 'text-red-400' : 'text-green-300'}`}>
                                                        <span className="text-gray-500 select-none mr-1">[{new Date(j.startedAt).toLocaleTimeString()}]</span>
                                                        {j.recipeName} — {j.state}
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ─── Jobs Tab ─── */}
                {tab === 'jobs' && (
                    <div className="p-4 space-y-4">
                        {/* Recipe Buttons */}
                        <div>
                            <h3 className="text-xs font-black text-black uppercase mb-2">레시피 (클릭하여 실행)</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {recipes.map(r => (
                                    <button key={r.id} onClick={() => runRecipe(r.id)} className="p-3 bg-white rounded-lg border-2 border-black text-left hover:bg-[#9DE5DC] hover:shadow-[3px_3px_0_0_#000] transition-all shadow-[2px_2px_0_0_#000] group">
                                        <span className="text-sm font-black text-black group-hover:text-black block">{r.name}</span>
                                        <span className="text-xs text-gray-500 block mt-0.5">{r.description}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Job Queue */}
                        <div>
                            <h3 className="text-xs font-black text-black uppercase mb-2">작업 큐</h3>
                            {jobs.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">실행된 작업이 없습니다</p>
                            ) : (
                                <div className="space-y-2">
                                    {jobs.slice().reverse().map(job => (
                                        <div key={job.id} className="p-3 bg-white rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000]">
                                            <div className="flex justify-between items-center">
                                                <span className="font-black text-sm text-black">{job.recipeName}</span>
                                                <span className={`text-xs font-black px-2 py-0.5 rounded-md border-2 border-black ${job.state === 'SUCCESS' ? 'bg-emerald-200 text-emerald-800' : job.state === 'RUNNING' ? 'bg-green-200 text-green-800 animate-pulse' : job.state === 'ERROR' ? 'bg-red-200 text-red-800' : job.state === 'QUEUED' ? 'bg-yellow-200 text-yellow-800' : 'bg-gray-200 text-gray-600'}`}>
                                                    {job.state}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center mt-1.5">
                                                <span className="text-xs text-gray-500">Agent: {job.assignedAgentId} · {job.id}</span>
                                                <div className="flex gap-1.5">
                                                    {(job.state === 'RUNNING' || job.state === 'QUEUED') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); stopJob(job.id); }}
                                                            className="bg-red-400 text-white border-2 border-black rounded-lg px-3 py-1 text-sm font-bold shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                                                        >
                                                            Stop
                                                        </button>
                                                    )}
                                                    {(job.state === 'SUCCESS' || job.state === 'ERROR' || job.state === 'CANCELED') && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); runRecipe(job.recipeId); }}
                                                            className="bg-blue-400 text-white border-2 border-black rounded-lg px-3 py-1 text-sm font-bold shadow-[2px_2px_0_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                                                        >
                                                            재실행
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── Artifacts Tab (R-4) ─── */}
                {tab === 'artifacts' && (
                    <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-black text-black uppercase">산출물 (Artifacts)</h3>
                            <span className="text-xs text-gray-400">
                                작업 완료 시 자동 등록
                            </span>
                        </div>

                        {artifacts.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                                <div className="text-4xl mb-2"><FolderOpen className="w-10 h-10 mx-auto" strokeWidth={2.5} /></div>
                                <p className="text-sm text-gray-400 font-bold">작업 결과물이 여기에 표시됩니다</p>
                                <p className="text-xs text-gray-300 mt-1">Jobs를 실행하면 생성된 파일이 자동으로 등록됩니다</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {Object.entries(
                                    artifacts.reduce((acc, curr) => {
                                        if (!acc[curr.type]) acc[curr.type] = [];
                                        acc[curr.type].push(curr);
                                        return acc;
                                    }, {} as Record<string, typeof artifacts>)
                                ).map(([type, list]) => (
                                    <div key={type}>
                                        <button
                                            onClick={() => setExpandedTypes(prev => ({ ...prev, [type]: !prev[type] }))}
                                            className="flex items-center gap-2 w-full text-left font-black text-sm text-black mb-2 hover:bg-gray-100 p-1 rounded"
                                        >
                                            <span className={`transform transition-transform ${expandedTypes[type] ? 'rotate-90' : ''}`}>▶</span>
                                            {type.toUpperCase()} ({list.length})
                                        </button>

                                        {expandedTypes[type] && (
                                            <div className="pl-4 ml-2 border-l-2 border-dashed border-gray-300 space-y-2">
                                                {list.map((art, i) => (
                                                    <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-black shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-all">
                                                        <div className="w-10 h-10 rounded-lg border-2 border-black bg-gray-100 flex items-center justify-center text-lg font-black">
                                                            {art.type === 'image' ? <Image className="w-5 h-5" strokeWidth={2.5} /> : art.type === 'document' ? <FileText className="w-5 h-5" strokeWidth={2.5} /> : <Package className="w-5 h-5" strokeWidth={2.5} />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-bold text-sm text-black truncate block">{art.name}</span>
                                                            <span className="text-xs text-gray-400 truncate block">{art.path}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => downloadFile(art.path, art.name)}
                                                            className="text-xs font-black px-2 py-1 rounded-md border-2 border-black bg-[#9DE5DC] shadow-[1px_1px_0_0_#000] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                                                        >
                                                            다운로드
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ─── Settings Tab (P2-7 + FE-4: Server Sync) ─── */}
                {tab === 'settings' && (
                    <div className="p-4 space-y-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-black text-black uppercase">실행 설정</h3>
                            {settingsSyncStatus === 'saving' && (
                                <span className="text-xs font-bold text-gray-500 animate-pulse">저장 중...</span>
                            )}
                            {settingsSyncStatus === 'saved' && (
                                <span className="text-xs font-bold text-emerald-600 px-2 py-0.5 bg-emerald-50 border border-emerald-300 rounded-md">Saved</span>
                            )}
                            {settingsSyncStatus === 'error' && (
                                <span className="text-xs font-bold text-red-600 px-2 py-0.5 bg-red-50 border border-red-300 rounded-md">저장 실패</span>
                            )}
                        </div>

                        {/* Max Concurrent Agents */}
                        <div className="space-y-1.5">
                            <label htmlFor="setting-max-agents" className="block text-xs font-black text-black">
                                최대 동시 에이전트
                            </label>
                            <input
                                id="setting-max-agents"
                                type="number"
                                min={1}
                                max={25}
                                value={runSettings.maxConcurrentAgents}
                                onChange={e => updateRunSettings({ maxConcurrentAgents: Number(e.target.value) })}
                                className="w-full text-sm px-3 py-2 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                            />
                        </div>

                        {/* Log Verbosity */}
                        <div className="space-y-1.5">
                            <label htmlFor="setting-log-verbosity" className="block text-xs font-black text-black">
                                로그 상세도
                            </label>
                            <select
                                id="setting-log-verbosity"
                                value={runSettings.logVerbosity}
                                onChange={e => updateRunSettings({ logVerbosity: e.target.value as LogVerbosity })}
                                className="w-full text-sm px-3 py-2 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                            >
                                <option value="debug">Debug</option>
                                <option value="info">Info</option>
                                <option value="warn">Warn</option>
                                <option value="error">Error</option>
                            </select>
                        </div>

                        {/* Log Auto Scroll */}
                        <div className="flex items-center gap-3">
                            <input
                                id="setting-auto-scroll"
                                type="checkbox"
                                checked={runSettings.logAutoScroll}
                                onChange={e => updateRunSettings({ logAutoScroll: e.target.checked })}
                                className="w-5 h-5 rounded border-2 border-black accent-black cursor-pointer"
                            />
                            <label htmlFor="setting-auto-scroll" className="text-xs font-black text-black cursor-pointer">
                                로그 자동 스크롤
                            </label>
                        </div>

                        {/* Run Timeout */}
                        <div className="space-y-1.5">
                            <label htmlFor="setting-timeout" className="block text-xs font-black text-black">
                                실행 타임아웃 (초)
                            </label>
                            <input
                                id="setting-timeout"
                                type="number"
                                min={10}
                                max={3600}
                                value={runSettings.runTimeoutSeconds}
                                onChange={e => updateRunSettings({ runTimeoutSeconds: Number(e.target.value) })}
                                className="w-full text-sm px-3 py-2 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
