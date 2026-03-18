import React, { useEffect } from 'react';
import { AppErrorBoundary } from './components/layout/AppErrorBoundary';
import { AuthGate } from './components/auth/AuthGate';
import { MainLayout } from './components/layout/MainLayout';

const App: React.FC = () => {
    useEffect(() => {
        window.dogbaApi?.app?.markStartup?.('react-app-mounted');
    }, []);

    return (
        <AppErrorBoundary>
            <AuthGate>
                <MainLayout />
            </AuthGate>
        </AppErrorBoundary>
    );
};

export default App;
