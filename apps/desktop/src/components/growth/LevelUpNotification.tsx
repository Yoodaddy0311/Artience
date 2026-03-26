import React, { useEffect, useRef, useState } from 'react';
import type { EvolutionStage } from '../../types/growth';

const STAGE_COLORS: Record<EvolutionStage, string> = {
    novice: '#9ca3af',
    apprentice: '#60a5fa',
    journeyman: '#22c55e',
    expert: '#f59e0b',
    master: '#ef4444',
    legendary: '#a855f7',
};

const STAGE_LABELS: Record<EvolutionStage, string> = {
    novice: 'Novice',
    apprentice: 'Apprentice',
    journeyman: 'Journeyman',
    expert: 'Expert',
    master: 'Master',
    legendary: 'Legendary',
};

interface LevelUpNotificationProps {
    readonly agentName: string;
    readonly newLevel: number;
    readonly evolutionStage: EvolutionStage;
    readonly onClose: () => void;
}

export const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({
    agentName,
    newLevel,
    evolutionStage,
    onClose,
}) => {
    const [visible, setVisible] = useState(false);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    const slideOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Trigger slide-in
        const showTimer = requestAnimationFrame(() => setVisible(true));

        // Auto-dismiss after 5 seconds
        const dismissTimer = setTimeout(() => {
            setVisible(false);
            slideOutTimerRef.current = setTimeout(
                () => onCloseRef.current(),
                300,
            );
        }, 5000);

        return () => {
            cancelAnimationFrame(showTimer);
            clearTimeout(dismissTimer);
            if (slideOutTimerRef.current)
                clearTimeout(slideOutTimerRef.current);
        };
    }, []); // stable — onClose tracked via ref

    const color = STAGE_COLORS[evolutionStage];

    return (
        <div
            className="fixed top-4 right-4 z-50 transition-all duration-300 ease-out"
            style={{
                transform: visible ? 'translateX(0)' : 'translateX(120%)',
                opacity: visible ? 1 : 0,
            }}
            role="alert"
            aria-live="polite"
        >
            <div
                className="border-2 border-black rounded-xl bg-white shadow-[4px_4px_0_0_#000] p-4 min-w-[280px]"
                style={{ borderLeftWidth: '6px', borderLeftColor: color }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                        <p className="font-black text-xs uppercase tracking-wider text-gray-500 mb-1">
                            Level Up!
                        </p>
                        <p className="font-black text-lg text-black leading-tight">
                            {agentName}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <span
                                className="font-black text-sm px-2 py-0.5 rounded-md border-2 border-black"
                                style={{ backgroundColor: color }}
                            >
                                Lv.{newLevel}
                            </span>
                            <span
                                className="text-xs font-bold px-2 py-0.5 rounded-md border border-black"
                                style={{
                                    backgroundColor: `${color}33`,
                                    color: '#000',
                                }}
                            >
                                {STAGE_LABELS[evolutionStage]}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setVisible(false);
                            slideOutTimerRef.current = setTimeout(onClose, 300);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-md border-2 border-black bg-white hover:bg-gray-100 transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                        aria-label="Close notification"
                    >
                        <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
