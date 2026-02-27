import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Bot, Wrench, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAppStore, type AppLanguage } from '../../store/useAppStore';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const LANGUAGE_OPTIONS: { value: AppLanguage; label: string }[] = [
    { value: 'ko', label: '한국어' },
    { value: 'en', label: 'English' },
    { value: 'ja', label: '日本語' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const appSettings = useAppStore((s) => s.appSettings);
    const updateAppSettings = useAppStore((s) => s.updateAppSettings);
    const dialogRef = useRef<HTMLDivElement>(null);

    const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking');
    const [isPolling, setIsPolling] = useState(false);

    // ESC to close + focus trap
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key === 'Tab' && dialogRef.current) {
                const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        },
        [onClose],
    );

    useEffect(() => {
        if (!isOpen) return;
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, handleKeyDown]);

    const checkAuthStatus = async () => {
        try {
            // Check if .claude.json exists in user profile (using a dedicated endpoint or generic job)
            const res = await fetch(`${appSettings.apiUrl}/api/cli/auth-status`);
            const data = await res.json();
            setAuthStatus(data.authenticated ? 'authenticated' : 'unauthenticated');
        } catch (e) {
            if (import.meta.env.DEV) console.error("Failed to check auth status", e);
            setAuthStatus('unauthenticated');
        }
    };

    useEffect(() => {
        if (isOpen) {
            checkAuthStatus();
        }
    }, [isOpen]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPolling) {
            interval = setInterval(() => {
                checkAuthStatus().then(() => {
                    // if it becomes authenticated while polling, stop polling
                    setAuthStatus(current => {
                        if (current === 'authenticated') {
                            setIsPolling(false);
                            return 'authenticated';
                        }
                        return current;
                    });
                });
            }, 2000);
        }
        return () => clearInterval(interval);
    }, [isPolling]);

    const handleLogin = async () => {
        try {
            // Trigger backend to spawn a native terminal window for login
            await fetch(`${appSettings.apiUrl}/api/cli/auth-login`, { method: 'POST' });
            setIsPolling(true);
        } catch (e) {
            if (import.meta.env.DEV) console.error("Failed to open login terminal", e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-modal-title"
                className="bg-white border-4 border-black shadow-[8px_8px_0_0_#000] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
            >

                {/* Header */}
                <div className="bg-[#FFD100] border-b-4 border-black p-4 flex justify-between items-center">
                    <h2 id="settings-modal-title" className="text-2xl font-black text-black tracking-tight flex items-center gap-2"><Settings className="w-6 h-6" strokeWidth={3} /> 환경 설정</h2>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 bg-white border-4 border-black shadow-[4px_4px_0_0_#000] rounded-lg flex items-center justify-center text-xl font-black hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000] active:translate-y-1 active:shadow-none transition-all"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-6 overflow-y-auto">
                    {/* Claude Authentication Section */}
                    <div className="border-4 border-black p-5 rounded-xl bg-gray-50 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#E8DAFF] border-2 border-black rounded-lg flex items-center justify-center"><Bot className="w-6 h-6 text-black" strokeWidth={2.5} /></div>
                            <div>
                                <h3 className="text-xl font-bold text-black">Claude Code CLI 연동</h3>
                                <p className="text-sm font-medium text-gray-600 mt-1">로컬 기기에 전역 설치된 Claude CLI와 권한을 연동합니다.</p>
                            </div>
                        </div>

                        <div className="border-t-4 border-dashed border-gray-300 my-2"></div>

                        <div className="flex items-center justify-between">
                            <span className="font-bold text-lg">상태:</span>

                            {authStatus === 'checking' && (
                                <span className="px-3 py-1 bg-gray-200 border-2 border-black rounded-lg font-bold animate-pulse">확인 중...</span>
                            )}
                            {authStatus === 'authenticated' && (
                                <span className="px-3 py-1 bg-[#A0E8AF] border-2 border-black rounded-lg font-bold text-black flex gap-2 items-center">
                                    <CheckCircle className="w-4 h-4" strokeWidth={2.5} /> 인증 완료
                                </span>
                            )}
                            {authStatus === 'unauthenticated' && !isPolling && (
                                <span className="px-3 py-1 bg-[#FF6B6B] border-2 border-black rounded-lg font-bold text-white flex gap-2 items-center">
                                    <XCircle className="w-4 h-4" strokeWidth={2.5} /> 미인증
                                </span>
                            )}
                            {isPolling && (
                                <span className="px-3 py-1 bg-[#FFD100] border-2 border-black rounded-lg font-bold text-black flex gap-2 items-center">
                                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} /> 로그인 대기 중...
                                </span>
                            )}
                        </div>

                        {authStatus === 'unauthenticated' && !isPolling && (
                            <button
                                onClick={handleLogin}
                                className="mt-2 w-full py-3 bg-black text-white font-bold text-lg rounded-xl border-4 border-black hover:bg-[#FFD100] hover:text-black transition-colors"
                            >
                                로그인 터미널 열기
                            </button>
                        )}
                        {isPolling && (
                            <p className="text-sm text-center font-bold text-gray-500 mt-2">
                                열려있는 터미널 창에서 브라우저 인증을 완료해주세요.
                            </p>
                        )}
                    </div>

                    {/* App Settings Section (P2-22) */}
                    <div className="border-4 border-black p-5 rounded-xl bg-gray-50 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#FFE066] border-2 border-black rounded-lg flex items-center justify-center"><Wrench className="w-6 h-6 text-black" strokeWidth={2.5} /></div>
                            <div>
                                <h3 className="text-xl font-bold text-black">앱 설정</h3>
                                <p className="text-sm font-medium text-gray-600 mt-1">API 연결, 언어, 자동저장 등 앱 동작을 설정합니다.</p>
                            </div>
                        </div>

                        <div className="border-t-4 border-dashed border-gray-300 my-2"></div>

                        {/* API URL */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="settings-api-url" className="font-bold text-sm text-black">API URL</label>
                            <input
                                id="settings-api-url"
                                type="text"
                                value={appSettings.apiUrl}
                                onChange={(e) => updateAppSettings({ apiUrl: e.target.value })}
                                placeholder="http://localhost:8000"
                                className="w-full px-3 py-2.5 border-4 border-black rounded-lg font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100] focus:ring-offset-2 shadow-[2px_2px_0_0_#000]"
                            />
                        </div>

                        {/* Language */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="settings-language" className="font-bold text-sm text-black">언어 (Language)</label>
                            <select
                                id="settings-language"
                                value={appSettings.language}
                                onChange={(e) => updateAppSettings({ language: e.target.value as AppLanguage })}
                                className="w-full px-3 py-2.5 border-4 border-black rounded-lg font-bold text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100] focus:ring-offset-2 shadow-[2px_2px_0_0_#000] appearance-none cursor-pointer"
                            >
                                {LANGUAGE_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Auto-Save Interval */}
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="settings-autosave" className="font-bold text-sm text-black">자동저장 간격 (초)</label>
                            <input
                                id="settings-autosave"
                                type="number"
                                min={5}
                                max={600}
                                value={appSettings.autoSaveInterval}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val) && val >= 5 && val <= 600) {
                                        updateAppSettings({ autoSaveInterval: val });
                                    }
                                }}
                                className="w-full px-3 py-2.5 border-4 border-black rounded-lg font-mono text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FFD100] focus:ring-offset-2 shadow-[2px_2px_0_0_#000]"
                            />
                        </div>

                        {/* Notifications Toggle */}
                        <div className="flex items-center justify-between">
                            <label htmlFor="settings-notifications" className="font-bold text-sm text-black">알림 활성화</label>
                            <button
                                id="settings-notifications"
                                role="switch"
                                aria-checked={appSettings.notificationsEnabled}
                                onClick={() => updateAppSettings({ notificationsEnabled: !appSettings.notificationsEnabled })}
                                className={`relative w-14 h-8 border-4 border-black rounded-full transition-colors shadow-[2px_2px_0_0_#000] ${
                                    appSettings.notificationsEnabled ? 'bg-[#A0E8AF]' : 'bg-gray-300'
                                }`}
                            >
                                <span
                                    className={`absolute top-0.5 w-5 h-5 bg-white border-2 border-black rounded-full transition-transform ${
                                        appSettings.notificationsEnabled ? 'translate-x-6' : 'translate-x-0.5'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
