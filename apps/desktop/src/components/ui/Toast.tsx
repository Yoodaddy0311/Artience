import React, { useEffect } from 'react';
import { useAppStore, type ToastType } from '../../store/useAppStore';

const TOAST_STYLES: Record<ToastType, { bg: string; icon: string }> = {
    success: { bg: 'bg-green-200', icon: 'V' },
    error: { bg: 'bg-red-200', icon: '!' },
    info: { bg: 'bg-blue-200', icon: 'i' },
};

const DEFAULT_DURATION = 3000;

interface ToastItemProps {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

const ToastItem: React.FC<ToastItemProps> = ({ id, type, message, duration }) => {
    const removeToast = useAppStore((s) => s.removeToast);
    const style = TOAST_STYLES[type];

    useEffect(() => {
        const timer = setTimeout(() => {
            removeToast(id);
        }, duration ?? DEFAULT_DURATION);
        return () => clearTimeout(timer);
    }, [id, duration, removeToast]);

    return (
        <div
            role={type === 'error' ? 'alert' : undefined}
            className={`${style.bg} border-2 border-black shadow-[4px_4px_0_0_#000] rounded-lg px-4 py-3 flex items-center gap-3 min-w-[280px] max-w-[400px] animate-slide-in`}
        >
            <span className="w-6 h-6 flex items-center justify-center border-2 border-black rounded-md bg-white text-xs font-black flex-shrink-0">
                {style.icon}
            </span>
            <span className="text-sm font-bold text-black flex-1">{message}</span>
            <button
                onClick={() => removeToast(id)}
                className="w-6 h-6 flex items-center justify-center border-2 border-black rounded-md bg-white text-xs font-black flex-shrink-0 hover:bg-gray-100 transition-colors"
            >
                x
            </button>
        </div>
    );
};

export const ToastContainer: React.FC = () => {
    const toasts = useAppStore((s) => s.toasts);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2" role="status" aria-live="polite">
            {toasts.map((toast) => (
                <ToastItem
                    key={toast.id}
                    id={toast.id}
                    type={toast.type}
                    message={toast.message}
                    duration={toast.duration}
                />
            ))}
        </div>
    );
};
