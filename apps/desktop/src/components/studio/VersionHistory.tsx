import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Home, Blocks, MapPin, Users, ClipboardList, Palette, Clock, RefreshCw, MailOpen, Plus, Minus, PenLine } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog';

// ── Types ──

interface SnapshotSummary {
    rooms: number;
    collisionTiles: number;
    spawnPoints: number;
    agents: number;
    recipes: number;
    theme: string;
}

interface Snapshot {
    id: string;
    createdAt: string;
    label: string;
    size: number;
    summary?: SnapshotSummary;
}

interface DiffItem {
    label: string;
    icon: React.ReactNode;
    oldVal: number | string;
    newVal: number | string;
    delta: number;
    type: 'increase' | 'decrease' | 'unchanged' | 'changed';
}

// ── Diff Logic ──

function computeDiff(older: SnapshotSummary, newer: SnapshotSummary): DiffItem[] {
    const items: DiffItem[] = [];

    const numericFields: Array<{ key: keyof SnapshotSummary; label: string; icon: React.ReactNode }> = [
        { key: 'rooms', label: '방 개수', icon: <Home className="w-4 h-4" strokeWidth={2.5} /> },
        { key: 'collisionTiles', label: '충돌 타일', icon: <Blocks className="w-4 h-4" strokeWidth={2.5} /> },
        { key: 'spawnPoints', label: '스폰 포인트', icon: <MapPin className="w-4 h-4" strokeWidth={2.5} /> },
        { key: 'agents', label: '에이전트', icon: <Users className="w-4 h-4" strokeWidth={2.5} /> },
        { key: 'recipes', label: '레시피', icon: <ClipboardList className="w-4 h-4" strokeWidth={2.5} /> },
    ];

    for (const field of numericFields) {
        const oldVal = (older[field.key] as number) ?? 0;
        const newVal = (newer[field.key] as number) ?? 0;
        const delta = newVal - oldVal;
        let type: DiffItem['type'] = 'unchanged';
        if (delta > 0) type = 'increase';
        else if (delta < 0) type = 'decrease';

        items.push({
            label: field.label,
            icon: field.icon,
            oldVal,
            newVal,
            delta,
            type,
        });
    }

    // Theme comparison (string)
    const oldTheme = older.theme ?? '';
    const newTheme = newer.theme ?? '';
    items.push({
        label: '테마',
        icon: <Palette className="w-4 h-4" strokeWidth={2.5} />,
        oldVal: oldTheme,
        newVal: newTheme,
        delta: 0,
        type: oldTheme === newTheme ? 'unchanged' : 'changed',
    });

    return items;
}

// ── Sub-components ──

