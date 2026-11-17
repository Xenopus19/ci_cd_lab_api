import express, { type Request, type Response } from 'express';
import { issueAuthToken, registerUser, revokeAuthToken, verifyCredentials, type PublicUser } from '../services/authService';
import { requireAuth } from '../middleware/requireAuth';

const authRouter = express.Router();

function readCredentials(req: Request): { name: string; password: string } | undefined {
    const { name, password } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length === 0 || typeof password !== 'string' || password.length === 0) {
        return undefined;
    }
    return { name, password };
}

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Register a new user and sign them in
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, password]
 *             properties:
 *               name: { type: string }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       201: { description: User registered; returns the user and an auth token }
 *       400: { description: Invalid input }
 *       409: { description: Name already taken }
 */
authRouter.post('/register', (req: Request, res: Response): Response => {
    const credentials = readCredentials(req);
    if (!credentials || credentials.password.length < 6) {
        return res.status(400).json({ error: 'A name and a password of at least 6 characters are required.' });
    }
    const user = registerUser(credentials.name, credentials.password);
    if (!user) {
        return res.status(409).json({ error: 'This name is already taken.' });
    }
    return res.status(201).json({ user, token: issueAuthToken(user.id) });
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Sign in with name and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, password]
 *             properties:
 *               name: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: Signed in; returns the user and an auth token }
 *       400: { description: Invalid input }
 *       401: { description: Wrong name or password }
 */
authRouter.post('/login', (req: Request, res: Response): Response => {
    const credentials = readCredentials(req);
    if (!credentials) {
        return res.status(400).json({ error: 'name and password are required.' });
    }
    const user = verifyCredentials(credentials.name, credentials.password);
    if (!user) {
        return res.status(401).json({ error: 'Invalid name or password.' });
    }
    return res.json({ user, token: issueAuthToken(user.id) });
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Get the authenticated user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: The current user }
 *       401: { description: Not authenticated }
 */
authRouter.get('/me', requireAuth, (_req: Request, res: Response<unknown, { user: PublicUser }>): Response => {
    return res.json(res.locals.user);
});

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     summary: Invalidate the current auth token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204: { description: Signed out }
 *       401: { description: Not authenticated }
 */
authRouter.post('/logout', requireAuth, (_req: Request, res: Response<unknown, { token: string }>): void => {
    revokeAuthToken(res.locals.token);
    res.status(204).end();
});

export default authRouter;
