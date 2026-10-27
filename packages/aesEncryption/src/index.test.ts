import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateKey } from './index';

describe('AES encryption service', () => {
    it('generates a Base64-encoded 256-bit key', () => {
        const key = generateKey();

        expect(Buffer.from(key, 'base64')).toHaveLength(32);
        expect(Buffer.from(key, 'base64').toString('base64')).toBe(key);
    });

    it.each(['Sensitive message', '', 'Unicode text: 你好 🌍'])(
        'encrypts and decrypts plaintext: %s',
        (plaintext) => {
            const key = generateKey();
            const ciphertext = encrypt(key, plaintext);

            expect(ciphertext).not.toBe(plaintext);
            expect(Buffer.from(ciphertext, 'base64').toString('base64')).toBe(ciphertext);
            expect(decrypt(key, ciphertext)).toBe(plaintext);
        }
    );

    it('uses a fresh IV for each encryption', () => {
        const key = generateKey();
        const plaintext = 'Same input';

        expect(encrypt(key, plaintext)).not.toBe(encrypt(key, plaintext));
    });

    it('rejects a ciphertext modified after encryption', () => {
        const key = generateKey();
        const ciphertext = encrypt(key, 'Authenticated message');
        const payload = Buffer.from(ciphertext, 'base64');
        const lastByteIndex = payload.length - 1;
        payload[lastByteIndex] = (payload[lastByteIndex] ?? 0) ^ 1;

        expect(() => decrypt(key, payload.toString('base64'))).toThrow();
    });

    it('rejects ciphertext encrypted with a different key', () => {
        const ciphertext = encrypt(generateKey(), 'Authenticated message');

        expect(() => decrypt(generateKey(), ciphertext)).toThrow();
    });

    it('rejects invalid Base64 keys and ciphertexts', () => {
        expect(() => encrypt('not base64!', 'message')).toThrow('Invalid base64 key');
        expect(() => decrypt(generateKey(), 'not base64!')).toThrow('Invalid base64 ciphertext');
    });

    it('rejects keys that are not 256 bits', () => {
        const shortKey = Buffer.alloc(16).toString('base64');

        expect(() => encrypt(shortKey, 'message')).toThrow('AES-256 keys must be 32 bytes');
        expect(() => decrypt(shortKey, '')).toThrow('AES-256 keys must be 32 bytes');
    });

    it('rejects ciphertexts that are too short to contain an IV and auth tag', () => {
        expect(() => decrypt(generateKey(), Buffer.alloc(27).toString('base64'))).toThrow(
            'Ciphertext is too short'
        );
    });
});
