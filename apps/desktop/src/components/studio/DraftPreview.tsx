import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ZoneType } from '../../systems/grid-world';
import type { ProjectTheme, AgentDefinition, RecipeDefinition } from '../../types/project';
import { useAppStore } from '../../store/useAppStore';

// ── Types (Unified with ProjectData from project.ts) ──

interface DraftSummary {
    rooms: number;
    collisionTiles: number;
    spawnPoints: number;
    agents: number;
    recipes: number;
    theme: string;
    generatedAt: string;
    method?: 'llm' | 'rule-based';
}

interface DraftFile {
    filename: string;
    path: string;
    type: 'json' | 'image' | 'other';
    size: number;
}

/** Room definition from the server draft world data. */
interface DraftRoom {
    id: string;
    name: string;
    type: string;
    width: number;
    height: number;
    x: number;
    y: number;
}

/** Zone definition from the server draft world data. */
interface DraftZone {
    id: string;
    name: string;
    type: string;
}

/** Theme shape from the server draft (rule-based or LLM). */
interface DraftThemeRaw {
    name?: string;
    primary_color?: string;
    secondary_color?: string;
    background?: string;
    palette?: ProjectTheme['palette'];
}

/** Agent shape from the server draft (may lack full AgentDefinition fields). */
interface DraftAgent {
    id: string;
    name: string;
    role?: string;
    personality?: string;
    sprite?: string;
    skills?: string[];
    systemPrompt?: string;
}

/** Recipe shape from the server draft. */
interface DraftRecipe {
    id: string;
    name: string;
    description?: string;
    command: string;
    args: string[];
    tags?: string[];
}

/** World data from the server draft. */
interface DraftWorld {
    grid_size?: number;
    gridCols?: number;
    gridRows?: number;
    rooms?: DraftRoom[];
    zones?: DraftZone[];
}

/**
 * DA-5: DraftData now uses ProjectData-compatible types.
 * Extended to hold the full draft response including world data.
 */
interface DraftData {
    summary: DraftSummary;
    prompt?: string;
    scope?: string;
    theme?: DraftThemeRaw;
    world?: DraftWorld;
    agents?: DraftAgent[];
    recipes?: DraftRecipe[];
}

// ── Error state type ──

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// ── Theme color extraction helpers ──

function extractThemeColors(theme?: DraftThemeRaw): {
    primary: string;
    secondary: string;
    background: string;
} {
    if (!theme) {
        return { primary: '#FFD100', secondary: '#9DE5DC', background: '#FFF8E7' };
    }
    // Handle both raw server format and ProjectTheme palette format
    const primary = theme.primary_color ?? theme.palette?.primary ?? '#FFD100';
    const secondary = theme.secondary_color ?? theme.palette?.secondary ?? '#9DE5DC';
    const background = theme.background ?? theme.palette?.background ?? '#FFF8E7';
    return { primary, secondary, background };
}

// ── Zone Color Map ──

const ZONE_COLORS: Record<ZoneType, string> = {
    work: '#FBBF24',     // yellow
    meeting: '#34D399',  // green
    rest: '#60A5FA',     // blue
    entrance: '#A78BFA', // purple
    hallway: '#D1D5DB',  // gray
};

const ZONE_LABELS: Record<ZoneType, string> = {
    work: 'Work',
    meeting: 'Meeting',
    rest: 'Rest',
    entrance: 'Entrance',
    hallway: 'Hallway',
};

// ── Room color assignment based on theme ──

function getRoomColor(index: number, themeColors: { primary: string; secondary: string }): string {
    const palette = [
        themeColors.primary,
        themeColors.secondary,
        '#FBBF24',
        '#34D399',
        '#60A5FA',
        '#A78BFA',
        '#F87171',
        '#FB923C',
    ];
    return palette[index % palette.length];
}

// ── Canvas World Renderer (Real Data) ──

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 300;

