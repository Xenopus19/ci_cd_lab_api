import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export interface User {
    id: string;
    name: string;
    passwordHash: string;
    salt: string;
}

export interface PublicUser {
    id: string;
    name: string;
}

const AUTH_TOKEN_DURATION_MS = 60 * 60 * 1000;

const users = new Map<string, User>();
const authTokens = new Map<string, { userId: string; expiresAt: number }>();

const normalizeName = (name: string): string => name.trim().toLowerCase();

function hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
}

function toPublicUser(user: User): PublicUser {
    return { id: user.id, name: user.name };
}

export function registerUser(name: string, password: string): PublicUser | undefined {
    const key = normalizeName(name);
    if (users.has(key)) {
        return undefined;
    }
    const salt = randomBytes(16).toString('hex');
    const user: User = { id: randomUUID(), name: name.trim(), salt, passwordHash: hashPassword(password, salt) };
    users.set(key, user);
    return toPublicUser(user);
}

export function verifyCredentials(name: string, password: string): PublicUser | undefined {
    const user = users.get(normalizeName(name));
    if (!user) {
        return undefined;
    }
    const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
    const expected = Buffer.from(user.passwordHash, 'hex');
    return timingSafeEqual(actual, expected) ? toPublicUser(user) : undefined;
}

export function issueAuthToken(userId: string): string {
    const token = randomBytes(32).toString('hex');
    authTokens.set(token, { userId, expiresAt: Date.now() + AUTH_TOKEN_DURATION_MS });
    return token;
}

export function getUserByToken(token: string): PublicUser | undefined {
    const entry = authTokens.get(token);
    if (!entry) {
        return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
        authTokens.delete(token);
        return undefined;
    }
    for (const user of users.values()) {
        if (user.id === entry.userId) {
            return toPublicUser(user);
        }
    }
    return undefined;
}

export function revokeAuthToken(token: string): void {
    authTokens.delete(token);
}
