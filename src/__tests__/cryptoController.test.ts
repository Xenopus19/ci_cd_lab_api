import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

async function loadApp() {
    vi.resetModules();
    const { default: app } = await import('../app');
    return app;
}

describe('crypto router', () => {
    it('encrypts and decrypts text using the generated key pair', async () => {
        const app = await loadApp();
        const keyResponse = await request(app).post('/api/crypto-keys/generate/rsa-keys');
        const id = keyResponse.body.id;
        const plaintext = 'Sensitive message';

        const encryptionResponse = await request(app)
            .post('/api/crypto-keys/encrypt')
            .send({ id, plaintext });

        expect(encryptionResponse.status).toBe(200);
        expect(encryptionResponse.body.ciphertext).toBeTypeOf('string');

        const decryptionResponse = await request(app)
            .post('/api/crypto-keys/decrypt')
            .send({ id, ciphertext: encryptionResponse.body.ciphertext });

        expect(decryptionResponse.status).toBe(200);
        expect(decryptionResponse.body).toEqual({ plaintext });
    });

    it('rejects invalid encryption input', async () => {
        const app = await loadApp();
        const response = await request(app)
            .post('/api/crypto-keys/encrypt')
            .send({ id: '1', plaintext: 'message' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('A positive integer id and string plaintext are required.');
    });
});
