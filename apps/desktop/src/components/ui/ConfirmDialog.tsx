import React, { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'default';
    onConfirm: () => void;
    onCancel: () => void;
}

const VARIANT_STYLES = {
    danger: {
        headerBg: 'bg-[#FF6B6B]',
        confirmBg: 'bg-[#FF6B6B] text-white',
        iconColor: 'text-white',
    },
    warning: {
        headerBg: 'bg-[#FFD100]',
        confirmBg: 'bg-[#FFD100] text-black',
        iconColor: 'text-black',
    },
    default: {
        headerBg: 'bg-[#60A5FA]',
        confirmBg: 'bg-[#60A5FA] text-white',
        iconColor: 'text-white',
    },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'danger',
    onConfirm,
    onCancel,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelBtnRef = useRef<HTMLButtonElement>(null);
    const style = VARIANT_STYLES[variant];

    // Focus trap + ESC handler
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCancel();
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
        [onCancel],
    );

    useEffect(() => {
        if (!open) return;
        document.addEventListener('keydown', handleKeyDown);
        // Auto-focus cancel button for safety
        cancelBtnRef.current?.focus();
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-desc"
                className="w-full max-w-sm bg-white border-4 border-black rounded-2xl shadow-[6px_6px_0_0_#000] overflow-hidden"
            >
                {/* Header */}
                <div className={`${style.headerBg} border-b-4 border-black p-4 flex items-center gap-3`}>
                    <AlertTriangle className={`w-6 h-6 ${style.iconColor}`} strokeWidth={2.5} />
                    <h3 id="confirm-dialog-title" className="font-black text-base text-black">
                        {title}
                    </h3>
                </div>

                {/* Body */}
                <div className="p-5">
                    <p id="confirm-dialog-desc" className="text-sm font-medium text-gray-700 leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-4 pt-0">
                    <button
                        ref={cancelBtnRef}
                        onClick={onCancel}
                        className="flex-1 py-2.5 text-xs font-black border-2 border-black rounded-lg bg-white shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-2.5 text-xs font-black border-2 border-black rounded-lg ${style.confirmBg} shadow-[2px_2px_0_0_#000] hover:shadow-[3px_3px_0_0_#000] active:translate-y-0.5 active:shadow-none transition-all`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
