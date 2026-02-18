/**
 * Workflow Orchestrator — Unified workflow lifecycle management
 *
 * Provides: startWorkflow, getWorkflowStatus, resumeWorkflow,
 * event replay, settlement receipts, and time-travel debugging.
 */

// ============================================================================
// Workflow Status (consolidated enum)
// ============================================================================

export type WorkflowStatus =
  | 'pending'
  | 'waiting_external'   // waiting for KYC/oracle/payment provider
  | 'submitted'          // on-chain tx submitted
  | 'confirmed'          // on-chain tx confirmed
  | 'blocked'            // compliance/policy blocked
  | 'failed'
  | 'completed';

export type WorkflowType =
  | 'mint'
  | 'transfer'
  | 'redeem'
  | 'invest'
  | 'distribute'
  | 'tokenize'
  | 'corporate_action'
  | 'refund';

// ============================================================================
// Workflow Handle
// ============================================================================

export interface WorkflowHandle {
  id: string;
  type: WorkflowType;
  status: WorkflowStatus;
  payload: Record<string, unknown>;
  steps: WorkflowStep[];
  currentStep: number;
  createdAt: string;
  updatedAt: string;
  /** Human-readable explanation when blocked */
  blockedReason?: string;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining?: number;
  /** On-chain tx hash (when submitted/confirmed) */
  txHash?: string;
  /** Correlation ID for tracing */
  correlationId: string;
  /** Error details if failed */
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

export interface WorkflowStep {
  index: number;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped' | 'waiting_external';
  /** Estimated duration in seconds for this step */
  estimatedDurationSec?: number;
  startedAt?: string;
  completedAt?: string;
  /** Human-readable description of what this step does */
  description: string;
  /** What the user sees when this step is waiting */
  waitingMessage?: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Workflow Events (typed, replayable, correlated)
// ============================================================================

export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.updated'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.blocked'
  | 'compliance.checked'
  | 'compliance.blocked'
  | 'compliance.cleared'
  | 'payment.initiated'
  | 'payment.confirmed'
  | 'payment.failed'
  | 'oracle.requested'
  | 'oracle.verified'
  | 'oracle.failed'
  | 'receipt.issued'
  | 'chain.submitted'
  | 'chain.confirmed'
  | 'chain.failed';

export interface WorkflowEvent<T = Record<string, unknown>> {
  id: string;
  workflowId: string;
  type: WorkflowEventType;
  timestamp: string;
  correlationId: string;
  /** On-chain tx hash when applicable */
  txHash?: string;
  /** Sequence number for ordering/replay */
  sequence: number;
  data: T;
  /** Off-chain reference ID (e.g. compliance decision ID, payment intent ID) */
  offChainRef?: string;
  /** On-chain block number when applicable */
  blockNumber?: number;
}

// ============================================================================
// Settlement Receipt
// ============================================================================

export interface SettlementReceipt {
  id: string;
  workflowId: string;
  type: 'mint' | 'transfer' | 'redeem' | 'distribute' | 'refund';
  status: 'pending' | 'settled' | 'failed';
  /** Parties involved */
  from?: { id: string; name?: string; address?: string };
  to?: { id: string; name?: string; address?: string };
  /** Asset/token info */
  assetId: string;
  tokenId?: string;
  amount: string;
  currency?: string;
  /** On-chain proof */
  txHash?: string;
  blockNumber?: number;
  chainId?: number;
  /** Compliance proof */
  complianceReceiptId?: string;
  /** Timestamps */
  initiatedAt: string;
  settledAt?: string;
  /** Verification */
  signature?: string;
  signatureAlgorithm?: string;
}

export interface OnChainAnchor {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  chainId: number;
  contractAddress: string;
  logIndex?: number;
  timestamp: string;
  explorerUrl?: string;
}

// ============================================================================
// Time-Estimate Hints
// ============================================================================

const STEP_TIME_ESTIMATES: Record<string, number> = {
  'compliance_check': 3,
  'kyc_verification': 30,
  'gas_estimation': 2,
  'wallet_signature': 15,
  'chain_submission': 5,
  'chain_confirmation': 30,
  'oracle_verification': 45,
  'payment_processing': 10,
  'settlement': 5,
};

// ============================================================================
// Blocked Workflow Explanations
// ============================================================================

/** Human-readable explanations for blocked workflow states */
const BLOCKED_EXPLANATIONS: Record<string, { title: string; description: string; action?: string }> = {
  KYC_REQUIRED: { title: 'Identity verification required', description: 'Your identity must be verified before proceeding.', action: 'Complete KYC verification' },
  KYC_EXPIRED: { title: 'Identity verification expired', description: 'Your KYC verification has expired and needs renewal.', action: 'Renew verification' },
  COMPLIANCE_FAILED: { title: 'Compliance check failed', description: 'This transaction does not meet current compliance requirements.', action: 'Review compliance requirements' },
  SANCTIONS_BLOCKED: { title: 'Sanctions restriction', description: 'This transaction is restricted due to sanctions screening.', action: 'Contact support' },
  LOCKUP_ACTIVE: { title: 'Lockup period active', description: 'Tokens are still within the mandatory holding period.', action: 'Wait for lockup to expire' },
  WHITELIST_REQUIRED: { title: 'Whitelist approval needed', description: 'The recipient must be on the transfer whitelist.', action: 'Request whitelist approval' },
  ACCREDITATION_REQUIRED: { title: 'Accreditation needed', description: 'Accredited investor status is required for this transaction.', action: 'Submit accreditation' },
  PAYMENT_PENDING: { title: 'Payment processing', description: 'Waiting for payment confirmation from the provider.', action: 'Check payment status' },
  ORACLE_PENDING: { title: 'Oracle verification pending', description: 'Waiting for external data verification from the oracle.', action: 'Wait for oracle response' },
  APPROVAL_REQUIRED: { title: 'Issuer approval needed', description: 'This transaction requires explicit approval from the issuer.', action: 'Request approval' },
  INSUFFICIENT_BALANCE: { title: 'Insufficient balance', description: 'The account does not have enough tokens for this operation.', action: 'Acquire more tokens' },
  GAS_TOO_HIGH: { title: 'Network fees too high', description: 'Current gas prices exceed acceptable limits. Try again later.', action: 'Retry when fees are lower' },
};

/** Get human-readable explanation for a blocked workflow */
export function getBlockedExplanation(code: string): { title: string; description: string; action?: string } {
  return BLOCKED_EXPLANATIONS[code] || { title: 'Transaction blocked', description: `This workflow is blocked (${code}). Contact support for assistance.` };
}

// ============================================================================
// WorkflowOrchestrator
// ============================================================================

export class WorkflowOrchestrator {
  private workflows = new Map<string, WorkflowHandle>();
  private events = new Map<string, WorkflowEvent[]>();
  private listeners = new Map<WorkflowEventType | '*', Set<(event: WorkflowEvent) => void>>();
  private receipts = new Map<string, SettlementReceipt>();
  private pollingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private apiBaseUrl: string;
  private getToken: (() => string) | null;

