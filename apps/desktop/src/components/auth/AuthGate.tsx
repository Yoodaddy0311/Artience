import React, { useEffect, useState } from 'react';
import { ShieldAlert, LogIn, RefreshCw, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Keeps the app shell mounted while auth is checked in the background.
 * Only shows a blocking overlay when authentication is confirmed missing.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const isAuthenticated = useAppStore((s) => s.isAuthenticated);
    const authChecking = useAppStore((s) => s.authChecking);
    const checkAuth = useAppStore((s) => s.checkAuth);
    const loginAuth = useAppStore((s) => s.loginAuth);
    const [loginPending, setLoginPending] = useState(false);

    useEffect(() => {
        void checkAuth();
    }, [checkAuth]);

    const handleLogin = async () => {
        setLoginPending(true);
        await loginAuth();
        setLoginPending(false);
    };

    const handleRetry = () => {
        void checkAuth();
    };

    return (
        <>
            {children}

            {(isAuthenticated === null || authChecking) && (
                <div className="fixed top-4 right-4 z-[90] pointer-events-none">
                    <div className="bg-white border-4 border-black shadow-[6px_6px_0_0_#000] rounded-2xl px-4 py-3 flex items-center gap-3">
                        <Loader2
                            className="w-5 h-5 animate-spin text-black"
                            strokeWidth={2.5}
                        />
                        <div className="flex flex-col">
                            <span className="font-black text-sm text-black">
                                Claude Code 확인 중
                            </span>
                            <span className="text-[11px] font-medium text-gray-600">
                                앱은 먼저 열고 인증만 백그라운드에서 확인합니다.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {isAuthenticated === false && !authChecking && (
                <div className="fixed inset-0 z-[100] bg-yellow-100/75 backdrop-blur-[2px] flex items-center justify-center p-8">
                    <div className="bg-white border-4 border-black shadow-[8px_8px_0_0_#000] rounded-2xl p-10 flex flex-col items-center gap-6 max-w-lg w-full">
                        <div className="w-20 h-20 bg-red-100 border-4 border-black rounded-2xl flex items-center justify-center shadow-[4px_4px_0_0_#000]">
                            <ShieldAlert
                                className="w-10 h-10 text-red-600"
                                strokeWidth={2.5}
                            />
                        </div>

                        <h1 className="font-black text-2xl text-black text-center leading-tight">
                            Claude Code 인증 필요
                        </h1>

                        <p className="text-center text-gray-700 font-medium text-sm leading-relaxed max-w-sm">
                            Dokba Studio를 제대로 사용하려면 Claude Code CLI
                            로그인이 필요합니다. 아래 버튼으로 인증을 진행해
                            주세요.
                        </p>

                        <div className="flex flex-col gap-3 w-full mt-2">
                            <button
                                onClick={handleLogin}
                                disabled={loginPending}
                                className="flex items-center justify-center gap-2 w-full min-h-[52px] px-6 bg-[#FFD100] font-bold text-black text-[15px] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-xl hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 uppercase"
                            >
                                {loginPending ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <LogIn
                                        className="w-5 h-5"
                                        strokeWidth={2.5}
                                    />
                                )}
                                {loginPending ? '로그인 진행 중..' : '로그인'}
                            </button>

                            <button
                                onClick={handleRetry}
                                disabled={authChecking}
                                className="flex items-center justify-center gap-2 w-full min-h-[44px] px-6 bg-white font-bold text-black text-[13px] border-4 border-black shadow-[4px_4px_0_0_#000] rounded-xl hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50"
                            >
                                <RefreshCw
                                    className="w-4 h-4"
                                    strokeWidth={2.5}
                                />
                                다시 확인
                            </button>
                        </div>

                        <p className="text-xs text-gray-400 text-center mt-2">
                            터미널에서{' '}
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded border border-gray-300 font-mono text-[11px]">
                                claude auth login
                            </code>{' '}
                            으로도 인증할 수 있습니다.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};
