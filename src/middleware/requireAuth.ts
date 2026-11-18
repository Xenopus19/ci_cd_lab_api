import { type NextFunction, type Request, type Response } from 'express';
import { getUserByToken, type PublicUser } from '../services/authService';

function getLocalBearerToken(req: Request): string | undefined {
    const header = req.headers['x-local-authorization'];
    const match = /^Bearer (.+)$/.exec(typeof header === 'string' ? header : '');
    return match?.[1];
}

export function requireAuth(
    req: Request,
    res: Response<unknown, { user: PublicUser; token: string }>,
    next: NextFunction
): void {
    const token = getLocalBearerToken(req);
    const user = token ? getUserByToken(token) : undefined;
    if (!token || !user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }

    res.locals.user = user;
    res.locals.token = token;
    next();
}
