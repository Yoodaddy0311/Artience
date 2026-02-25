import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface AppErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class AppErrorBoundary extends React.Component<
    { children: React.ReactNode },
    AppErrorBoundaryState
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
        return { hasError: true, error };
    }

    handleReload = () => {
        window.location.reload();
    };

    handleDismiss = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex items-center justify-center w-full h-screen bg-cream-50 font-sans">
                    <div className="max-w-[520px] w-full mx-4">
                        {/* Error Card */}
                        <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_#000] rounded-2xl overflow-hidden">
                            {/* Header */}
                            <div className="bg-[#FF6B6B] border-b-4 border-black p-6 flex items-center gap-4">
                                <div className="w-14 h-14 bg-white border-4 border-black rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,0.2)] flex items-center justify-center">
                                    <AlertTriangle className="w-8 h-8 text-[#FF6B6B]" strokeWidth={3} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-white tracking-tight">
                                        오류가 발생했습니다
                                    </h1>
                                    <p className="text-sm font-bold text-white/80 mt-0.5">
                                        애플리케이션에서 예기치 않은 오류가 발생했습니다.
                                    </p>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="p-6 flex flex-col gap-4">
                                {/* Error Details */}
                                {this.state.error && (
                                    <div className="bg-gray-50 border-3 border-black rounded-xl p-4 overflow-auto max-h-[200px]">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-2">
                                            Error Details
                                        </p>
                                        <pre className="text-xs font-mono text-red-600 whitespace-pre-wrap break-words leading-relaxed">
                                            {this.state.error.message}
                                        </pre>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3">
                                    <button
                                        onClick={this.handleReload}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#FFD100] text-black font-black text-sm border-4 border-black rounded-xl shadow-[4px_4px_0_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all"
                                    >
                                        <RefreshCw className="w-4 h-4" strokeWidth={3} />
                                        새로고침
                                    </button>
                                    <button
                                        onClick={this.handleDismiss}
                                        className="flex-1 py-3 bg-white text-black font-black text-sm border-4 border-black rounded-xl shadow-[4px_4px_0_0_#000] hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all"
                                    >
                                        다시 시도
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
