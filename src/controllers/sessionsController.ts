import express, { type Request, type Response } from 'express';
import { listSessions } from '../services/sessionService';

const sessionsRouter = express.Router();

/**
 * @openapi
 * /api/sessions:
 *   get:
 *     summary: List all sessions without their encryption keys
 *     tags: [Sessions]
 *     responses:
 *       200:
 *         description: Active and expired sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 required: [sessionId, expiresAt, expired]
 *                 properties:
 *                   sessionId: { type: string }
 *                   expiresAt: { type: string, format: date-time }
 *                   expired: { type: boolean }
 */
sessionsRouter.get('/', (_req: Request, res: Response): Response => {
    return res.json(listSessions());
});

export default sessionsRouter;
