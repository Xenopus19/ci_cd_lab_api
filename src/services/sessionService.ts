export interface Session {
    sessionId: string;
    key: string;
    expiresAt: Date;
    expired: boolean;
}

const sessions = new Map<string, Session>();

export function storeSession(sessionId: string, key: string, expiresAt: Date): void {
    sessions.set(sessionId, { sessionId, key, expiresAt, expired: false });
}

function updateExpiration(session: Session, now: number): void {
    if (session.expiresAt.getTime() <= now) {
        session.expired = true;
    }
}

export function getSession(sessionId: string): Session | undefined {
    const session = sessions.get(sessionId);
    if (session) {
        updateExpiration(session, Date.now());
    }
    return session;
}

export function listSessions(): Array<Omit<Session, 'key'>> {
    const now = Date.now();
    return Array.from(sessions.values(), (session) => {
        updateExpiration(session, now);
        return { sessionId: session.sessionId, expiresAt: session.expiresAt, expired: session.expired };
    });
}
