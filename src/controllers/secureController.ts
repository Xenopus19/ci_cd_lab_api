import express, { type Request, type Response } from 'express';
import { decrypt as aesDecrypt, encrypt as aesEncrypt } from '../../packages/aesEncryption/src/index';
import { decrypt as rsaDecrypt } from '../services/rsaService';

const secureRouter = express.Router();

const sessions = new Map<string, string>();

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
        sessions.set(sessionId, key);
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
 *             properties:
 *               ciphertext: { type: string }
 *     responses:
 *       200: { description: Encrypted response }
 *       400: { description: Invalid request }
 *       404: { description: Unknown session }
 */
secureRouter.post('/message', (req: Request, res: Response): Response => {
    const sessionId = header(req, 'x-session-id');
    const ciphertext = req.body?.ciphertext;
    if (!sessionId || typeof ciphertext !== 'string') {
        return res.status(400).json({ error: 'x-session-id header and ciphertext are required.' });
    }

    const key = sessions.get(sessionId);
    if (!key) {
        return res.status(404).json({ error: 'Unknown session.' });
    }

    try {
        const message = aesDecrypt(key, ciphertext);
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
