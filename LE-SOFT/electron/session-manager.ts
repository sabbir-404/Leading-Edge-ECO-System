/**
 * session-manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Trusted Main-Process Session Store for LESOFT.
 * 
 * Guarantees:
 *  - Maintains verified user identity and role in the Electron Main process.
 *  - Never trusts client-side role or user spoofing from the renderer.
 *  - Automatically updated on login, logout, and offline session restore.
 */

export interface UserSession {
    userId: number;
    username: string;
    fullName: string;
    role: string;
    permissions: Record<string, boolean>;
    loginTime: string;
}

let activeUserSession: UserSession | null = null;

export class SessionManager {
    /**
     * Sets the active authenticated user session in the Main Process.
     */
    public static setSession(user: {
        id: number;
        username: string;
        full_name?: string | null;
        role?: string | null;
        permissions?: Record<string, boolean> | null;
    }): UserSession {
        activeUserSession = {
            userId: user.id,
            username: user.username,
            fullName: user.full_name || user.username,
            role: user.role || 'operator',
            permissions: user.permissions || {},
            loginTime: new Date().toISOString()
        };
        return activeUserSession;
    }

    /**
     * Retrieves the current authenticated session.
     */
    public static getSession(): UserSession | null {
        return activeUserSession;
    }

    /**
     * Clears the active session on logout or lock.
     */
    public static clearSession(): void {
        activeUserSession = null;
    }

    /**
     * Helper to verify if the active user has a specific role or capability.
     */
    public static hasCapability(capability: string): boolean {
        if (!activeUserSession) return false;
        const role = activeUserSession.role.toLowerCase();
        if (role === 'superadmin' || role === 'admin') return true;
        return !!activeUserSession.permissions[capability];
    }
}
