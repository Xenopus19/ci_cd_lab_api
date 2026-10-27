import { constants, publicEncrypt, randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { decrypt, encrypt, generateKey } from '../../packages/aesEncryption/src/index';

const baseUrl = process.env.SERVER_URL ?? 'http://localhost:3000';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers }
    });
    const body = await response.json();
    if (!response.ok) {
        throw new Error(`${response.status} ${JSON.stringify(body)}`);
    }
    return body as T;
}

async function sendMessage(message: string): Promise<void> {
    // a. Public key (a fresh RSA key pair is generated on the server)
    const { id: rsaId } = await request<{ id: number }>('/api/crypto-keys/generate/rsa-keys', { method: 'POST' });
    const { publicKey } = await request<{ publicKey: string }>(`/api/crypto-keys/rsa-public-key/${rsaId}`);

    // b, c. Secret key (the AES IV is random per message and embedded in the ciphertext) and session number
    const secretKey = generateKey();
    const sessionId = randomUUID();

    // d. Send the secret key encrypted with RSA
    const encryptedKey = publicEncrypt(
        { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(secretKey, 'utf8')
    ).toString('base64');
    await request('/api/secure/session', {
        method: 'POST',
        headers: { 'x-rsa-id': String(rsaId), 'x-session-id': sessionId },
        body: JSON.stringify({ encryptedKey })
    });

    // f. Send the AES-encrypted message
    const response = await request<{ ciphertext: string }>('/api/secure/message', {
        method: 'POST',
        headers: { 'x-session-id': sessionId },
        body: JSON.stringify({ ciphertext: encrypt(secretKey, message) })
    });

    // h. Decrypt and display
    console.log(`Session: ${sessionId} (RSA key id: ${rsaId})`);
    console.log(`Server response: ${decrypt(secretKey, response.ciphertext)}`);
}

async function main(): Promise<void> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    while (true) {
        let message: string;
        try {
            message = (await rl.question('Enter a message (empty to exit): ')).trim();
        } catch {
            break; // stdin closed
        }
        if (!message) break;
        try {
            await sendMessage(message);
        } catch (error: unknown) {
            console.error('Error:', error instanceof Error ? error.message : error);
        }
    }
    rl.close();
}

main();
