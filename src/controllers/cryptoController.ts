import express, {type Request,type Response } from 'express';
import { decrypt, encrypt, generateRsaKeyPair, getRsaPublicKey } from '../services/rsaService';

const cryptoRouter = express.Router();
cryptoRouter.use(express.json());

/**
 * @openapi
 * /api/crypto-keys/generate/rsa-keys:
 *   post:
 *     summary: Generate an RSA key pair
 *     tags: [Crypto]
 *     responses:
 *       201:
 *         description: RSA key pair generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id]
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *       400:
 *         description: Key generation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string, example: Key generation error }
 *                 details: { type: string }
 */
cryptoRouter.post('/generate/rsa-keys', async (req: Request, res: Response): Promise<Response> => {
    try {
        const id = await generateRsaKeyPair();
        return res.status(201).json({ id });
    } catch (error: unknown) {
        return res.status(400).json({
            error: 'Key generation error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @openapi
 * /api/crypto-keys/rsa-public-key/{id}:
 *   get:
 *     summary: Get the public key for a generated RSA key pair
 *     tags: [Crypto]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Identifier returned when the key pair was generated
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: RSA public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, publicKey]
 *               properties:
 *                 id:
 *                   type: integer
 *                   example: 1
 *                 publicKey:
 *                   type: string
 *                   description: RSA public key in PEM format
 *       404:
 *         description: Invalid or unknown key identifier
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No such identifier exists.
 */
cryptoRouter.get('/rsa-public-key/:id', (req: Request, res: Response): Response => {
    const id = parseInt(String(req.params.id), 10);
    if (Number.isNaN(id)) {
        return res.status(404).json({ error: 'No such identifier exists.' });
    }

    const publicKey = getRsaPublicKey(id);
    if (!publicKey) {
        return res.status(404).json({ error: 'No such identifier exists.' });
    }

    return res.json(publicKey);
});

/**
 * @openapi
 * /api/crypto-keys/encrypt:
 *   post:
 *     summary: Encrypt plaintext using a generated RSA key pair
 *     description: Uses RSA-OAEP with SHA-256 and returns the ciphertext encoded as Base64.
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, plaintext]
 *             properties:
 *               id:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               plaintext:
 *                 type: string
 *                 example: Sensitive message
 *     responses:
 *       200:
 *         description: Plaintext encrypted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ciphertext]
 *               properties:
 *                 ciphertext:
 *                   type: string
 *                   description: Base64-encoded RSA-OAEP ciphertext
 *       400:
 *         description: Invalid input or encryption failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 details: { type: string }
 */
cryptoRouter.post('/encrypt', (req: Request, res: Response): Response => {
    const { id, plaintext } = req.body;
    if (!Number.isInteger(id) || id < 1 || typeof plaintext !== 'string') {
        return res.status(400).json({
            error: 'A positive integer id and string plaintext are required.'
        });
    }

    try {
        return res.json({ ciphertext: encrypt(id, plaintext) });
    } catch (error: unknown) {
        return res.status(400).json({
            error: 'Encryption error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * @openapi
 * /api/crypto-keys/decrypt:
 *   post:
 *     summary: Decrypt ciphertext using a generated RSA key pair
 *     description: Expects Base64-encoded ciphertext produced with RSA-OAEP and SHA-256.
 *     tags: [Crypto]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, ciphertext]
 *             properties:
 *               id:
 *                 type: integer
 *                 minimum: 1
 *                 example: 1
 *               ciphertext:
 *                 type: string
 *                 minLength: 1
 *                 description: Base64-encoded RSA-OAEP ciphertext
 *     responses:
 *       200:
 *         description: Ciphertext decrypted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [plaintext]
 *               properties:
 *                 plaintext:
 *                   type: string
 *                   example: Sensitive message
 *       400:
 *         description: Invalid input or decryption failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error: { type: string }
 *                 details: { type: string }
 */
cryptoRouter.post('/decrypt', (req: Request, res: Response): Response => {
    const { id, ciphertext } = req.body;
    if (!Number.isInteger(id) || id < 1 || typeof ciphertext !== 'string' || ciphertext.length === 0) {
        return res.status(400).json({
            error: 'A positive integer id and non-empty string ciphertext are required.'
        });
    }

    try {
        return res.json({ plaintext: decrypt(id, ciphertext) });
    } catch (error: unknown) {
        return res.status(400).json({
            error: 'Decryption error',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default cryptoRouter;