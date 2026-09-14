/**
 * Client-side storage of the user session created by
 * POST /api/sql/verifyUserPin. The token is sent as `x-user-token` on
 * deviceFetch calls and lets admin-gated routes identify the human user
 * when the shop enables `requireUserAuth`.
 */

const SESSION_KEY = 'tradiz-user-session';

export interface StoredUserSession {
    userId: number;
    token: string;
    expiresAt: string; // ISO date
}

export function getUserSession(): StoredUserSession | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as StoredUserSession;
        if (!session?.token || !session?.userId || !session?.expiresAt) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        if (Date.parse(session.expiresAt) <= Date.now()) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
        return session;
    } catch {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
}

export function setUserSession(session: StoredUserSession): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearUserSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(SESSION_KEY);
}
