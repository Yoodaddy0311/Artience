import React, { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';

export const StudioDecorator: React.FC = () => {
    const [assets, setAssets] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAsset, setSelectedAsset] = useState<number | null>(null);

    useEffect(() => {
        const studioApi = window.dogbaApi?.studio;
        if (!studioApi) {
            setLoading(false);
            return;
        }
        studioApi.getAssets()
            .then(data => {
                if (data.assets) setAssets(data.assets.map(a => a.path));
            })
            .catch(() => {
                // IPC unreachable — silently use empty assets
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return (
        <div className="w-full h-full bg-cream-50 flex flex-col p-8 overflow-y-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-brown-900 mb-2 flex items-center gap-2"><Palette className="w-8 h-8 inline-block" strokeWidth={2.5} /> Nano Banana Studio</h1>
                    <p className="text-brown-500 font-medium">로컬 자산 라이브러리가 API와 실시간으로 연동되었습니다. (Phase 4-C)</p>
                </div>
                <button className="bg-brown-800 text-white font-bold py-3 px-6 rounded-2xl shadow-md hover:bg-brown-900 transition-colors">
                    + 신규 에셋 생성
                </button>
            </div>

            {loading ? (
                <div className="flex bg-white items-center justify-center w-full h-64 border-2 border-dashed border-cream-200 rounded-3xl text-brown-400 font-bold animate-pulse">
                    로컬 라이브러리 동기화 중...
                </div>
            ) : assets.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 p-2">
                    {assets.map((asset, idx) => {
                        const isSelected = selectedAsset === idx;
                        return (
                            <div
                                key={idx}
                                onClick={() => setSelectedAsset(isSelected ? null : idx)}
                                className={`overflow-hidden transition-all cursor-pointer group ${
                                    isSelected
                                        ? 'rounded-xl border-2 border-black bg-yellow-100 shadow-[4px_4px_0_0_#000] scale-[1.02]'
                                        : 'rounded-3xl border border-cream-200 bg-white shadow-sm hover:shadow-lg hover:scale-105'
                                }`}
                            >
                                <div className="aspect-square bg-cream-100 flex items-center justify-center p-4 relative overflow-hidden">
                                    <img src={asset} alt="Asset" className="max-w-full max-h-full object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 w-6 h-6 bg-black text-white rounded-md flex items-center justify-center text-xs font-black border-2 border-black shadow-[1px_1px_0_0_#FFD100]">
                                            ✓
                                        </div>
                                    )}
                                </div>
                                <div className={`p-4 border-t flex justify-between items-center ${
                                    isSelected ? 'bg-yellow-50 border-black' : 'bg-white border-cream-100'
                                }`}>
                                    <span className="text-sm font-bold text-brown-800 truncate">에셋_{idx + 1}</span>
                                    {isSelected
                                        ? <span className="text-xs bg-black text-white px-2 py-1 rounded-md font-black shrink-0">선택됨</span>
                                        : <span className="text-xs bg-pink-100 text-pink-600 px-2 py-1 rounded-full font-bold shrink-0">Image</span>
                                    }
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="flex bg-white items-center justify-center w-full h-64 border-2 border-dashed border-cream-200 rounded-3xl text-brown-400 font-bold">
                    생성된 에셋이 없습니다.
                </div>
            )}
        </div>
    );
};
