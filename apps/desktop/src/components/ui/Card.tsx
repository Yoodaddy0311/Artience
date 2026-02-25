import React from 'react';

export interface CardProps {
    children: React.ReactNode;
    title?: string;
    className?: string;
    onClick?: () => void;
    hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    title,
    className = '',
    onClick,
    hoverable = false,
}) => {
    const baseStyles = [
        'bg-white',
        'border-2 border-black',
        'rounded-lg',
        'shadow-[4px_4px_0_0_#000]',
        'p-4',
    ].join(' ');

    const hoverStyles = hoverable
        ? 'hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000] transition-all duration-150 cursor-pointer'
        : '';

    return (
        <div
            className={`${baseStyles} ${hoverStyles} ${className}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            } : undefined}
        >
            {title && (
                <h3 className="font-black text-black text-lg mb-3 border-b-2 border-black pb-2">
                    {title}
                </h3>
            )}
            {children}
        </div>
    );
};
