import React, { useEffect, useMemo, useState } from 'react';
import {
    FolderOpen,
    Image,
    FileText,
    RefreshCw,
    Settings2,
    Trash2,
    Upload,
} from 'lucide-react';
import { useAppStore, type ProjectAsset } from '../../store/useAppStore';

interface NumericFieldProps {
    label: string;
    value: number;
    step?: number;
    min?: number;
    max?: number;
    onCommit: (value: number) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({
    label,
    value,
    step = 1,
    min,
    max,
    onCommit,
}) => {
    const [draft, setDraft] = useState(() => String(value));

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    const commit = () => {
        const parsed = Number(draft);
        if (!Number.isFinite(parsed)) {
            setDraft(String(value));
            return;
        }

        const clamped = Math.min(
            max ?? parsed,
            Math.max(min ?? parsed, parsed),
        );
        setDraft(String(clamped));
        if (clamped !== value) {
            onCommit(clamped);
        }
    };

    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                {label}
            </span>
            <input
                type="number"
                value={draft}
                step={step}
                min={min}
                max={max}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                        setDraft(String(value));
                        e.currentTarget.blur();
                    }
                }}
                className="h-10 rounded-lg border-2 border-black bg-white px-3 text-sm font-bold text-black outline-none transition-all focus:-translate-y-0.5 focus:shadow-[3px_3px_0_0_#000]"
            />
        </label>
    );
};

