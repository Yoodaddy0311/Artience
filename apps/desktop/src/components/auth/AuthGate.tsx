import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { ShieldAlert, LogIn, RefreshCw, Loader2 } from 'lucide-react';

/**
 * AuthGate — 앱 시작 시 Claude Code CLI 인증 상태를 확인하고,
 * 미인증이면 전체 앱을 차단하는 게이트 화면.
 *
 * Neo-brutalism 스타일 (border-4, shadow-[4px_4px_0_0_#000], bold colors).
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const isAuthenticated = useAppStore((s) => s.isAuthenticated);
    const authChecking = useAppStore((s) => s.authChecking);
    const checkAuth = useAppStore((s) => s.checkAuth);
    const loginAuth = useAppStore((s) => s.loginAuth);
    const [loginPending, setLoginPending] = useState(false);

    // Check auth on mount
    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    // Authenticated — render children
    if (isAuthenticated === true) {
        return <>{children}</>;
    }

    // Checking (null or authChecking) — loading spinner
    if (isAuthenticated === null || authChecking) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-screen bg-yellow-100">
                <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_#000] rounded-2xl p-12 flex flex-col items-center gap-6 max-w-md">
                    <Loader2
                        className="w-12 h-12 animate-spin text-black"
                        strokeWidth={2.5}
                    />
                    <p className="font-bold text-lg text-black">
                        인증 상태 확인 중...
                    </p>
                </div>
            </div>
        );
    }

    // Not authenticated — gate screen
    const handleLogin = async () => {
        setLoginPending(true);
        await loginAuth();
        setLoginPending(false);
    };

    const handleRetry = () => {
        checkAuth();
    };

    return (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-yellow-100 p-8">
            <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_#000] rounded-2xl p-10 flex flex-col items-center gap-6 max-w-lg w-full">
                {/* Icon */}
                <div className="w-20 h-20 bg-red-100 border-4 border-black rounded-2xl flex items-center justify-center shadow-[4px_4px_0_0_#000]">
                    <ShieldAlert
                        className="w-10 h-10 text-red-600"
                        strokeWidth={2.5}
                    />
                </div>

                {/* Title */}
                <h1 className="font-black text-2xl text-black text-center leading-tight">
                    Claude Code 인증 필요
                </h1>

                {/* Description */}
                <p className="text-center text-gray-700 font-medium text-sm leading-relaxed max-w-sm">
                    Dokba Studio를 사용하려면 Claude Code CLI에 로그인해야
                    합니다. 아래 버튼을 눌러 인증을 진행하세요.
                </p>

                {/* Actions */}
                <div className="flex flex-col gap-3 w-full mt-2">
                    <button
                        onClick={handleLogin}
                        disabled={loginPending}
                        className="flex items-center justify-center gap-2 w-full min-h-[52px] px-6 bg-[#FFD100] font-bold text-black text-[15px] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-xl hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
                    >
                        {loginPending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <LogIn className="w-5 h-5" strokeWidth={2.5} />
                        )}
                        {loginPending ? '로그인 진행 중...' : '로그인'}
                    </button>

                    <button
                        onClick={handleRetry}
                        disabled={authChecking}
                        className="flex items-center justify-center gap-2 w-full min-h-[44px] px-6 bg-white font-bold text-black text-[13px] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-xl hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
                    >
                        <RefreshCw className="w-4 h-4" strokeWidth={2.5} />
                        다시 확인
                    </button>
                </div>

                {/* Hint */}
                <p className="text-xs text-gray-400 text-center mt-2">
                    터미널에서{' '}
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-mono text-[11px]">
                        claude auth login
                    </code>{' '}
                    으로도 인증할 수 있습니다.
                </p>
            </div>
        </div>
    );
};
