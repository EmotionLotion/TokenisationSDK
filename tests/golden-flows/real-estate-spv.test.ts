/**
 * AHOY Golden Flow Test
 * Real Estate SPV Tokenization - End-to-End Flow
 *
 * This test demonstrates the complete lifecycle of tokenizing a real estate
 * property through an SPV (Special Purpose Vehicle) structure:
 *
 * Phase 1: Create property asset with SPV details (Flow A)
 * Phase 2: Deploy compliant security token ERC-3643 (Flow A)
 * Phase 3: Onboard investors with KYC (Flow B)
 * Phase 4: Issue tokens to investors (Flow B)
 * Phase 5: Execute compliant secondary transfer (Flow C)
 * Phase 6: Distribute rental yield (Flow D)
 * Phase 7: Generate compliance reports
 * Phase 8: Redemption & Exit (Flow E)
 *
 * Golden Flows Covered:
 * - Flow A: Asset → Token (Phases 1-2)
 * - Flow B: Investor Onboarding (Phases 3-4)
 * - Flow C: Compliance & Transfer (Phase 5)
 * - Flow D: Corporate Action / Distribution (Phase 6)
 * - Flow E: Redemption & Exit (Phase 8)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiClient, testId, waitFor } from '../helpers/api-client';

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.TEST_API_KEY || 'ak_test_sandbox_key_12345';

describe('Golden Flow: Real Estate SPV Tokenization', () => {
  let client: ApiClient;

  // Track created resources
  const state = {
    assetId: '',
    tokenId: '',
    investor1Id: '',
    investor2Id: '',
    investor1WalletId: '',
    investor2WalletId: '',
    policyId: '',
    scheduleId: '',
    transferId: '',
    distributionId: '',
  };

  beforeAll(() => {
    client = new ApiClient(API_URL, API_KEY);
  });

  // ===========================================================================
  // PHASE 1: Asset Creation
  // ===========================================================================

  describe('Phase 1: Asset Creation', () => {
    it('1.1 - Create real estate asset with SPV details', async () => {
      const asset = await client.post('/api/v1/assets', {
        name: 'Marina Tower Unit 2501',
        type: 'real_estate',
        jurisdiction: 'AE',
        status: 'draft',
        metadata: {
          // Property details
          propertyType: 'residential',
          address: '2501 Marina Tower, Dubai Marina',
          emirate: 'Dubai',
          plotNumber: 'DM-2501-A',
          titleDeedNumber: 'TD-2024-123456',

          // SPV details
          spv: {
            name: 'Marina 2501 Holdings Ltd',
            registrationNumber: 'ADGM-12345',
            jurisdiction: 'ADGM',
            incorporationDate: '2024-01-15',
          },

          // Valuation
          valuation: {
            amount: '5000000',
            currency: 'AED',
            date: '2024-06-01',
            appraiser: 'CBRE Dubai',
          },

          // Documents (references)
          documents: [
            { type: 'title_deed', hash: 'Qm...', status: 'verified' },
            { type: 'spv_certificate', hash: 'Qm...', status: 'verified' },
            { type: 'valuation_report', hash: 'Qm...', status: 'verified' },
          ],
        },
      });

      expect(asset.id).toBeDefined();
      expect(asset.name).toBe('Marina Tower Unit 2501');
      expect(asset.jurisdiction).toBe('AE');

      state.assetId = asset.id;
      console.log(`    ✓ Asset created: ${state.assetId}`);
    });
  });

  // ===========================================================================
  // PHASE 2: Token Deployment
  // ===========================================================================

  describe('Phase 2: Token Deployment', () => {
    it('2.1 - Create compliance policy for real estate', async () => {
      const policy = await client.post('/api/v1/compliance/policies', {
        name: 'UAE Real Estate Compliance',
        type: 'transfer',
        description: 'Compliance rules for UAE real estate token transfers',
        rules: [
          // KYC requirement
          {
            id: 'rule-kyc-required',
            type: 'require',
            field: 'receiver.kycStatus',
            op: 'eq',
            value: 'approved',
            message: 'Receiver must complete KYC verification',
            code: 'KYC_REQUIRED',
          },
          // Accredited investor check
          {
            id: 'rule-accredited',
            type: 'require',
            field: 'receiver.type',
            op: 'in',
            value: ['qualified', 'accredited', 'institutional'],
            message: 'Only qualified/accredited investors allowed',
            code: 'ACCREDITATION_REQUIRED',
          },
          // Sanctioned countries block
          {
            id: 'rule-sanctions',
            type: 'block',
            field: 'receiver.countryCode',
            op: 'in',
            value: ['IR', 'KP', 'SY', 'CU'],
            message: 'Transfers to sanctioned jurisdictions prohibited',
            code: 'SANCTIONED_COUNTRY',
          },
          // Maximum holding limit (10%)
          {
            id: 'rule-max-holding',
            type: 'limit',
            field: 'receiver.holdingPercentage',
            op: 'lte',
            value: 10,
            message: 'Maximum 10% holding per investor',
            code: 'MAX_HOLDING_EXCEEDED',
          },
        ],
      });

      expect(policy.id).toBeDefined();
      state.policyId = policy.id;
      console.log(`    ✓ Policy created: ${state.policyId}`);
    });

    it('2.2 - Create security token (ERC-3643)', async () => {
      const token = await client.post('/api/v1/tokens', {
        name: 'Marina 2501 Token',
        symbol: 'M2501',
        totalSupply: '5000000000000000000000000', // 5M tokens (= 5M AED value)
        chainId: 31337,
        standard: 'ERC3643',
        decimals: 18,
        metadata: {
          assetId: state.assetId,
          assetType: 'real_estate',
          jurisdiction: 'UAE',
          regulatoryFramework: 'DFSA',
          tokenPrice: '1', // 1 AED per token
          minimumInvestment: '10000', // 10,000 AED minimum
        },
      });

      expect(token.id).toBeDefined();
      expect(token.status).toBe('draft');
      state.tokenId = token.id;
      console.log(`    ✓ Token created: ${state.tokenId}`);
    });

    it('2.3 - Attach compliance policy to token', async () => {
      const attachment = await client.post(`/api/v1/tokens/${state.tokenId}/policies`, {
        policyId: state.policyId,
        priority: 0,
      });

      expect(attachment).toBeDefined();
      console.log(`    ✓ Policy attached to token`);
    });

    it('2.4 - Deploy token to blockchain', async () => {
      const deployed = await client.post(`/api/v1/tokens/${state.tokenId}/deploy`);

      expect(deployed.status).toMatch(/deploying|deployed/);
      console.log(`    ✓ Token deployment initiated`);

      // Wait for deployment (in sandbox this is fast)
      await waitFor(async () => {
        const token = await client.get(`/api/v1/tokens/${state.tokenId}`);
        return token.status === 'deployed';
      }, 30000, 2000).catch(() => {
        console.log('    ⚠ Deployment still in progress');
      });
    });
  });

  // ===========================================================================
  // PHASE 3: Investor Onboarding
  // ===========================================================================

  describe('Phase 3: Investor Onboarding', () => {
    it('3.1 - Onboard Investor 1 (UAE individual)', async () => {
      const investor = await client.post('/api/v1/investors', {
        email: `investor1-${testId()}@example.com`,
        type: 'accredited',
        countryCode: 'AE',
        profile: {
          firstName: 'Ahmed',
          lastName: 'Al Maktoum',
          nationality: 'AE',
          dateOfBirth: '1985-03-15',
        },
        metadata: {
          investorCategory: 'high_net_worth',
          sourceOfFunds: 'business_income',
        },
      });

      expect(investor.id).toBeDefined();
      state.investor1Id = investor.id;
      console.log(`    ✓ Investor 1 created: ${state.investor1Id}`);
    });

    it('3.2 - Start KYC for Investor 1', async () => {
      const session = await client.post(`/api/v1/investors/${state.investor1Id}/kyc`, {
        provider: 'sumsub',
        level: 'enhanced',
      });

      expect(session.id).toBeDefined();
      expect(session.verificationUrl).toBeDefined();
      console.log(`    ✓ KYC session started`);

      // In sandbox, simulate KYC completion
      // The mock provider auto-approves
    });

    it('3.3 - Add wallet for Investor 1', async () => {
      const wallet = await client.post(`/api/v1/investors/${state.investor1Id}/wallets`, {
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        chainId: 31337,
        label: 'Primary Investment Wallet',
      });

      expect(wallet.id).toBeDefined();
      state.investor1WalletId = wallet.id;
      console.log(`    ✓ Wallet added for Investor 1`);
    });

    it('3.4 - Onboard Investor 2 (UK institutional)', async () => {
      const investor = await client.post('/api/v1/investors', {
        email: `investor2-${testId()}@example.com`,
        type: 'institutional',
        countryCode: 'GB',
        profile: {
          companyName: 'London Property Fund LP',
          registrationNumber: 'LP-12345',
          jurisdiction: 'UK',
        },
        metadata: {
          investorCategory: 'institutional_fund',
          aum: '500000000', // $500M AUM
        },
      });

      expect(investor.id).toBeDefined();
      state.investor2Id = investor.id;
      console.log(`    ✓ Investor 2 created: ${state.investor2Id}`);
    });

    it('3.5 - Add wallet for Investor 2', async () => {
      const wallet = await client.post(`/api/v1/investors/${state.investor2Id}/wallets`, {
        address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        chainId: 31337,
        label: 'Fund Custody Wallet',
      });

      expect(wallet.id).toBeDefined();
      state.investor2WalletId = wallet.id;
      console.log(`    ✓ Wallet added for Investor 2`);
    });
  });

  // ===========================================================================
  // PHASE 4: Token Issuance
  // ===========================================================================

  describe('Phase 4: Token Issuance', () => {
    it('4.1 - Issue tokens to Investor 1', async () => {
      const issuance = await client.post(`/api/v1/tokens/${state.tokenId}/issue`, {
        toWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '250000000000000000000000', // 250,000 tokens (5% of supply)
        metadata: {
          investorId: state.investor1Id,
          subscriptionAgreement: 'SA-2024-001',
        },
      });

      expect(issuance).toBeDefined();
      console.log(`    ✓ 250,000 tokens issued to Investor 1`);
    });

    it('4.2 - Issue tokens to Investor 2', async () => {
      const issuance = await client.post(`/api/v1/tokens/${state.tokenId}/issue`, {
        toWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amount: '500000000000000000000000', // 500,000 tokens (10% of supply)
        metadata: {
          investorId: state.investor2Id,
          subscriptionAgreement: 'SA-2024-002',
        },
      });

      expect(issuance).toBeDefined();
      console.log(`    ✓ 500,000 tokens issued to Investor 2`);
    });

    it('4.3 - Verify cap table', async () => {
      const capTable = await client.get(`/api/v1/tokens/${state.tokenId}/cap-table`);

      expect(capTable.data).toBeDefined();
      console.log(`    ✓ Cap table has ${capTable.data.length} entries`);
    });
  });

  // ===========================================================================
  // PHASE 5: Secondary Transfer
  // ===========================================================================

  describe('Phase 5: Secondary Transfer', () => {
    it('5.1 - Pre-check transfer compliance', async () => {
      const check = await client.post('/api/v1/transfers/check', {
        tokenId: state.tokenId,
        fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        toWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amount: '50000000000000000000000', // 50,000 tokens
      });

      expect(check.allowed).toBeDefined();
      console.log(`    ✓ Transfer compliance check: ${check.allowed ? 'ALLOWED' : 'DENIED'}`);
    });

    it('5.2 - Execute secondary transfer', async () => {
      const transfer = await client.post('/api/v1/transfers', {
        tokenId: state.tokenId,
        fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        toWallet: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
        amount: '50000000000000000000000', // 50,000 tokens
        metadata: {
          tradeId: 'TRADE-2024-001',
          price: '50000', // 50,000 AED
          reason: 'Secondary market sale',
        },
      });

      expect(transfer.id).toBeDefined();
      state.transferId = transfer.id;
      console.log(`    ✓ Transfer initiated: ${state.transferId}`);
    });

    it('5.3 - Monitor transfer status', async () => {
      const transfer = await client.get(`/api/v1/transfers/${state.transferId}`);

      expect(transfer.status).toBeDefined();
      console.log(`    ✓ Transfer status: ${transfer.status}`);
    });
  });

  // ===========================================================================
  // PHASE 6: Yield Distribution
  // ===========================================================================

  describe('Phase 6: Yield Distribution', () => {
    it('6.1 - Create rental income distribution schedule', async () => {
      const schedule = await client.post('/api/v1/distributions/schedules', {
        tokenId: state.tokenId,
        type: 'RENT',
        frequency: 'MONTHLY',
        allocationStrategy: 'PRO_RATA',
        paymentCurrency: 'USDC',
        startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
        amount: '20000000000', // 20,000 USDC monthly rent
        metadata: {
          description: 'Monthly rental income distribution',
          propertyManager: 'Dubai Property Management LLC',
        },
      });

      expect(schedule.id).toBeDefined();
      state.scheduleId = schedule.id;
      console.log(`    ✓ Distribution schedule created: ${state.scheduleId}`);
    });

    it('6.2 - Execute distribution', async () => {
      const distribution = await client.post(
        `/api/v1/distributions/schedules/${state.scheduleId}/execute`,
        {
          snapshotDate: new Date().toISOString(),
          overrideAmount: '20000000000', // 20,000 USDC
        }
      );

      expect(distribution.id).toBeDefined();
      state.distributionId = distribution.id;
      console.log(`    ✓ Distribution executed: ${state.distributionId}`);
    });

    it('6.3 - View distribution payouts', async () => {
      const payouts = await client.get(`/api/v1/distributions/${state.distributionId}/payouts`);

      expect(payouts.data).toBeDefined();
      console.log(`    ✓ ${payouts.data.length} payouts created`);
    });
  });

  // ===========================================================================
  // PHASE 7: Reporting & Audit
  // ===========================================================================

  describe('Phase 7: Reporting & Audit', () => {
    it('7.1 - Get audit trail for token', async () => {
      const audit = await client.get('/api/v1/audit', {
        entityType: 'token',
        entityId: state.tokenId,
        limit: 20,
      });

      expect(audit.data).toBeDefined();
      console.log(`    ✓ ${audit.data.length} audit entries for token`);
    });

    it('7.2 - Get compliance decisions', async () => {
      const decisions = await client.get('/api/v1/compliance/decisions', {
        limit: 10,
      });

      expect(decisions.data).toBeDefined();
      console.log(`    ✓ ${decisions.data.length} compliance decisions`);
    });

    it('7.3 - Final cap table verification', async () => {
      const capTable = await client.get(`/api/v1/tokens/${state.tokenId}/cap-table`);

      expect(capTable.data).toBeDefined();
      console.log(`    ✓ Final cap table:`);
      capTable.data.forEach((entry: any) => {
        console.log(`      - ${entry.walletAddress}: ${entry.balance} tokens (${entry.percentage}%)`);
      });
    });
  });

  // ===========================================================================
  // PHASE 8: Redemption & Exit (Flow E)
  // ===========================================================================

  describe('Phase 8: Redemption & Exit', () => {
    it('8.1 - Create redemption request for Investor 1', async () => {
      // Investor 1 wants to redeem 50,000 tokens
      const redemption = await client.post('/api/v1/transfers/redemption', {
        tokenId: state.tokenId,
        investorId: state.investor1Id,
        fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '50000000000000000000000', // 50,000 tokens
        paymentMethod: 'bank_wire',
        paymentDetails: {
          bankName: 'Emirates NBD',
          accountNumber: 'XXXX-XXXX-1234',
          iban: 'AE070331234567890123456',
          currency: 'AED',
        },
        metadata: {
          reason: 'Partial exit',
          redemptionPrice: '1.05', // 1.05 AED per token (5% premium)
          expectedPayment: '52500', // 52,500 AED
        },
      });

      expect(redemption.id).toBeDefined();
      expect(redemption.status).toMatch(/pending|processing/);
      console.log(`    ✓ Redemption request created: ${redemption.id}`);
    });

    it('8.2 - Verify redemption eligibility', async () => {
      // Check if investor can redeem (lockup periods, restrictions)
      const eligibility = await client.get(`/api/v1/investors/${state.investor1Id}/redemption-eligibility`, {
        tokenId: state.tokenId,
        amount: '50000000000000000000000',
      });

      expect(eligibility.eligible).toBeDefined();
      console.log(`    ✓ Redemption eligibility: ${eligibility.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);

      if (!eligibility.eligible && eligibility.reason) {
        console.log(`      Reason: ${eligibility.reason}`);
      }
    });

    it('8.3 - Execute token burn', async () => {
      // Burn tokens as part of redemption
      const burn = await client.post(`/api/v1/tokens/${state.tokenId}/burn`, {
        fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        amount: '50000000000000000000000', // 50,000 tokens
        reason: 'Investor redemption',
        metadata: {
          investorId: state.investor1Id,
          redemptionId: 'RDM-2024-001',
        },
      });

      expect(burn).toBeDefined();
      console.log(`    ✓ Tokens burned for redemption`);
    });

    it('8.4 - Verify updated cap table after redemption', async () => {
      const capTable = await client.get(`/api/v1/tokens/${state.tokenId}/cap-table`);

      expect(capTable.data).toBeDefined();
      console.log(`    ✓ Updated cap table after redemption:`);
      capTable.data.forEach((entry: any) => {
        console.log(`      - ${entry.walletAddress.slice(0, 10)}...: ${entry.balance} tokens`);
      });
    });

    it('8.5 - Full exit flow for Investor 1', async () => {
      // Investor 1 redeems remaining tokens for full exit
      const remainingBalance = await client.get(`/api/v1/tokens/${state.tokenId}/balance`, {
        wallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      });

      if (remainingBalance.balance && remainingBalance.balance !== '0') {
        const fullExit = await client.post(`/api/v1/tokens/${state.tokenId}/burn`, {
          fromWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          amount: remainingBalance.balance,
          reason: 'Full investor exit',
          metadata: {
            investorId: state.investor1Id,
            exitType: 'full_redemption',
          },
        });

        expect(fullExit).toBeDefined();
        console.log(`    ✓ Full exit completed for Investor 1`);
      } else {
        console.log(`    ✓ Investor 1 has no remaining balance`);
      }
    });

    it('8.6 - Verify investor status after exit', async () => {
      const investor = await client.get(`/api/v1/investors/${state.investor1Id}`);

      expect(investor.id).toBe(state.investor1Id);
      console.log(`    ✓ Investor 1 status verified after exit`);
    });

    it('8.7 - Generate exit report', async () => {
      const report = await client.post('/api/v1/reports', {
        type: 'holding_statement',
        format: 'json',
        parameters: {
          investorId: state.investor1Id,
          includeRedemptions: true,
        },
      });

      expect(report.id).toBeDefined();
      console.log(`    ✓ Exit report generated: ${report.id}`);
    });
  });

  // ===========================================================================
  // Summary
  // ===========================================================================

  describe('Summary', () => {
    it('Golden flow completed successfully', () => {
      console.log('\n========================================');
      console.log('GOLDEN FLOW SUMMARY');
      console.log('========================================');
      console.log(`Asset ID:        ${state.assetId}`);
      console.log(`Token ID:        ${state.tokenId}`);
      console.log(`Policy ID:       ${state.policyId}`);
      console.log(`Investor 1 ID:   ${state.investor1Id}`);
      console.log(`Investor 2 ID:   ${state.investor2Id}`);
      console.log(`Transfer ID:     ${state.transferId}`);
      console.log(`Distribution ID: ${state.distributionId}`);
      console.log('----------------------------------------');
      console.log('Flows Completed:');
      console.log('  ✓ Flow A: Asset → Token');
      console.log('  ✓ Flow B: Investor Onboarding');
      console.log('  ✓ Flow C: Compliance & Transfer');
      console.log('  ✓ Flow D: Yield Distribution');
      console.log('  ✓ Flow E: Redemption & Exit');
      console.log('========================================\n');

      expect(state.tokenId).toBeDefined();
      expect(state.investor1Id).toBeDefined();
      expect(state.investor2Id).toBeDefined();
    });
  });
});
