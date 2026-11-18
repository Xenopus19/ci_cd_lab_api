import { afterEach, describe, expect, it, vi } from 'vitest';
import { TokenProvider } from '../../client-app/src/tokenProvider';

describe('console client credentials', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('sends form-encoded credentials, reuses the token and replaces it at expiration', async () => {
        const now = 1_000_000;
        const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
        const fetchMock = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ access_token: 'first', expires_in: 10 }))
            .mockResolvedValueOnce(Response.json({ access_token: 'second', expires_in: 10 }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = new TokenProvider('http://keycloak/token', 'client:id', 's e+cret');

        expect(await provider.getToken()).toBe('first');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('http://keycloak/token');
        expect(init?.method).toBe('POST');
        const headers = new Headers(init?.headers);
        expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
        expect(headers.get('authorization')).toBe(`Basic ${Buffer.from('client%3Aid:s+e%2Bcret').toString('base64')}`);
        expect(String(init?.body)).toBe('grant_type=client_credentials');

        clock.mockReturnValue(now + 9_999);
        expect(await provider.getToken()).toBe('first');
        clock.mockReturnValue(now + 10_000);
        expect(await provider.getToken()).toBe('second');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('surfaces failures and does not cache invalid responses', async () => {
        const fetchMock = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(Response.json({ error: 'invalid_client' }, { status: 401 }))
            .mockResolvedValueOnce(Response.json({ access_token: 'bad' }))
            .mockResolvedValueOnce(Response.json({ access_token: 'good', expires_in: 60 }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = new TokenProvider('http://keycloak/token', 'client', 'secret');
        await expect(provider.getToken()).rejects.toThrow('Token request failed with status 401.');
        await expect(provider.getToken()).rejects.toThrow('Token response must contain');
        await expect(provider.getToken()).resolves.toBe('good');
    });

    it('does not use a token that expired while the request was in flight', async () => {
        const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
        vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
            clock.mockReturnValue(2_000);
            return Response.json({ access_token: 'expired', expires_in: 1 });
        }));
        const provider = new TokenProvider('http://keycloak/token', 'client', 'secret');
        await expect(provider.getToken()).rejects.toThrow('Token expired before it could be used.');
    });
});
