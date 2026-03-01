/**
 * Resolves a public asset path for both Vite dev server and packaged Electron (file:// protocol).
 *
 * In dev: Vite serves `/assets/foo.png` from the public directory — works as-is.
 * In packaged Electron: `file://` loads `index.html` from the `dist/` folder.
 *   Absolute paths like `/assets/foo.png` resolve to the filesystem root (e.g. `C:\assets\foo.png`),
 *   so we convert them to `./assets/foo.png` which resolves relative to `index.html`.
 *
 * Usage:
 *   import { assetPath } from '@/lib/assetPath';
 *   <img src={assetPath('/assets/characters/foo.png')} />
 *   PIXI.Assets.load(assetPath('/sprites/iso/otter-nw.png'))
 */
export function assetPath(absolutePath: string): string {
    // Already relative — return as-is
    if (absolutePath.startsWith('./') || absolutePath.startsWith('../')) {
        return absolutePath;
    }

    // In packaged Electron (file:// protocol), make path relative to index.html
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
        return '.' + absolutePath;
    }

    // Dev server or web deployment — absolute path works fine
    return absolutePath;
}
