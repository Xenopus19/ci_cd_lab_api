import { createInterface } from 'node:readline/promises';
import { SecureClient } from './secureClient';

const baseUrl = process.env.SERVER_URL ?? 'http://localhost:3000';

async function main(): Promise<void> {
    const token = process.env.ACCESS_TOKEN;
    if (!token) {
        throw new Error('Set ACCESS_TOKEN to a lab-api access token.');
    }
    const client = new SecureClient(baseUrl, token);
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

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
