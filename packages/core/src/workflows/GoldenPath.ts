/**
 * Golden Path Workflows - High-level opinionated flows for common tokenization scenarios
 *
 * @deprecated Use WorkflowRegistry instead. Vertical-specific workflows should be
 * registered by their respective packs (e.g., @tokenisation/pack-realestate registers
 * 'tokenize-real-estate'). The generic ProgressCallback, FlowResult, StepResult, and
 * FlowError types are preserved for backward compatibility but new code should use
 * WorkflowProgressEvent, WorkflowResult, etc. from WorkflowRegistry.
 *
 * Migration:
 * ```typescript
 * // Before:
 * sdk.goldenPath.tokenizeRealEstate({ titleDeedNumber: '...' });
 *
 * // After:
 * import { createRealEstateWorkflows } from '@tokenisation/pack-realestate';
 * sdk.workflows.register(createRealEstateWorkflows());
 * sdk.workflows.run('tokenize-real-estate', { titleDeedNumber: '...' });
 * ```
 */

import { type Result, ok, err } from '../core/index.js';

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Progress callback for tracking workflow execution
 */
export interface ProgressCallback {
  (progress: ProgressEvent): void;
}

/**
 * Progress event emitted during workflow execution
 */
export interface ProgressEvent {
  /** Current step number (1-indexed) */
  step: number;
  /** Total number of steps in the workflow */
  totalSteps: number;
  /** Human-readable step name */
  stepName: string;
  /** Current status of the step */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** Percentage complete (0-100) */
  percentComplete: number;
  /** Optional message with additional context */
  message?: string;
  /** Data produced by the step (if any) */
  data?: unknown;
}

/**
 * Workflow execution result
 */
export interface FlowResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: FlowError;
  steps: StepResult[];
  totalTimeMs: number;
}

/**
 * Result of a single step
 */
export interface StepResult {
  stepNumber: number;
  stepName: string;
  status: 'completed' | 'failed' | 'skipped';
  timeMs: number;
  data?: unknown;
  error?: string;
}

/**
 * Flow error with context
 */
export interface FlowError {
  code: string;
  message: string;
  step: number;
  stepName: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Real Estate Tokenization Types
// ============================================================================

/**
 * Options for tokenizing real estate
 */
export interface TokenizeRealEstateOptions {
  // Property identification
  titleDeedNumber: string;
  propertyAddress: string;
  propertyType?: 'apartment' | 'villa' | 'commercial' | 'land' | 'office';

  // Token configuration
  tokenName: string;
  tokenSymbol: string;
  totalSupply: string;
  decimals?: number;

  // Documents
  titleDeedDocument?: DocumentInput;
  valuationReport?: DocumentInput;
  additionalDocuments?: DocumentInput[];

  // Compliance
  compliancePolicy?: string;
  restrictedJurisdictions?: string[];

  // Chain deployment
  chainId?: number;
  autoDeployToken?: boolean;

  // Callbacks
  onProgress?: ProgressCallback;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Document input for workflows
 */
export interface DocumentInput {
  name: string;
  type: string;
  uri?: string;
  content?: Buffer;
  sha256?: string;
}

/**
 * Result of real estate tokenization
 */
export interface TokenizeRealEstateResult {
  assetId: string;
  tokenId: string;
  tokenAddress?: string;
  titleDeedId?: string;
  documents: string[];
  compliancePolicyId?: string;
  chainId?: number;
  txHash?: string;
}

// ============================================================================
// Security Token Types
// ============================================================================

/**
 * Options for launching a security token
 */
export interface LaunchSecurityTokenOptions {
  // Token details
  tokenName: string;
  tokenSymbol: string;
  totalSupply: string;
  decimals?: number;

  // Security classification
  securityType: 'equity' | 'debt' | 'fund' | 'reit' | 'revenue_share';
  jurisdiction: string;
  regulatoryFramework?: 'reg_d' | 'reg_s' | 'reg_a' | 'mifid2' | 'general';

  // Offering configuration
  offeringType?: 'private' | 'public';
  minimumInvestment?: string;
  maximumInvestment?: string;
  accreditedOnly?: boolean;

