import express, { type NextFunction, type Request, type Response } from 'express';
import { decrypt as aesDecrypt, encrypt as aesEncrypt } from '../../packages/aesEncryption/src/index';
import { decrypt as rsaDecrypt } from '../services/rsaService';
import { storeSession, type Session } from '../services/sessionService';
import { requireSession } from '../middleware/requireSession';
import { isHashValid } from '../utils/hash';

const SESSION_DURATION_MS = 1000;
const secureRouter = express.Router();

function header(req: Request, name: string): string | undefined {
    const value = req.headers[name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * @openapi
 * /api/secure/session:
 *   post:
 *     summary: Register a symmetric session key encrypted with the server RSA public key
 *     parameters:
 *       - in: header
 *         name: x-rsa-id
 *         required: true
 *         schema: { type: integer }
 *       - in: header
 *         name: x-session-id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               encryptedKey: { type: string, description: Base64 RSA-OAEP(SHA-256) encrypted AES-256 key (base64) }
 *     responses:
 *       201: { description: Session stored }
 *       400: { description: Invalid request }
 */
secureRouter.post('/session', (req: Request, res: Response): Response => {
    const rsaId = Number(header(req, 'x-rsa-id'));
    const sessionId = header(req, 'x-session-id');
    const encryptedKey = req.body?.encryptedKey;
    if (!Number.isInteger(rsaId) || rsaId < 1 || !sessionId || typeof encryptedKey !== 'string') {
        return res.status(400).json({ error: 'x-rsa-id, x-session-id headers and encryptedKey are required.' });
    }

    try {
        const key = rsaDecrypt(rsaId, encryptedKey);
        aesEncrypt(key, '');
        storeSession(sessionId, key, new Date(Date.now() + SESSION_DURATION_MS));
        return res.status(201).json({ status: 'ok', sessionId });
    } catch (error: unknown) {
        return res.status(400).json({
            error: 'Session key error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @openapi
 * /api/secure/message:
 *   post:
 *     summary: Send an AES-256-GCM encrypted message; the reply is encrypted the same way
 *     parameters:
 *       - in: header
 *         name: x-session-id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ciphertext, hash]
 *             properties:
 *               ciphertext: { type: string }
 *               hash: { type: string, description: Hex-encoded SHA-256 hash of the plaintext message }
 *     responses:
 *       200: { description: Encrypted response }
 *       400: { description: Invalid request }
 *       404: { description: Unknown session }
 *       440: { description: Session expired }
 */
secureRouter.post('/message', (req: Request, res: Response, next: NextFunction): void => {
    const sessionId = header(req, 'x-session-id');
    const ciphertext = req.body?.ciphertext;
    if (!sessionId || typeof ciphertext !== 'string') {
        res.status(400).json({ error: 'x-session-id header and ciphertext are required.' });
        return;
    }
    next();
}, requireSession, (req: Request, res: Response<unknown, { session: Session }>): Response => {
    const ciphertext = req.body.ciphertext;
    const key = res.locals.session.key;
    const hash = req.body?.hash;
    if (typeof hash !== 'string') {
        return res.status(400).json({ error: 'Hash is required.' });
    }
    try {
        const message = aesDecrypt(key, ciphertext);
        if (!isHashValid(message, hash)) {
            return res.status(400).json({ error: 'Hash mismatch.' });
        }
        console.log('Hash is valid.');
        const reply = JSON.stringify({ message, receivedAt: new Date().toISOString() });
        return res.json({ ciphertext: aesEncrypt(key, reply) });
    } catch (error: unknown) {
        return res.status(400).json({
            error: 'Message decryption error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default secureRouter;
