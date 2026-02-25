import React from 'react';

export interface ButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    className?: string;
    type?: 'button' | 'submit';
}

export const Button: React.FC<ButtonProps> = ({
    children,
    onClick,
    variant = 'primary',
    size = 'md',
    disabled = false,
    className = '',
    type = 'button',
}) => {
    const baseStyles = [
        'inline-flex items-center justify-center',
        'font-bold',
        'rounded-lg',
        'transition-all duration-150',
        'cursor-pointer',
        'select-none',
    ].join(' ');

    const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
        primary: [
            'bg-yellow-300 text-black',
            'border-2 border-black',
            'shadow-[4px_4px_0_0_#000]',
            'hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000]',
            'active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]',
        ].join(' '),
        secondary: [
            'bg-white text-black',
            'border-2 border-black',
            'shadow-[4px_4px_0_0_#000]',
            'hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000]',
            'active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]',
        ].join(' '),
        danger: [
            'bg-red-400 text-white',
            'border-2 border-black',
            'shadow-[4px_4px_0_0_#000]',
            'hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000]',
            'active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]',
        ].join(' '),
        ghost: [
            'bg-transparent text-black',
            'border-2 border-black',
            'hover:-translate-y-0.5',
            'active:translate-y-0.5',
        ].join(' '),
    };

    const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-6 py-3 text-[15px]',
        lg: 'px-8 py-4 text-lg',
    };

    const disabledStyles = disabled
        ? 'opacity-50 cursor-not-allowed pointer-events-none'
        : '';

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabledStyles} ${className}`}
        >
            {children}
        </button>
    );
};
