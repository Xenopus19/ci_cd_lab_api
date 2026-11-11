import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureClient } from '../../client-app/src/secureClient';
import { encrypt, generateKey } from '../../packages/aesEncryption/src/index';
import cryptoRouter from '../controllers/cryptoController';
import secureRouter from '../controllers/secureController';
import { encrypt as rsaEncrypt, generateRsaKeyPair } from '../services/rsaService';

const app = express();
app.use(express.json());
app.use('/api/crypto-keys', cryptoRouter);
app.use('/api/secure', secureRouter);

describe('secure sessions', () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
        server = await new Promise<Server>((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it('expires at the exact deadline and removes the expired session', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const rsaId = await generateRsaKeyPair();
        const sessionId = randomUUID();
        const key = generateKey();
        const registration = await request(app).post('/api/secure/session')
            .set('x-rsa-id', String(rsaId))
            .set('x-session-id', sessionId)
            .send({ encryptedKey: rsaEncrypt(rsaId, key) });
        expect(registration.status).toBe(201);

        const send = () => request(app).post('/api/secure/message')
            .set('x-session-id', sessionId)
            .send({ ciphertext: encrypt(key, 'hello') });
        clock.mockReturnValue(now + 3600 * 1000 - 1);
        expect((await send()).status).toBe(200);
        clock.mockReturnValue(now + 3600 * 1000);
        const expired = await send();
        expect(expired.status).toBe(404);
        expect(expired.body).toEqual({ error: 'Session expired.' });
        expect((await send()).body).toEqual({ error: 'Unknown session.' });
    });

    it('reuses a session, renews it on expiry, and continues with the new key', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const client = new SecureClient(baseUrl);
        const first = await client.sendMessage('first');
        const second = await client.sendMessage('second');
        expect(second.sessionId).toBe(first.sessionId);
        expect(JSON.parse(second.reply).message).toBe('second');

        clock.mockReturnValue(now + 3600 * 1000);
        const renewed = await client.sendMessage('after expiry');
        expect(renewed.sessionId).not.toBe(first.sessionId);
        expect(renewed.rsaId).not.toBe(first.rsaId);
        expect(JSON.parse(renewed.reply).message).toBe('after expiry');
        const next = await client.sendMessage('next');
        expect(next.sessionId).toBe(renewed.sessionId);
        expect(JSON.parse(next.reply).message).toBe('next');
    });

    it('does not renew for unrelated errors', async () => {
        const realFetch = globalThis.fetch;
        const fetchSpy = vi.fn<typeof fetch>(async (input, init) => {
            if (String(input).endsWith('/api/secure/message')) {
                return Response.json({ error: 'Unknown session.' }, { status: 404 });
            }
            return realFetch(input, init);
        });
        vi.stubGlobal('fetch', fetchSpy);
        const client = new SecureClient(baseUrl);
        await expect(client.sendMessage('hello')).rejects.toThrow('404 {"error":"Unknown session."}');
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/session'))).toHaveLength(1);
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/message'))).toHaveLength(1);
    });

    it('retries expiration only once and surfaces the retry failure', async () => {
        const realFetch = globalThis.fetch;
        const fetchSpy = vi.fn<typeof fetch>(async (input, init) => {
            if (String(input).endsWith('/api/secure/message')) {
                return Response.json({ error: 'Session expired.' }, { status: 404 });
            }
            return realFetch(input, init);
        });
        vi.stubGlobal('fetch', fetchSpy);
        const client = new SecureClient(baseUrl);
        await expect(client.sendMessage('hello')).rejects.toThrow('404 {"error":"Session expired."}');
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/session'))).toHaveLength(2);
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/message'))).toHaveLength(2);
    });
});
