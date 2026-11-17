import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecureClient } from '../../browser-client/src/secureClient';
import app from '../app';

describe('browser secure client', () => {
    let server: Server;
    let client: SecureClient;
    let messageRequests: number;
    let forcedError: { status: number; error: string } | undefined;

    beforeEach(async () => {
        messageRequests = 0;
        forcedError = undefined;
        const testApp = express();
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
        client = new SecureClient(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
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
