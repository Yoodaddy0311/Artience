/**
 * User token authentication utilities.
 */

export interface AuthConfig {
  token: string;
  room: string;
}

/**
 * Validate token format (non-empty string).
 * Actual auth happens server-side on WS handshake.
 */
export function validateToken(token: string): boolean {
  return typeof token === "string" && token.trim().length > 0;
}

/**
 * Validate room code format (alphanumeric + hyphens, 1-50 chars).
 */
export function validateRoom(room: string): boolean {
  return /^[a-zA-Z0-9\-]{1,50}$/.test(room);
}

/**
 * Build the WebSocket URL with auth query params.
 */
export function buildWsUrl(
  serverUrl: string,
  room: string,
  token: string,
): string {
  const base = serverUrl.replace(/^http/, "ws").replace(/\/+$/, "");
  const url = new URL(`${base}/ws/town`);
  url.searchParams.set("token", token);
  url.searchParams.set("room", room);
  return url.toString();
}
