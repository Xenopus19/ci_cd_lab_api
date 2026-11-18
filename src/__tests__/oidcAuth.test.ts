import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SecureClient as NodeSecureClient } from '../../client-app/src/secureClient';
import { SecureClient as BrowserSecureClient } from '../../browser-client/src/secureClient';

describe('OIDC bearer authentication', () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    let issuer: string;
    let server: Server;
    let app: typeof import('../app').default;
    let discoveryRequests = 0;
    let keyRequests = 0;
    const previousIssuer = process.env.OIDC_ISSUER;
    const previousSpaOrigin = process.env.SPA_ORIGIN;

    function token(claims: Record<string, unknown> = {}, key: KeyObject = keys.privateKey): string {
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const header = encode({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
        const payload = encode({
            iss: issuer, aud: 'lab-api', sub: 'user',
            exp: Math.floor(Date.now() / 1000) + 3600, ...claims
        });
        const input = `${header}.${payload}`;
        return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
    }

    beforeAll(async () => {
        server = createServer((req, res) => {
            res.setHeader('content-type', 'application/json');
            if (req.url === '/realms/oidc-lab/.well-known/openid-configuration') {
                discoveryRequests++;
                res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/certs` }));
            } else if (req.url === '/realms/oidc-lab/certs') {
                keyRequests++;
                res.end(JSON.stringify({ keys: [{ ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }] }));
            } else {
                res.statusCode = 404;
                res.end('{}');
            }
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/realms/oidc-lab`;
        process.env.OIDC_ISSUER = issuer;
        process.env.SPA_ORIGIN = 'https://spa.example.com';
        vi.resetModules();
        app = (await import('../app')).default;
    });

    afterAll(async () => {
        if (previousIssuer === undefined) delete process.env.OIDC_ISSUER;
        else process.env.OIDC_ISSUER = previousIssuer;
        if (previousSpaOrigin === undefined) delete process.env.SPA_ORIGIN;
        else process.env.SPA_ORIGIN = previousSpaOrigin;
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it('requires a bearer token on every API route, including legacy and unknown routes', async () => {
        const routes = [
            request(app).post('/api/crypto-keys/generate/rsa-keys'),
            request(app).get('/api/crypto-keys/rsa-public-key/1'),
            request(app).post('/api/crypto-keys/encrypt'),
            request(app).post('/api/crypto-keys/decrypt'),
            request(app).post('/api/secure/session'),
            request(app).post('/api/secure/message'),
            request(app).get('/api/sessions'),
            request(app).get('/api/cats'),
            request(app).post('/api/auth/register'),
            request(app).post('/api/auth/login'),
            request(app).get('/api/auth/me'),
            request(app).post('/api/auth/logout'),
            request(app).get('/api/future-route'),
        ];
        for (const route of routes) expect((await route).status).toBe(401);
    });

    it('handles CORS preflights before authentication for the configured SPA', async () => {
        const response = await request(app).options('/api/secure/session')
            .set('Origin', 'https://spa.example.com')
            .set('Access-Control-Request-Method', 'POST')
            .set('Access-Control-Request-Headers', 'authorization,content-type,x-rsa-id,x-session-id,x-local-authorization');
        expect(response.status).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBe('https://spa.example.com');
        for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
            expect(response.headers['access-control-allow-methods']).toContain(method);
        }
        for (const header of ['authorization', 'content-type', 'x-rsa-id', 'x-session-id', 'x-local-authorization']) {
            expect(response.headers['access-control-allow-headers']?.toLowerCase()).toContain(header);
        }
        const unauthorized = await request(app).get('/api/sessions').set('Origin', 'https://spa.example.com');
        expect(unauthorized.status).toBe(401);
        expect(unauthorized.headers['access-control-allow-origin']).toBe('https://spa.example.com');
        const otherOrigin = await request(app).options('/api/secure/session')
            .set('Origin', 'https://other.example.com').set('Access-Control-Request-Method', 'POST');
        expect(otherOrigin.headers['access-control-allow-origin']).not.toBe('https://other.example.com');
        const authenticated = await request(app).get('/api/sessions')
            .set('Origin', 'https://spa.example.com').set('Authorization', `Bearer ${token()}`);
        expect(authenticated.status).toBe(200);
        expect(authenticated.headers['access-control-allow-origin']).toBe('https://spa.example.com');
    });

    it('accepts a signed realm token and discovers the realm keys', async () => {
        const response = await request(app).get('/api/sessions').set('Authorization', `Bearer ${token({ aud: ['other', 'lab-api'] })}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
        expect(discoveryRequests).toBeGreaterThan(0);
        expect(keyRequests).toBeGreaterThan(0);
    });

    it('rejects invalid signatures, issuer, audience, expiration, and malformed tokens', async () => {
        const badTokens = [
            token({}, otherKeys.privateKey),
            token({ iss: `${issuer}/wrong` }),
            token({ aud: ['other'] }),
            token({ aud: undefined }),
            token({ exp: Math.floor(Date.now() / 1000) - 1 }),
            token({ exp: Math.floor(Date.now() / 1000) }),
            token({ exp: undefined }),
            'not-a-jwt',
        ];
        for (const badToken of badTokens) {
            expect((await request(app).get('/api/sessions').set('Authorization', `Bearer ${badToken}`)).status).toBe(401);
        }
    });

    it('allows valid tokens through the common policy to the route handlers', async () => {
        const bearer = `Bearer ${token()}`;
        const generated = await request(app).post('/api/crypto-keys/generate/rsa-keys').set('Authorization', bearer);
        expect(generated.status).toBe(201);
        expect((await request(app).get(`/api/crypto-keys/rsa-public-key/${generated.body.id}`).set('Authorization', bearer)).status).toBe(200);
        expect((await request(app).post('/api/secure/session').set('Authorization', bearer).send({})).status).toBe(400);
        expect((await request(app).post('/api/secure/message').set('Authorization', bearer).send({})).status).toBe(400);
        expect((await request(app).get('/api/cats').set('Authorization', bearer)).status).toBe(200);
    });

    it('requires both the realm token and the local token for legacy profile operations', async () => {
        const bearer = `Bearer ${token()}`;
        const registered = await request(app).post('/api/auth/register')
            .set('Authorization', bearer).send({ name: 'OIDC test user', password: 'secret1' });
        expect(registered.status).toBe(201);
        const localToken = `Bearer ${registered.body.token}`;
        expect((await request(app).get('/api/auth/me').set('Authorization', localToken)).status).toBe(401);
        expect((await request(app).get('/api/auth/me').set('X-Local-Authorization', localToken)).status).toBe(401);
        const me = await request(app).get('/api/auth/me')
            .set('Authorization', bearer).set('X-Local-Authorization', localToken);
        expect(me.status).toBe(200);
        expect(me.body.name).toBe('OIDC test user');
        expect((await request(app).post('/api/auth/logout')
            .set('Authorization', bearer).set('X-Local-Authorization', localToken)).status).toBe(204);
        expect((await request(app).get('/api/auth/me')
            .set('Authorization', bearer).set('X-Local-Authorization', localToken)).status).toBe(401);
    });

    it('sends authenticated requests from both secure clients', async () => {
        const api = await new Promise<Server>((resolve) => {
            const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
        });
        const baseUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
        try {
            const nodeClient = new NodeSecureClient(baseUrl, token());
            const browserClient = new BrowserSecureClient(baseUrl, async () => token());
            expect(JSON.parse((await nodeClient.sendMessage('node')).reply).message).toBe('node');
            expect(JSON.parse((await browserClient.sendMessage('browser')).reply).message).toBe('browser');
            expect(await browserClient.listSessions()).toHaveLength(2);
        } finally {
            await new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
        }
    });
});