  constructor(config: {
    apiBaseUrl?: string;
    getToken?: () => string;
  } = {}) {
    this.apiBaseUrl = config.apiBaseUrl || '';
    this.getToken = config.getToken || null;
  }

  // --------------------------------------------------------------------------
  // Workflow Lifecycle
  // --------------------------------------------------------------------------

  /** Start a new workflow */
  startWorkflow(type: WorkflowType, payload: Record<string, unknown>): WorkflowHandle {
    const id = crypto.randomUUID ? crypto.randomUUID() : `wf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const correlationId = `cor_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const steps = this.buildSteps(type);
    const now = new Date().toISOString();

    const handle: WorkflowHandle = {
      id,
      type,
      status: 'pending',
      payload,
      steps,
      currentStep: 0,
      createdAt: now,
      updatedAt: now,
      correlationId,
      estimatedTimeRemaining: steps.reduce((sum, s) => sum + (s.estimatedDurationSec || 0), 0),
    };

    this.workflows.set(id, handle);
    this.events.set(id, []);
    this.emitEvent(id, 'workflow.started', { type, payload });
    return handle;
  }

  /** Get current workflow status */
  getWorkflowStatus(workflowId: string): WorkflowHandle | null {
    return this.workflows.get(workflowId) || null;
  }

  /** Resume a paused/blocked workflow */
  resumeWorkflow(workflowId: string, resumeData?: Record<string, unknown>): WorkflowHandle | null {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;
    if (wf.status !== 'blocked' && wf.status !== 'waiting_external') return wf;

    wf.status = 'pending';
    wf.blockedReason = undefined;
    wf.updatedAt = new Date().toISOString();
    if (resumeData) {
      wf.steps[wf.currentStep].data = { ...wf.steps[wf.currentStep].data, ...resumeData };
    }
    this.emitEvent(workflowId, 'workflow.updated', { resumed: true, resumeData });
    return wf;
  }

