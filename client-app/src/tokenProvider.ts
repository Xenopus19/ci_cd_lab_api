export class TokenProvider {
    private token: { value: string; expiresAt: number } | undefined;
    private pending: Promise<string> | undefined;

    constructor(
        private readonly tokenUrl: string,
        private readonly clientId: string,
        private readonly clientSecret: string
    ) {}

    async getToken(): Promise<string> {
        if (this.token && Date.now() < this.token.expiresAt) {
            return this.token.value;
        }
        if (!this.pending) {
            this.pending = this.requestToken();
        }
        try {
            return await this.pending;
        } finally {
            this.pending = undefined;
        }
    }

    private async requestToken(): Promise<string> {
        const startedAt = Date.now();
        const encode = (value: string) => new URLSearchParams({ value }).toString().slice('value='.length);
        const credentials = Buffer.from(`${encode(this.clientId)}:${encode(this.clientSecret)}`).toString('base64');
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                authorization: `Basic ${credentials}`
            },
            body: new URLSearchParams({ grant_type: 'client_credentials' })
        });
        if (!response.ok) {
            throw new Error(`Token request failed with status ${response.status}.`);
        }
        const body: unknown = await response.json();
        if (typeof body !== 'object' || body === null ||
            !('access_token' in body) || typeof body.access_token !== 'string' || !body.access_token ||
            !('expires_in' in body) || typeof body.expires_in !== 'number' ||
            !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
            throw new Error('Token response must contain an access_token and a positive expires_in.');
        }
        const expiresAt = startedAt + body.expires_in * 1000;
        if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
            throw new Error('Token expired before it could be used.');
        }
        this.token = { value: body.access_token, expiresAt };
        return this.token.value;
    }
}
