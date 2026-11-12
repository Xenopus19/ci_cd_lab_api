import { constants, publicEncrypt, randomUUID, createHash } from 'node:crypto';
import { decrypt, encrypt, generateKey } from '../../packages/aesEncryption/src/index';

interface Session {
    id: string;
    rsaId: number;
    key: string;
}

class RequestError extends Error {
    constructor(public readonly status: number, public readonly body: unknown) {
        super(`${status} ${JSON.stringify(body)}`);
    }
}

export class SecureClient {
    private session: Session | undefined;

    constructor(private readonly baseUrl: string) {}

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers: { 'content-type': 'application/json', ...init.headers }
        });
        const body: unknown = await response.json();
        if (!response.ok) {
            throw new RequestError(response.status, body);
        }
        return body as T;
    }

    private async createSession(): Promise<Session> {
        const { id: rsaId } = await this.request<{ id: number }>('/api/crypto-keys/generate/rsa-keys', { method: 'POST' });
        const { publicKey } = await this.request<{ publicKey: string }>(`/api/crypto-keys/rsa-public-key/${rsaId}`);
        const key = generateKey();
        const id = randomUUID();
        const encryptedKey = publicEncrypt(
            { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
            Buffer.from(key, 'utf8')
        ).toString('base64');
        await this.request('/api/secure/session', {
            method: 'POST',
            headers: { 'x-rsa-id': String(rsaId), 'x-session-id': id },
            body: JSON.stringify({ encryptedKey })
        });
        return { id, rsaId, key };
    }

    private async sendWithSession(session: Session, message: string): Promise<string> {
        const hash = createHash('sha256').update(message).digest('hex');
        const response = await this.request<{ ciphertext: string }>('/api/secure/message', {
            method: 'POST',
            headers: { 'x-session-id': session.id },
            body: JSON.stringify({ ciphertext: encrypt(session.key, message), hash })
        });
        return decrypt(session.key, response.ciphertext);
    }

    async sendMessage(message: string): Promise<{ sessionId: string; rsaId: number; reply: string }> {
        let session = this.session ?? await this.createSession();
        this.session = session;
        let reply: string;
        try {
            reply = await this.sendWithSession(session, message);
        } catch (error: unknown) {
            if (!(error instanceof RequestError) || error.status !== 440 ||
                typeof error.body !== 'object' || error.body === null ||
                !('error' in error.body) || error.body.error !== 'Session expired.') {
                throw error;
            }
            console.log('Session expired, creating a new session.');
            this.session = undefined;
            session = await this.createSession();
            this.session = session;
            try {
                reply = await this.sendWithSession(session, message);
            } catch (retryError: unknown) {
                this.session = undefined;
                throw retryError;
            }
        }
        return { sessionId: session.id, rsaId: session.rsaId, reply };
    }
}
