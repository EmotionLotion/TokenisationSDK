/**
 * Nexus Compute Credit Pack
 *
 * Credits earned for contributing to Federated ML training.
 * Zero-Knowledge proofs verify training contributions.
 *
 * Flow: Node Trains Model -> Generates ZK Proof -> Mints Credit
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../../SDK.js';
import { EvidenceType } from '../../models/index.js';
import { AgentCapability, type ComputeCredit, type AgentWallet } from '../types.js';
import { SDKError, ErrorCode } from '../../errors/index.js';

/**
 * Compute node configuration
 */
export interface ComputeNodeConfig {
  /** Node operator name */
  operatorName: string;

  /** Hardware specs */
  hardware: {
    gpuModel: string;
    vram: number; // GB
    cpuCores: number;
  };

  /** Geographic region */
  region: string;
}

/**
 * Training contribution data
 */
export interface TrainingContribution {
  modelId: string;
  trainingRound: number;
  dataPointsProcessed: number;
  epochsCompleted: number;
  accuracy: number;
  trainingTimeSeconds: number;
}

/**
 * Nexus Compute Credit Pack
 *
 * Implements compute credits for Federated ML contributions.
 */
export class ComputeCreditPack {
  private sdk: TokenisationSDK;
  private config: ComputeNodeConfig;
  private nodeId: string | null = null;
  private issuerId: string | null = null;

  constructor(sdk: TokenisationSDK, config: ComputeNodeConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Register a new compute node
   */
  async registerNode(): Promise<{
    nodeAssetId: string;
    nodeId: string;
    issuerId: string;
  }> {
    // Step 1: Create Nexus Platform (Issuer)
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: 'Ahoy Nexus',
      jurisdiction: 'AE',
    });

    this.issuerId = issuer.id;

