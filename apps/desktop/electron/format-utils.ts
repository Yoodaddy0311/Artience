/**
 * Shared formatting utilities used across Electron main-process modules.
 */

/** Format milliseconds into a human-readable duration (Korean). */
export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}초`;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
        return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
    }
    return `${minutes}분`;
}
