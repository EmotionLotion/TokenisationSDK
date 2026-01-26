import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestEnvironment, generateRandomString } from '../utils/setup.js';
import { RightType } from '@tokenisation/sdk';

describe('Flow A: Asset Creation -> Token Issuance', () => {
    let ctx: Awaited<ReturnType<typeof setupTestEnvironment>>;
    let assetId: string;
    let tokenId: string;

    beforeAll(async () => {
        ctx = await setupTestEnvironment();
    });

    it('1. Create Asset (Real Estate SPV)', async () => {
        const name = `Marina Heights ${generateRandomString()}`;

        // Call SDK to create asset
        const asset = await ctx.client.assets.create({
            name: name,
            description: 'Luxury Waterfront Apartment SPV',
            rightType: RightType.OWNERSHIP,
            jurisdiction: {
                countryCode: 'AE',
                regulatoryFramework: 'UAE_VARA',
            },
            metadata: {
                propertyType: 'RESIDENTIAL',
                unitNumber: '101',
            },
        });

        assetId = asset.id;
        expect(asset).toBeDefined();
        expect(asset.id).toBeDefined();
        expect(asset.jurisdiction.countryCode).toBe('AE');

        console.log(`✅ Asset Created: ${assetId}`);
    });

    it('2. Create Token Definition', async () => {
        const symbol = `MH${generateRandomString(3).toUpperCase()}`;

        const token = await ctx.client.tokens.create({
            name: 'Marina Heights Token',
            symbol: symbol,
            decimals: 18,
            totalSupply: '1000000',
            chainId: 31337, // Local Anvil
            assetId: assetId,
        });

        tokenId = token.id;
        expect(token).toBeDefined();
        expect(token.status).toBe('draft');

        console.log(`✅ Token Created: ${tokenId}`);
    });

    it('3. Deploy Token (Mints Initial Supply)', async () => {
        // This triggers the Factory Refactor logic we just verified
        const deployedToken = await ctx.client.tokens.deploy(tokenId, {
            deployerAddress: ctx.wallet.address // Pass the wallet address as initial owner
        });

        expect(deployedToken.status).toBe('deploying');
        console.log(`⏳ Deployment initiated...`);

        // Wait for deployment to confirm (Mocking wait loop for now, real test would poll)
        // In a real run, we'd poll client.tokens.get(tokenId) until status == 'deployed'
    });

    // Verify on-chain (using ethers) would go here
});
