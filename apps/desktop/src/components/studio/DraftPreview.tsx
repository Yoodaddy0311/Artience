import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { DraftSummary, DraftFile, DraftData, FetchState } from './draft-types';
import { extractThemeColors, getRoomColor, CANVAS_WIDTH, CANVAS_HEIGHT, renderWorldPreview } from './draft-canvas';
import { DraftSkeleton, RefineModal, ColorSwatch, MethodBadge, StatCard } from './DraftSkeleton';

// ── Main Component ──

export const DraftPreview: React.FC = () => {
    const apiUrl = useAppStore((s) => s.appSettings.apiUrl);
    const [draftData, setDraftData] = useState<DraftData | null>(null);
    const [draft, setDraft] = useState<DraftSummary | null>(null);
    const [files, setFiles] = useState<DraftFile[]>([]);
    const [fetchState, setFetchState] = useState<FetchState>('idle');
    const [applying, setApplying] = useState(false);
    const [refining, setRefining] = useState(false);
    const [refineOpen, setRefineOpen] = useState(false);
    const [message, setMessage] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const loading = fetchState === 'loading';

    const fetchDraft = useCallback(async () => {
        setFetchState('loading');
        setMessage('');
        try {
            // Fetch summary + files from the API
            const res = await fetch(`${apiUrl}/api/studio/draft`);
            const data = await res.json();

            if (data.summary) {
                setDraft(data.summary as DraftSummary);
            } else {
                setDraft(null);
            }
            if (data.files) {
                setFiles(data.files as DraftFile[]);
            }

            // Fetch the full draft.json for canvas rendering (theme, world, agents, recipes)
            try {
                const fullRes = await fetch('/generated/draft.json');
                if (fullRes.ok) {
                    const fullDraft = await fullRes.json();
                    setDraftData(fullDraft as DraftData);
                } else {
                    // Fall back to the summary-only data
                    setDraftData(data as DraftData);
                }
            } catch {
                setDraftData(data as DraftData);
            }

            setFetchState('success');
        } catch {
            setMessage('Draft loading failed. Check server connection.');
            setFetchState('error');
        }
    }, [apiUrl]);

    useEffect(() => {
        fetchDraft();
    }, [fetchDraft]);

    // Canvas rendering
    useEffect(() => {
        if (!draft || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set actual pixel dimensions for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        ctx.scale(dpr, dpr);

        renderWorldPreview(ctx, draft, draftData);
    }, [draft, draftData]);

    const applyDraft = async () => {
        setApplying(true);
        setMessage('');
        try {
            const res = await fetch(`${apiUrl}/api/studio/draft/apply`, {
                method: 'POST',
            });
            const data = await res.json();
            setMessage(data.message || 'Applied to project.json successfully.');
            await fetchDraft();
        } catch {
            setMessage('Apply failed. Check server connection.');
        }
        setApplying(false);
    };

    const regenerate = async () => {
        setMessage('Regenerating with same prompt...');
        try {
            await fetch(`${apiUrl}/api/studio/draft/regenerate`, {
                method: 'POST',
            });
            setMessage('');
            await fetchDraft();
        } catch {
            setMessage('Regeneration failed.');
        }
    };

    const handleRefine = async (refinementText: string) => {
        setRefining(true);
        setMessage('Refining draft...');
        try {
            const originalPrompt = draftData?.prompt || '';
            const combinedPrompt = `${originalPrompt}\n\n[Refinement]: ${refinementText}`;

            const res = await fetch(`${apiUrl}/api/studio/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: combinedPrompt,
                    scope: draftData?.scope || 'all',
                }),
            });

            if (!res.ok) {
                throw new Error(`Server responded with ${res.status}`);
            }

            setRefineOpen(false);
            setMessage('');
            await fetchDraft();
        } catch {
            setMessage('Refinement failed. Check server connection.');
        }
        setRefining(false);
    };

    // Extract theme colors for display
    const themeColors = extractThemeColors(draftData?.theme);
    const themeName = draftData?.theme?.name ?? draft?.theme ?? 'Default';
    const rooms = draftData?.world?.rooms ?? [];
    const agents = draftData?.agents ?? [];
    const recipes = draftData?.recipes ?? [];

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#FFD100]">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-black text-lg text-black">Draft Preview</h2>
                        <p className="text-xs text-gray-700 mt-1">
                            Review the AI-generated draft and apply to your project
                        </p>
                    </div>
                    {draft?.method && <MethodBadge method={draft.method} />}
                </div>
            </div>

            {/* Loading state: skeleton */}
            {loading && <DraftSkeleton />}

            {/* Error state */}
            {fetchState === 'error' && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4 p-8">
                    <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-black flex items-center justify-center shadow-[2px_2px_0_0_#000]">
                        <span className="text-2xl font-black text-red-400">!</span>
                    </div>
                    <p className="font-bold text-sm text-center text-red-600">
                        {message || 'Failed to load draft data.'}
                    </p>
                    <button
                        onClick={fetchDraft}
                        className="text-xs font-black px-4 py-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Empty state */}
            {fetchState === 'success' && !draft && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4 p-8">
                    <div className="w-16 h-16 rounded-full bg-gray-50 border-2 border-black flex items-center justify-center shadow-[2px_2px_0_0_#000]">
                        <span className="text-2xl font-black text-gray-300">?</span>
                    </div>
                    <p className="font-bold text-sm text-center">
                        No draft generated yet.
                        <br />
                        Use AI Builder to generate one.
                    </p>
                    <button
                        onClick={fetchDraft}
                        className="text-xs font-black px-4 py-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        Refresh
                    </button>
                </div>
            )}

            {/* Success state with data */}
            {fetchState === 'success' && draft && !loading && (
                <div className="flex-1 overflow-y-auto">
                    {/* Theme Section */}
                    <div className="px-4 pt-4 pb-2">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                            Theme
                        </h3>
                        <div className="p-3 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000]">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-black text-sm text-black">{themeName}</span>
                                {draft.method && <MethodBadge method={draft.method} />}
                            </div>
                            <div className="flex flex-wrap gap-3">
                                <ColorSwatch color={themeColors.primary} label="Primary" />
                                <ColorSwatch color={themeColors.secondary} label="Secondary" />
                                <ColorSwatch color={themeColors.background} label="Background" />
                            </div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="p-4 grid grid-cols-3 gap-3">
                        <StatCard
                            label="Rooms"
                            value={rooms.length || draft.rooms}
                            color={themeColors.primary}
                        />
                        <StatCard
                            label="Collision"
                            value={draft.collisionTiles}
                            color="#EF4444"
                        />
                        <StatCard
                            label="Spawns"
                            value={draft.spawnPoints}
                            color="#A78BFA"
                        />
                        <StatCard
                            label="Agents"
                            value={agents.length || draft.agents}
                            color="#34D399"
                        />
                        <StatCard
                            label="Recipes"
                            value={recipes.length || draft.recipes}
                            color="#60A5FA"
                        />
                        <StatCard
                            label="Theme"
                            value={themeName}
                            color={themeColors.primary}
                            isText
                        />
                    </div>

                    {/* Canvas World Preview */}
                    <div className="px-4 mb-3">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                            World Preview
                        </h3>
                        <div className="border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] overflow-hidden bg-gray-50">
                            <canvas
                                ref={canvasRef}
                                style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Room List (compact) */}
                    {rooms.length > 0 && (
                        <div className="px-4 mb-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Rooms ({rooms.length})
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {rooms.map((room, idx) => (
                                    <span
                                        key={room.id}
                                        className="text-[10px] font-bold px-2 py-1 rounded border-2 border-black bg-white shadow-[1px_1px_0_0_#000] flex items-center gap-1"
                                    >
                                        <span
                                            className="inline-block w-2 h-2 rounded-sm border border-black shrink-0"
                                            style={{ backgroundColor: getRoomColor(idx, themeColors) }}
                                        />
                                        {room.name || room.id}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Agent List (compact, with roles) */}
                    {agents.length > 0 && (
                        <div className="px-4 mb-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Agents ({agents.length})
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {agents.slice(0, 30).map(agent => (
                                    <span
                                        key={agent.id}
                                        className="text-[10px] font-bold px-2 py-1 rounded border-2 border-black bg-[#34D399]/20 shadow-[1px_1px_0_0_#000]"
                                        title={agent.role ? `Role: ${agent.role}` : undefined}
                                    >
                                        {agent.name}
                                        {agent.role && agent.role !== 'General' && (
                                            <span className="text-gray-400 ml-1">({agent.role})</span>
                                        )}
                                    </span>
                                ))}
                                {agents.length > 30 && (
                                    <span className="text-[10px] font-bold px-2 py-1 text-gray-400">
                                        +{agents.length - 30} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recipe List (sidebar-style list) */}
                    {recipes.length > 0 && (
                        <div className="px-4 mb-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Recipes ({recipes.length})
                            </h3>
                            <div className="space-y-1.5">
                                {recipes.map(recipe => (
                                    <div
                                        key={recipe.id}
                                        className="flex items-center gap-2 p-2 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000]"
                                    >
                                        <span className="text-xs font-black text-[#60A5FA]">
                                            {recipe.id}
                                        </span>
                                        <span className="text-xs font-bold flex-1">
                                            {recipe.name}
                                        </span>
                                        <code className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                            {recipe.command} {recipe.args.join(' ')}
                                        </code>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="px-4 pb-4 space-y-2">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider">
                                Generated Files
                            </h3>
                            {files.map((f, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 p-2 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000]"
                                >
                                    <span className="text-xs font-bold text-gray-400 w-5 text-center">
                                        {f.type === 'json' ? 'J' : f.type === 'image' ? 'I' : 'F'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold truncate">{f.filename}</p>
                                        <p className="text-[10px] text-gray-400">
                                            {(f.size / 1024).toFixed(1)}KB
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Action Buttons (fixed bottom) */}
            {draft && !loading && (
                <div className="p-4 border-t-2 border-black bg-gray-50 space-y-3">
                    {message && fetchState !== 'error' && (
                        <p
                            className={`text-xs font-bold text-center ${
                                message.toLowerCase().includes('fail') ? 'text-red-500' : 'text-green-600'
                            }`}
                        >
                            {message}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={applyDraft}
                            disabled={applying}
                            className="flex-1 py-2.5 bg-[#22C55E] text-white font-black text-sm border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                        >
                            {applying ? 'Applying...' : 'Apply'}
                        </button>
                        <button
                            onClick={regenerate}
                            className="flex-1 py-2.5 bg-[#60A5FA] text-white font-black text-sm border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            Regenerate
                        </button>
                        <button
                            onClick={() => setRefineOpen(true)}
                            className="flex-1 py-2.5 bg-[#A78BFA] text-white font-black text-sm border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                        >
                            Refine
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-400 text-center">
                        Generated: {draft.generatedAt}
                    </p>
                </div>
            )}

            {/* Refine Modal */}
            <RefineModal
                open={refineOpen}
                onClose={() => setRefineOpen(false)}
                onSubmit={handleRefine}
                loading={refining}
            />
        </div>
    );
};
