/**
 * Extension Module Tests
 *
 * Tests for CashFlow, Governance, and Escrow modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  CashFlowEngine,
  DistributionType,
  DistributionFrequency,
  AllocationStrategy,
} from '../src/modules/CashFlow.js';
import {
  GovernanceEngine,
  ProposalType,
  VotingStrategy,
  VoteType,
  QuorumType,
} from '../src/modules/Governance.js';
import {
  EscrowEngine,
  EscrowType,
  EscrowStatus,
} from '../src/modules/Escrow.js';

describe('CashFlowEngine', () => {
  let engine: CashFlowEngine;
  const testAssetId = uuidv4();

  beforeEach(() => {
    // Create engine with a mock balance provider
    engine = new CashFlowEngine();
    engine.setBalanceProvider(async (assetId: string) => [
      { holderId: 'holder-1', holderAddress: '0x111', balance: '600', weight: 0.6 },
      { holderId: 'holder-2', holderAddress: '0x222', balance: '400', weight: 0.4 },
    ]);
  });

  describe('Distribution Schedules', () => {
    it('should create a distribution schedule', () => {
      const startDate = new Date().toISOString();
      const schedule = engine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.QUARTERLY,
        paymentCurrency: 'USDC',
        allocationStrategy: AllocationStrategy.PRO_RATA,
        startDate,
      });

      expect(schedule.id).toBeDefined();
      expect(schedule.assetId).toBe(testAssetId);
      expect(schedule.type).toBe(DistributionType.DIVIDEND);
      expect(schedule.isActive).toBe(true);
    });

    it('should get schedule by id', () => {
      const startDate = new Date().toISOString();
      const created = engine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.INTEREST,
        frequency: DistributionFrequency.MONTHLY,
        paymentCurrency: 'USD',
        allocationStrategy: AllocationStrategy.EQUAL,
        startDate,
      });

      const retrieved = engine.getSchedule(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should get schedules for asset', () => {
      const startDate = new Date().toISOString();
      const assetId1 = uuidv4();
      const assetId2 = uuidv4();

      engine.createSchedule({
        assetId: assetId1,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.QUARTERLY,
        paymentCurrency: 'USDC',
        startDate,
      });
      engine.createSchedule({
        assetId: assetId1,
        type: DistributionType.INTEREST,
        frequency: DistributionFrequency.MONTHLY,
        paymentCurrency: 'USDC',
        startDate,
      });
      engine.createSchedule({
        assetId: assetId2,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.ANNUAL,
        paymentCurrency: 'USDC',
        startDate,
      });

      const schedulesForAsset1 = engine.getSchedulesForAsset(assetId1);
      expect(schedulesForAsset1.length).toBe(2);
    });

    it('should pause and resume schedules', () => {
      const startDate = new Date().toISOString();
      const schedule = engine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.MONTHLY,
        paymentCurrency: 'USD',
        startDate,
      });

      expect(schedule.isActive).toBe(true);

      engine.pauseSchedule(schedule.id);
      let updated = engine.getSchedule(schedule.id);
      expect(updated?.isActive).toBe(false);

      engine.resumeSchedule(schedule.id);
      updated = engine.getSchedule(schedule.id);
      expect(updated?.isActive).toBe(true);
    });
  });

  describe('Distributions', () => {
    it('should calculate pro-rata distribution', async () => {
      const startDate = new Date().toISOString();
      const schedule = engine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.QUARTERLY,
        paymentCurrency: 'USDC',
        allocationStrategy: AllocationStrategy.PRO_RATA,
        startDate,
      });

      const distribution = await engine.executeDistribution(schedule.id, {
        amount: '10000',
      });

      expect(distribution.totalAmount).toBe('10000');
      expect(distribution.recipientCount).toBe(2);

      // Check allocations (60/40 split of 10000)
      const holder1Payout = distribution.payouts.find(p => p.recipientId === 'holder-1');
      const holder2Payout = distribution.payouts.find(p => p.recipientId === 'holder-2');

      expect(holder1Payout?.amount).toBe('6000'); // 60% of 10000
      expect(holder2Payout?.amount).toBe('4000'); // 40% of 10000
    });

    it('should calculate equal distribution', async () => {
      const startDate = new Date().toISOString();
      const schedule = engine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.MONTHLY,
        paymentCurrency: 'USDC',
        allocationStrategy: AllocationStrategy.EQUAL,
        startDate,
      });

      const distribution = await engine.executeDistribution(schedule.id, {
        amount: '10000',
      });

      // All get equal share regardless of balance
      const holder1 = distribution.payouts.find(p => p.recipientId === 'holder-1');
      const holder2 = distribution.payouts.find(p => p.recipientId === 'holder-2');

      expect(holder1?.amount).toBe('5000');
      expect(holder2?.amount).toBe('5000');
    });
  });
});

describe('GovernanceEngine', () => {
  let engine: GovernanceEngine;
  const testAssetId = uuidv4();

  beforeEach(() => {
    engine = new GovernanceEngine();
    // Configure governance
    engine.configure({
      assetId: testAssetId,
      votingStrategy: VotingStrategy.TOKEN_WEIGHTED,
      quorumType: QuorumType.FIXED,
      quorumValue: 100,
      votingPeriodSeconds: 86400, // 1 day
      executionDelaySeconds: 3600, // 1 hour
      proposalThreshold: '1',
      allowDelegation: true,
      maxActiveProposalsPerUser: 5,
      approvalThreshold: 50,
      requireSecond: false,
    });
    // Set voting power provider
    engine.setVotingPowerProvider(async () => '1000');
  });

  describe('Proposals', () => {
    it('should create a proposal', async () => {
      const proposal = await engine.createProposal({
        assetId: testAssetId,
        title: 'Increase Dividend',
        description: 'Proposal to increase quarterly dividend by 10%',
        type: ProposalType.PARAMETER_CHANGE,
        proposerId: 'holder-1',
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.title).toBe('Increase Dividend');
      expect(proposal.state).toBe('ACTIVE_VOTING');
    });

    it('should get proposal by id', async () => {
      const created = await engine.createProposal({
        assetId: testAssetId,
        title: 'Test Proposal',
        description: 'Test',
        type: ProposalType.GENERAL,
        proposerId: 'holder-1',
      });

      const retrieved = engine.getProposal(created.id);
      expect(retrieved?.id).toBe(created.id);
    });
  });

  describe('Voting', () => {
    it('should cast a vote', async () => {
      const proposal = await engine.createProposal({
        assetId: testAssetId,
        title: 'Vote Test',
        description: 'Test voting',
        type: ProposalType.GENERAL,
        proposerId: 'holder-1',
      });

      const vote = await engine.castVote(
        proposal.id,
        'holder-2',
        VoteType.FOR,
        'I support this'
      );

      expect(vote.voteType).toBe(VoteType.FOR);
      expect(vote.voterId).toBe('holder-2');
    });

    it('should prevent duplicate votes', async () => {
      const proposal = await engine.createProposal({
        assetId: testAssetId,
        title: 'No Duplicate Test',
        description: 'Test',
        type: ProposalType.GENERAL,
        proposerId: 'holder-1',
      });

      await engine.castVote(proposal.id, 'holder-2', VoteType.FOR);

      await expect(
        engine.castVote(proposal.id, 'holder-2', VoteType.AGAINST)
      ).rejects.toThrow('Already voted on this proposal');
    });

    it('should tally votes correctly', async () => {
      const proposal = await engine.createProposal({
        assetId: testAssetId,
        title: 'Tally Test',
        description: 'Test',
        type: ProposalType.GENERAL,
        proposerId: 'proposer',
      });

      await engine.castVote(proposal.id, 'holder-1', VoteType.FOR);
      await engine.castVote(proposal.id, 'holder-2', VoteType.AGAINST);
      await engine.castVote(proposal.id, 'holder-3', VoteType.FOR);

      const updated = engine.getProposal(proposal.id);
      expect(updated?.votes.for).toBe('2000'); // 2 FOR votes * 1000 power each
      expect(updated?.votes.against).toBe('1000'); // 1 AGAINST vote * 1000 power
      expect(updated?.votes.total).toBe('3000');
    });

    it('should cancel a proposal', async () => {
      const proposal = await engine.createProposal({
        assetId: testAssetId,
        title: 'Cancel Test',
        description: 'Test',
        type: ProposalType.GENERAL,
        proposerId: 'holder-1',
      });

      await engine.cancelProposal(proposal.id, 'holder-1', 'Changed mind');

      const cancelled = engine.getProposal(proposal.id);
      expect(cancelled?.state).toBe('CANCELLED');
    });
  });
});

describe('EscrowEngine', () => {
  let engine: EscrowEngine;
  const testAssetId = uuidv4();

  beforeEach(() => {
    engine = new EscrowEngine();
  });

  describe('Escrow Creation', () => {
    it('should create an escrow', () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'Property Purchase Escrow',
        assetId: testAssetId,
        amount: '50000',
        currency: 'USDC',
        parties: [
          { partyId: 'buyer', role: 'DEPOSITOR' },
          { partyId: 'seller', role: 'BENEFICIARY' },
        ],
      });

      expect(escrow.id).toBeDefined();
      expect(escrow.status).toBe(EscrowStatus.DRAFT);
      expect(escrow.amount).toBe('50000');
    });

    it('should get escrow by id', () => {
      const created = engine.createEscrow({
        type: EscrowType.TIME_LOCKED,
        title: 'Time Lock Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USD',
        parties: [
          { partyId: 'party-1', role: 'DEPOSITOR' },
          { partyId: 'party-2', role: 'BENEFICIARY' },
        ],
      });

      const retrieved = engine.getEscrow(created.id);
      expect(retrieved?.id).toBe(created.id);
    });
  });

  describe('Escrow Lifecycle', () => {
    it('should fund an escrow', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'Fund Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
        ],
      });

      const funded = await engine.fundEscrow(escrow.id, 'depositor', '10000', 'tx-hash-123');
      expect(funded.status).toBe(EscrowStatus.ACTIVE);
    });

    it('should sign/approve escrow', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'Sign Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
        ],
      });

      await engine.fundEscrow(escrow.id, 'depositor', '10000');
      const signed = await engine.signEscrow(escrow.id, 'depositor');

      const party = signed.parties.find(p => p.partyId === 'depositor');
      expect(party?.hasSigned).toBe(true);
    });

    it('should release an escrow when conditions are met', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'Release Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
        ],
      });

      await engine.fundEscrow(escrow.id, 'depositor', '10000');
      await engine.signEscrow(escrow.id, 'depositor');
      await engine.checkConditions(escrow.id);

      const released = await engine.releaseEscrow(escrow.id, 'depositor');
      expect(released.status).toBe(EscrowStatus.RELEASED);
      expect(released.releasedAmount).toBe('10000');
    });

    it('should not release escrow with unfulfilled conditions', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'No Release Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
        ],
      });

      await engine.fundEscrow(escrow.id, 'depositor', '10000');
      // Don't sign - condition not met

      await expect(
        engine.releaseEscrow(escrow.id, 'depositor')
      ).rejects.toThrow('Release conditions not met');
    });

    it('should refund an escrow', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.SIMPLE,
        title: 'Refund Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
        ],
      });

      await engine.fundEscrow(escrow.id, 'depositor', '10000');
      const refunded = await engine.refundEscrow(escrow.id, 'depositor', 'Deal cancelled');

      expect(refunded.status).toBe(EscrowStatus.REFUNDED);
      expect(refunded.refundedAmount).toBe('10000');
    });
  });

  describe('Disputes', () => {
    it('should raise and resolve a dispute', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.DISPUTE,
        title: 'Dispute Test',
        assetId: testAssetId,
        amount: '10000',
        currency: 'USDC',
        parties: [
          { partyId: 'depositor', role: 'DEPOSITOR' },
          { partyId: 'beneficiary', role: 'BENEFICIARY' },
          { partyId: 'arbiter', role: 'ARBITER' },
        ],
      });

      await engine.fundEscrow(escrow.id, 'depositor', '10000');

      // Raise dispute
      const disputed = await engine.raiseDispute(escrow.id, 'beneficiary', 'Product not as described');
      expect(disputed.status).toBe(EscrowStatus.DISPUTED);

      // Resolve dispute (split 60/40)
      const resolved = await engine.resolveDispute(escrow.id, 'arbiter', 'SPLIT', 60);
      expect(resolved.status).toBe(EscrowStatus.RELEASED);
    });
  });

  describe('Milestones', () => {
    it('should handle milestone-based escrow', async () => {
      const escrow = engine.createEscrow({
        type: EscrowType.MILESTONE,
        title: 'Milestone Test',
        assetId: testAssetId,
        amount: '100000',
        currency: 'USDC',
        parties: [
          { partyId: 'client', role: 'DEPOSITOR' },
          { partyId: 'contractor', role: 'BENEFICIARY' },
        ],
      });

      // Add milestones
      const milestone1 = engine.addMilestone({
        escrowId: escrow.id,
        title: 'Phase 1',
        amount: '30000',
        percentage: 30,
        order: 1,
      });

      const milestone2 = engine.addMilestone({
        escrowId: escrow.id,
        title: 'Phase 2',
        amount: '70000',
        percentage: 70,
        order: 2,
      });

      await engine.fundEscrow(escrow.id, 'client', '100000');

      // Submit and approve first milestone
      engine.submitMilestoneEvidence(escrow.id, milestone1.id, 'contractor', {
        type: 'document',
        uri: 'https://example.com/deliverable1.pdf',
      });

      await engine.approveMilestone(escrow.id, milestone1.id, 'client', true, 'Looks good');

      const milestones = engine.getMilestones(escrow.id);
      expect(milestones[0].status).toBe('COMPLETED');
      expect(milestones[1].status).toBe('PENDING');
    });
  });
});