  // Documents
  prospectus?: DocumentInput;
  subscriptionAgreement?: DocumentInput;
  additionalDocuments?: DocumentInput[];

  // Chain deployment
  chainId?: number;
  complianceModules?: string[];

  // Callbacks
  onProgress?: ProgressCallback;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Result of security token launch
 */
export interface LaunchSecurityTokenResult {
  assetId: string;
  tokenId: string;
  tokenAddress?: string;
  offeringId?: string;
  compliancePolicyId: string;
  documents: string[];
}

// ============================================================================
// Distribution Types
// ============================================================================

/**
 * Options for distributing to investors
 */
export interface DistributeOptions {
  // Token identification
  tokenId: string;

  // Distribution details
  distributionType: 'dividend' | 'yield' | 'interest' | 'return_of_capital';
  totalAmount: string;
  currency?: string;
  paymentMethod?: 'on_chain' | 'bank_transfer' | 'stablecoin';

  // Timing
  recordDate?: Date;
  paymentDate?: Date;

  // Filtering
  excludeAddresses?: string[];
  minimumBalance?: string;

  // Callbacks
  onProgress?: ProgressCallback;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Result of distribution
 */
export interface DistributeResult {
  distributionId: string;
  totalRecipients: number;
  totalAmount: string;
  currency: string;
  payments: DistributionPayment[];
  skipped: SkippedRecipient[];
}

/**
 * Individual distribution payment
 */
export interface DistributionPayment {
  recipientAddress: string;
  investorId?: string;
  amount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
}

/**
 * Skipped recipient info
 */
export interface SkippedRecipient {
  address: string;
  reason: string;
}

// ============================================================================
// Golden Path Flows Interface
// ============================================================================

/**
 * High-level workflow interface for common tokenization scenarios
 */
export interface IGoldenPathFlows {
  /**
   * Tokenize Dubai real estate in 8 steps:
   * 1. Validate against Dubai Real Estate pack
   * 2. Create asset with DLD metadata
   * 3. Attach documents (title deed, valuation)
   * 4. Submit for verification
   * 5. DLD ownership verification (if available)
   * 6. Create compliance policy
   * 7. Deploy token contract (optional)
   * 8. Activate asset
   *
   * @example
   * ```typescript
   * const result = await sdk.goldenPath.tokenizeRealEstate({
   *   titleDeedNumber: 'DLD-2024-12345',
   *   propertyAddress: '1802, Marina Towers, Dubai Marina',
   *   tokenName: 'Marina Tower Unit 1802',
   *   tokenSymbol: 'MT1802',
   *   totalSupply: '1000000',
   *   onProgress: (p) => console.log(`[${p.step}/${p.totalSteps}] ${p.stepName}`)
   * });
   * ```
   */
  tokenizeRealEstate(options: TokenizeRealEstateOptions): Promise<FlowResult<TokenizeRealEstateResult>>;

  /**
   * Launch a security token with regulatory compliance in 7 steps:
   * 1. Validate security parameters
   * 2. Create underlying asset
   * 3. Attach offering documents
   * 4. Configure compliance rules
   * 5. Create compliance policy
   * 6. Deploy token contract
   * 7. Activate and open for investment
   */
  launchSecurityToken(options: LaunchSecurityTokenOptions): Promise<FlowResult<LaunchSecurityTokenResult>>;

  /**
   * Distribute funds to token holders in 5 steps:
   * 1. Snapshot token holders at record date
   * 2. Calculate entitlements
   * 3. Filter excluded addresses
   * 4. Process payments
   * 5. Generate distribution report
   */
  distributeToInvestors(options: DistributeOptions): Promise<FlowResult<DistributeResult>>;
}

// ============================================================================
// Golden Path Implementation
// ============================================================================

/**
 * GoldenPathFlows - Implementation of high-level workflows
 */
export class GoldenPathFlows implements IGoldenPathFlows {
  private sdk: unknown; // Reference to parent SDK

  constructor(sdk: unknown) {
    this.sdk = sdk;
  }

