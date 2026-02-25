import React, { useState, useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { AppErrorBoundary } from './components/layout/AppErrorBoundary';

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-screen bg-yellow-100">
                <h1 className="font-black text-4xl text-black mb-8 tracking-tight">
                    Dokba Studio
                </h1>
                <div className="w-64 h-6 border-2 border-black bg-white rounded-sm overflow-hidden">
                    <div className="h-full w-full bg-black animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <AppErrorBoundary>
            <MainLayout />
        </AppErrorBoundary>
    );
};

export default App;
