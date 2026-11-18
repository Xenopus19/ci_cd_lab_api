import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureClient } from '../../browser-client/src/secureClient';
import { clearExchanges, getExchanges } from '../../browser-client/src/exchangeLog';
import app from '../app';

vi.mock('../middleware/requireOidcAuth', () => ({ requireOidcAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));

describe('browser secure client', () => {
    let server: Server;
    let client: SecureClient;
    let messageRequests: number;
    let forcedError: { status: number; error: string } | undefined;

    beforeEach(async () => {
        clearExchanges();
        messageRequests = 0;
        forcedError = undefined;
        const testApp = express();
        testApp.use('/api', (req, _res, next) => {
            expect(req.headers.authorization).toBe('Bearer test-token');
            next();
        });
        testApp.use('/api/secure/message', (_req, res, next) => {
            messageRequests++;
            if (forcedError) {
                res.status(forcedError.status).json({ error: forcedError.error });
                return;
            }
            next();
        });
        testApp.use(app);
        server = await new Promise<Server>((resolve) => {
            const listener = testApp.listen(0, '127.0.0.1', () => resolve(listener));
        });
        client = new SecureClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, async () => 'test-token');
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it('encrypts Unicode messages, decrypts replies, reuses and renews sessions', async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const first = await client.sendMessage('Hello, світ! 🐈');
        expect(JSON.parse(first.reply).message).toBe('Hello, світ! 🐈');
        const second = await client.sendMessage('second');
        expect(second.sessionId).toBe(first.sessionId);
        expect(JSON.parse(second.reply).message).toBe('second');

        const firstSession = (await client.listSessions()).find((session) => session.sessionId === first.sessionId);
        expect(firstSession).toBeDefined();
        clock.mockReturnValue(new Date(firstSession!.expiresAt).getTime());
        const renewed = await client.sendMessage('after expiry');
        expect(renewed.sessionId).not.toBe(first.sessionId);
        expect(renewed.rsaId).not.toBe(first.rsaId);
        expect(JSON.parse(renewed.reply).message).toBe('after expiry');
        expect(messageRequests).toBe(4);
        const exchanges = getExchanges();
        expect(exchanges.map((exchange) => [exchange.method, new URL(exchange.url).pathname, exchange.response?.status])).toEqual([
            ['POST', '/api/crypto-keys/generate/rsa-keys', 201],
            ['GET', `/api/crypto-keys/rsa-public-key/${first.rsaId}`, 200],
            ['POST', '/api/secure/session', 201],
            ['POST', '/api/secure/message', 200],
            ['POST', '/api/secure/message', 200],
            ['GET', '/api/sessions', 200],
            ['POST', '/api/secure/message', 440],
            ['POST', '/api/crypto-keys/generate/rsa-keys', 201],
            ['GET', `/api/crypto-keys/rsa-public-key/${renewed.rsaId}`, 200],
            ['POST', '/api/secure/session', 201],
            ['POST', '/api/secure/message', 200],
        ]);
        const sentMessage = JSON.parse(exchanges[10].body!);
        expect(sentMessage).toEqual({ ciphertext: expect.any(String), hash: expect.any(String) });
        expect(exchanges[10].body).not.toContain('after expiry');
        expect(JSON.parse(exchanges[10].response!.body!)).toEqual({ ciphertext: expect.any(String) });
        expect(exchanges[10].response!.duration).toBeGreaterThanOrEqual(0);
        expect(exchanges[10].headers).toContain('Bearer [hidden]');
        expect(exchanges[10].headers).not.toContain('test-token');
        expect(JSON.parse(exchanges[2].body!).encryptedKey).toBe('[hidden]');
        expect(await client.listSessions()).toEqual(expect.arrayContaining([
            expect.objectContaining({ sessionId: first.sessionId, expired: true }),
            expect.objectContaining({ sessionId: renewed.sessionId, expired: false })
        ]));
        expect((await client.sendMessage('next')).sessionId).toBe(renewed.sessionId);
    });

    it('does not renew for unrelated errors', async () => {
        forcedError = { status: 404, error: 'Session expired.' };
        await expect(client.sendMessage('hello')).rejects.toMatchObject({ response: { status: 404 } });
        expect(messageRequests).toBe(1);
    });

    it('retries expiration only once and surfaces the failure', async () => {
        forcedError = { status: 440, error: 'Session expired.' };
        await expect(client.sendMessage('hello')).rejects.toMatchObject({ response: { status: 440 } });
        expect(messageRequests).toBe(2);
    });
});
