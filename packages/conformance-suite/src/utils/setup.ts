// Direct import from dist to avoid vitest resolution issues
import { ApiClient } from '../../../../sdk/dist/ApiClient.js';
import { JsonRpcProvider, Wallet } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

export const TEST_CONFIG = {
    apiUrl: process.env.API_URL || 'http://localhost:3001',
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    apiKey: process.env.TEST_API_KEY || 'sk_test_admin',
    masterKey: process.env.MASTER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
};

export async function setupTestEnvironment() {
    console.log('Setting up test environment...');
    console.log('API URL:', TEST_CONFIG.apiUrl);
    console.log('RPC URL:', TEST_CONFIG.rpcUrl);

    // 1. Initialize SDK Client with dev mode bypass headers
    let client: ApiClient;
    try {
        client = new ApiClient({
            apiKey: TEST_CONFIG.apiKey,
            baseUrl: TEST_CONFIG.apiUrl,
            defaultHeaders: {
                // Dev mode bypass headers for local testing
                'X-Dev-Org-Id': 'test-org',
                'X-Dev-Party-Id': 'test-party',
            },
        });
        console.log('Client created, has assets:', !!client.assets);
        console.log('Client has tokens:', !!client.tokens);
    } catch (e: any) {
        console.error('Failed to create ApiClient:', e.message);
        throw e;
    }

    // 2. Initialize Chain Provider
    const provider = new JsonRpcProvider(TEST_CONFIG.rpcUrl);
    const wallet = new Wallet(TEST_CONFIG.masterKey, provider);

    // 3. Health Check
    try {
        const health = await client.healthCheck();
        console.log('Health check result:', health);
        if (health.status !== 'ok') throw new Error('API not healthy');
    } catch (e: any) {
        console.warn('⚠️  API Health Check Failed:', e.message);
    }

    return { client, provider, wallet };
}

export function generateRandomString(length: number = 8): string {
    return Math.random().toString(36).substring(2, 2 + length);
}