const DiffRow: React.FC<{ item: DiffItem }> = ({ item }) => {
    const colorMap: Record<DiffItem['type'], { bg: string; text: string; border: string }> = {
        increase: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
        decrease: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
        unchanged: { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' },
        changed: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
    };

    const style = colorMap[item.type];

    const deltaLabel = (): string => {
        if (item.type === 'unchanged') return '=';
        if (item.type === 'changed') return '~';
        const sign = item.delta > 0 ? '+' : '';
        return `${sign}${item.delta}`;
    };

    return (
        <div className={`flex items-center gap-2 p-2.5 rounded-lg border-2 border-black ${style.bg} shadow-[1px_1px_0_0_#000]`}>
            <span className="text-base flex-shrink-0 flex items-center">{item.icon}</span>
            <span className="text-xs font-black text-black flex-shrink-0 w-20">{item.label}</span>
            <div className="flex-1 flex items-center justify-center gap-1.5">
                <span className={`text-xs font-bold ${item.type === 'unchanged' ? 'text-gray-400' : 'text-gray-600'}`}>
                    {item.oldVal}
                </span>
                <span className="text-xs font-black text-black">&rarr;</span>
                <span className={`text-xs font-bold ${style.text}`}>
                    {item.newVal}
                </span>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded border-2 border-black ${style.bg} ${style.text} flex-shrink-0`}>
                {deltaLabel()}
            </span>
        </div>
    );
};

// ── JSON Diff types & component ──

interface JsonDiffChange {
    path: string;
    type: 'added' | 'removed' | 'modified';
    oldValue?: string;
    newValue?: string;
}

const CHANGE_STYLES: Record<JsonDiffChange['type'], { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    added: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: <Plus className="w-3 h-3" strokeWidth={3} />, label: '추가' },
    removed: { bg: 'bg-red-50', text: 'text-red-700', icon: <Minus className="w-3 h-3" strokeWidth={3} />, label: '삭제' },
    modified: { bg: 'bg-amber-50', text: 'text-amber-700', icon: <PenLine className="w-3 h-3" strokeWidth={2.5} />, label: '수정' },
};

const JsonDiffRow: React.FC<{ change: JsonDiffChange }> = ({ change }) => {
    const style = CHANGE_STYLES[change.type];
    return (
        <div className={`flex items-start gap-2 p-2 rounded-lg border-2 border-black ${style.bg} shadow-[1px_1px_0_0_#000]`}>
            <span className={`flex-shrink-0 mt-0.5 ${style.text}`}>{style.icon}</span>
            <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono font-bold text-black break-all">{change.path}</span>
                <div className="flex flex-wrap gap-1 mt-1">
                    {change.type === 'removed' && change.oldValue !== undefined && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-red-100 text-red-600 rounded border border-red-300 break-all">
                            {change.oldValue}
                        </span>
                    )}
                    {change.type === 'added' && change.newValue !== undefined && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded border border-emerald-300 break-all">
                            {change.newValue}
                        </span>
                    )}
                    {change.type === 'modified' && (
                        <>
                            {change.oldValue !== undefined && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 bg-red-100 text-red-600 rounded border border-red-300 line-through break-all">
                                    {change.oldValue}
                                </span>
                            )}
                            <span className="text-[9px] font-black text-black self-center">&rarr;</span>
                            {change.newValue !== undefined && (
                                <span className="text-[9px] font-mono px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded border border-emerald-300 break-all">
                                    {change.newValue}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border border-black ${style.bg} ${style.text} flex-shrink-0`}>
                {style.label}
            </span>
        </div>
    );
};

const JsonDiffSection: React.FC<{ oldId: string; newId: string }> = ({ oldId, newId }) => {
    const [changes, setChanges] = useState<JsonDiffChange[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'added' | 'removed' | 'modified'>('all');

    useEffect(() => {
        let cancelled = false;
        const fetchDiff = async () => {
            setLoading(true);
            setError(null);
            const studioApi = window.dogbaApi?.studio;
            if (!studioApi) {
                if (!cancelled) setError('Studio API not available.');
                if (!cancelled) setLoading(false);
                return;
            }
            try {
                const result = await studioApi.getDiff(oldId, newId);
                if (!result.success) throw new Error(result.diff || 'Diff failed');
                // Parse diff result as changes array
                if (!cancelled) {
                    try {
                        const parsed = JSON.parse(result.diff || '[]');
                        setChanges(parsed.changes || parsed || []);
                    } catch {
                        setChanges([]);
                    }
                }
            } catch {
                if (!cancelled) setError('JSON diff를 불러올 수 없습니다.');
            }
            if (!cancelled) setLoading(false);
        };
        fetchDiff();
        return () => { cancelled = true; };
    }, [oldId, newId]);

    const filtered = filterType === 'all' ? changes : changes.filter(c => c.type === filterType);
    const addedCount = changes.filter(c => c.type === 'added').length;
    const removedCount = changes.filter(c => c.type === 'removed').length;
    const modifiedCount = changes.filter(c => c.type === 'modified').length;

    if (loading) {
        return <div className="text-center py-4 text-gray-400 text-xs font-bold animate-pulse">JSON diff 로딩 중...</div>;
    }
    if (error) {
        return <div className="text-center py-4 text-red-400 text-xs font-bold">{error}</div>;
    }
    if (changes.length === 0) {
        return <div className="text-center py-4 text-gray-400 text-xs font-bold">JSON 내용이 동일합니다.</div>;
    }

    return (
        <div className="space-y-2">
            {/* Filter bar */}
            <div className="flex gap-1.5 flex-wrap">
                {([
                    ['all', `전체 (${changes.length})`],
                    ['added', `추가 (${addedCount})`],
                    ['removed', `삭제 (${removedCount})`],
                    ['modified', `수정 (${modifiedCount})`],
                ] as [typeof filterType, string][]).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setFilterType(key)}
                        className={`text-[9px] font-black px-2 py-1 rounded border-2 border-black transition-all shadow-[1px_1px_0_0_#000] ${
                            filterType === key ? 'bg-[#C4B5FD] text-black' : 'bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {/* Change list */}
            {filtered.map((change, idx) => (
                <JsonDiffRow key={idx} change={change} />
            ))}
        </div>
    );
};


const DiffPanel: React.FC<{
    olderSnap: Snapshot;
    newerSnap: Snapshot;
    onClose: () => void;
    formatDate: (iso: string) => string;
}> = ({ olderSnap, newerSnap, onClose, formatDate }) => {
    const [activeTab, setActiveTab] = useState<'summary' | 'json'>('summary');

    const diffItems = useMemo(() => {
        if (!olderSnap.summary || !newerSnap.summary) return [];
        return computeDiff(olderSnap.summary, newerSnap.summary);
    }, [olderSnap, newerSnap]);

    const changedCount = diffItems.filter(d => d.type !== 'unchanged').length;
    const increaseCount = diffItems.filter(d => d.type === 'increase').length;
    const decreaseCount = diffItems.filter(d => d.type === 'decrease').length;

    const hasSummaries = !!olderSnap.summary && !!newerSnap.summary;

    return (
        <div className="flex flex-col h-full">
            {/* Diff Header */}
            <div className="p-3 border-b-2 border-black bg-[#C4B5FD]">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-black text-sm text-black">Diff 비교 결과</h3>
                    <button
                        onClick={onClose}
                        className="text-[10px] font-black px-2.5 py-1 bg-white border-2 border-black rounded shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] transition-all"
                    >
                        닫기
                    </button>
                </div>
                <div className="flex gap-2 text-[10px]">
                    <div className="flex-1 p-1.5 bg-white/60 rounded border border-black/20">
                        <span className="font-black">A: </span>
                        <span className="font-bold">{olderSnap.label}</span>
                        <span className="text-gray-500 ml-1">({formatDate(olderSnap.createdAt)})</span>
                    </div>
                    <div className="flex-1 p-1.5 bg-white/60 rounded border border-black/20">
                        <span className="font-black">B: </span>
                        <span className="font-bold">{newerSnap.label}</span>
                        <span className="text-gray-500 ml-1">({formatDate(newerSnap.createdAt)})</span>
                    </div>
                </div>
            </div>

            {/* Tab toggle: Summary vs JSON Diff */}
            <div className="flex border-b-2 border-black bg-white">
                <button
                    onClick={() => setActiveTab('summary')}
                    className={`flex-1 py-2 text-[10px] font-black transition-all ${
                        activeTab === 'summary' ? 'bg-[#E8DAFF] text-black' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                >
                    요약 비교
                </button>
                <button
                    onClick={() => setActiveTab('json')}
                    className={`flex-1 py-2 text-[10px] font-black transition-all border-l-2 border-black ${
                        activeTab === 'json' ? 'bg-[#E8DAFF] text-black' : 'text-gray-400 hover:bg-gray-50'
                    }`}
                >
                    JSON Diff
                </button>
            </div>

            {/* Diff Summary Bar (summary tab only) */}
            {activeTab === 'summary' && (
                <div className="p-2 border-b-2 border-black bg-white flex items-center justify-center gap-3 text-[10px] font-black">
                    <span className="text-black">{changedCount}개 변경</span>
                    {increaseCount > 0 && (
                        <span className="text-emerald-600 px-1.5 py-0.5 bg-emerald-50 border border-emerald-300 rounded">
                            +{increaseCount} 증가
                        </span>
                    )}
                    {decreaseCount > 0 && (
                        <span className="text-red-600 px-1.5 py-0.5 bg-red-50 border border-red-300 rounded">
                            -{decreaseCount} 감소
                        </span>
                    )}
                    {changedCount === 0 && (
                        <span className="text-gray-400">변경사항 없음</span>
                    )}
                </div>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {activeTab === 'summary' ? (
                    !hasSummaries ? (
                        <div className="text-center py-8 text-gray-400">
                            <div className="text-2xl mb-2">--</div>
                            <p className="font-bold text-xs">요약 데이터가 없는 스냅샷입니다</p>
                            <p className="text-[10px] mt-1">비교하려면 두 스냅샷 모두 요약 정보가 필요합니다</p>
                        </div>
                    ) : (
                        diffItems.map((item, idx) => (
                            <DiffRow key={idx} item={item} />
                        ))
                    )
                ) : (
                    <JsonDiffSection
                        oldId={olderSnap.id}
                        newId={newerSnap.id}
                    />
                )}
            </div>
        </div>
    );
};

// ── Main Component ──

export const VersionHistory: React.FC = () => {
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    // Diff comparison state
    const [compareMode, setCompareMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [showDiff, setShowDiff] = useState(false);

    // Rollback confirm state
    const [rollbackTarget, setRollbackTarget] = useState<Snapshot | null>(null);

    useEffect(() => { fetchHistory(); }, []);

    const fetchHistory = async () => {
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const data = await studioApi.getHistory();
            if (data.snapshots) {
                setSnapshots(data.snapshots.map(s => ({
                    id: s.id,
                    createdAt: s.timestamp,
                    label: s.message,
                    size: 0,
                })));
            }
        } catch {
            // IPC unreachable — silently ignore
        }
        setLoading(false);
    };

    const rollback = async (id: string) => {
        setMessage('');
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) return;
        try {
            const result = await studioApi.rollback(id);
            setMessage(result.success ? '롤백 완료' : (result.error || '롤백 실패'));
            await fetchHistory();
        } catch {
            setMessage('롤백 실패');
        }
    };

    const formatDate = (iso: string) => {
        try {
            const d = new Date(iso);
            return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
        } catch { return iso; }
    };

    const toggleSelection = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                if (next.size >= 2) {
                    // Replace the oldest selection
                    const [first] = next;
                    next.delete(first);
                }
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleCompareToggle = useCallback(() => {
        if (compareMode) {
            // Exit compare mode
            setCompareMode(false);
            setSelectedIds(new Set());
            setShowDiff(false);
        } else {
            setCompareMode(true);
            setSelectedIds(new Set());
            setShowDiff(false);
        }
    }, [compareMode]);

    const handleStartDiff = useCallback(() => {
        if (selectedIds.size === 2) {
            setShowDiff(true);
        }
    }, [selectedIds]);

    // Resolve selected snapshots for diff (older first by createdAt)
    const diffPair = useMemo((): { older: Snapshot; newer: Snapshot } | null => {
        if (selectedIds.size !== 2) return null;
        const ids = Array.from(selectedIds);
        const snapA = snapshots.find(s => s.id === ids[0]);
        const snapB = snapshots.find(s => s.id === ids[1]);
        if (!snapA || !snapB) return null;

        const timeA = new Date(snapA.createdAt).getTime();
        const timeB = new Date(snapB.createdAt).getTime();
        return timeA <= timeB
            ? { older: snapA, newer: snapB }
            : { older: snapB, newer: snapA };
    }, [selectedIds, snapshots]);

    // Diff view
    if (showDiff && diffPair) {
        return (
            <div className="flex flex-col h-full bg-white">
                <DiffPanel
                    olderSnap={diffPair.older}
                    newerSnap={diffPair.newer}
                    onClose={() => {
                        setShowDiff(false);
                        setCompareMode(false);
                        setSelectedIds(new Set());
                    }}
                    formatDate={formatDate}
                />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#F0ABFC]">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-black text-lg text-black flex items-center gap-1.5"><Clock className="w-5 h-5 inline-block" strokeWidth={2.5} /> Version History</h2>
                        <p className="text-xs text-gray-700 mt-1">Apply할 때마다 자동 스냅샷</p>
                    </div>
                    <div className="flex gap-1.5">
                        {snapshots.length >= 2 && (
                            <button
                                onClick={handleCompareToggle}
                                className={`text-[10px] font-black px-3 py-1.5 border-2 border-black rounded-lg shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] transition-all ${
                                    compareMode
                                        ? 'bg-[#C4B5FD] text-black'
                                        : 'bg-white text-black'
                                }`}
                            >
                                {compareMode ? '취소' : '비교'}
                            </button>
                        )}
                        <button
                            onClick={fetchHistory}
                            className="text-xs font-black px-3 py-1.5 bg-white border-2 border-black rounded-lg shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] transition-all"
                        >
                            <RefreshCw className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* Compare mode instruction bar */}
                {compareMode && (
                    <div className="mt-2 p-2 bg-white/70 rounded-lg border-2 border-black text-[10px] font-bold text-center">
                        {selectedIds.size === 0 && '비교할 두 버전을 선택하세요'}
                        {selectedIds.size === 1 && '하나 더 선택하세요 (2개 필요)'}
                        {selectedIds.size === 2 && (
                            <button
                                onClick={handleStartDiff}
                                className="font-black px-4 py-1.5 bg-[#C4B5FD] text-black border-2 border-black rounded shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] transition-all"
                            >
                                비교하기
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Message */}
            {message && (
                <div className={`p-2 text-center text-xs font-bold ${message.includes('⚠️') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {message}
                </div>
            )}

            {/* Snapshot List */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="text-center text-gray-400 font-bold animate-pulse py-8">로딩 중...</div>
                ) : snapshots.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <div className="text-3xl mb-2"><MailOpen className="w-8 h-8 mx-auto" strokeWidth={2.5} /></div>
                        <p className="font-bold text-sm">스냅샷이 없습니다</p>
                        <p className="text-xs mt-1">Draft를 Apply하면 자동 생성됩니다</p>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Timeline line */}
                        <div className={`absolute top-0 bottom-0 w-0.5 bg-black ${compareMode ? 'left-10' : 'left-4'}`} />

                        <div className="space-y-4">
                            {snapshots.map((snap, i) => {
                                const prevSnap = snapshots[i + 1];
                                const hasSummary = !!snap.summary;
                                const diffs: string[] = [];
                                const isSelected = selectedIds.has(snap.id);

                                if (snap.summary && prevSnap?.summary) {
                                    if (snap.summary.rooms !== prevSnap.summary.rooms) diffs.push(`방: ${prevSnap.summary.rooms} → ${snap.summary.rooms}`);
                                    if (snap.summary.agents !== prevSnap.summary.agents) diffs.push(`Agent: ${prevSnap.summary.agents} → ${snap.summary.agents}`);
                                    if (snap.summary.recipes !== prevSnap.summary.recipes) diffs.push(`Recipe: ${prevSnap.summary.recipes} → ${snap.summary.recipes}`);
                                }

                                return (
                                    <div key={snap.id} className="flex items-start gap-3 relative">
                                        {/* Compare checkbox */}
                                        {compareMode && (
                                            <button
                                                onClick={() => toggleSelection(snap.id)}
                                                className={`w-6 h-6 rounded border-2 border-black flex items-center justify-center flex-shrink-0 transition-all ${
                                                    isSelected
                                                        ? 'bg-[#C4B5FD] shadow-[1px_1px_0_0_#000]'
                                                        : 'bg-white hover:bg-gray-100'
                                                }`}
                                            >
                                                {isSelected && <span className="text-xs font-black">✓</span>}
                                            </button>
                                        )}

                                        {/* Timeline dot */}
                                        <div className={`w-8 h-8 rounded-full border-2 border-black flex items-center justify-center z-10 flex-shrink-0 ${
                                            isSelected
                                                ? 'bg-[#C4B5FD] ring-2 ring-[#8B5CF6] ring-offset-1'
                                                : i === 0
                                                    ? 'bg-[#FFD100]'
                                                    : 'bg-white'
                                        }`}>
                                            <span className="text-xs font-black">{i === 0 ? '★' : i + 1}</span>
                                        </div>

                                        {/* Snapshot card */}
                                        <div
                                            className={`flex-1 p-3 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-all ${
                                                isSelected ? 'ring-2 ring-[#8B5CF6] ring-offset-1' : ''
                                            }`}
                                            onClick={compareMode ? () => toggleSelection(snap.id) : undefined}
                                            style={compareMode ? { cursor: 'pointer' } : undefined}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-black truncate">{snap.label}</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5 mb-1.5">
                                                        {formatDate(snap.createdAt)} · {(snap.size / 1024).toFixed(1)}KB
                                                    </p>

                                                    {diffs.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap mt-1">
                                                            {diffs.map((d, di) => (
                                                                <span key={di} className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-300 rounded">
                                                                    {d}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {diffs.length === 0 && hasSummary && prevSnap?.summary && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 border border-gray-300 rounded">변경사항 없음</span>
                                                    )}
                                                </div>
                                                {!compareMode && (
                                                    <button
                                                        onClick={() => setRollbackTarget(snap)}
                                                        className="text-[10px] font-black px-2 py-1 bg-[#60A5FA] text-white border-2 border-black rounded shadow-[1px_1px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] flex-shrink-0 transition-all"
                                                    >
                                                        롤백
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t-2 border-black bg-gray-50 text-center text-xs font-bold text-gray-400">
                총 {snapshots.length}개 스냅샷
                {compareMode && selectedIds.size > 0 && (
                    <span className="ml-2 text-[#8B5CF6]">({selectedIds.size}/2 선택됨)</span>
                )}
            </div>

            {/* Rollback Confirm Dialog */}
            <ConfirmDialog
                open={!!rollbackTarget}
                title="롤백 확인"
                message={rollbackTarget ? `"${rollbackTarget.label}" 버전으로 롤백하시겠습니까? 현재 상태는 새 스냅샷으로 자동 저장됩니다.` : ''}
                confirmLabel="롤백"
                cancelLabel="취소"
                variant="warning"
                onConfirm={() => {
                    if (rollbackTarget) {
                        rollback(rollbackTarget.id);
                    }
                    setRollbackTarget(null);
                }}
                onCancel={() => setRollbackTarget(null)}
            />
        </div>
    );
};
