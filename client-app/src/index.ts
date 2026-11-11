import { createInterface } from 'node:readline/promises';
import { SecureClient } from './secureClient';

const baseUrl = process.env.SERVER_URL ?? 'http://localhost:3000';
const client = new SecureClient(baseUrl);

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
            const { sessionId, rsaId, reply } = await client.sendMessage(message);
            console.log(`Session: ${sessionId} (RSA key id: ${rsaId})`);
            console.log(`Server response: ${reply}`);
        } catch (error: unknown) {
            console.error('Error:', error instanceof Error ? error.message : error);
        }
    }
    rl.close();
}

main();
