import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import app from '../app';

vi.mock('../middleware/requireOidcAuth', () => ({ requireOidcAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));

describe('auth API', () => {
    it('registers, reads the profile, and logs out', async () => {
        const registered = await request(app).post('/api/auth/register').send({ name: 'Alice', password: 'secret1' });
        expect(registered.status).toBe(201);
        expect(registered.body.user.name).toBe('Alice');
        expect(registered.body.user).not.toHaveProperty('passwordHash');

        const auth = { 'X-Local-Authorization': `Bearer ${registered.body.token}` };
        const me = await request(app).get('/api/auth/me').set(auth);
        expect(me.status).toBe(200);
        expect(me.body.name).toBe('Alice');

        expect((await request(app).post('/api/auth/logout').set(auth)).status).toBe(204);
        expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(401);
    });

    it('rejects invalid and duplicate registrations', async () => {
        expect((await request(app).post('/api/auth/register').send({ name: 'Bob', password: '123' })).status).toBe(400);
        await request(app).post('/api/auth/register').send({ name: 'Bob', password: 'secret1' });
        const duplicate = await request(app).post('/api/auth/register').send({ name: 'bob', password: 'secret1' });
        expect(duplicate.status).toBe(409);
    });

    it('logs in with valid credentials only', async () => {
        await request(app).post('/api/auth/register').send({ name: 'Carol', password: 'secret1' });

        const ok = await request(app).post('/api/auth/login').send({ name: 'Carol', password: 'secret1' });
        expect(ok.status).toBe(200);
        expect(typeof ok.body.token).toBe('string');

        expect((await request(app).post('/api/auth/login').send({ name: 'Carol', password: 'wrong' })).status).toBe(401);
        expect((await request(app).post('/api/auth/login').send({ name: 'Nobody', password: 'x' })).status).toBe(401);
        expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
    });

    it('requires a token for protected endpoints', async () => {
        expect((await request(app).get('/api/auth/me')).status).toBe(401);
        expect((await request(app).get('/api/auth/me').set('X-Local-Authorization', 'Bearer nope')).status).toBe(401);
    });
});