    // Step 2: Create Node Operator
    const node = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.INVESTOR, PartyRole.CUSTODIAN],
      name: this.config.operatorName,
      jurisdiction: 'AE',
    });

    this.nodeId = node.id;

    // Step 3: Create Node Registration Asset
    const nodeAsset = await this.sdk.assets.create({
      name: `Nexus Compute Node - ${this.config.operatorName}`,
      description: `Federated ML compute node. GPU: ${this.config.hardware.gpuModel}, VRAM: ${this.config.hardware.vram}GB`,
      rightType: RightType.VERIFICATION,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: issuer.id,
      typedMetadata: {
        assetType: 'COMPUTE_NODE',
        nodeId: node.id,
        operatorName: this.config.operatorName,
        hardware: this.config.hardware,
        region: this.config.region,
        totalCreditsEarned: 0,
        totalTrainingRounds: 0,
        reputation: 100,
        isOnline: true,
      },
    });

    // Step 4: Add hardware verification
    this.sdk.evidence.create({
      assetId: nodeAsset.id,
      type: EvidenceType.AUDIT_REPORT,
      title: 'Hardware Verification',
      description: `Verified compute specs: ${this.config.hardware.gpuModel}, ${this.config.hardware.vram}GB VRAM`,
      contentHash: 'sha256:' + Buffer.from(nodeAsset.id + 'hw').toString('hex').slice(0, 64),
      source: {
        type: 'HARDWARE_ORACLE',
        identifier: 'nexus-hw-verifier',
        name: 'Nexus Hardware Verifier',
        trusted: true,
        reputationScore: 95,
      },
    });

    // Step 5: Activate node
    await this.sdk.assets.transition(nodeAsset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.verify(nodeAsset.id, issuer.id);
    await this.sdk.assets.activate(nodeAsset.id, issuer.id);

    await this.sdk.tokens.mint(nodeAsset.id, node.id, '1');

    return {
      nodeAssetId: nodeAsset.id,
      nodeId: node.id,
      issuerId: issuer.id,
    };
  }

  /**
   * Submit training contribution and earn credits
   */
  async submitTrainingContribution(
    contribution: TrainingContribution
  ): Promise<{
    creditAssetId: string;
    credit: ComputeCredit;
    ahoyPointsEarned: number;
  }> {
    if (!this.nodeId || !this.issuerId) {
      throw new SDKError('Node not registered. Call registerNode() first.', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call registerNode() before contributeTraining()' },
      });
    }

    // Calculate compute units (based on work done)
    const computeUnits = this.calculateComputeUnits(contribution);

    // Generate ZK proof hash (simulated)
    const zkProofHash = this.generateZKProofHash(contribution);

    // Calculate reward
    const ahoyPointsEarned = Math.ceil(computeUnits * 0.1); // 0.1 $AHOY per compute unit

    // Create credit metadata
    const credit: ComputeCredit = {
      creditId: '',
      nodeId: this.nodeId,
      modelId: contribution.modelId,
      trainingRound: contribution.trainingRound,
      dataPointsProcessed: contribution.dataPointsProcessed,
      computeUnits,
      zkProofHash,
      timestamp: new Date().toISOString(),
      rewardAmount: ahoyPointsEarned.toString(),
    };

    // Create Credit Asset
    const creditAsset = await this.sdk.assets.create({
      name: `Compute Credit - Round ${contribution.trainingRound}`,
      description: `Training contribution for model ${contribution.modelId}. ${computeUnits} compute units.`,
      rightType: RightType.VERIFICATION,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: this.issuerId,
      typedMetadata: {
        assetType: 'COMPUTE_CREDIT',
        ...credit,
      },
    });

    credit.creditId = creditAsset.id;

    // Add ZK proof evidence
    this.sdk.evidence.create({
      assetId: creditAsset.id,
      type: EvidenceType.CERTIFICATE,
      title: 'Zero-Knowledge Proof of Training',
      description: `ZK proof verifying training contribution without revealing data`,
      contentHash: zkProofHash,
      source: {
        type: 'ZK_VERIFIER',
        identifier: 'nexus-zk-verifier',
        name: 'Nexus ZK Verifier',
        trusted: true,
        reputationScore: 100,
      },
    });

    // Activate credit
    await this.sdk.assets.transition(creditAsset.id, LifecycleState.PENDING_VERIFICATION, this.issuerId);
    await this.sdk.assets.verify(creditAsset.id, this.issuerId);
    await this.sdk.assets.activate(creditAsset.id, this.issuerId);

    await this.sdk.tokens.mint(creditAsset.id, this.nodeId, computeUnits.toString());

    return {
      creditAssetId: creditAsset.id,
      credit,
      ahoyPointsEarned,
    };
  }

  /**
   * Calculate compute units from training contribution
   */
  private calculateComputeUnits(contribution: TrainingContribution): number {
    // Base units from data processed
    const dataUnits = contribution.dataPointsProcessed / 1000;

    // Bonus for accuracy
    const accuracyBonus = contribution.accuracy > 0.9 ? 1.5 : contribution.accuracy > 0.8 ? 1.2 : 1.0;

    // Efficiency bonus (faster training = more bonus)
    const expectedTime = contribution.dataPointsProcessed / 100; // Expected seconds
    const efficiencyBonus = contribution.trainingTimeSeconds < expectedTime ? 1.3 : 1.0;

    return Math.ceil(dataUnits * accuracyBonus * efficiencyBonus);
  }

  /**
   * Generate simulated ZK proof hash
   */
  private generateZKProofHash(contribution: TrainingContribution): string {
    const data = JSON.stringify(contribution);
    return 'zk_proof_' + Buffer.from(data).toString('hex').slice(0, 64);
  }
}

/**
 * Agent Wallet Pack
 *
 * Autonomous agents that own wallets and can hire other agents.
 */
export class AgentWalletPack {
  private sdk: TokenisationSDK;

  constructor(sdk: TokenisationSDK) {
    this.sdk = sdk;
  }

