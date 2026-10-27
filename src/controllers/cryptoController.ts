import express, {type Request,type Response } from 'express';
import { decrypt, encrypt, generateRsaKeyPair, getRsaPublicKey } from '../services/rsaService';

const cryptoRouter = express.Router();
cryptoRouter.use(express.json());

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