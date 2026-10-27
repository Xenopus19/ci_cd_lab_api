import { constants, generateKeyPair, privateDecrypt, publicEncrypt } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

interface KeyPair {
    publicKey: string;
    privateKey: string;
}

export interface PublicKey {
    id: number;
    publicKey: string;
}

const keyStorage = new Map<number, KeyPair>();
let currentId = 1;

export async function generateRsaKeyPair(): Promise<number> {
    const { publicKey, privateKey } = await generateKeyPairAsync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    const id = currentId++;
    keyStorage.set(id, { publicKey, privateKey });

    return id;
}

export function getRsaPublicKey(id: number): PublicKey | undefined {
    const keyPair = keyStorage.get(id);
    if (!keyPair) {
        return undefined;
    }

    return { id, publicKey: keyPair.publicKey };
}

export function encrypt(id: number, plaintext: string): string {
    const keyPair = keyStorage.get(id);
    if (!keyPair) {
        throw new Error(`No key pair found for ID ${id}`);
    }

    return publicEncrypt(
        {
            key: keyPair.publicKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        Buffer.from(plaintext, 'utf8')
    ).toString('base64');
}

export function decrypt(id: number, ciphertext: string): string {
    const keyPair = keyStorage.get(id);
    if (!keyPair) {
        throw new Error(`No key pair found for ID ${id}`);
    }

    return privateDecrypt(
        {
            key: keyPair.privateKey,
            padding: constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        Buffer.from(ciphertext, 'base64')
    ).toString('utf8');
}