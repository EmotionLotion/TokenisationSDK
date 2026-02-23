/**
 * Production Components Tests
 *
 * Verifies the four critical production infrastructure components:
 * 1. ReconciliationService - Server vs chain state verification
 * 2. MultisigGovernance - Multi-signature + timelock for upgrades
 * 3. IdempotentOperations - Idempotency for mint/burn/transfer/distribution
 * 4. JobQueue - Distributed async job processing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// RECONCILIATION SERVICE TESTS
// ============================================================================

import {
  ReconciliationService,
  MockServerDataProvider,
  MockChainDataProvider,
  ReconciliationStatus,
  DiscrepancyType,
  DiscrepancySeverity,
  type ReconciliationConfig,
  type Discrepancy,
  type ReconciliationReport,
} from '@tokenisation/chains';

describe('ReconciliationService', () => {
  let serverProvider: MockServerDataProvider;
  let chainProvider: MockChainDataProvider;
  let reconciliationService: ReconciliationService;

  const TEST_ASSET_ID = 'asset-001';
  const TEST_CONTRACT = '0x1234567890123456789012345678901234567890';
  const TEST_CHAIN_ID = 1;

  beforeEach(() => {
    serverProvider = new MockServerDataProvider();
    chainProvider = new MockChainDataProvider();
    reconciliationService = new ReconciliationService(serverProvider, chainProvider);
    reconciliationService.registerAsset(TEST_ASSET_ID, TEST_CONTRACT, TEST_CHAIN_ID);
  });

  describe('Balance Reconciliation', () => {
    it('should detect no discrepancies when balances match', async () => {
      const balances = [
        { holderId: 'holder-1', holderAddress: '0xAAA', balance: '1000000', lastUpdated: new Date().toISOString() },
        { holderId: 'holder-2', holderAddress: '0xBBB', balance: '500000', lastUpdated: new Date().toISOString() },
      ];

      serverProvider.setBalances(TEST_ASSET_ID, balances);
      serverProvider.setTotalSupply(TEST_ASSET_ID, '1500000');
      chainProvider.setBalances(TEST_CONTRACT, balances);
      chainProvider.setTotalSupply(TEST_CONTRACT, '1500000');

      const config: ReconciliationConfig = {
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      };

      const report = await reconciliationService.reconcile(config);

      expect(report.status).toBe(ReconciliationStatus.COMPLETED);
      expect(report.discrepanciesFound).toBe(0);
      expect(report.serverTotalSupply).toBe('1500000');
      expect(report.chainTotalSupply).toBe('1500000');
    });

    it('should detect balance mismatch', async () => {
      serverProvider.setBalances(TEST_ASSET_ID, [
        { holderId: 'holder-1', holderAddress: '0xAAA', balance: '1000000', lastUpdated: new Date().toISOString() },
      ]);
      serverProvider.setTotalSupply(TEST_ASSET_ID, '1000000');

      chainProvider.setBalances(TEST_CONTRACT, [
        { holderId: 'holder-1', holderAddress: '0xAAA', balance: '900000', lastUpdated: new Date().toISOString() },
      ]);
      chainProvider.setTotalSupply(TEST_CONTRACT, '900000');

      const report = await reconciliationService.reconcile({
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      });

      expect(report.status).toBe(ReconciliationStatus.COMPLETED);
      expect(report.discrepanciesFound).toBeGreaterThan(0);

      const balanceDiscrepancy = report.discrepancies.find(d => d.type === DiscrepancyType.BALANCE_MISMATCH);
      expect(balanceDiscrepancy).toBeDefined();
      expect(balanceDiscrepancy!.serverValue).toBe('1000000');
      expect(balanceDiscrepancy!.chainValue).toBe('900000');
    });

    it('should detect missing on-chain holder', async () => {
      serverProvider.setBalances(TEST_ASSET_ID, [
        { holderId: 'holder-1', holderAddress: '0xAAA', balance: '1000000', lastUpdated: new Date().toISOString() },
      ]);
      serverProvider.setTotalSupply(TEST_ASSET_ID, '1000000');

      chainProvider.setBalances(TEST_CONTRACT, []);
      chainProvider.setTotalSupply(TEST_CONTRACT, '0');

      const report = await reconciliationService.reconcile({
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      });

      const missingDiscrepancy = report.discrepancies.find(d => d.type === DiscrepancyType.MISSING_ON_CHAIN);
      expect(missingDiscrepancy).toBeDefined();
      expect(missingDiscrepancy!.holderAddress).toBe('0xaaa');
    });

    it('should detect supply mismatch', async () => {
      serverProvider.setTotalSupply(TEST_ASSET_ID, '2000000');
      chainProvider.setTotalSupply(TEST_CONTRACT, '1500000');

      const report = await reconciliationService.reconcile({
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      });

      const supplyDiscrepancy = report.discrepancies.find(d => d.type === DiscrepancyType.SUPPLY_MISMATCH);
      expect(supplyDiscrepancy).toBeDefined();
      expect(supplyDiscrepancy!.severity).toBe(DiscrepancySeverity.CRITICAL);
    });
  });

  describe('Alert Handling', () => {
    it('should notify alert handlers on discrepancy', async () => {
      const discrepancies: Discrepancy[] = [];
      const reports: ReconciliationReport[] = [];

      reconciliationService.registerAlertHandler({
        onDiscrepancy: async (d) => { discrepancies.push(d); },
        onComplete: async (r) => { reports.push(r); },
        onError: async () => {},
      });

      serverProvider.setTotalSupply(TEST_ASSET_ID, '1000000');
      chainProvider.setTotalSupply(TEST_CONTRACT, '500000');

      await reconciliationService.reconcile({
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      });

      expect(discrepancies.length).toBeGreaterThan(0);
      expect(reports.length).toBe(1);
    });
  });

  describe('Discrepancy Resolution', () => {
    it('should allow manual resolution of discrepancies', async () => {
      serverProvider.setTotalSupply(TEST_ASSET_ID, '1000000');
      chainProvider.setTotalSupply(TEST_CONTRACT, '500000');

      const report = await reconciliationService.reconcile({
        assetId: TEST_ASSET_ID,
        contractAddress: TEST_CONTRACT,
        chainId: TEST_CHAIN_ID,
      });

      const discrepancy = report.discrepancies[0];
      expect(discrepancy.resolved).toBe(false);

      const resolved = reconciliationService.resolveDiscrepancy(
        discrepancy.id,
        'Manual adjustment made on-chain'
      );

      expect(resolved).toBe(true);

      const unresolved = reconciliationService.getUnresolvedDiscrepancies();
      expect(unresolved.find(d => d.id === discrepancy.id)).toBeUndefined();
    });
  });
});

// ============================================================================
// MULTISIG GOVERNANCE TESTS
// ============================================================================

import {
  MultisigWallet,
  TimelockController,
  OperationType,
  ProposalStatus,
  type Signer,
} from '@tokenisation/chains';

describe('MultisigGovernance', () => {
  let multisig: MultisigWallet;
  const signers: Signer[] = [
    { id: 's1', address: '0xSigner1', name: 'Signer 1', weight: 1, isActive: true, addedAt: new Date().toISOString() },
    { id: 's2', address: '0xSigner2', name: 'Signer 2', weight: 1, isActive: true, addedAt: new Date().toISOString() },
    { id: 's3', address: '0xSigner3', name: 'Signer 3', weight: 1, isActive: true, addedAt: new Date().toISOString() },
  ];

  beforeEach(() => {
    multisig = new MultisigWallet({
      threshold: 2,
      signers,
      chainId: 1,
      timelockDuration: 2, // 2 seconds for testing
      emergencyTimelockDuration: 1,
      proposalExpiryDuration: 60,
    }, {
      minDelay: 1, // Override min delay for testing
      maxDelay: 100,
      gracePeriod: 60,
      bypassOperations: [],
    });
  });

  describe('Proposal Lifecycle', () => {
    it('should create a proposal', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.CONTRACT_UPGRADE,
        title: 'Upgrade Token Contract',
        description: 'Upgrade to v2',
        target: '0xNewContract',
        proposedBy: '0xSigner1',
      });

      expect(proposal.id).toBeDefined();
      expect(proposal.status).toBe(ProposalStatus.PENDING);
      expect(proposal.requiredSignatures).toBe(2);
      expect(proposal.currentSignatures).toBe(0);
    });

    it('should reject proposal from non-signer', async () => {
      await expect(
        multisig.createProposal({
          operationType: OperationType.CONTRACT_UPGRADE,
          title: 'Test',
          description: 'Test',
          target: '0x0',
          proposedBy: '0xUnauthorized',
        })
      ).rejects.toThrow('Proposer is not an active signer');
    });

    it('should collect signatures and approve when threshold reached', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.PARAMETER_CHANGE,
        title: 'Change Parameter',
        description: 'Update max supply',
        target: '0xContract',
        proposedBy: '0xSigner1',
      });

      // First signature
      await multisig.signProposal({
        proposalId: proposal.id,
        signerAddress: '0xSigner1',
        signature: '0x' + 'a'.repeat(130),
      });

      let updated = multisig.getProposal(proposal.id)!;
      expect(updated.currentSignatures).toBe(1);
      expect(updated.status).toBe(ProposalStatus.PENDING);

      // Second signature - should approve
      await multisig.signProposal({
        proposalId: proposal.id,
        signerAddress: '0xSigner2',
        signature: '0x' + 'b'.repeat(130),
      });

      updated = multisig.getProposal(proposal.id)!;
      expect(updated.currentSignatures).toBe(2);
      expect(updated.status).toBe(ProposalStatus.QUEUED);
      expect(updated.queuedAt).toBeDefined();
      expect(updated.executableAt).toBeDefined();
    });

    it('should prevent duplicate signatures', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.ROLE_GRANT,
        title: 'Add Role',
        description: 'Grant admin role',
        target: '0xUser',
        proposedBy: '0xSigner1',
      });

      await multisig.signProposal({
        proposalId: proposal.id,
        signerAddress: '0xSigner1',
        signature: '0x' + 'a'.repeat(130),
      });

      await expect(
        multisig.signProposal({
          proposalId: proposal.id,
          signerAddress: '0xSigner1',
          signature: '0x' + 'a'.repeat(130),
        })
      ).rejects.toThrow('Already signed this proposal');
    });

    it('should enforce timelock before execution', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.CONTRACT_UPGRADE,
        title: 'Upgrade',
        description: 'Upgrade contract',
        target: '0xNew',
        proposedBy: '0xSigner1',
        customTimelockDuration: 5, // 5 seconds
      });

      // Sign and approve
      await multisig.signProposal({ proposalId: proposal.id, signerAddress: '0xSigner1', signature: '0x' + 'a'.repeat(130) });
      await multisig.signProposal({ proposalId: proposal.id, signerAddress: '0xSigner2', signature: '0x' + 'b'.repeat(130) });

      // Try to execute immediately - should fail
      await expect(
        multisig.executeProposal(proposal.id, '0xSigner1', async () => 'success')
      ).rejects.toThrow('Timelock not expired');
    });

    it('should execute after timelock expires', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.PARAMETER_CHANGE,
        title: 'Change',
        description: 'Change param',
        target: '0xContract',
        proposedBy: '0xSigner1',
        customTimelockDuration: 1, // 1 second
      });

      await multisig.signProposal({ proposalId: proposal.id, signerAddress: '0xSigner1', signature: '0x' + 'a'.repeat(130) });
      await multisig.signProposal({ proposalId: proposal.id, signerAddress: '0xSigner2', signature: '0x' + 'b'.repeat(130) });

      // Wait for timelock
      await new Promise(resolve => setTimeout(resolve, 1100));

      const executed = await multisig.executeProposal(
        proposal.id,
        '0xSigner1',
        async () => '0xTxHash123'
      );

      expect(executed.status).toBe(ProposalStatus.EXECUTED);
      expect(executed.executionTxHash).toBe('0xTxHash123');
    });

    it('should allow cancellation of pending proposals', async () => {
      const proposal = await multisig.createProposal({
        operationType: OperationType.ASSET_FREEZE,
        title: 'Freeze Asset',
        description: 'Emergency freeze',
        target: '0xAsset',
        proposedBy: '0xSigner1',
      });

      const cancelled = await multisig.cancelProposal(
        proposal.id,
        '0xSigner2',
        'Not needed anymore'
      );

      expect(cancelled.status).toBe(ProposalStatus.CANCELLED);
      expect(cancelled.cancellationReason).toBe('Not needed anymore');
    });
  });

  describe('Timelock Controller', () => {
    let timelock: TimelockController;

    beforeEach(() => {
      timelock = new TimelockController(1); // 1 second minimum delay
    });

    it('should schedule and execute operations', async () => {
      const operationId = timelock.schedule({
        target: '0xContract',
        value: '0',
        data: '0xCalldata',
        salt: 'unique-salt',
        delay: 1,
      });

      expect(operationId).toBeDefined();
      expect(timelock.isOperationReady(operationId)).toBe(false);

      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(timelock.isOperationReady(operationId)).toBe(true);

      let executed = false;
      await timelock.execute(operationId, async () => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it('should prevent duplicate scheduling', () => {
      timelock.schedule({
        target: '0xContract',
        value: '0',
        data: '0xData',
        salt: 'same-salt',
      });

      expect(() =>
        timelock.schedule({
          target: '0xContract',
          value: '0',
          data: '0xData',
          salt: 'same-salt',
        })
      ).toThrow('Operation already scheduled');
    });

    it('should allow cancellation', () => {
      const operationId = timelock.schedule({
        target: '0xContract',
        value: '0',
        data: '0xData',
        salt: 'cancel-test',
      });

      const cancelled = timelock.cancel(operationId);
      expect(cancelled).toBe(true);
      expect(timelock.getRemainingTime(operationId)).toBe(-1);
    });
  });
});

// ============================================================================
// IDEMPOTENT OPERATIONS TESTS
// ============================================================================

import {
  IdempotentOperationsManager,
  IdempotentCashFlowEngine,
  OperationType as IdempotentOpType,
} from '@tokenisation/core';
import { CashFlowEngine, DistributionType, DistributionFrequency } from '@tokenisation/core';

describe('IdempotentOperations', () => {
  let idempotentOps: IdempotentOperationsManager;

  beforeEach(() => {
    idempotentOps = new IdempotentOperationsManager();
  });

  describe('Mint Idempotency', () => {
    it('should execute mint only once for same key', async () => {
      let executionCount = 0;

      const params = {
        assetId: 'asset-1',
        to: '0xRecipient',
        amount: '1000000',
        nonce: 1,
      };

      // First call
      const result1 = await idempotentOps.mint(params, async () => {
        executionCount++;
        return { txHash: '0xHash1' };
      });

      expect(result1.success).toBe(true);
      expect(executionCount).toBe(1);

      // Second call with same params - should return cached
      const result2 = await idempotentOps.mint(params, async () => {
        executionCount++;
        return { txHash: '0xHash2' };
      });

      expect(result2.success).toBe(true);
      expect(executionCount).toBe(1); // Not incremented
      if (result2.success) {
        expect(result2.data).toEqual({ txHash: '0xHash1' }); // Same result
      }
    });

    it('should allow different nonces for same recipient', async () => {
      let executionCount = 0;

      const result1 = await idempotentOps.mint(
        { assetId: 'asset-1', to: '0xRecipient', amount: '1000', nonce: 1 },
        async () => { executionCount++; return { id: 1 }; }
      );

      const result2 = await idempotentOps.mint(
        { assetId: 'asset-1', to: '0xRecipient', amount: '1000', nonce: 2 },
        async () => { executionCount++; return { id: 2 }; }
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(executionCount).toBe(2);
    });
  });

  describe('Distribution Idempotency', () => {
    it('should execute distribution only once per schedule+date', async () => {
      let executionCount = 0;

      const params = {
        scheduleId: 'schedule-1',
        assetId: 'asset-1',
        totalAmount: '50000',
        executionDate: '2025-01-15',
      };

      const result1 = await idempotentOps.distribute(params, async () => {
        executionCount++;
        return { distributionId: 'dist-1' };
      });

      const result2 = await idempotentOps.distribute(params, async () => {
        executionCount++;
        return { distributionId: 'dist-2' };
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(executionCount).toBe(1);
    });

    it('should allow different execution dates for same schedule', async () => {
      let executionCount = 0;

      await idempotentOps.distribute(
        { scheduleId: 'schedule-1', assetId: 'asset-1', totalAmount: '50000', executionDate: '2025-01-15' },
        async () => { executionCount++; return { id: 1 }; }
      );

      await idempotentOps.distribute(
        { scheduleId: 'schedule-1', assetId: 'asset-1', totalAmount: '50000', executionDate: '2025-02-15' },
        async () => { executionCount++; return { id: 2 }; }
      );

      expect(executionCount).toBe(2);
    });
  });

  describe('Claim Idempotency', () => {
    it('should allow only one claim per distribution+recipient', async () => {
      let claimCount = 0;

      const result1 = await idempotentOps.claim(
        { distributionId: 'dist-1', recipientId: 'holder-1', amount: '1000' },
        async () => { claimCount++; return { claimed: true }; }
      );

      const result2 = await idempotentOps.claim(
        { distributionId: 'dist-1', recipientId: 'holder-1', amount: '1000' },
        async () => { claimCount++; return { claimed: true }; }
      );

      expect(claimCount).toBe(1);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('Idempotent CashFlow Wrapper', () => {
    let cashFlowEngine: CashFlowEngine;
    let idempotentCashFlow: IdempotentCashFlowEngine;
    let testAssetId: string;

    beforeEach(() => {
      testAssetId = uuidv4();
      cashFlowEngine = new CashFlowEngine();
      cashFlowEngine.setBalanceProvider(async () => [
        { holderId: 'holder-1', balance: '500000', weight: 1 },
        { holderId: 'holder-2', balance: '500000', weight: 1 },
      ]);

      idempotentCashFlow = new IdempotentCashFlowEngine(cashFlowEngine);
    });

    it('should execute distribution idempotently', async () => {
      const schedule = cashFlowEngine.createSchedule({
        assetId: testAssetId,
        type: DistributionType.DIVIDEND,
        frequency: DistributionFrequency.MONTHLY,
        paymentCurrency: 'USDC',
        amount: '10000',
        startDate: new Date().toISOString(),
      });

      const result1 = await idempotentCashFlow.executeDistribution(schedule.id, {
        amount: '10000',
        snapshotAt: '2025-01-15T00:00:00Z',
      });

      const result2 = await idempotentCashFlow.executeDistribution(schedule.id, {
        amount: '10000',
        snapshotAt: '2025-01-15T00:00:00Z',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Should be same distribution
      if (result1.success && result2.success) {
        expect(result1.data.id).toBe(result2.data.id);
      }
    });
  });
});

// ============================================================================
// JOB QUEUE TESTS
// ============================================================================

import {
  JobQueue,
  JobStatus,
  JobPriority,
  MemoryJobStore,
  createDistributionQueue,
} from '@tokenisation/core';

describe('JobQueue', () => {
  let queue: JobQueue<{ value: number }, { result: string }>;

  beforeEach(() => {
    queue = new JobQueue('test-queue', new MemoryJobStore(), {
      concurrency: 2,
    });
  });

  afterEach(async () => {
    await queue.close();
  });

  describe('Job Management', () => {
    it('should add and retrieve jobs', async () => {
      const job = await queue.add('process', { value: 42 });

      expect(job.id).toBeDefined();
      expect(job.status).toBe(JobStatus.WAITING);
      expect(job.data.value).toBe(42);

      const retrieved = await queue.getJob(job.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.data.value).toBe(42);
    });

    it('should add bulk jobs', async () => {
      const jobs = await queue.addBulk([
        { name: 'job1', data: { value: 1 } },
        { name: 'job2', data: { value: 2 } },
        { name: 'job3', data: { value: 3 } },
      ]);

      expect(jobs.length).toBe(3);

      const counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(3);
    });

    it('should respect job priority', async () => {
      await queue.add('low', { value: 1 }, { priority: JobPriority.LOW });
      await queue.add('high', { value: 2 }, { priority: JobPriority.HIGH });
      await queue.add('normal', { value: 3 }, { priority: JobPriority.NORMAL });

      const waiting = await queue.getWaiting();

      // High priority should be first
      expect(waiting[0].name).toContain('high');
    });

    it('should handle delayed jobs', async () => {
      const job = await queue.add('delayed', { value: 100 }, { delay: 500 });

      expect(job.status).toBe(JobStatus.DELAYED);

      const delayed = await queue.getDelayed();
      expect(delayed.length).toBe(1);
    });
  });

  describe('Job Processing', () => {
    it('should process jobs', async () => {
      const processed: number[] = [];

      queue.process(async (job) => {
        processed.push(job.data.value);
        return { result: `processed-${job.data.value}` };
      });

      await queue.add('task', { value: 1 });
      await queue.add('task', { value: 2 });

      queue.start(100);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(processed).toContain(1);
      expect(processed).toContain(2);

      const counts = await queue.getJobCounts();
      expect(counts.completed).toBe(2);
    });

    it('should retry failed jobs', async () => {
      let attempts = 0;

      queue.process(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return { result: 'success' };
      });

      await queue.add('retry-task', { value: 1 }, {
        attempts: 3,
        backoff: { type: 'fixed', delay: 50 },
      });

      queue.start(25);

      // Wait for retries (need time for: attempt 1, 50ms backoff, attempt 2, 50ms backoff, attempt 3)
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(attempts).toBe(3);

      const counts = await queue.getJobCounts();
      expect(counts.completed).toBe(1);
    });

    it('should move to dead letter after max attempts', async () => {
      queue.process(async () => {
        throw new Error('Always fails');
      });

      const deadJobs: unknown[] = [];
      queue.on('dead', (job) => deadJobs.push(job));

      await queue.add('failing-task', { value: 1 }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 25 },
      });

      queue.start(25);

      // Wait for: attempt 1, 25ms backoff, attempt 2 (max reached -> dead)
      await new Promise(resolve => setTimeout(resolve, 800));

      expect(deadJobs.length).toBe(1);
    });

    it('should track job progress', async () => {
      const progressUpdates: number[] = [];

      queue.on('progress', (job, progress) => {
        progressUpdates.push(progress);
      });

      queue.process(async (job) => {
        await queue.updateProgress(job.id, 25);
        await queue.updateProgress(job.id, 50);
        await queue.updateProgress(job.id, 75);
        return { result: 'done' };
      });

      await queue.add('progress-task', { value: 1 });

      queue.start(100);

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
    });
  });

  describe('Queue Management', () => {
    it('should pause and resume', async () => {
      const processed: number[] = [];

      queue.process(async (job) => {
        processed.push(job.data.value);
        return { result: 'done' };
      });

      await queue.add('task', { value: 1 });
      await queue.pause();

      queue.start(100);

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(processed.length).toBe(0);

      await queue.resume();

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(processed.length).toBe(1);
    });

    it('should clean old jobs', async () => {
      queue.process(async () => ({ result: 'done' }));

      await queue.add('task1', { value: 1 });
      await queue.add('task2', { value: 2 });

      queue.start(50);

      await new Promise(resolve => setTimeout(resolve, 300));

      const counts = await queue.getJobCounts();
      expect(counts.completed).toBe(2);

      // Clean immediately (0 grace period)
      const cleaned = await queue.clean(0, JobStatus.COMPLETED);
      expect(cleaned).toBe(2);

      const countsAfter = await queue.getJobCounts();
      expect(countsAfter.completed).toBe(0);
    });

    it('should drain the queue', async () => {
      await queue.add('task1', { value: 1 });
      await queue.add('task2', { value: 2 });
      await queue.add('task3', { value: 3 });

      let counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(3);

      await queue.drain();

      counts = await queue.getJobCounts();
      expect(counts.waiting).toBe(0);
    });
  });

  describe('Distribution Queue', () => {
    it('should create a distribution queue with proper defaults', async () => {
      const distQueue = createDistributionQueue();

      const job = await distQueue.add('monthly-rent', {
        scheduleId: 'schedule-1',
        assetId: 'property-1',
        executionDate: '2025-01-15',
      });

      expect(job.maxAttempts).toBe(3);
      expect(job.opts.backoff?.type).toBe('exponential');

      await distQueue.close();
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Production Components Integration', () => {
  it('should work together: JobQueue + IdempotentOps for distributions', async () => {
    const propertyAssetId = uuidv4();
    const cashFlowEngine = new CashFlowEngine();
    cashFlowEngine.setBalanceProvider(async () => [
      { holderId: 'holder-1', balance: '700000', weight: 1 },
      { holderId: 'holder-2', balance: '300000', weight: 1 },
    ]);

    const idempotentCashFlow = new IdempotentCashFlowEngine(cashFlowEngine);

    const schedule = cashFlowEngine.createSchedule({
      assetId: propertyAssetId,
      type: DistributionType.RENT,
      frequency: DistributionFrequency.MONTHLY,
      paymentCurrency: 'USDC',
      amount: '10000',
      startDate: new Date().toISOString(),
    });

    const distQueue = createDistributionQueue();
    const processedDistributions: string[] = [];

    distQueue.process(async (job) => {
      const result = await idempotentCashFlow.executeDistribution(
        job.data.scheduleId,
        {
          amount: '10000',
          snapshotAt: job.data.executionDate,
        }
      );

      if (result.success) {
        processedDistributions.push(result.data.id);
        return { distributionId: result.data.id };
      }
      throw new Error(result.error);
    });

    // Add job twice (simulating retry)
    await distQueue.add('monthly-rent', {
      scheduleId: schedule.id,
      assetId: propertyAssetId,
      executionDate: '2025-01-15T00:00:00Z',
    });

    await distQueue.add('monthly-rent', {
      scheduleId: schedule.id,
      assetId: propertyAssetId,
      executionDate: '2025-01-15T00:00:00Z',
    });

    distQueue.start(50);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Both jobs completed but same distribution ID due to idempotency
    expect(processedDistributions.length).toBe(2);
    expect(processedDistributions[0]).toBe(processedDistributions[1]);

    await distQueue.close();
  });
});