function renderWorldPreview(
    ctx: CanvasRenderingContext2D,
    summary: DraftSummary,
    draftData: DraftData | null,
): void {
    const themeColors = extractThemeColors(draftData?.theme);
    const rooms = draftData?.world?.rooms ?? [];
    const zones = draftData?.world?.zones ?? [];
    const agents = draftData?.agents ?? [];

    // Determine grid bounds from room data
    let maxX = 40;
    let maxY = 25;

    if (rooms.length > 0) {
        for (const room of rooms) {
            const rx = room.x + room.width;
            const ry = room.y + room.height;
            if (rx > maxX) maxX = rx;
            if (ry > maxY) maxY = ry;
        }
        // Add margin
        maxX = Math.max(maxX + 2, 20);
        maxY = Math.max(maxY + 2, 12);
    }

    const cellW = CANVAS_WIDTH / maxX;
    const cellH = CANVAS_HEIGHT / maxY;

    // ── Background ──
    ctx.fillStyle = themeColors.background;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ── Grid lines (subtle) ──
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= maxX; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= maxY; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(CANVAS_WIDTH, y * cellH);
        ctx.stroke();
    }

    // ── Draw rooms as colored rectangles ──
    if (rooms.length > 0) {
        rooms.forEach((room, idx) => {
            const color = getRoomColor(idx, themeColors);
            const rx = room.x * cellW;
            const ry = room.y * cellH;
            const rw = room.width * cellW;
            const rh = room.height * cellH;

            // Room fill (semi-transparent)
            ctx.fillStyle = color + '35';
            ctx.fillRect(rx, ry, rw, rh);

            // Room border (Neo-Brutalist thick border)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);

            // Inner color accent border
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx + 2, ry + 2, rw - 4, rh - 4);

            // Room name label (centered)
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 9px Pretendard, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const label = room.name || room.id;
            const labelX = rx + rw / 2;
            const labelY = ry + rh / 2;

            // Label background pill
            const textMetrics = ctx.measureText(label);
            const pillW = textMetrics.width + 8;
            const pillH = 14;
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.fillRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(labelX - pillW / 2, labelY - pillH / 2, pillW, pillH);

            ctx.fillStyle = '#000000';
            ctx.fillText(label, labelX, labelY);
        });
    } else {
        // Fallback: no room data -- show placeholder message
        ctx.fillStyle = '#9CA3AF';
        ctx.font = 'bold 12px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No room layout data available', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    }

    // ── Draw zone labels at top ──
    if (zones.length > 0) {
        const zoneBarY = 4;
        ctx.font = 'bold 8px Pretendard, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        zones.forEach((zone, idx) => {
            const zx = 6 + idx * 80;
            const zoneType = zone.type as ZoneType;
            const color = ZONE_COLORS[zoneType] ?? '#D1D5DB';

            // Zone badge
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillRect(zx - 2, zoneBarY - 1, 76, 13);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(zx - 2, zoneBarY - 1, 76, 13);

            // Color dot
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(zx + 4, zoneBarY + 5, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Zone name
            ctx.fillStyle = '#374151';
            ctx.fillText(zone.name, zx + 10, zoneBarY + 1);
        });
    }

    // ── Draw agent spawn points ──
    if (agents.length > 0 && rooms.length > 0) {
        // Distribute agents across rooms for spawn visualization
        agents.forEach((agent, idx) => {
            const room = rooms[idx % rooms.length];
            // Distribute within room bounds with margin
            const margin = 1;
            const slotsPerRow = Math.max(Math.floor((room.width - margin * 2) / 1.5), 1);
            const col = idx % slotsPerRow;
            const row = Math.floor(idx / slotsPerRow) % Math.max(Math.floor((room.height - margin * 2) / 1.5), 1);

            const ax = (room.x + margin + col * 1.5 + 0.5) * cellW;
            const ay = (room.y + margin + row * 1.5 + 0.5) * cellH;

            const dotRadius = Math.min(cellW, cellH) * 0.35;

            // Agent dot with theme-based color
            const agentColor = getRoomColor(idx, themeColors);
            ctx.fillStyle = agentColor;
            ctx.beginPath();
            ctx.arc(ax, ay, dotRadius, 0, Math.PI * 2);
            ctx.fill();

            // Outline
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Agent initial letter inside the dot
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `bold ${Math.max(Math.floor(dotRadius * 1.2), 6)}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(agent.name.charAt(0).toUpperCase(), ax, ay);
        });
    }

    // ── Legend overlay (bottom-right) ──
    const legendEntries: Array<{ color: string; label: string }> = [];
    if (rooms.length > 0) {
        rooms.slice(0, 5).forEach((room, idx) => {
            legendEntries.push({
                color: getRoomColor(idx, themeColors),
                label: room.name || room.id,
            });
        });
        if (rooms.length > 5) {
            legendEntries.push({ color: '#9CA3AF', label: `+${rooms.length - 5} more` });
        }
    }

    if (legendEntries.length > 0) {
        const legendH = legendEntries.length * 13 + 10;
        const legendW = 112;
        const legendX = CANVAS_WIDTH - legendW - 6;
        const legendY = CANVAS_HEIGHT - legendH - 6;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fillRect(legendX - 4, legendY - 4, legendW, legendH);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(legendX - 4, legendY - 4, legendW, legendH);

        ctx.font = 'bold 8px Pretendard, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        legendEntries.forEach((item, i) => {
            const ly = legendY + 6 + i * 13;
            ctx.fillStyle = item.color;
            ctx.fillRect(legendX + 2, ly - 4, 10, 10);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(legendX + 2, ly - 4, 10, 10);
            ctx.fillStyle = '#374151';
            ctx.fillText(item.label, legendX + 16, ly + 1);
        });
    }

    // ── Stats overlay (top-left, below zones) ──
    const agentCount = agents.length || summary.agents;
    const statsText = `${rooms.length || summary.rooms} rooms | ${agentCount} agents | ${summary.spawnPoints} spawns`;
    ctx.font = 'bold 9px Pretendard, sans-serif';
    const statsWidth = ctx.measureText(statsText).width + 12;
    const statsY = zones.length > 0 ? 20 : 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(4, statsY, statsWidth, 18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, statsY, statsWidth, 18);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(statsText, 10, statsY + 10);
}

// ── Skeleton Loader ──

const SkeletonPulse: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
);

const DraftSkeleton: React.FC = () => (
    <div className="flex-1 overflow-y-auto">
        {/* Stat card skeletons */}
        <div className="p-4 grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="p-3 rounded-lg border-2 border-gray-200 bg-white text-center"
                >
                    <SkeletonPulse className="w-3 h-3 rounded-full mx-auto mb-2" />
                    <SkeletonPulse className="h-6 w-12 mx-auto mb-1" />
                    <SkeletonPulse className="h-3 w-10 mx-auto" />
                </div>
            ))}
        </div>
        {/* Canvas skeleton */}
        <div className="px-4 mb-3">
            <SkeletonPulse className="h-4 w-28 mb-2" />
            <SkeletonPulse className="h-[300px] w-full rounded-lg border-2 border-gray-200" />
        </div>
        {/* List skeletons */}
        <div className="px-4 mb-3">
            <SkeletonPulse className="h-4 w-20 mb-2" />
            <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonPulse key={i} className="h-6 w-16 rounded" />
                ))}
            </div>
        </div>
    </div>
);

// ── Refine Modal ──

interface RefineModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (text: string) => void;
    loading: boolean;
}

const RefineModal: React.FC<RefineModalProps> = ({ open, onClose, onSubmit, loading }) => {
    const [text, setText] = useState('');

    const handleSubmit = () => {
        if (!text.trim()) return;
        onSubmit(text.trim());
        setText('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md bg-white border-2 border-black rounded-xl shadow-[4px_4px_0_0_#000] p-5">
                <h3 className="font-black text-base text-black mb-3">Refine Draft</h3>
                <p className="text-xs text-gray-500 mb-3">
                    수정 사항을 자연어로 입력하세요. 기존 프롬프트에 추가되어 재생성됩니다.
                </p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="예: 회의실을 1개 더 추가하고, 휴게실을 넓혀줘"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border-2 border-black rounded-lg bg-white font-medium resize-none focus:outline-none focus:ring-2 focus:ring-[#FFD100] mb-4"
                    autoFocus
                />
                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-xs font-black border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !text.trim()}
                        className="px-4 py-2 text-xs font-black text-white border-2 border-black rounded-lg bg-[#A78BFA] shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                    >
                        {loading ? 'Refining...' : 'Refine & Regenerate'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Color Swatch ──

const ColorSwatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <div className="flex items-center gap-1.5">
        <div
            className="w-4 h-4 rounded border-2 border-black shrink-0"
            style={{ backgroundColor: color }}
        />
        <span className="text-[10px] font-bold text-gray-600 truncate">{label}</span>
        <code className="text-[9px] font-mono text-gray-400 uppercase">{color}</code>
    </div>
);

// ── Method Badge ──

const MethodBadge: React.FC<{ method?: string }> = ({ method }) => {
    if (!method) return null;

    const isLLM = method === 'llm';
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black rounded border-2 border-black shadow-[1px_1px_0_0_#000] ${
                isLLM
                    ? 'bg-[#A78BFA]/20 text-[#7C3AED]'
                    : 'bg-[#FBBF24]/20 text-[#92400E]'
            }`}
        >
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{
                backgroundColor: isLLM ? '#7C3AED' : '#92400E',
            }} />
            {isLLM ? 'Claude AI' : 'Rule-based'}
        </span>
    );
};

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

// ── Stat Card Sub-component ──

const StatCard: React.FC<{
    label: string;
    value: number | string;
    color: string;
    isText?: boolean;
}> = ({ label, value, color, isText }) => (
    <div className="p-3 rounded-lg border-2 border-black bg-white shadow-[1px_1px_0_0_#000] text-center">
        <div
            className="w-3 h-3 rounded-full mx-auto mb-1 border border-black"
            style={{ backgroundColor: color }}
        />
        <div className={`font-black ${isText ? 'text-xs' : 'text-xl'} text-black leading-tight`}>
            {value}
        </div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
            {label}
        </div>
    </div>
);
