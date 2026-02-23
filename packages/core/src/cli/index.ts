#!/usr/bin/env node
/**
 * Tokenise CLI
 *
 * Command-line interface for the Tokenisation SDK.
 *
 * Usage:
 *   tokenise create --type real_estate --name "My Property"
 *   tokenise mint --asset <id> --to <address> --amount <amount>
 *   tokenise list
 *   tokenise status <asset-id>
 */

import { Command } from 'commander';
import { TokenisationSDK, LifecycleState, RightType, PartyRole, PartyType } from '../SDK.js';

const program = new Command();
const sdk = new TokenisationSDK();

// Helper to format output
function formatAsset(asset: any): void {
  console.log('');
  console.log(`Asset: ${asset.name}`);
  console.log(`  ID: ${asset.id}`);
  console.log(`  Type: ${asset.rightType}`);
  console.log(`  State: ${asset.state}`);
  console.log(`  Jurisdiction: ${asset.jurisdiction.countryCode}`);
  console.log(`  Created: ${asset.createdAt}`);
  if (asset.description) {
    console.log(`  Description: ${asset.description}`);
  }
  console.log('');
}

function formatParty(party: any): void {
  console.log('');
  console.log(`Party: ${party.name}`);
  console.log(`  ID: ${party.id}`);
  console.log(`  Type: ${party.type}`);
  console.log(`  Roles: ${party.roles.join(', ')}`);
  console.log(`  Jurisdiction: ${party.jurisdiction}`);
  console.log(`  KYC Level: ${party.verificationLevel}`);
  console.log(`  Frozen: ${party.isFrozen}`);
  console.log('');
}

// Program setup
program
  .name('tokenise')
  .description('CLI for the Tokenisation SDK')
  .version('1.0.0');

// ============================================================================
// ASSET COMMANDS
// ============================================================================

