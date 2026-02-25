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
}

interface DraftFile {
    filename: string;
    path: string;
    type: 'json' | 'image' | 'other';
    size: number;
}

/**
 * DA-5: DraftData now uses ProjectData-compatible types.
 * - theme: ProjectTheme (from project.ts)
 * - agents: AgentDefinition[] (from project.ts)
 * - recipes: RecipeDefinition[] (from project.ts)
 */
interface DraftData {
    summary: DraftSummary;
    prompt?: string;
    scope?: string;
    theme?: ProjectTheme;
    agents?: AgentDefinition[];
    recipes?: RecipeDefinition[];
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

// ── Procedural Layout Generator ──

interface RoomRect {
    x: number;
    y: number;
    w: number;
    h: number;
    zone: ZoneType;
}

interface SpawnDot {
    x: number;
    y: number;
    zone: ZoneType;
}

function generateProceduralLayout(summary: DraftSummary): {
    rooms: RoomRect[];
    walls: Array<{ x: number; y: number; w: number; h: number }>;
    spawns: SpawnDot[];
    gridCols: number;
    gridRows: number;
} {
    const gridCols = 40;
    const gridRows = 25;
    const zoneOrder: ZoneType[] = ['work', 'meeting', 'rest', 'entrance'];
    const rooms: RoomRect[] = [];
    const walls: Array<{ x: number; y: number; w: number; h: number }> = [];
    const spawns: SpawnDot[] = [];

    const roomCount = Math.max(summary.rooms, 2);

    // Divide grid into quadrants, place rooms proportionally
    const quadrants: Array<{ x: number; y: number; w: number; h: number; zone: ZoneType }> = [
        { x: 1, y: 1, w: 18, h: 11, zone: 'work' },
        { x: 20, y: 1, w: 19, h: 11, zone: 'meeting' },
        { x: 1, y: 17, w: 18, h: 7, zone: 'rest' },
        { x: 20, y: 17, w: 19, h: 7, zone: 'entrance' },
    ];

    // Hallway strip
    rooms.push({ x: 1, y: 13, w: 38, h: 3, zone: 'hallway' });

    // Build rooms from quadrants, distributing extras
    for (let i = 0; i < Math.min(roomCount, quadrants.length); i++) {
        const q = quadrants[i % quadrants.length];
        rooms.push({
            x: q.x,
            y: q.y,
            w: q.w,
            h: q.h,
            zone: q.zone,
        });
    }

    // Extra rooms subdivide existing quadrants
    if (roomCount > 4) {
        const extraCount = roomCount - 4;
        for (let i = 0; i < extraCount; i++) {
            const base = quadrants[i % quadrants.length];
            const halfW = Math.floor(base.w / 2) - 1;
            rooms.push({
                x: base.x + halfW + 2,
                y: base.y + 1,
                w: halfW,
                h: base.h - 2,
                zone: zoneOrder[(4 + i) % zoneOrder.length],
            });
        }
    }

    // Outer walls
    walls.push({ x: 0, y: 0, w: gridCols, h: 1 });           // top
    walls.push({ x: 0, y: gridRows - 1, w: gridCols, h: 1 }); // bottom
    walls.push({ x: 0, y: 0, w: 1, h: gridRows });             // left
    walls.push({ x: gridCols - 1, y: 0, w: 1, h: gridRows });  // right

    // Room divider walls
    walls.push({ x: 19, y: 1, w: 1, h: 11 });   // vertical mid top
    walls.push({ x: 1, y: 12, w: 38, h: 1 });    // horizontal mid top
    walls.push({ x: 1, y: 16, w: 38, h: 1 });    // horizontal mid bottom
    walls.push({ x: 19, y: 17, w: 1, h: 7 });    // vertical mid bottom

    // Distribute spawn points across rooms (excluding hallway)
    const spawnableRooms = rooms.filter(r => r.zone !== 'hallway');
    const spawnCount = summary.spawnPoints || summary.agents || 0;

    for (let i = 0; i < spawnCount; i++) {
        const room = spawnableRooms[i % spawnableRooms.length];
        const margin = 2;
        const sx = room.x + margin + ((i * 3) % Math.max(room.w - margin * 2, 1));
        const sy = room.y + margin + (Math.floor((i * 2) / Math.max(room.w - margin * 2, 1)) % Math.max(room.h - margin * 2, 1));
        spawns.push({ x: sx, y: sy, zone: room.zone });
    }

    return { rooms, walls, spawns, gridCols, gridRows };
}

// ── Canvas World Renderer ──

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 300;

function renderWorldPreview(
    ctx: CanvasRenderingContext2D,
    summary: DraftSummary,
    draftData: DraftData | null,
): void {
    const { rooms, walls, spawns, gridCols, gridRows } = generateProceduralLayout(summary);
    const cellW = CANVAS_WIDTH / gridCols;
    const cellH = CANVAS_HEIGHT / gridRows;

    // Background (use theme background if available)
    ctx.fillStyle = draftData?.theme?.palette?.background || '#F9FAFB';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid lines (subtle)
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= gridCols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * cellW, 0);
        ctx.lineTo(x * cellW, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= gridRows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * cellH);
        ctx.lineTo(CANVAS_WIDTH, y * cellH);
        ctx.stroke();
    }

    // Zone fills
    for (const room of rooms) {
        const color = ZONE_COLORS[room.zone] || '#E5E7EB';
        ctx.fillStyle = color + '40'; // 25% opacity
        ctx.fillRect(room.x * cellW, room.y * cellH, room.w * cellW, room.h * cellH);

        // Zone border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(room.x * cellW, room.y * cellH, room.w * cellW, room.h * cellH);

        // Zone label
        ctx.fillStyle = '#374151';
        ctx.font = 'bold 9px Pretendard, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = ZONE_LABELS[room.zone] || room.zone;
        ctx.fillText(
            label,
            (room.x + room.w / 2) * cellW,
            (room.y + room.h / 2) * cellH,
        );
    }

    // Walls (collision areas)
    ctx.fillStyle = '#1F2937';
    for (const wall of walls) {
        ctx.fillRect(wall.x * cellW, wall.y * cellH, wall.w * cellW, wall.h * cellH);
    }

    // Door gaps (holes in walls)
    ctx.fillStyle = '#FDE68A'; // warm yellow for doors
    const doorPositions = [
        { x: 8, y: 12, w: 2, h: 1 },   // work -> hallway
        { x: 28, y: 12, w: 2, h: 1 },  // meeting -> hallway
        { x: 8, y: 16, w: 2, h: 1 },   // hallway -> rest
        { x: 28, y: 16, w: 2, h: 1 },  // hallway -> entrance
        { x: 19, y: 5, w: 1, h: 2 },   // work <-> meeting
        { x: 19, y: 19, w: 1, h: 2 },  // rest <-> entrance
    ];
    for (const door of doorPositions) {
        ctx.fillRect(door.x * cellW, door.y * cellH, door.w * cellW, door.h * cellH);
    }

    // Spawn points
    for (const sp of spawns) {
        const zoneColor = ZONE_COLORS[sp.zone] || '#6B7280';
        ctx.fillStyle = zoneColor;
        ctx.beginPath();
        ctx.arc(
            sp.x * cellW + cellW / 2,
            sp.y * cellH + cellH / 2,
            Math.min(cellW, cellH) * 0.4,
            0,
            Math.PI * 2,
        );
        ctx.fill();

        // Outline
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Legend overlay (bottom-right)
    const legendX = CANVAS_WIDTH - 110;
    const legendY = CANVAS_HEIGHT - 72;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(legendX - 4, legendY - 4, 112, 74);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(legendX - 4, legendY - 4, 112, 74);

    const legendItems: Array<{ color: string; label: string }> = [
        { color: ZONE_COLORS.work, label: 'Work' },
        { color: ZONE_COLORS.meeting, label: 'Meeting' },
        { color: ZONE_COLORS.rest, label: 'Rest' },
        { color: ZONE_COLORS.entrance, label: 'Entrance' },
        { color: '#1F2937', label: 'Wall' },
    ];

    ctx.font = 'bold 8px Pretendard, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    legendItems.forEach((item, i) => {
        const ly = legendY + 6 + i * 13;
        ctx.fillStyle = item.color;
        ctx.fillRect(legendX + 2, ly - 4, 10, 10);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX + 2, ly - 4, 10, 10);
        ctx.fillStyle = '#374151';
        ctx.fillText(item.label, legendX + 16, ly + 1);
    });

    // Stats overlay (top-left)
    const statsText = `${summary.rooms} rooms | ${summary.collisionTiles} walls | ${spawns.length} spawns`;
    ctx.font = 'bold 9px Pretendard, sans-serif';
    const statsWidth = ctx.measureText(statsText).width + 12;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillRect(4, 4, statsWidth, 18);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, 4, statsWidth, 18);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(statsText, 10, 14);
}

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

