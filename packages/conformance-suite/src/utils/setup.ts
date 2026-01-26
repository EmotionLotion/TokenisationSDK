import { createApiClient, ApiClient } from '@tokenisation/sdk';
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
    // 1. Initialize SDK Client
    const client = new ApiClient({
        apiKey: TEST_CONFIG.apiKey,
        baseUrl: TEST_CONFIG.apiUrl,
    });

    // 2. Initialize Chain Provider
    const provider = new JsonRpcProvider(TEST_CONFIG.rpcUrl);
    const wallet = new Wallet(TEST_CONFIG.masterKey, provider);

    // 3. Health Check
    try {
        const health = await client.healthCheck();
        if (health.status !== 'ok') throw new Error('API not healthy');
    } catch (e) {
        console.warn('⚠️  API Health Check Failed (Ensure Docker is running)');
    }

    return { client, provider, wallet };
}

export function generateRandomString(length: number = 8): string {
    return Math.random().toString(36).substring(2, 2 + length);
}
