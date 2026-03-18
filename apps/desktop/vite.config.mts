import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const devPort = Number(process.env.DOGBA_VITE_PORT ?? '5173');

export default defineConfig({
    plugins: [react(), tailwindcss()],
    // Electron loads via file:// protocol — assets must use relative paths
    base: './',
    server: {
        port: devPort,
        strictPort: true,
        hmr: {
            host: 'localhost',
            port: devPort,
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        // AgentTown is already lazy-loaded, so allow its optional Pixi chunk
        // to be slightly larger without treating it as a regression.
        chunkSizeWarningLimit: 650,
        rollupOptions: {
            output: {
                manualChunks: {
                    // Split PixiJS into its own chunk (largest dep)
                    'vendor-pixi': ['pixi.js'],
                    // Split terminal renderer/runtime separately from app shell
                    'vendor-terminal': ['@xterm/xterm', '@xterm/addon-fit'],
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
