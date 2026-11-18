import { createInterface } from 'node:readline/promises';
import { SecureClient } from './secureClient';
import { TokenProvider } from './tokenProvider';

const baseUrl = process.env.SERVER_URL ?? 'http://localhost:3000';
const tokenUrl = process.env.OIDC_TOKEN_URL ?? 'http://localhost:8080/realms/oidc-lab/protocol/openid-connect/token';

async function main(): Promise<void> {
    const clientSecret = process.env.CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error('Set CLIENT_SECRET to the Keycloak client secret.');
    }
    const tokenProvider = new TokenProvider(tokenUrl, process.env.CLIENT_ID ?? 'lab-console', clientSecret);
    const client = new SecureClient(baseUrl, () => tokenProvider.getToken());
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
