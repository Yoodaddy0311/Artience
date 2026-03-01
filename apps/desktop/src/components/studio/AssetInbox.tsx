import React, { useState, useRef, useCallback } from 'react';
import { Target, FolderOpen, Image, FileText, Package, Paperclip, Inbox, MailOpen } from 'lucide-react';

interface AssetFile {
    id: string;
    name: string;
    type: 'image' | 'document' | 'archive' | 'unknown';
    size: number;
    file: File;
    previewUrl?: string;
    tags: string[];
    status: 'uploading' | 'ready' | 'error';
}

const FILE_TYPE_MAP: Record<string, AssetFile['type']> = {
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'image/svg+xml': 'image',
    'application/pdf': 'document',
    'text/plain': 'document',
    'text/markdown': 'document',
    'application/json': 'document',
    'application/zip': 'archive',
    'application/x-zip-compressed': 'archive',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const TAG_COLORS: Record<string, string> = {
    Theme: 'bg-purple-200 text-purple-800',
    World: 'bg-green-200 text-green-800',
    Agents: 'bg-blue-200 text-blue-800',
    Recipes: 'bg-orange-200 text-orange-800',
};

export const AssetInbox: React.FC = () => {
    const [assets, setAssets] = useState<AssetFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [filter, setFilter] = useState<string>('all');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const classifyType = (file: File): AssetFile['type'] => {
        return FILE_TYPE_MAP[file.type] || 'unknown';
    };

    const autoTag = (file: File): string[] => {
        const name = file.name.toLowerCase();
        const tags: string[] = [];
        if (name.includes('theme') || name.includes('palette') || name.includes('color')) tags.push('Theme');
        if (name.includes('world') || name.includes('map') || name.includes('layout') || name.includes('floor')) tags.push('World');
        if (name.includes('agent') || name.includes('character') || name.includes('sprite')) tags.push('Agents');
        if (name.includes('recipe') || name.includes('command') || name.includes('script')) tags.push('Recipes');
        return tags;
    };

    const processFiles = useCallback((files: FileList | File[]) => {
        const newAssets: AssetFile[] = Array.from(files).map(file => {
            const type = classifyType(file);
            const previewUrl = type === 'image' ? URL.createObjectURL(file) : undefined;
            const oversized = file.size > MAX_FILE_SIZE;
            return {
                id: crypto.randomUUID(),
                name: file.name,
                type,
                size: file.size,
                file,
                previewUrl,
                tags: autoTag(file),
                status: oversized ? 'error' as const : 'uploading' as const,
            };
        });
        setAssets(prev => [...newAssets, ...prev]);

        newAssets.forEach(async (asset) => {
            // Skip upload for oversized files (already marked as error)
            if (asset.size > MAX_FILE_SIZE) return;

            const fileApi = window.dogbaApi?.file;
            if (!fileApi) {
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'ready' as const } : a));
                return;
            }
            try {
                // For local-first: files are already on disk, just mark as ready
                // TODO: implement file copy via dogbaApi.file.copy when project dir is set
                setAssets(prev => prev.map(a => a.id === asset.id ? {
                    ...a,
                    status: 'ready' as const
                } : a));
            } catch {
                setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, status: 'error' as const } : a));
            }
        });
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    }, [processFiles]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
        }
    }, [processFiles]);

    const toggleTag = (assetId: string, tag: string) => {
        setAssets(prev => prev.map(a => {
            if (a.id !== assetId) return a;
            const tags = a.tags.includes(tag)
                ? a.tags.filter(t => t !== tag)
                : [...a.tags, tag];
            return { ...a, tags };
        }));
    };

    const removeAsset = (assetId: string) => {
        setAssets(prev => {
            const asset = prev.find(a => a.id === assetId);
            if (asset?.previewUrl) URL.revokeObjectURL(asset.previewUrl);
            return prev.filter(a => a.id !== assetId);
        });
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const filteredAssets = filter === 'all'
        ? assets
        : assets.filter(a => a.tags.includes(filter));

    const typeIcon = (type: AssetFile['type']) => {
        switch (type) {
            case 'image': return <Image className="w-5 h-5" strokeWidth={2.5} />;
            case 'document': return <FileText className="w-5 h-5" strokeWidth={2.5} />;
            case 'archive': return <Package className="w-5 h-5" strokeWidth={2.5} />;
            default: return <Paperclip className="w-5 h-5" strokeWidth={2.5} />;
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="p-4 border-b-2 border-black bg-[#E8DAFF]">
                <h2 className="font-black text-lg text-black flex items-center gap-1.5"><Inbox className="w-5 h-5 inline-block" strokeWidth={2.5} /> Asset Inbox</h2>
                <p className="text-xs text-gray-600 mt-1">파일을 드래그하거나 클릭하여 업로드하세요</p>
            </div>

            {/* Drop Zone */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`m-4 p-8 border-3 border-dashed rounded-xl text-center cursor-pointer transition-all ${isDragging
                    ? 'border-[#FFD100] bg-[#FFF8E7] scale-[1.02] shadow-[4px_4px_0_0_#000]'
                    : 'border-gray-300 hover:border-[#9DE5DC] hover:bg-gray-50'
                    }`}
                style={{ borderWidth: '3px' }}
            >
                <div className="mb-2">{isDragging ? <Target className="w-10 h-10 mx-auto text-[#FFD100]" strokeWidth={2.5} /> : <FolderOpen className="w-10 h-10 mx-auto text-gray-400" strokeWidth={2} />}</div>
                <p className="text-sm font-bold text-gray-600">
                    {isDragging ? '여기에 놓으세요!' : '이미지, 문서, ZIP을 드래그하세요'}
                </p>
                <p className="text-xs text-gray-400 mt-1">또는 클릭하여 파일 선택</p>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.txt,.md,.json,.zip"
                />
            </div>

            {/* Tag Filter */}
            <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {['all', 'Theme', 'World', 'Agents', 'Recipes'].map(tag => (
                    <button
                        key={tag}
                        onClick={() => setFilter(tag)}
                        className={`text-xs font-black px-3 py-1.5 rounded-md border-2 border-black transition-all shadow-[1px_1px_0_0_#000] ${filter === tag
                            ? 'bg-[#FFD100] text-black'
                            : 'bg-white text-gray-500 hover:bg-gray-50'
                            }`}
                    >
                        {tag === 'all' ? '전체' : tag} {tag !== 'all' && `(${assets.filter(a => a.tags.includes(tag)).length})`}
                    </button>
                ))}
            </div>

            {/* Asset List */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                {filteredAssets.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                        <div className="text-3xl mb-2"><MailOpen className="w-8 h-8 mx-auto" strokeWidth={2.5} /></div>
                        <p className="font-bold text-sm">업로드된 에셋이 없습니다</p>
                    </div>
                ) : (
                    filteredAssets.map(asset => (
                        <div key={asset.id} className="flex items-start gap-3 p-3 rounded-lg border-2 border-black bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] transition-all">
                            {/* Preview */}
                            <div className="w-12 h-12 rounded-lg border-2 border-black bg-gray-50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                {asset.previewUrl ? (
                                    <img src={asset.previewUrl} alt={asset.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="flex items-center justify-center">{typeIcon(asset.type)}</span>
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-black truncate">{asset.name}</span>
                                    {asset.status === 'uploading' && <span className="text-xs text-blue-500 font-bold animate-pulse">업로드 중...</span>}
                                    {asset.status === 'error' && (
                                        <span className="text-xs text-red-500 font-bold">
                                            {asset.size > MAX_FILE_SIZE ? '⚠️ 50MB 초과' : '⚠️ 오류'}
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-400">{formatSize(asset.size)} · {asset.type}</span>

                                {/* Tags */}
                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                    {['Theme', 'World', 'Agents', 'Recipes'].map(tag => (
                                        <button
                                            key={tag}
                                            onClick={() => toggleTag(asset.id, tag)}
                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-all ${asset.tags.includes(tag)
                                                ? `${TAG_COLORS[tag]} border-black`
                                                : 'bg-gray-100 text-gray-400 border-transparent hover:border-gray-300'
                                                }`}
                                        >
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Delete */}
                            <button
                                onClick={() => removeAsset(asset.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0 mt-1"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Footer Stats */}
            {assets.length > 0 && (
                <div className="p-3 border-t-2 border-black bg-gray-50 flex justify-between items-center text-xs font-bold text-gray-500">
                    <span>총 {assets.length}개 에셋</span>
                    <span>{formatSize(assets.reduce((acc, a) => acc + a.size, 0))}</span>
                </div>
            )}
        </div>
    );
};
