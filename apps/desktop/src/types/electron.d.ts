interface DogbaTerminalApi {
    create(cols: number, rows: number): Promise<string>;
    write(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    destroy(id: string): void;
    onData(callback: (id: string, data: string) => void): () => void;
    onExit(callback: (id: string, exitCode: number) => void): () => void;
}

interface DogbaApi {
    app: {
        getVersion: () => string | undefined;
    };
    terminal: DogbaTerminalApi;
}

declare global {
    interface Window {
        dogbaApi?: DogbaApi;
    }
}

export {};
