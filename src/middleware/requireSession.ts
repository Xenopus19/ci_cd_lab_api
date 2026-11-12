import { type NextFunction, type Request, type Response } from 'express';
import { getSession, type Session } from '../services/sessionService';

export function requireSession(
    req: Request,
    res: Response<unknown, { session: Session }>,
    next: NextFunction
): void {
    const sessionId = req.headers['x-session-id'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
        res.status(400).json({ error: 'x-session-id header is required.' });
        return;
    }

    const session = getSession(sessionId);
    if (!session) {
        res.status(404).json({ error: 'Unknown session.' });
        return;
    }
    if (session.expired) {
        res.status(440).json({ error: 'Session expired.' });
        return;
    }

    res.locals.session = session;
    next();
}