program
  .command('create')
  .description('Create a new asset')
  .requiredOption('-t, --type <type>', 'Asset type (OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION)')
  .requiredOption('-n, --name <name>', 'Asset name')
  .option('-d, --description <desc>', 'Asset description')
  .option('-j, --jurisdiction <code>', 'ISO country code', 'AE')
  .option('--issuer <id>', 'Issuer party ID')
  .action(async (options) => {
    try {
      // Create issuer if not provided
      let issuerId = options.issuer;
      if (!issuerId) {
        const issuer = sdk.parties_.create({
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          name: 'Default Issuer',
          jurisdiction: options.jurisdiction,
        });
        issuerId = issuer.id;
        console.log(`Created default issuer: ${issuerId}`);
      }

      const asset = await sdk.assets.create({
        name: options.name,
        description: options.description,
        rightType: options.type as RightType,
        jurisdiction: {
          countryCode: options.jurisdiction,
          accreditedOnly: false,
          blockedJurisdictions: [],
        },
        issuerId,
      });

      console.log('Asset created successfully!');
      formatAsset(asset);
    } catch (error) {
      console.error('Error creating asset:', error);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all assets')
  .option('-s, --state <state>', 'Filter by state')
  .action(async (options) => {
    try {
      let assets;
      if (options.state) {
        assets = sdk.assets.getByState(options.state as LifecycleState);
      } else {
        assets = sdk.assets.getAll();
      }

      if (assets.length === 0) {
        console.log('No assets found.');
        return;
      }

      console.log(`\nFound ${assets.length} asset(s):\n`);
      assets.forEach((asset) => {
        console.log(`  [${asset.state}] ${asset.name} (${asset.id.slice(0, 8)}...)`);
      });
      console.log('');
    } catch (error) {
      console.error('Error listing assets:', error);
      process.exit(1);
    }
  });

program
  .command('status <assetId>')
  .description('Get asset status')
  .action(async (assetId) => {
    try {
      const asset = await sdk.assets.get(assetId);
      if (!asset) {
        console.error(`Asset ${assetId} not found`);
        process.exit(1);
      }

      formatAsset(asset);

      // Show valid transitions
      const validNext = sdk.engine.getValidNextStates(asset.state);
      if (validNext.length > 0) {
        console.log(`  Valid transitions: ${validNext.join(', ')}`);
      }
    } catch (error) {
      console.error('Error getting status:', error);
      process.exit(1);
    }
  });

program
  .command('verify <assetId>')
  .description('Mark asset as verified')
  .option('--verifier <id>', 'Verifier party ID', 'default-verifier')
  .action(async (assetId, options) => {
    try {
      // First transition to PENDING_VERIFICATION
      const asset = await sdk.assets.get(assetId);
      if (!asset) {
        console.error(`Asset ${assetId} not found`);
        process.exit(1);
      }

      if (asset.state === LifecycleState.DRAFT) {
        const pendingResult = await sdk.assets.transition(
          assetId,
          LifecycleState.PENDING_VERIFICATION,
          options.verifier
        );
        if (!pendingResult.success) {
          console.error(`Failed to submit for verification: ${pendingResult.error}`);
          process.exit(1);
        }
      }

      // Then verify
      const result = await sdk.assets.verify(assetId, options.verifier);
      if (!result.success) {
        console.error(`Verification failed: ${result.error}`);
        process.exit(1);
      }

      console.log('Asset verified successfully!');
      formatAsset(result.data);
    } catch (error) {
      console.error('Error verifying asset:', error);
      process.exit(1);
    }
  });

program
  .command('activate <assetId>')
  .description('Activate an asset (mint tokens)')
  .option('--actor <id>', 'Actor party ID', 'default-actor')
  .action(async (assetId, options) => {
    try {
      const result = await sdk.assets.activate(assetId, options.actor);
      if (!result.success) {
        console.error(`Activation failed: ${result.error}`);
        process.exit(1);
      }

      console.log('Asset activated successfully!');
      formatAsset(result.data);
    } catch (error) {
      console.error('Error activating asset:', error);
      process.exit(1);
    }
  });

// ============================================================================
// TOKEN COMMANDS
// ============================================================================

program
  .command('mint')
  .description('Mint tokens for an asset')
  .requiredOption('-a, --asset <id>', 'Asset ID')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount to mint')
  .action(async (options) => {
    try {
      const result = await sdk.tokens.mint(options.asset, options.to, options.amount);
      if (!result.success) {
        console.error(`Mint failed: ${result.error}`);
        process.exit(1);
      }

      console.log(`Successfully minted ${options.amount} tokens to ${options.to}`);
    } catch (error) {
      console.error('Error minting:', error);
      process.exit(1);
    }
  });

program
  .command('transfer')
  .description('Transfer tokens')
  .requiredOption('-a, --asset <id>', 'Asset ID')
  .requiredOption('--from <address>', 'Sender address')
  .requiredOption('--to <address>', 'Recipient address')
  .requiredOption('--amount <amount>', 'Amount to transfer')
  .action(async (options) => {
    try {
      const result = await sdk.tokens.transfer(
        options.asset,
        options.from,
        options.to,
        options.amount
      );
      if (!result.success) {
        console.error(`Transfer failed: ${result.error}`);
        process.exit(1);
      }

      console.log(`Successfully transferred ${options.amount} tokens`);
    } catch (error) {
      console.error('Error transferring:', error);
      process.exit(1);
    }
  });

program
  .command('balance')
  .description('Get token balance')
  .requiredOption('-a, --asset <id>', 'Asset ID')
  .requiredOption('--address <address>', 'Wallet address')
  .action(async (options) => {
    try {
      const balance = await sdk.tokens.getBalance(options.asset, options.address);
      console.log(`Balance: ${balance}`);
    } catch (error) {
      console.error('Error getting balance:', error);
      process.exit(1);
    }
  });

// ============================================================================
// PARTY COMMANDS
// ============================================================================

program
  .command('party:create')
  .description('Create a new party')
  .requiredOption('-n, --name <name>', 'Party name')
  .requiredOption('-r, --role <role>', 'Party role (ISSUER, INVESTOR, VERIFIER)')
  .option('-t, --type <type>', 'Party type (INDIVIDUAL, ORGANIZATION)', 'INDIVIDUAL')
  .option('-j, --jurisdiction <code>', 'ISO country code', 'AE')
  .action(async (options) => {
    try {
      const party = sdk.parties_.create({
        type: options.type as PartyType,
        roles: [options.role as PartyRole],
        name: options.name,
        jurisdiction: options.jurisdiction,
      });

      console.log('Party created successfully!');
      formatParty(party);
    } catch (error) {
      console.error('Error creating party:', error);
      process.exit(1);
    }
  });

program
  .command('party:list')
  .description('List all parties')
  .action(async () => {
    try {
      const parties = sdk.parties_.getAll();

      if (parties.length === 0) {
        console.log('No parties found.');
        return;
      }

      console.log(`\nFound ${parties.length} party(ies):\n`);
      parties.forEach((party) => {
        console.log(`  [${party.type}] ${party.name} (${party.id.slice(0, 8)}...) - ${party.roles.join(', ')}`);
      });
      console.log('');
    } catch (error) {
      console.error('Error listing parties:', error);
      process.exit(1);
    }
  });

program
  .command('party:kyc <partyId>')
  .description('Set KYC status for a party')
  .option('--verified', 'Set as verified')
  .option('--expires <date>', 'KYC expiry date (ISO format)')
  .action(async (partyId, options) => {
    try {
      const result = sdk.parties_.setKyc(partyId, options.verified || false, options.expires);
      if (!result.success) {
        console.error(`KYC update failed: ${result.error}`);
        process.exit(1);
      }

      console.log(`KYC status updated for party ${partyId}`);
    } catch (error) {
      console.error('Error updating KYC:', error);
      process.exit(1);
    }
  });

// ============================================================================
// DEMO COMMAND
// ============================================================================

program
  .command('demo')
  .description('Run a full demo flow')
  .action(async () => {
    console.log('\n=== Tokenisation SDK Demo ===\n');

    try {
      // 1. Create Issuer
      console.log('1. Creating Issuer...');
      const issuer = sdk.parties_.create({
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.ISSUER],
        name: 'Dubai Properties LLC',
        jurisdiction: 'AE',
      });
      console.log(`   Created: ${issuer.name} (${issuer.id.slice(0, 8)}...)`);

      // 2. Create Investors
      console.log('\n2. Creating Investors...');
      const investor1 = sdk.parties_.create({
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        name: 'Ahmed Al Maktoum',
        jurisdiction: 'AE',
      });
      sdk.parties_.setKyc(investor1.id, true);
      console.log(`   Created: ${investor1.name} (KYC verified)`);

      const investor2 = sdk.parties_.create({
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        name: 'Sarah Johnson',
        jurisdiction: 'US',
      });
      sdk.parties_.setKyc(investor2.id, true);
      console.log(`   Created: ${investor2.name} (KYC verified)`);

      // 3. Create Asset
      console.log('\n3. Creating Real Estate Asset...');
      const asset = await sdk.assets.create({
        name: 'Dubai Marina Tower - Unit 1501',
        description: 'Luxury 2BR apartment with sea view',
        rightType: RightType.OWNERSHIP,
        jurisdiction: {
          countryCode: 'AE',
          accreditedOnly: false,
          blockedJurisdictions: ['KP', 'IR'],
        },
        issuerId: issuer.id,
      });
      console.log(`   Created: ${asset.name}`);
      console.log(`   State: ${asset.state}`);

      // 4. Submit for verification
      console.log('\n4. Submitting for verification...');
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
      console.log(`   State: PENDING_VERIFICATION`);

      // 5. Verify
      console.log('\n5. Verifying asset...');
      await sdk.assets.verify(asset.id, 'verifier-001');
      console.log(`   State: VERIFIED`);

      // 6. Activate (mint tokens)
      console.log('\n6. Activating asset...');
      await sdk.assets.activate(asset.id, issuer.id);
      console.log(`   State: ACTIVE`);

      // 7. Mint tokens
      console.log('\n7. Minting tokens...');
      await sdk.tokens.mint(asset.id, investor1.id, '500000000000000000000'); // 500 tokens
      await sdk.tokens.mint(asset.id, investor2.id, '500000000000000000000'); // 500 tokens
      console.log('   Minted 500 tokens to each investor');

      // 8. Check balances
      console.log('\n8. Final Balances:');
      const balance1 = await sdk.tokens.getBalance(asset.id, investor1.id);
      const balance2 = await sdk.tokens.getBalance(asset.id, investor2.id);
      console.log(`   ${investor1.name}: ${balance1}`);
      console.log(`   ${investor2.name}: ${balance2}`);

      // 9. Summary
      console.log('\n=== Demo Complete ===\n');
      console.log('Summary:');
      console.log(`  - Asset: ${asset.name}`);
      console.log(`  - Asset ID: ${asset.id}`);
      console.log(`  - Total Supply: ${sdk.indexer.getTotalSupply(asset.id)}`);
      console.log(`  - Holder Count: ${sdk.indexer.getHolderCount(asset.id)}`);
      console.log('');

    } catch (error) {
      console.error('\nDemo failed:', error);
      process.exit(1);
    }
  });

// Parse and execute
program.parse();
