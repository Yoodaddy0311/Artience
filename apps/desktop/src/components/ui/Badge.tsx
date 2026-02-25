import React from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
    children: React.ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    size = 'md',
    className = '',
}) => {
    const baseStyles = 'inline-flex items-center font-bold border-2 border-black rounded-lg';

    const variants: Record<BadgeVariant, string> = {
        default: 'bg-gray-100 text-black',
        success: 'bg-green-300 text-black',
        warning: 'bg-yellow-300 text-black',
        error: 'bg-red-300 text-black',
        info: 'bg-blue-300 text-black',
    };

    const sizes: Record<BadgeSize, string> = {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-3 py-1 text-sm',
    };

    return (
        <span
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        >
            {children}
        </span>
    );
};
