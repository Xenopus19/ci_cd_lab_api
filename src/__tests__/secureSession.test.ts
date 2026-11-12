import { createHash, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureClient } from '../../client-app/src/secureClient';
import { encrypt, generateKey } from '../../packages/aesEncryption/src/index';
import app from '../app';
import { requireSession } from '../middleware/requireSession';
import { encrypt as rsaEncrypt, generateRsaKeyPair } from '../services/rsaService';
import { storeSession, type Session } from '../services/sessionService';

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

    it('lists active and expired sessions and rejects expired sessions repeatedly', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const empty = await request(app).get('/api/sessions');
        expect(empty.status).toBe(200);
        expect(empty.body).toEqual([]);
        const rsaId = await generateRsaKeyPair();
        const sessionId = randomUUID();
        const key = generateKey();
        const registration = await request(app).post('/api/secure/session')
            .set('x-rsa-id', String(rsaId))
            .set('x-session-id', sessionId)
            .send({ encryptedKey: rsaEncrypt(rsaId, key) });
        expect(registration.status).toBe(201);

        const active = await request(app).get('/api/sessions');
        expect(active.body).toHaveLength(1);
        expect(active.body[0]).toEqual({
            sessionId,
            expiresAt: expect.any(String),
            expired: false
        });
        const deadline = new Date(active.body[0].expiresAt).getTime();

        const send = () => request(app).post('/api/secure/message')
            .set('x-session-id', sessionId)
            .send({ ciphertext: encrypt(key, 'hello'), hash: createHash('sha256').update('hello').digest('hex') });
        clock.mockReturnValue(deadline - 1);
        expect((await send()).status).toBe(200);
        clock.mockReturnValue(deadline);
        const listed = await request(app).get('/api/sessions');
        expect(listed.body).toEqual([{ sessionId, expiresAt: new Date(deadline).toISOString(), expired: true }]);
        const expired = await send();
        expect(expired.status).toBe(440);
        expect(expired.body).toEqual({ error: 'Session expired.' });
        const expiredAgain = await send();
        expect(expiredAgain.status).toBe(440);
        expect(expiredAgain.body).toEqual({ error: 'Session expired.' });
        expect((await request(app).get('/api/sessions')).body).toEqual(listed.body);
        expect((await request(app).post('/api/secure/message')
            .set('x-session-id', randomUUID())
            .send({ ciphertext: 'unused' })).status).toBe(404);
    });

    it('validates the hash of the decrypted message', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(Date.now());
        const rsaId = await generateRsaKeyPair();
        const sessionId = randomUUID();
        const key = generateKey();
        const registration = await request(app).post('/api/secure/session')
            .set('x-rsa-id', String(rsaId))
            .set('x-session-id', sessionId)
            .send({ encryptedKey: rsaEncrypt(rsaId, key) });
        expect(registration.status).toBe(201);

        const message = 'Hello, світ!';
        const ciphertext = encrypt(key, message);
        const send = (body: object) => request(app).post('/api/secure/message')
            .set('x-session-id', sessionId)
            .send(body);
        const hash = createHash('sha256').update(message).digest('hex');
        expect((await send({ ciphertext, hash })).status).toBe(200);
        const ciphertextHash = createHash('sha256').update(ciphertext).digest('hex');
        const mismatch = await send({ ciphertext, hash: ciphertextHash });
        expect(mismatch.status).toBe(400);
        expect(mismatch.body).toEqual({ error: 'Hash mismatch.' });
        const missing = await send({ ciphertext });
        expect(missing.status).toBe(400);
        expect(missing.body).toEqual({ error: 'Hash is required.' });
        const invalid = await send({ ciphertext: 'invalid', hash });
        expect(invalid.status).toBe(400);
        expect(invalid.body.error).toBe('Message decryption error');
    });

    it('reuses session middleware on multiple routes', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const sessionId = randomUUID();
        storeSession(sessionId, generateKey(), new Date(now + 1000));
        const protectedApp = express();
        const handler = (_req: Request, res: Response<unknown, { session: Session }>) =>
            res.json({ sessionId: res.locals.session.sessionId });
        protectedApp.get('/first', requireSession, handler);
        protectedApp.get('/second', requireSession, handler);

        for (const path of ['/first', '/second']) {
            const response = await request(protectedApp).get(path).set('x-session-id', sessionId);
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ sessionId });
        }
        const missing = await request(protectedApp).get('/first');
        expect(missing.status).toBe(400);
        expect(missing.body).toEqual({ error: 'x-session-id header is required.' });
        const unknown = await request(protectedApp).get('/first').set('x-session-id', randomUUID());
        expect(unknown.status).toBe(404);
        expect(unknown.body).toEqual({ error: 'Unknown session.' });
        clock.mockReturnValue(now + 1000);
        const expired = await request(protectedApp).get('/second').set('x-session-id', sessionId);
        expect(expired.status).toBe(440);
        expect(expired.body).toEqual({ error: 'Session expired.' });
    });

    it('validates message input before looking up the session', async () => {
        const missingHeader = await request(app).post('/api/secure/message').send({ ciphertext: 'unused' });
        const missingCiphertext = await request(app).post('/api/secure/message')
            .set('x-session-id', randomUUID()).send({});
        for (const response of [missingHeader, missingCiphertext]) {
            expect(response.status).toBe(400);
            expect(response.body).toEqual({ error: 'x-session-id header and ciphertext are required.' });
        }
    });

    it('reuses a session, renews it on expiry, and continues with the new key', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const realFetch = globalThis.fetch;
        const messageStatuses: number[] = [];
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
            const response = await realFetch(input, init);
            if (String(input).endsWith('/api/secure/message')) {
                messageStatuses.push(response.status);
            }
            return response;
        }));
        const client = new SecureClient(baseUrl);
        const first = await client.sendMessage('first');
        const second = await client.sendMessage('second');
        expect(second.sessionId).toBe(first.sessionId);
        expect(JSON.parse(second.reply).message).toBe('second');

        const sessions = await request(app).get('/api/sessions');
        const firstSession = sessions.body.find((session: { sessionId: string }) => session.sessionId === first.sessionId);
        expect(firstSession).toBeDefined();
        clock.mockReturnValue(new Date(firstSession.expiresAt).getTime());
        const renewed = await client.sendMessage('after expiry');
        expect(renewed.sessionId).not.toBe(first.sessionId);
        expect(renewed.rsaId).not.toBe(first.rsaId);
        expect(JSON.parse(renewed.reply).message).toBe('after expiry');
        expect(messageStatuses).toContain(440);
        const afterRenewal = await request(app).get('/api/sessions');
        expect(afterRenewal.body).toEqual(expect.arrayContaining([
            expect.objectContaining({ sessionId: first.sessionId, expired: true }),
            expect.objectContaining({ sessionId: renewed.sessionId, expired: false })
        ]));
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
                return Response.json({ error: 'Session expired.' }, { status: 440 });
            }
            return realFetch(input, init);
        });
        vi.stubGlobal('fetch', fetchSpy);
        const client = new SecureClient(baseUrl);
        await expect(client.sendMessage('hello')).rejects.toThrow('440 {"error":"Session expired."}');
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/session'))).toHaveLength(2);
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/message'))).toHaveLength(2);
    });

    it('does not renew for a 404 with an expiration message', async () => {
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
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/session'))).toHaveLength(1);
        expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/api/secure/message'))).toHaveLength(1);
    });
});
