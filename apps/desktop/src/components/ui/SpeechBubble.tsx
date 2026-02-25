import React from 'react';

export type TailDirection = 'top' | 'bottom' | 'left' | 'right';

export interface SpeechBubbleProps {
    children: React.ReactNode;
    tail?: TailDirection;
    isAsking?: boolean;
    className?: string;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
    children,
    tail = 'bottom',
    isAsking = false,
    className = '',
}) => {
    const baseStyles = [
        'relative',
        'bg-white',
        'border-2 border-black',
        'rounded-lg',
        'shadow-[3px_3px_0_0_#000]',
        'p-3',
        'text-xs font-bold text-black',
        'max-w-[180px] leading-relaxed',
        'z-10',
    ].join(' ');

    const askingStyles = isAsking ? 'animate-pulse border-yellow-400' : '';

    return (
        <div className={`${baseStyles} ${askingStyles} ${className}`}>
            {children}

            {/* Tail: border triangle (outer) */}
            <div className={getTailOuterClasses(tail, isAsking)} />
            {/* Tail: fill triangle (inner) */}
            <div className={getTailInnerClasses(tail)} />
        </div>
    );
};

function getTailOuterClasses(direction: TailDirection, isAsking: boolean): string {
    const borderColor = isAsking ? 'border-t-yellow-400' : 'border-t-black';
    const borderColorH = isAsking ? 'border-b-yellow-400' : 'border-b-black';
    const borderColorL = isAsking ? 'border-r-yellow-400' : 'border-r-black';
    const borderColorR = isAsking ? 'border-l-yellow-400' : 'border-l-black';

    const shared = 'absolute w-0 h-0';

    switch (direction) {
        case 'bottom':
            return `${shared} -bottom-[10px] left-1/2 -translate-x-1/2 border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent border-t-[9px] ${borderColor}`;
        case 'top':
            return `${shared} -top-[10px] left-1/2 -translate-x-1/2 border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent border-b-[9px] ${borderColorH}`;
        case 'left':
            return `${shared} top-1/2 -left-[10px] -translate-y-1/2 border-t-[9px] border-b-[9px] border-t-transparent border-b-transparent border-r-[9px] ${borderColorL}`;
        case 'right':
            return `${shared} top-1/2 -right-[10px] -translate-y-1/2 border-t-[9px] border-b-[9px] border-t-transparent border-b-transparent border-l-[9px] ${borderColorR}`;
    }
}

function getTailInnerClasses(direction: TailDirection): string {
    const shared = 'absolute w-0 h-0';

    switch (direction) {
        case 'bottom':
            return `${shared} -bottom-[8px] left-1/2 -translate-x-1/2 border-l-[8px] border-r-[8px] border-l-transparent border-r-transparent border-t-[8px] border-t-white`;
        case 'top':
            return `${shared} -top-[8px] left-1/2 -translate-x-1/2 border-l-[8px] border-r-[8px] border-l-transparent border-r-transparent border-b-[8px] border-b-white`;
        case 'left':
            return `${shared} top-1/2 -left-[8px] -translate-y-1/2 border-t-[8px] border-b-[8px] border-t-transparent border-b-transparent border-r-[8px] border-r-white`;
        case 'right':
            return `${shared} top-1/2 -right-[8px] -translate-y-1/2 border-t-[8px] border-b-[8px] border-t-transparent border-b-transparent border-l-[8px] border-l-white`;
    }
}
