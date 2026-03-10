import React, { useEffect, useState, useRef } from 'react';

interface HistoryModalProps {
    agentId: string;
    agentName: string;
    onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
    agentId,
    agentName,
    onClose,
}) => {
    const [history, setHistory] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                if (window.dogbaApi?.terminal?.readHistory) {
                    const data =
                        await window.dogbaApi.terminal.readHistory(agentId);
                    setHistory(data || '기록이 없습니다.');
                } else {
                    setHistory('API가 연결되지 않았습니다.');
                }
            } catch (err) {
                console.error(err);
                setHistory('기록을 불러오는 중 오류가 발생했습니다.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [agentId]);

    // Auto-scroll to bottom on load
    useEffect(() => {
        if (!isLoading && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [isLoading, history]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div
                className="bg-[#1e1e1e] border-2 border-gray-600 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                style={{
                    width: '800px',
                    height: '600px',
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#2d2d2d] border-b border-gray-600 shrink-0">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="text-xl">📜</span>
                        {agentName} - 작업 히스토리
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-600 text-gray-400 hover:text-white transition-colors"
                        title="닫기"
                    >
                        ✕
                    </button>
                </div>

                {/* 내용 (터미널 스타일) */}
                <div className="flex-1 bg-black p-4 overflow-hidden flex flex-col">
                    {isLoading ? (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                            기록을 불러오는 중...
                        </div>
                    ) : (
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto font-mono text-sm text-gray-300 pr-2 custom-scrollbar"
                            style={{
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}
                        >
                            {/* ANSI 코드를 단순 표시할 수도 있으나, 여기서는 xterm.js 없이 pre-wrap으로 보여주므로 깔끔한 텍스트 뷰를 위해 정제 기능이 필요할 수 있습니다. 
                                향후 정규식으로 ANSI 색상 코드를 날리는 필터 도입 가능. 일단은 raw 로 출력합니다. */}
                            {history.replace(/\x1b\[[0-9;]*m/g, '')}
                        </div>
                    )}
                </div>
                {/* 하단 푸터 */}
                <div className="px-4 py-2 bg-[#2d2d2d] border-t border-gray-600 text-xs text-gray-400 flex justify-end shrink-0">
                    이전 대화 및 작업 로그 (로컬 파일 기반)
                </div>
            </div>
        </div>
    );
};