  /**
   * Tokenize Dubai real estate
   */
  async tokenizeRealEstate(
    options: TokenizeRealEstateOptions
  ): Promise<FlowResult<TokenizeRealEstateResult>> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    const totalSteps = 8;
    let currentStep = 0;

    const emitProgress = (
      stepName: string,
      status: ProgressEvent['status'],
      message?: string,
      data?: unknown
    ) => {
      currentStep++;
      const progress: ProgressEvent = {
        step: currentStep,
        totalSteps,
        stepName,
        status,
        percentComplete: Math.round((currentStep / totalSteps) * 100),
        message,
        data,
      };
      options.onProgress?.(progress);
    };

    const recordStep = (
      stepNumber: number,
      stepName: string,
      status: 'completed' | 'failed' | 'skipped',
      timeMs: number,
      data?: unknown,
      error?: string
    ) => {
      steps.push({ stepNumber, stepName, status, timeMs, data, error });
    };

    try {
      // Step 1: Validate against Dubai Real Estate pack
      let stepStart = Date.now();
      emitProgress('Validating property data', 'in_progress');

      if (!options.titleDeedNumber) {
        throw new FlowValidationError('Title deed number is required', 'MISSING_TITLE_DEED');
      }
      if (!options.propertyAddress) {
        throw new FlowValidationError('Property address is required', 'MISSING_ADDRESS');
      }
      if (!options.tokenName || !options.tokenSymbol) {
        throw new FlowValidationError('Token name and symbol are required', 'MISSING_TOKEN_CONFIG');
      }

      recordStep(1, 'Validating property data', 'completed', Date.now() - stepStart);

      // Step 2: Create asset with DLD metadata
      stepStart = Date.now();
      emitProgress('Creating asset', 'in_progress');

      const assetId = `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      // In production: would call sdk.assets.create()

      recordStep(2, 'Creating asset', 'completed', Date.now() - stepStart, { assetId });

      // Step 3: Attach documents
      stepStart = Date.now();
      emitProgress('Attaching documents', 'in_progress');

      const documentIds: string[] = [];
      if (options.titleDeedDocument) {
        documentIds.push(`doc_${Date.now().toString(36)}`);
      }
      if (options.valuationReport) {
        documentIds.push(`doc_${Date.now().toString(36)}`);
      }
      // In production: would call sdk.documents.upload() for each

      recordStep(3, 'Attaching documents', 'completed', Date.now() - stepStart, { documentIds });

      // Step 4: Submit for verification
      stepStart = Date.now();
      emitProgress('Submitting for verification', 'in_progress');
      // In production: would call sdk.assets.verify()

      recordStep(4, 'Submitting for verification', 'completed', Date.now() - stepStart);

      // Step 5: DLD ownership verification
      stepStart = Date.now();
      emitProgress('DLD ownership verification', 'in_progress');
      // In production: would call DLD integration
      // For now, skip this step in mock mode

      recordStep(5, 'DLD ownership verification', 'skipped', Date.now() - stepStart, undefined, 'DLD integration not configured');

      // Step 6: Create compliance policy
      stepStart = Date.now();
      emitProgress('Creating compliance policy', 'in_progress');

      const compliancePolicyId = `pol_${Date.now().toString(36)}`;
      // In production: would create transfer restrictions, KYC requirements, etc.

      recordStep(6, 'Creating compliance policy', 'completed', Date.now() - stepStart, { compliancePolicyId });

      // Step 7: Deploy token contract
      stepStart = Date.now();
      let tokenId: string | undefined;
      let tokenAddress: string | undefined;

      if (options.autoDeployToken !== false) {
        emitProgress('Deploying token contract', 'in_progress');

        tokenId = `tok_${Date.now().toString(36)}`;
        // In production with chain configured: would deploy ERC-3643 contract
        // tokenAddress would be the deployed contract address

        recordStep(7, 'Deploying token contract', 'completed', Date.now() - stepStart, { tokenId });
      } else {
        emitProgress('Deploying token contract', 'skipped', 'Auto-deploy disabled');
        recordStep(7, 'Deploying token contract', 'skipped', 0);
      }

      // Step 8: Activate asset
      stepStart = Date.now();
      emitProgress('Activating asset', 'in_progress');
      // In production: would call sdk.assets.activate()

      recordStep(8, 'Activating asset', 'completed', Date.now() - stepStart);

      return {
        success: true,
        data: {
          assetId,
          tokenId: tokenId || `tok_${assetId}`,
          tokenAddress,
          titleDeedId: options.titleDeedNumber,
          documents: documentIds,
          compliancePolicyId,
          chainId: options.chainId,
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const flowError: FlowError = {
        code: (error as any).code || 'FLOW_ERROR',
        message: (error as Error).message,
        step: currentStep,
        stepName: steps[steps.length - 1]?.stepName || 'Unknown',
      };

      return {
        success: false,
        error: flowError,
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Launch security token with regulatory compliance
   */
  async launchSecurityToken(
    options: LaunchSecurityTokenOptions
  ): Promise<FlowResult<LaunchSecurityTokenResult>> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    const totalSteps = 7;
    let currentStep = 0;

    const emitProgress = (
      stepName: string,
      status: ProgressEvent['status'],
      message?: string
    ) => {
      currentStep++;
      options.onProgress?.({
        step: currentStep,
        totalSteps,
        stepName,
        status,
        percentComplete: Math.round((currentStep / totalSteps) * 100),
        message,
      });
    };

    try {
      // Step 1: Validate security parameters
      emitProgress('Validating security parameters', 'in_progress');

      if (!options.tokenName || !options.tokenSymbol) {
        throw new FlowValidationError('Token name and symbol are required', 'MISSING_TOKEN_CONFIG');
      }
      if (!options.securityType) {
        throw new FlowValidationError('Security type is required', 'MISSING_SECURITY_TYPE');
      }
      if (!options.jurisdiction) {
        throw new FlowValidationError('Jurisdiction is required', 'MISSING_JURISDICTION');
      }

      steps.push({ stepNumber: 1, stepName: 'Validating security parameters', status: 'completed', timeMs: 10 });

      // Step 2: Create underlying asset
      emitProgress('Creating underlying asset', 'in_progress');
      const assetId = `ast_sec_${Date.now().toString(36)}`;
      steps.push({ stepNumber: 2, stepName: 'Creating underlying asset', status: 'completed', timeMs: 50, data: { assetId } });

      // Step 3: Attach offering documents
      emitProgress('Attaching offering documents', 'in_progress');
      const documentIds: string[] = [];
      if (options.prospectus) {
        documentIds.push(`doc_prospectus_${Date.now().toString(36)}`);
      }
      if (options.subscriptionAgreement) {
        documentIds.push(`doc_subscription_${Date.now().toString(36)}`);
      }
      steps.push({ stepNumber: 3, stepName: 'Attaching offering documents', status: 'completed', timeMs: 100, data: { documentIds } });

      // Step 4: Configure compliance rules
      emitProgress('Configuring compliance rules', 'in_progress');
      steps.push({ stepNumber: 4, stepName: 'Configuring compliance rules', status: 'completed', timeMs: 50 });

      // Step 5: Create compliance policy
      emitProgress('Creating compliance policy', 'in_progress');
      const compliancePolicyId = `pol_sec_${Date.now().toString(36)}`;
      steps.push({ stepNumber: 5, stepName: 'Creating compliance policy', status: 'completed', timeMs: 50, data: { compliancePolicyId } });

      // Step 6: Deploy token contract
      emitProgress('Deploying token contract', 'in_progress');
      const tokenId = `tok_sec_${Date.now().toString(36)}`;
      steps.push({ stepNumber: 6, stepName: 'Deploying token contract', status: 'completed', timeMs: 200, data: { tokenId } });

      // Step 7: Activate and open for investment
      emitProgress('Activating token', 'in_progress');
      const offeringId = options.offeringType ? `off_${Date.now().toString(36)}` : undefined;
      steps.push({ stepNumber: 7, stepName: 'Activating token', status: 'completed', timeMs: 50, data: { offeringId } });

      return {
        success: true,
        data: {
          assetId,
          tokenId,
          offeringId,
          compliancePolicyId,
          documents: documentIds,
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: (error as any).code || 'FLOW_ERROR',
          message: (error as Error).message,
          step: currentStep,
          stepName: steps[steps.length - 1]?.stepName || 'Unknown',
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Distribute funds to token holders
   */
  async distributeToInvestors(
    options: DistributeOptions
  ): Promise<FlowResult<DistributeResult>> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    const totalSteps = 5;
    let currentStep = 0;

    const emitProgress = (
      stepName: string,
      status: ProgressEvent['status'],
      message?: string
    ) => {
      currentStep++;
      options.onProgress?.({
        step: currentStep,
        totalSteps,
        stepName,
        status,
        percentComplete: Math.round((currentStep / totalSteps) * 100),
        message,
      });
    };

    try {
      // Step 1: Snapshot token holders
      emitProgress('Snapshotting token holders', 'in_progress');

      if (!options.tokenId) {
        throw new FlowValidationError('Token ID is required', 'MISSING_TOKEN_ID');
      }
      if (!options.totalAmount) {
        throw new FlowValidationError('Total amount is required', 'MISSING_AMOUNT');
      }

      // In production: would query token holders from ledger
      const mockHolders = [
        { address: '0x1234...', balance: '100000' },
        { address: '0x5678...', balance: '200000' },
        { address: '0x9abc...', balance: '300000' },
      ];
      steps.push({ stepNumber: 1, stepName: 'Snapshotting token holders', status: 'completed', timeMs: 100, data: { holderCount: mockHolders.length } });

      // Step 2: Calculate entitlements
      emitProgress('Calculating entitlements', 'in_progress');

      const totalBalance = mockHolders.reduce((sum, h) => sum + BigInt(h.balance), 0n);
      const entitlements = mockHolders.map(h => ({
        address: h.address,
        balance: h.balance,
        entitlement: ((BigInt(h.balance) * BigInt(options.totalAmount)) / totalBalance).toString(),
      }));

      steps.push({ stepNumber: 2, stepName: 'Calculating entitlements', status: 'completed', timeMs: 50, data: { entitlements } });

      // Step 3: Filter excluded addresses
      emitProgress('Filtering excluded addresses', 'in_progress');

      const excludeSet = new Set(options.excludeAddresses || []);
      const skipped: SkippedRecipient[] = [];
      const eligibleHolders = entitlements.filter(e => {
        if (excludeSet.has(e.address)) {
          skipped.push({ address: e.address, reason: 'Excluded by configuration' });
          return false;
        }
        if (options.minimumBalance && BigInt(e.balance) < BigInt(options.minimumBalance)) {
          skipped.push({ address: e.address, reason: 'Below minimum balance' });
          return false;
        }
        return true;
      });

      steps.push({ stepNumber: 3, stepName: 'Filtering excluded addresses', status: 'completed', timeMs: 20, data: { eligible: eligibleHolders.length, skipped: skipped.length } });

      // Step 4: Process payments
      emitProgress('Processing payments', 'in_progress');

      const payments: DistributionPayment[] = eligibleHolders.map(h => ({
        recipientAddress: h.address,
        amount: h.entitlement,
        status: 'pending' as const,
      }));

      // In production: would submit transactions
      steps.push({ stepNumber: 4, stepName: 'Processing payments', status: 'completed', timeMs: 500, data: { processed: payments.length } });

      // Step 5: Generate distribution report
      emitProgress('Generating distribution report', 'in_progress');

      const distributionId = `dist_${Date.now().toString(36)}`;
      steps.push({ stepNumber: 5, stepName: 'Generating distribution report', status: 'completed', timeMs: 30 });

      return {
        success: true,
        data: {
          distributionId,
          totalRecipients: payments.length,
          totalAmount: options.totalAmount,
          currency: options.currency || 'USD',
          payments,
          skipped,
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: (error as any).code || 'FLOW_ERROR',
          message: (error as Error).message,
          step: currentStep,
          stepName: steps[steps.length - 1]?.stepName || 'Unknown',
        },
        steps,
        totalTimeMs: Date.now() - startTime,
      };
    }
  }
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Flow validation error
 */
export class FlowValidationError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'FlowValidationError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}
