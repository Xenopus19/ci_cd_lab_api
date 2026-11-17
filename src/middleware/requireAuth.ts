import { type NextFunction, type Request, type Response } from 'express';
import { getUserByToken, type PublicUser } from '../services/authService';

export function getBearerToken(req: Request): string | undefined {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    return match?.[1];
}

export function requireAuth(
    req: Request,
    res: Response<unknown, { user: PublicUser; token: string }>,
    next: NextFunction
): void {
    const token = getBearerToken(req);
    const user = token ? getUserByToken(token) : undefined;
    if (!token || !user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }

    res.locals.user = user;
    res.locals.token = token;
    next();
}