  /**
   * Create an autonomous agent with wallet
   */
  async createAgent(config: {
    agentName: string;
    capabilities: AgentCapability[];
    initialBalance: string;
  }): Promise<{
    agentAssetId: string;
    agentId: string;
    wallet: AgentWallet;
  }> {
    // Create Nexus Platform
    const platform = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      name: 'Ahoy Nexus',
      jurisdiction: 'AE',
    });

    // Create Agent (as a special party type)
    const agent = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION, // Agents are represented as orgs
      roles: [PartyRole.INVESTOR, PartyRole.CUSTODIAN],
      name: `AI Agent: ${config.agentName}`,
      jurisdiction: 'AE',
    });

    // Generate wallet address (simulated)
    const walletAddress = '0x' + Buffer.from(agent.id).toString('hex').slice(0, 40);

    // Create wallet metadata
    const wallet: AgentWallet = {
      agentId: agent.id,
      walletAddress,
      capabilities: config.capabilities,
      balance: config.initialBalance,
      spentTotal: '0',
      earnedTotal: '0',
      servicesHired: 0,
      servicesProvided: 0,
      reputation: 100,
      isActive: true,
    };

    // Create Agent Asset
    const agentAsset = await this.sdk.assets.create({
      name: `Nexus Agent: ${config.agentName}`,
      description: `Autonomous AI agent with capabilities: ${config.capabilities.join(', ')}`,
      rightType: RightType.ACCESS,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      issuerId: platform.id,
      typedMetadata: {
        assetType: 'AGENT_WALLET',
        ...wallet,
      },
    });

    // Activate agent
    await this.sdk.assets.transition(agentAsset.id, LifecycleState.PENDING_VERIFICATION, platform.id);
    await this.sdk.assets.verify(agentAsset.id, platform.id);
    await this.sdk.assets.activate(agentAsset.id, platform.id);

    await this.sdk.tokens.mint(agentAsset.id, agent.id, '1');

    return {
      agentAssetId: agentAsset.id,
      agentId: agent.id,
      wallet,
    };
  }

  /**
   * Agent hires another agent's service
   */
  async hireAgent(
    hirerAgentId: string,
    providerAgentId: string,
    capability: AgentCapability,
    payment: string
  ): Promise<{ success: boolean; txId: string }> {
    // Record the transaction (in a real system, this would involve token transfer)
    const txId = uuidv4();

    // Add evidence of service hire
    this.sdk.evidence.create({
      assetId: hirerAgentId,
      type: EvidenceType.FINANCIAL_DOCUMENT,
      title: 'Agent Service Hire',
      description: `Hired agent ${providerAgentId} for ${capability} service. Payment: ${payment} $AHOY`,
      contentHash: 'sha256:' + Buffer.from(txId).toString('hex').slice(0, 64),
      source: {
        type: 'AGENT_MARKETPLACE',
        identifier: 'nexus-marketplace',
        name: 'Nexus Agent Marketplace',
        trusted: true,
        reputationScore: 95,
      },
    });

    return { success: true, txId };
  }
}

/**
 * Quick start helpers
 */
export async function registerComputeNode(
  sdk: TokenisationSDK,
  operatorName: string,
  gpuModel: string = 'NVIDIA A100'
): Promise<string> {
  const pack = new ComputeCreditPack(sdk, {
    operatorName,
    hardware: {
      gpuModel,
      vram: 80,
      cpuCores: 64,
    },
    region: 'UAE-EAST',
  });

  const result = await pack.registerNode();
  return result.nodeAssetId;
}

export async function createRoutingAgent(
  sdk: TokenisationSDK,
  agentName: string
): Promise<string> {
  const pack = new AgentWalletPack(sdk);
  const result = await pack.createAgent({
    agentName,
    capabilities: [AgentCapability.ROUTING, AgentCapability.SCHEDULING],
    initialBalance: '1000',
  });

  return result.agentAssetId;
}

/**
 * Simulate a week of compute contributions
 */
export async function simulateComputeWeek(
  sdk: TokenisationSDK,
  nodeAssetId: string,
  pack: ComputeCreditPack
): Promise<{
  totalCredits: number;
  totalAhoyEarned: number;
}> {
  let totalCredits = 0;
  let totalAhoyEarned = 0;

  // 7 days, 3-5 training rounds per day
  for (let day = 0; day < 7; day++) {
    const roundsPerDay = Math.floor(Math.random() * 3) + 3;

    for (let round = 0; round < roundsPerDay; round++) {
      const contribution: TrainingContribution = {
        modelId: `model-${day}-${round}`,
        trainingRound: day * roundsPerDay + round + 1,
        dataPointsProcessed: Math.floor(Math.random() * 50000) + 10000,
        epochsCompleted: Math.floor(Math.random() * 10) + 5,
        accuracy: 0.8 + Math.random() * 0.15,
        trainingTimeSeconds: Math.floor(Math.random() * 3600) + 1800,
      };

      const result = await pack.submitTrainingContribution(contribution);
      totalCredits += result.credit.computeUnits;
      totalAhoyEarned += result.ahoyPointsEarned;
    }
  }

  return { totalCredits, totalAhoyEarned };
}
