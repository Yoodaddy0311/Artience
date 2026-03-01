import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // Electron loads via file:// protocol — assets must use relative paths
    base: './',
    server: {
        port: 5173,
        strictPort: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    // Split PixiJS into its own chunk (largest dep)
                    'vendor-pixi': ['pixi.js'],
                    // Split React ecosystem
                    'vendor-react': ['react', 'react-dom'],
                    // Split Zustand + other state management
                    'vendor-state': ['zustand'],
                    // Split lucide icons
                    'vendor-icons': ['lucide-react'],
                },
            },
        },
    },
});
