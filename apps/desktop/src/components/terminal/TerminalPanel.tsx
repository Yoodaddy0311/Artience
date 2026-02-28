import React, { useRef, useEffect, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export const TerminalPanel: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const termIdRef = useRef<string | null>(null);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'unavailable'>('connecting');

    useEffect(() => {
        const api = window.dogbaApi?.terminal;
        if (!api) {
            setStatus('unavailable');
            return;
        }

        const term = new Terminal({
            fontSize: 14,
            fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
            theme: {
                background: '#1e1e2e',
                foreground: '#cdd6f4',
                cursor: '#f5e0dc',
            },
            cursorBlink: true,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        terminalRef.current = term;
        fitAddonRef.current = fitAddon;

        if (containerRef.current) {
            term.open(containerRef.current);
            fitAddon.fit();
        }

        // Create PTY process
        const cols = term.cols;
        const rows = term.rows;

        api.create(cols, rows).then((id) => {
            termIdRef.current = id;
            setStatus('connected');

            // Terminal input -> PTY
            term.onData((data) => {
                api.write(id, data);
            });

            // Handle resize
            term.onResize(({ cols: c, rows: r }) => {
                api.resize(id, c, r);
            });
        }).catch(() => {
            setStatus('error');
        });

        // PTY output -> Terminal
        const removeDataListener = api.onData((id, data) => {
            if (id === termIdRef.current) {
                term.write(data);
            }
        });

        const removeExitListener = api.onExit((id, _exitCode) => {
            if (id === termIdRef.current) {
                term.write('\r\n[Process exited]\r\n');
                setStatus('error');
            }
        });

        // Resize observer
        const resizeObserver = new ResizeObserver(() => {
            fitAddon.fit();
        });
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
            removeDataListener();
            removeExitListener();
            if (termIdRef.current) {
                api.destroy(termIdRef.current);
            }
            term.dispose();
        };
    }, []);

    if (status === 'unavailable') {
        return (
            <div style={{ padding: 16, color: '#cdd6f4', backgroundColor: '#1e1e2e', height: '100%' }}>
                Terminal is only available in the Electron desktop app.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#1e1e2e' }}>
            <div style={{
                padding: '4px 12px',
                fontSize: 12,
                color: status === 'connected' ? '#a6e3a1' : '#f38ba8',
                borderBottom: '1px solid #313244',
            }}>
                Terminal {status === 'connecting' ? '(connecting...)' : status === 'error' ? '(disconnected)' : ''}
            </div>
            <div ref={containerRef} style={{ flex: 1, padding: 4 }} />
        </div>
    );
};