  /** Advance workflow to next step (called internally or by integration) */
  advanceStep(workflowId: string, stepData?: Record<string, unknown>): WorkflowHandle | null {
    const wf = this.workflows.get(workflowId);
    if (!wf) return null;

    const current = wf.steps[wf.currentStep];
    if (current) {
      current.status = 'completed';
      current.completedAt = new Date().toISOString();
      if (stepData) current.data = { ...current.data, ...stepData };
    }

    wf.currentStep++;
    wf.updatedAt = new Date().toISOString();

    if (wf.currentStep >= wf.steps.length) {
      wf.status = 'completed';
      this.emitEvent(workflowId, 'workflow.completed', { totalSteps: wf.steps.length });
      this.stopPolling(workflowId);
    } else {
      wf.steps[wf.currentStep].status = 'in_progress';
      wf.steps[wf.currentStep].startedAt = new Date().toISOString();
      wf.estimatedTimeRemaining = wf.steps
        .filter((_, i) => i >= wf.currentStep)
        .reduce((sum, s) => sum + (s.estimatedDurationSec || 0), 0);
      this.emitEvent(workflowId, 'workflow.updated', {
        step: wf.currentStep,
        stepName: wf.steps[wf.currentStep].name,
      });
    }

    return wf;
  }

  /** Mark workflow as blocked */
  blockWorkflow(workflowId: string, reason: string, code?: string): void {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.status = 'blocked';
    wf.blockedReason = reason;
    if (code) {
      const explanation = getBlockedExplanation(code);
      wf.blockedReason = explanation.description;
      (wf as any).blockedCode = code;
      (wf as any).blockedAction = explanation.action;
    }
    wf.updatedAt = new Date().toISOString();
    if (wf.steps[wf.currentStep]) {
      wf.steps[wf.currentStep].status = 'waiting_external';
      wf.steps[wf.currentStep].waitingMessage = reason;
    }
    this.emitEvent(workflowId, 'workflow.blocked', { reason, code });
  }

  /** Mark workflow as failed */
  failWorkflow(workflowId: string, error: { code: string; message: string; details?: Record<string, unknown> }): void {
    const wf = this.workflows.get(workflowId);
    if (!wf) return;
    wf.status = 'failed';
    wf.error = error;
    wf.updatedAt = new Date().toISOString();
    if (wf.steps[wf.currentStep]) {
      wf.steps[wf.currentStep].status = 'failed';
    }
    this.emitEvent(workflowId, 'workflow.failed', { error });
    this.stopPolling(workflowId);
  }

  // --------------------------------------------------------------------------
  // Event System (typed, replayable, correlated)
  // --------------------------------------------------------------------------