// ── Main Component ──

export const DraftPreview: React.FC = () => {
    const apiUrl = useAppStore((s) => s.appSettings.apiUrl);
    const [draftData, setDraftData] = useState<DraftData | null>(null);
    const [draft, setDraft] = useState<DraftSummary | null>(null);
    const [files, setFiles] = useState<DraftFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [refining, setRefining] = useState(false);
    const [refineOpen, setRefineOpen] = useState(false);
    const [message, setMessage] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const fetchDraft = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${apiUrl}/api/studio/draft`);
            const data = await res.json();
            if (data.summary) {
                setDraft(data.summary as DraftSummary);
            }
            if (data.files) {
                setFiles(data.files as DraftFile[]);
            }
            // Use the full response as DraftData for canvas rendering
            setDraftData(data as DraftData);
        } catch {
            setMessage('Draft loading failed. Check server connection.');
        }
        setLoading(false);
    }, []);

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

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#FFD100]">
                <h2 className="font-black text-lg text-black">Draft Preview</h2>
                <p className="text-xs text-gray-700 mt-1">
                    Review the AI-generated draft and apply to your project
                </p>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 font-bold animate-pulse">
                    Loading draft...
                </div>
            ) : !draft ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-4 p-8">
                    <div className="text-4xl">
                        <span role="img" aria-label="empty">
                            {''}
                        </span>
                    </div>
                    <p className="font-bold text-sm text-center">
                        No draft generated yet.
                        <br />
                        Use AI Builder to generate one.
                    </p>
                    <button
                        onClick={fetchDraft}
                        className="text-xs font-black px-4 py-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-all"
                    >
                        Refresh
                    </button>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto">
                    {/* Summary Cards */}
                    <div className="p-4 grid grid-cols-3 gap-3">
                        <StatCard label="Rooms" value={draft.rooms} color="#FBBF24" />
                        <StatCard label="Collision" value={draft.collisionTiles} color="#EF4444" />
                        <StatCard label="Spawns" value={draft.spawnPoints} color="#A78BFA" />
                        <StatCard label="Agents" value={draftData?.agents?.length ?? draft.agents} color="#34D399" />
                        <StatCard label="Recipes" value={draftData?.recipes?.length ?? draft.recipes} color="#60A5FA" />
                        <StatCard label="Theme" value={draft.theme} color="#E8DAFF" isText />
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

                    {/* Agent List (compact) */}
                    {draftData?.agents && draftData.agents.length > 0 && (
                        <div className="px-4 mb-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Agents ({draftData.agents.length})
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {draftData.agents.slice(0, 30).map(agent => (
                                    <span
                                        key={agent.id}
                                        className="text-[10px] font-bold px-2 py-1 rounded border-2 border-black bg-[#34D399]/20 shadow-[1px_1px_0_0_#000]"
                                    >
                                        {agent.name}
                                    </span>
                                ))}
                                {draftData.agents.length > 30 && (
                                    <span className="text-[10px] font-bold px-2 py-1 text-gray-400">
                                        +{draftData.agents.length - 30} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Recipe List (compact) */}
                    {draftData?.recipes && draftData.recipes.length > 0 && (
                        <div className="px-4 mb-3">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                                Recipes ({draftData.recipes.length})
                            </h3>
                            <div className="space-y-1.5">
                                {draftData.recipes.map(recipe => (
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
                    {message && (
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
