import { constants, publicEncrypt } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateRsaKeyPair, getRsaPublicKey } from '../services/rsaService';

describe('crypto service', () => {
    let keyId: number;

    beforeEach(async () => {
        keyId = await generateRsaKeyPair();
    });

    it('encrypts plaintext as a Base64-encoded RSA ciphertext', () => {
        const plaintext = 'Sensitive message';
        const ciphertext = encrypt(keyId, plaintext);

        expect(ciphertext).not.toBe(plaintext);
        expect(Buffer.from(ciphertext, 'base64').toString('base64')).toBe(ciphertext);
        expect(Buffer.from(ciphertext, 'base64')).toHaveLength(256);
    });

    it('decrypts ciphertext encrypted with the corresponding public key', () => {
        const plaintext = 'Sensitive message';
        const keyPair = getRsaPublicKey(keyId);
        if (!keyPair) {
            throw new Error('Generated public key should be available');
        }

        const ciphertext = publicEncrypt(
            {
                key: keyPair.publicKey,
                padding: constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            },
            Buffer.from(plaintext, 'utf8')
        ).toString('base64');

        expect(decrypt(keyId, ciphertext)).toBe(plaintext);
    });

    it('throws when encrypting with an unknown key ID', () => {
        expect(() => encrypt(-1, 'message')).toThrow('No key pair found for ID -1');
    });

    it('throws when decrypting with an unknown key ID', () => {
        expect(() => decrypt(-1, 'Y2lwaGVydGV4dA==')).toThrow('No key pair found for ID -1');
    });
});
