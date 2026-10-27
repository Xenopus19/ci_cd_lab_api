import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const algorithm = 'aes-256-gcm';
const keyLength = 32;
const ivLength = 12;
const authTagLength = 16;

export function generateKey(): string {
    return randomBytes(keyLength).toString('base64');
}

export function encrypt(key: string, plaintext: string): string {
    const keyBytes = decodeBase64(key, 'key');
    if (keyBytes.length !== keyLength) {
        throw new Error(`AES-256 keys must be ${keyLength} bytes`);
    }

    const iv = randomBytes(ivLength);
    const cipher = createCipheriv(algorithm, keyBytes, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);

    return payload.toString('base64');
}

export function decrypt(key: string, ciphertext: string): string {
    const keyBytes = decodeBase64(key, 'key');
    if (keyBytes.length !== keyLength) {
        throw new Error(`AES-256 keys must be ${keyLength} bytes`);
    }

    const payload = decodeBase64(ciphertext, 'ciphertext');
    if (payload.length < ivLength + authTagLength) {
        throw new Error('Ciphertext is too short');
    }

    const iv = payload.subarray(0, ivLength);
    const authTag = payload.subarray(ivLength, ivLength + authTagLength);
    const encrypted = payload.subarray(ivLength + authTagLength);
    const decipher = createDecipheriv(algorithm, keyBytes, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]).toString('utf8');
}

function decodeBase64(value: string, name: string): Buffer {
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) {
        throw new Error(`Invalid base64 ${name}`);
    }

    return decoded;
}