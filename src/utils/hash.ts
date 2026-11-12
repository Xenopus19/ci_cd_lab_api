import { createHash } from 'node:crypto';

export function isHashValid(message: string, hash: string): boolean {
    return createHash('sha256').update(message).digest('hex') === hash;
}