export const AssetsPanel: React.FC = () => {
    const assets = useAppStore((s) => s.assets);
    const setAssets = useAppStore((s) => s.setAssets);
    const projectConfig = useAppStore((s) => s.projectConfig);
    const selectedWorldObjectId = useAppStore((s) => s.selectedWorldObjectId);
    const setSelectedWorldObjectId = useAppStore(
        (s) => s.setSelectedWorldObjectId,
    );
    const updateWorldObjectProperties = useAppStore(
        (s) => s.updateWorldObjectProperties,
    );
    const saveProject = useAppStore((s) => s.saveProject);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedObject = useMemo(
        () =>
            projectConfig.world.layers.objects.find(
                (object) => object.id === selectedWorldObjectId,
            ) ?? null,
        [projectConfig.world.layers.objects, selectedWorldObjectId],
    );

    const selectedAssetName =
        typeof selectedObject?.properties?.asset === 'string'
            ? (selectedObject.properties.asset.split('/').pop() ??
              selectedObject.properties.asset)
            : null;

    const commitSelectedPatch = (patch: Record<string, unknown>) => {
        if (!selectedObject) return;
        updateWorldObjectProperties(selectedObject.id, patch);
        saveProject();
    };

    const fetchAssets = async () => {
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await studioApi.getAssets();
            if (data.assets && Array.isArray(data.assets)) {
                // filter out hidden files and character sprite sheets
                const visibleAssets = data.assets.filter((a) => {
                    if (a.name.startsWith('.')) return false;
                    // Ignore character directions (e.g. cat-se.png, cat-idle.png)
                    if (
                        /-(se|sw|ne|nw|idle|walk|sit)\.(png|webp)$/i.test(
                            a.name,
                        )
                    )
                        return false;
                    return true;
                });
                const mapped: ProjectAsset[] = visibleAssets.map((a, idx) => ({
                    id: `asset-${idx}`,
                    name: a.name || `asset_${idx + 1}`,
                    type: /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(a.name)
                        ? ('image' as const)
                        : ('data' as const),
                    url: a.path,
                    size: a.size || 0,
                    createdAt: new Date().toISOString(),
                }));
                // Sort array to keep it stable
                mapped.sort((a, b) => a.name.localeCompare(b.name));
                setAssets(mapped);
            }
        } catch {
            // IPC unreachable — silently ignore
        }
        setLoading(false);
    };

    const handleUpload = async () => {
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) return;
        const result = await studioApi.uploadAsset();
        if (result.success && result.copied?.length) {
            fetchAssets();
        } else if (result.error && result.error !== 'canceled') {
            console.error('Upload failed:', result.error);
        }
    };

    const handleDelete = async (filename: string) => {
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) return;
        if (window.confirm(`${filename} 에셋을 삭제하시겠습니까?`)) {
            const result = await studioApi.deleteAsset(filename);
            if (result.success) {
                fetchAssets();
            } else {
                console.error('Delete failed:', result.error);
            }
        }
    };

    const handleDragStart = (
        e: React.DragEvent<HTMLDivElement>,
        asset: ProjectAsset,
    ) => {
        e.dataTransfer.setData(
            'application/json',
            JSON.stringify({ type: 'asset', url: asset.url, name: asset.name }),
        );
        e.dataTransfer.effectAllowed = 'copy';
    };

    useEffect(() => {
        if (assets.length === 0) {
            fetchAssets();
        }
    }, []);

    useEffect(() => {
        if (selectedWorldObjectId && !selectedObject) {
            setSelectedWorldObjectId(null);
        }
    }, [selectedObject, selectedWorldObjectId, setSelectedWorldObjectId]);

    const typeIcon = (type: ProjectAsset['type']) => {
        switch (type) {
            case 'image':
                return (
                    <Image
                        className="w-4 h-4 text-pink-500"
                        strokeWidth={2.5}
                    />
                );
            case 'data':
                return (
                    <FileText
                        className="w-4 h-4 text-blue-500"
                        strokeWidth={2.5}
                    />
                );
            default:
                return (
                    <FolderOpen
                        className="w-4 h-4 text-gray-500"
                        strokeWidth={2.5}
                    />
                );
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#FFE066]">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="font-black text-lg text-black flex items-center gap-2">
                            <FolderOpen className="w-5 h-5" strokeWidth={3} />
                            Assets
                        </h2>
                        <p className="text-xs text-gray-700 mt-1">
                            프로젝트 에셋 목록
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleUpload}
                            className="w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                            title="에셋 업로드"
                        >
                            <Upload
                                className="w-4 h-4 text-black"
                                strokeWidth={2.5}
                            />
                        </button>
                        <button
                            onClick={fetchAssets}
                            disabled={loading}
                            className="w-9 h-9 flex items-center justify-center border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                            title="새로고침"
                        >
                            <RefreshCw
                                className={`w-4 h-4 text-black ${loading ? 'animate-spin' : ''}`}
                                strokeWidth={2.5}
                            />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {loading && assets.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 font-bold animate-pulse">
                        로딩 중...
                    </div>
                ) : error && assets.length === 0 ? (
                    <div className="text-center py-12">
                        <FolderOpen
                            className="w-12 h-12 text-gray-300 mx-auto mb-3"
                            strokeWidth={1.5}
                        />
                        <p className="font-bold text-sm text-gray-400">
                            {error}
                        </p>
                        <button
                            onClick={fetchAssets}
                            className="mt-3 text-xs font-black px-4 py-2 bg-white border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-all"
                        >
                            다시 시도
                        </button>
                    </div>
                ) : assets.length === 0 ? (
                    <div className="text-center py-12">
                        <FolderOpen
                            className="w-12 h-12 text-gray-300 mx-auto mb-3"
                            strokeWidth={1.5}
                        />
                        <p className="font-bold text-sm text-gray-400">
                            에셋이 없습니다
                        </p>
                        <p className="text-xs text-gray-300 mt-1">
                            우측 상단의 버튼을 눌러 에셋을 업로드해주세요
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {assets.map((asset) => (
                            <div
                                key={asset.id}
                                className="flex items-center gap-3 p-3 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing group"
                                draggable={true}
                                onDragStart={(e) => handleDragStart(e, asset)}
                            >
                                {/* Preview */}
                                <div className="w-10 h-10 rounded-lg border-2 border-black bg-gray-50 flex-shrink-0 overflow-hidden flex items-center justify-center pointer-events-none">
                                    {asset.type === 'image' ? (
                                        <img
                                            src={asset.url}
                                            alt={asset.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        typeIcon(asset.type)
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0 pointer-events-none">
                                    <span className="font-bold text-sm text-black truncate block">
                                        {asset.name}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {asset.type}
                                    </span>
                                </div>

                                {/* Actions */}
                                <button
                                    onClick={() => handleDelete(asset.name)}
                                    className="w-8 h-8 flex items-center justify-center border-2 border-transparent rounded bg-transparent opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all text-gray-400 hover:text-red-500"
                                    title="삭제"
                                >
                                    <Trash2
                                        className="w-4 h-4"
                                        strokeWidth={2.5}
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="mt-6 rounded-2xl border-2 border-black bg-[#FFF7D6] shadow-[3px_3px_0_0_#000] overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b-2 border-black px-4 py-3 bg-white">
                        <div className="flex items-center gap-2">
                            <Settings2 className="w-4 h-4 text-black" />
                            <div>
                                <h3 className="text-sm font-black text-black">
                                    Selected Object
                                </h3>
                                <p className="text-[11px] text-gray-500 font-bold">
                                    Collision and occlusion tuning
                                </p>
                            </div>
                        </div>
                        {selectedObject && (
                            <button
                                onClick={() => setSelectedWorldObjectId(null)}
                                className="px-3 py-1.5 text-[11px] font-black rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#000] transition-all"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {selectedObject ? (
                        <div className="space-y-4 p-4">
                            <div className="rounded-xl border-2 border-black bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-black truncate">
                                            {selectedAssetName ??
                                                selectedObject.type}
                                        </p>
                                        <p className="text-[11px] font-bold text-gray-500 mt-1">
                                            id: {selectedObject.id}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full border-2 border-black bg-[#FFE066] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]">
                                        {selectedObject.type}
                                    </span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-bold text-gray-600">
                                    <div className="rounded-lg bg-gray-50 px-2 py-2">
                                        Grid: {selectedObject.x},{' '}
                                        {selectedObject.y}
                                    </div>
                                    <div className="rounded-lg bg-gray-50 px-2 py-2">
                                        Size: {selectedObject.width} x{' '}
                                        {selectedObject.height}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                                    Transform
                                </p>
                                <div className="grid grid-cols-1 gap-3">
                                    <NumericField
                                        label="Scale"
                                        value={Number(
                                            selectedObject.properties?.scale ??
                                                1,
                                        )}
                                        step={0.05}
                                        min={0.1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                scale: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Offset X"
                                        value={Number(
                                            selectedObject.properties
                                                ?.offsetX ?? 0,
                                        )}
                                        step={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                offsetX: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Offset Y"
                                        value={Number(
                                            selectedObject.properties
                                                ?.offsetY ?? 0,
                                        )}
                                        step={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                offsetY: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Rotation (rad)"
                                        value={Number(
                                            selectedObject.properties
                                                ?.rotation ?? 0,
                                        )}
                                        step={0.05}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                rotation: value,
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-500">
                                    Collision and Occlusion
                                </p>
                                <div className="grid grid-cols-1 gap-3">
                                    <NumericField
                                        label="Occlusion Offset Y"
                                        value={Number(
                                            selectedObject.properties
                                                ?.occlusionOffsetY ?? 0,
                                        )}
                                        step={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                occlusionOffsetY: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Collision Padding"
                                        value={Number(
                                            selectedObject.properties
                                                ?.collisionPadding ?? 0,
                                        )}
                                        step={1}
                                        min={0}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                collisionPadding: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Collision Inset X"
                                        value={Number(
                                            selectedObject.properties
                                                ?.collisionInsetX ?? 0,
                                        )}
                                        step={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                collisionInsetX: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Collision Inset Y"
                                        value={Number(
                                            selectedObject.properties
                                                ?.collisionInsetY ?? 0,
                                        )}
                                        step={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                collisionInsetY: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Footprint Width"
                                        value={Number(
                                            selectedObject.properties
                                                ?.collisionFootprintWidth ??
                                                selectedObject.width,
                                        )}
                                        step={1}
                                        min={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                collisionFootprintWidth: value,
                                            })
                                        }
                                    />
                                    <NumericField
                                        label="Footprint Height"
                                        value={Number(
                                            selectedObject.properties
                                                ?.collisionFootprintHeight ??
                                                selectedObject.height,
                                        )}
                                        step={1}
                                        min={1}
                                        onCommit={(value) =>
                                            commitSelectedPatch({
                                                collisionFootprintHeight: value,
                                            })
                                        }
                                    />
                                </div>
                            </div>

                            <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-black bg-white px-3 py-3">
                                <div>
                                    <p className="text-sm font-black text-black">
                                        Walkable
                                    </p>
                                    <p className="text-[11px] font-bold text-gray-500 mt-1">
                                        Allow agents to pass through this asset
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={Boolean(
                                        selectedObject.properties?.isWalkable,
                                    )}
                                    onChange={(e) =>
                                        commitSelectedPatch({
                                            isWalkable: e.target.checked,
                                        })
                                    }
                                    className="h-5 w-5 rounded border-2 border-black accent-black"
                                />
                            </label>
                        </div>
                    ) : (
                        <div className="p-4 text-sm font-bold text-gray-600">
                            캔버스에서 오브젝트를 선택하면 이곳에서 스케일,
                            오프셋, 충돌 풋프린트, 가림 기준선을 정교하게 조정할
                            수 있습니다.
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            {assets.length > 0 && (
                <div className="p-3 border-t-2 border-black bg-gray-50 text-center text-xs font-bold text-gray-500">
                    {assets.length}개 에셋
                </div>
            )}
        </div>
    );
};