  /** Subscribe to workflow events */
  on(eventType: WorkflowEventType | '*', listener: (event: WorkflowEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => { this.listeners.get(eventType)?.delete(listener); };
  }

  /** Replay all events for a workflow (for debugging/time-travel) */
  replayEvents(workflowId: string, onEvent: (event: WorkflowEvent) => void): void {
    const events = this.events.get(workflowId) || [];
    for (const event of events) {
      onEvent(event);
    }
  }

  /** Get all events for a workflow */
  getWorkflowEvents(workflowId: string): WorkflowEvent[] {
    return [...(this.events.get(workflowId) || [])];
  }

  // --------------------------------------------------------------------------
  // Polling (for workflows awaiting external completion)
  // --------------------------------------------------------------------------

  /** Start polling workflow status from the API */
  startPolling(workflowId: string, intervalMs: number = 3000): void {
    if (this.pollingIntervals.has(workflowId)) return;
    const interval = setInterval(async () => {
      try {
        const res = await this.apiFetch(`/workflows/${workflowId}`);
        if (res) {
          const wf = this.workflows.get(workflowId);
          if (wf && res.status !== wf.status) {
            Object.assign(wf, res);
            this.emitEvent(workflowId, 'workflow.updated', { polled: true });
          }
          if (res.status === 'completed' || res.status === 'failed') {
            this.stopPolling(workflowId);
          }
        }
      } catch {
        // polling failure is non-fatal
      }
    }, intervalMs);
    this.pollingIntervals.set(workflowId, interval);
  }

  stopPolling(workflowId: string): void {
    const interval = this.pollingIntervals.get(workflowId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(workflowId);
    }
  }

  // --------------------------------------------------------------------------
  // Receipts & Proofs
  // --------------------------------------------------------------------------

  /** Get settlement receipt for a workflow */
  getSettlementReceipt(workflowId: string): SettlementReceipt | null {
    return this.receipts.get(workflowId) || null;
  }

  /** Create a settlement receipt */
  issueSettlementReceipt(receipt: Omit<SettlementReceipt, 'id'>): SettlementReceipt {
    const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const full: SettlementReceipt = { id, ...receipt };
    this.receipts.set(receipt.workflowId, full);
    this.emitEvent(receipt.workflowId, 'receipt.issued', { receiptId: id });
    return full;
  }

  /** Get on-chain anchor for a receipt or workflow */
  getOnChainAnchor(receiptOrWorkflowId: string): OnChainAnchor | null {
    const receipt = this.receipts.get(receiptOrWorkflowId);
    if (receipt?.txHash && receipt.blockNumber && receipt.chainId) {
      return {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        blockHash: '', // would come from chain query
        chainId: receipt.chainId,
        contractAddress: '', // would come from chain query
        timestamp: receipt.settledAt || receipt.initiatedAt,
      };
    }
    const wf = this.workflows.get(receiptOrWorkflowId);
    if (wf?.txHash) {
      return {
        txHash: wf.txHash,
        blockNumber: 0,
        blockHash: '',
        chainId: 0,
        contractAddress: '',
        timestamp: wf.updatedAt,
      };
    }
    return null;
  }

  /** Verify receipt signature */
  verifyReceiptSignature(receipt: SettlementReceipt): { valid: boolean; error?: string } {
    if (!receipt.signature) return { valid: false, error: 'No signature present' };
    // In production, this would verify against issuer's public key
    // For now, check signature exists and format is valid
    const isHex = /^[0-9a-f]+$/i.test(receipt.signature);
    if (!isHex) return { valid: false, error: 'Invalid signature format' };
    return { valid: true };
  }

  // --------------------------------------------------------------------------
  // Workflow Replayer (time-travel debugging)
  // --------------------------------------------------------------------------

  /** Reconstruct workflow state at a specific event sequence */
  getStateAtEvent(workflowId: string, sequence: number): WorkflowHandle | null {
    const events = this.events.get(workflowId);
    if (!events) return null;

    // Replay events up to the sequence number to reconstruct state
    const initial = this.buildInitialHandle(workflowId);
    if (!initial) return null;

    for (const event of events) {
      if (event.sequence > sequence) break;
      this.applyEventToHandle(initial, event);
    }
    return initial;
  }

  /** Get snapshot of all workflows for debugging */
  getDebugSnapshot(): {
    workflows: WorkflowHandle[];
    totalEvents: number;
    activePolling: string[];
  } {
    return {
      workflows: Array.from(this.workflows.values()),
      totalEvents: Array.from(this.events.values()).reduce((sum, evts) => sum + evts.length, 0),
      activePolling: Array.from(this.pollingIntervals.keys()),
    };
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    for (const [id] of this.pollingIntervals) {
      this.stopPolling(id);
    }
    this.workflows.clear();
    this.events.clear();
    this.listeners.clear();
    this.receipts.clear();
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private emitEvent(workflowId: string, type: WorkflowEventType, data: Record<string, unknown>, extra?: { txHash?: string; offChainRef?: string; blockNumber?: number }): void {
    const wf = this.workflows.get(workflowId);
    const events = this.events.get(workflowId) || [];
    const event: WorkflowEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workflowId,
      type,
      timestamp: new Date().toISOString(),
      correlationId: wf?.correlationId || workflowId,
      txHash: extra?.txHash || wf?.txHash,
      offChainRef: extra?.offChainRef,
      blockNumber: extra?.blockNumber,
      sequence: events.length + 1,
      data,
    };
    events.push(event);
    this.events.set(workflowId, events);

    // Notify listeners
    this.listeners.get(type)?.forEach(fn => fn(event));
    this.listeners.get('*')?.forEach(fn => fn(event));
  }

  private buildSteps(type: WorkflowType): WorkflowStep[] {
    const stepTemplates: Record<WorkflowType, { name: string; key: string; description: string }[]> = {
      mint: [
        { name: 'Compliance Check', key: 'compliance_check', description: 'Verifying compliance rules and restrictions' },
        { name: 'Gas Estimation', key: 'gas_estimation', description: 'Calculating network fees' },
        { name: 'Wallet Signature', key: 'wallet_signature', description: 'Waiting for wallet approval' },
        { name: 'Chain Submission', key: 'chain_submission', description: 'Submitting transaction to blockchain' },
        { name: 'Chain Confirmation', key: 'chain_confirmation', description: 'Waiting for block confirmation' },
        { name: 'Settlement', key: 'settlement', description: 'Finalizing records' },
      ],
      transfer: [
        { name: 'Compliance Check', key: 'compliance_check', description: 'Checking sender and recipient eligibility' },
        { name: 'Gas Estimation', key: 'gas_estimation', description: 'Calculating transfer fees' },
        { name: 'Wallet Signature', key: 'wallet_signature', description: 'Waiting for sender approval' },
        { name: 'Chain Submission', key: 'chain_submission', description: 'Broadcasting transfer transaction' },
        { name: 'Chain Confirmation', key: 'chain_confirmation', description: 'Waiting for block confirmation' },
        { name: 'Settlement', key: 'settlement', description: 'Updating ownership records' },
      ],
      redeem: [
        { name: 'Eligibility Check', key: 'compliance_check', description: 'Verifying redemption eligibility and lockup period' },
        { name: 'Pricing', key: 'oracle_verification', description: 'Fetching current NAV for redemption pricing' },
        { name: 'Approval', key: 'compliance_check', description: 'Awaiting issuer approval' },
        { name: 'Token Burn', key: 'chain_submission', description: 'Burning redeemed tokens' },
        { name: 'Chain Confirmation', key: 'chain_confirmation', description: 'Waiting for burn confirmation' },
        { name: 'Payment Disbursement', key: 'payment_processing', description: 'Initiating payment to investor' },
      ],
      invest: [
        { name: 'KYC Verification', key: 'kyc_verification', description: 'Verifying investor identity' },
        { name: 'Compliance Check', key: 'compliance_check', description: 'Checking eligibility and limits' },
        { name: 'Payment Processing', key: 'payment_processing', description: 'Processing investment payment' },
        { name: 'Token Minting', key: 'chain_submission', description: 'Minting tokens to investor wallet' },
        { name: 'Chain Confirmation', key: 'chain_confirmation', description: 'Waiting for mint confirmation' },
        { name: 'Settlement', key: 'settlement', description: 'Issuing investment receipt' },
      ],
      distribute: [
        { name: 'Cap Table Snapshot', key: 'compliance_check', description: 'Capturing current holder distribution' },
        { name: 'Calculation', key: 'settlement', description: 'Computing pro-rata allocations' },
        { name: 'Approval', key: 'compliance_check', description: 'Awaiting distribution approval' },
        { name: 'Payment Batch', key: 'payment_processing', description: 'Initiating batch payments' },
        { name: 'Settlement', key: 'settlement', description: 'Finalizing distribution records' },
      ],
      tokenize: [
        { name: 'Asset Registration', key: 'compliance_check', description: 'Registering asset metadata' },
        { name: 'Compliance Setup', key: 'compliance_check', description: 'Configuring compliance rules' },
        { name: 'Oracle Verification', key: 'oracle_verification', description: 'Verifying asset through oracle' },
        { name: 'Contract Deployment', key: 'chain_submission', description: 'Deploying token contract' },
        { name: 'Chain Confirmation', key: 'chain_confirmation', description: 'Waiting for deployment confirmation' },
        { name: 'Activation', key: 'settlement', description: 'Activating token for trading' },
      ],
      corporate_action: [
        { name: 'Action Validation', key: 'compliance_check', description: 'Validating corporate action parameters' },
        { name: 'Snapshot', key: 'settlement', description: 'Capturing holder positions' },
        { name: 'Calculation', key: 'settlement', description: 'Computing entitlements' },
        { name: 'Execution', key: 'chain_submission', description: 'Executing on-chain updates' },
        { name: 'Confirmation', key: 'chain_confirmation', description: 'Awaiting block confirmation' },
      ],
      refund: [
        { name: 'Eligibility Check', key: 'compliance_check', description: 'Verifying refund eligibility' },
        { name: 'Amount Calculation', key: 'settlement', description: 'Calculating refund amount' },
        { name: 'Token Burn', key: 'chain_submission', description: 'Burning tokens if applicable' },
        { name: 'Payment Initiation', key: 'payment_processing', description: 'Initiating refund payment' },
        { name: 'Settlement', key: 'settlement', description: 'Finalizing refund records' },
      ],
    };

    return (stepTemplates[type] || []).map((tmpl, i) => ({
      index: i,
      name: tmpl.name,
      status: i === 0 ? 'in_progress' as const : 'pending' as const,
      estimatedDurationSec: STEP_TIME_ESTIMATES[tmpl.key] || 5,
      description: tmpl.description,
      startedAt: i === 0 ? new Date().toISOString() : undefined,
    }));
  }

  private buildInitialHandle(workflowId: string): WorkflowHandle | null {
    const events = this.events.get(workflowId);
    if (!events || events.length === 0) return null;
    const first = events[0];
    const firstData = first.data as { type?: WorkflowType; payload?: Record<string, unknown> };
    return {
      id: workflowId,
      type: firstData.type || 'mint',
      status: 'pending',
      payload: firstData.payload || {},
      steps: this.buildSteps(firstData.type || 'mint'),
      currentStep: 0,
      createdAt: first.timestamp,
      updatedAt: first.timestamp,
      correlationId: first.correlationId,
    };
  }

  private applyEventToHandle(handle: WorkflowHandle, event: WorkflowEvent): void {
    handle.updatedAt = event.timestamp;
    const data = event.data as Record<string, unknown>;
    switch (event.type) {
      case 'workflow.completed':
        handle.status = 'completed';
        break;
      case 'workflow.failed':
        handle.status = 'failed';
        handle.error = data.error as WorkflowHandle['error'];
        break;
      case 'workflow.blocked':
        handle.status = 'blocked';
        handle.blockedReason = data.reason as string;
        break;
      case 'workflow.updated':
        if (typeof data.step === 'number') handle.currentStep = data.step;
        break;
      case 'chain.submitted':
        handle.status = 'submitted';
        handle.txHash = data.txHash as string;
        break;
      case 'chain.confirmed':
        handle.status = 'confirmed';
        break;
    }
  }

  private async apiFetch(path: string): Promise<any> {
    if (!this.apiBaseUrl) return null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.getToken) headers['Authorization'] = `Bearer ${this.getToken()}`;
    const res = await fetch(`${this.apiBaseUrl}${path}`, { headers });
    if (!res.ok) return null;
    return res.json();
  }
}
