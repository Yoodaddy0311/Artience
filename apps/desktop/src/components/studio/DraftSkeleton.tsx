import React, { useState } from 'react';

// ── Skeleton Loader ──

export const SkeletonPulse: React.FC<{ className?: string }> = ({ className }) => (
    <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
);

export const DraftSkeleton: React.FC = () => (
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

export const RefineModal: React.FC<RefineModalProps> = ({ open, onClose, onSubmit, loading }) => {
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

export const ColorSwatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
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

export const MethodBadge: React.FC<{ method?: string }> = ({ method }) => {
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

// ── Stat Card Sub-component ──

export const StatCard: React.FC<{
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
