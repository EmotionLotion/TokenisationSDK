/**
 * Pack: Warehouse Receipt / Supply Chain Document
 *
 * Reference implementation for tokenizing warehouse receipts and invoices:
 * - Non-fungible document tokens
 * - Approved operator issuance
 * - Verified buyer transfers
 * - Settlement/redemption burns token
 * - Dispute/freeze states
 */

import { v4 as uuidv4 } from 'uuid';
import type { RightModel } from '@tokenisation/core';
import { LifecycleState, RightType, TransferabilityMode } from '@tokenisation/core';
import type { AssetPack } from '@tokenisation/core';
import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '@tokenisation/core';

// ============================================================================
// TYPES
// ============================================================================

export enum DocumentType {
  WAREHOUSE_RECEIPT = 'WAREHOUSE_RECEIPT',
  BILL_OF_LADING = 'BILL_OF_LADING',
  INVOICE = 'INVOICE',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  CERTIFICATE_OF_ORIGIN = 'CERTIFICATE_OF_ORIGIN',
  INSPECTION_CERTIFICATE = 'INSPECTION_CERTIFICATE',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  DISPUTED = 'DISPUTED',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED',
}

export interface WarehouseReceiptMetadata {
  assetType: 'WAREHOUSE_RECEIPT';
  documentType: DocumentType;
  /** Unique document number */
  documentNumber: string;
  /** Issuing warehouse/facility */
  issuingFacility: {
    id: string;
    name: string;
    address: string;
    country: string;
    licenseNumber?: string;
  };
  /** Goods description */
  goods: {
    description: string;
    commodity: string;
    quantity: number;
    unit: string;
    grade?: string;
    lotNumber?: string;
  };
  /** Storage details */
  storage: {
    warehouseId: string;
    locationCode: string;
    storageStart: string;
    expectedRelease?: string;
    storageConditions?: string;
  };
  /** Value information */
  value: {
    estimatedValue: string;
    currency: string;
    valuationDate: string;
    insurancePolicy?: string;
    insuranceAmount?: string;
  };
  /** Document hashes for verification */
  documentHashes: {
    receiptHash: string;
    photoHashes?: string[];
    inspectionReportHash?: string;
  };
  /** Current holder */
  currentHolder: string;
  /** Transfer history */
  transferHistory: TransferRecord[];
}

export interface TransferRecord {
  from: string;
  to: string;
  timestamp: string;
  transactionId: string;
  verifiedBy?: string;
}

export interface Operator {
  id: string;
  name: string;
  type: 'WAREHOUSE' | 'LOGISTICS' | 'TRADER' | 'BANK' | 'INSPECTOR';
  licenseNumber?: string;
  authorized: boolean;
  authorizedAt: string;
  authorizedBy: string;
}

export interface Dispute {
  id: string;
  documentId: string;
  raisedBy: string;
  raisedAt: string;
  reason: string;
  evidence?: string[];
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' | 'ESCALATED';
  resolution?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ============================================================================
// WAREHOUSE RECEIPT ENGINE
// ============================================================================

export class WarehouseReceiptEngine {
  private documents: Map<string, RightModel> = new Map();
  private operators: Map<string, Operator> = new Map();
  private disputes: Map<string, Dispute> = new Map();
  private verifiedBuyers: Set<string> = new Set();

  /**
   * Register an approved operator
   */
  registerOperator(params: {
    id: string;
    name: string;
    type: Operator['type'];
    licenseNumber?: string;
    authorizedBy: string;
  }): Operator {
    const operator: Operator = {
      ...params,
      authorized: true,
      authorizedAt: new Date().toISOString(),
    };
    this.operators.set(params.id, operator);
    return operator;
  }

  /**
   * Revoke operator authorization
   */
  revokeOperator(operatorId: string): void {
    const operator = this.operators.get(operatorId);
    if (operator) {
      operator.authorized = false;
    }
  }

  /**
   * Verify a buyer for transfers
   */
  verifyBuyer(buyerId: string): void {
    this.verifiedBuyers.add(buyerId);
  }

  /**
   * Issue a warehouse receipt
   */
  issue(params: {
    operatorId: string;
    documentType: DocumentType;
    documentNumber: string;
    facility: WarehouseReceiptMetadata['issuingFacility'];
    goods: WarehouseReceiptMetadata['goods'];
    storage: WarehouseReceiptMetadata['storage'];
    value: WarehouseReceiptMetadata['value'];
    documentHashes: WarehouseReceiptMetadata['documentHashes'];
    initialHolder: string;
  }): { success: boolean; document?: RightModel; error?: string } {
    // Check operator authorization
    const operator = this.operators.get(params.operatorId);
    if (!operator?.authorized) {
      return { success: false, error: 'Operator not authorized to issue documents' };
    }

    // Check operator type
    if (operator.type !== 'WAREHOUSE' && operator.type !== 'LOGISTICS') {
      return { success: false, error: 'Only warehouse or logistics operators can issue receipts' };
    }

    const now = new Date().toISOString();
    const metadata: WarehouseReceiptMetadata = {
      assetType: 'WAREHOUSE_RECEIPT',
      documentType: params.documentType,
      documentNumber: params.documentNumber,
      issuingFacility: params.facility,
      goods: params.goods,
      storage: params.storage,
      value: params.value,
      documentHashes: params.documentHashes,
      currentHolder: params.initialHolder,
      transferHistory: [],
    };

    const document: RightModel = {
      id: uuidv4(),
      name: `${params.documentType} - ${params.documentNumber}`,
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: params.facility.country,
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: false,
        startTime: now,
        endTime: params.storage.expectedRelease,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      metadata: metadata as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };

    this.documents.set(document.id, document);
    return { success: true, document };
  }

  /**
   * Transfer document to verified buyer
   */
  transfer(params: {
    documentId: string;
    fromHolder: string;
    toHolder: string;
    verifierId?: string;
  }): { success: boolean; error?: string } {
    const document = this.documents.get(params.documentId);
    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    const metadata = document.metadata as unknown as WarehouseReceiptMetadata;

    // Check current holder
    if (metadata.currentHolder !== params.fromHolder) {
      return { success: false, error: 'Sender is not the current holder' };
    }

    // Check document status
    if (document.state === LifecycleState.FROZEN) {
      return { success: false, error: 'Document is frozen due to dispute' };
    }

    if (document.state === LifecycleState.REDEEMED) {
      return { success: false, error: 'Document has been settled/redeemed' };
    }

    // Check buyer verification
    if (!this.verifiedBuyers.has(params.toHolder)) {
      return { success: false, error: 'Buyer is not verified' };
    }

    // Record transfer
    const transferRecord: TransferRecord = {
      from: params.fromHolder,
      to: params.toHolder,
      timestamp: new Date().toISOString(),
      transactionId: uuidv4(),
      verifiedBy: params.verifierId,
    };

    metadata.transferHistory.push(transferRecord);
    metadata.currentHolder = params.toHolder;
    document.updatedAt = new Date().toISOString();

    return { success: true };
  }

  /**
   * Raise a dispute
   */
  raiseDispute(params: {
    documentId: string;
    raisedBy: string;
    reason: string;
    evidence?: string[];
  }): { success: boolean; dispute?: Dispute; error?: string } {
    const document = this.documents.get(params.documentId);
    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    const dispute: Dispute = {
      id: uuidv4(),
      documentId: params.documentId,
      raisedBy: params.raisedBy,
      raisedAt: new Date().toISOString(),
      reason: params.reason,
      evidence: params.evidence,
      status: 'OPEN',
    };

    this.disputes.set(dispute.id, dispute);

    // Freeze the document
    document.state = LifecycleState.FROZEN;
    document.updatedAt = new Date().toISOString();

    return { success: true, dispute };
  }

  /**
   * Resolve a dispute
   */
  resolveDispute(params: {
    disputeId: string;
    resolution: string;
    resolvedBy: string;
    unfreezeDocument: boolean;
  }): { success: boolean; error?: string } {
    const dispute = this.disputes.get(params.disputeId);
    if (!dispute) {
      return { success: false, error: 'Dispute not found' };
    }

    dispute.status = 'RESOLVED';
    dispute.resolution = params.resolution;
    dispute.resolvedAt = new Date().toISOString();
    dispute.resolvedBy = params.resolvedBy;

    if (params.unfreezeDocument) {
      const document = this.documents.get(dispute.documentId);
      if (document) {
        document.state = LifecycleState.ACTIVE;
        document.updatedAt = new Date().toISOString();
      }
    }

    return { success: true };
  }

  /**
   * Settle/redeem document (burns token)
   */
  settle(params: {
    documentId: string;
    settledBy: string;
    settlementProof?: string;
  }): { success: boolean; error?: string } {
    const document = this.documents.get(params.documentId);
    if (!document) {
      return { success: false, error: 'Document not found' };
    }

    const metadata = document.metadata as unknown as WarehouseReceiptMetadata;

    // Only current holder can settle
    if (metadata.currentHolder !== params.settledBy) {
      return { success: false, error: 'Only current holder can settle' };
    }

    // Check for open disputes
    const openDisputes = Array.from(this.disputes.values())
      .filter(d => d.documentId === params.documentId && d.status !== 'RESOLVED');
    if (openDisputes.length > 0) {
      return { success: false, error: 'Cannot settle with open disputes' };
    }

    // Mark as redeemed (burn)
    document.state = LifecycleState.REDEEMED;
    document.updatedAt = new Date().toISOString();

    return { success: true };
  }

  /**
   * Get document by ID
   */
  getDocument(documentId: string): RightModel | undefined {
    return this.documents.get(documentId);
  }

  /**
   * Get documents by holder
   */
  getDocumentsByHolder(holderId: string): RightModel[] {
    return Array.from(this.documents.values())
      .filter(d => (d.metadata as unknown as WarehouseReceiptMetadata).currentHolder === holderId);
  }

  /**
   * Get document transfer history
   */
  getTransferHistory(documentId: string): TransferRecord[] {
    const document = this.documents.get(documentId);
    if (!document) return [];
    return (document.metadata as unknown as WarehouseReceiptMetadata).transferHistory;
  }

  /**
   * Verify document authenticity
   */
  verifyDocument(documentId: string, receiptHash: string): boolean {
    const document = this.documents.get(documentId);
    if (!document) return false;
    const metadata = document.metadata as unknown as WarehouseReceiptMetadata;
    return metadata.documentHashes.receiptHash === receiptHash;
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

export const WAREHOUSE_RECEIPT_PACK: AssetPack = {
  id: 'WAREHOUSE_RECEIPT',
  name: 'Warehouse Receipt / Supply Chain',
  description: 'Non-fungible document tokens for warehouse receipts, bills of lading, and trade finance',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.COMMODITY,
    investorClass: InvestorClass.INSTITUTIONAL,
    liquidityProfile: LiquidityProfile.SEMI_LIQUID,
    fractionalization: FractionalizationType.WHOLE,
    lockupDays: 0,
    additionalJurisdictions: [],
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.PENDING_VERIFICATION,
      conditions: [
        { type: 'DOCUMENT', documents: ['GOODS_INSPECTION', 'STORAGE_AGREEMENT'] },
        { type: 'APPROVAL', approvals: [{ role: 'WAREHOUSE_OPERATOR', count: 1 }] },
      ],
      actions: [],
      description: 'Submit receipt for verification',
    },
    {
      from: LifecycleState.PENDING_VERIFICATION,
      to: LifecycleState.VERIFIED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'INSPECTOR', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RECEIPT_VERIFIED' } }],
      description: 'Inspector verifies goods',
    },
    {
      from: LifecycleState.VERIFIED,
      to: LifecycleState.ACTIVE,
      conditions: [],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'RECEIPT_ISSUED' } }],
      description: 'Issue receipt for trading',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.FROZEN,
      conditions: [
        { type: 'CUSTOM', customCondition: 'DISPUTE_RAISED' },
      ],
      actions: [{ type: 'FREEZE', params: {} }],
      description: 'Freeze due to dispute',
    },
    {
      from: LifecycleState.FROZEN,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'ARBITRATOR', count: 1 }] },
      ],
      actions: [{ type: 'UNFREEZE', params: {} }],
      description: 'Unfreeze after dispute resolution',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'HOLDER', count: 1 }] },
        { type: 'DOCUMENT', documents: ['DELIVERY_CONFIRMATION'] },
      ],
      actions: [
        { type: 'BURN', params: {} },
        { type: 'EMIT_EVENT', params: { event: 'RECEIPT_SETTLED' } },
      ],
      description: 'Settle and burn receipt on delivery',
    },
  ],

  complianceRules: [
    {
      id: 'OPERATOR_AUTH',
      name: 'Operator Authorization',
      type: 'CUSTOM',
      params: { requireAuthorizedOperator: true },
      severity: 'BLOCK',
    },
    {
      id: 'BUYER_VERIFICATION',
      name: 'Buyer Verification Required',
      type: 'KYC',
      params: { requireVerifiedBuyer: true },
      severity: 'BLOCK',
    },
    {
      id: 'NO_DISPUTE',
      name: 'No Open Disputes',
      type: 'CUSTOM',
      params: { blockIfDisputed: true },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [
    {
      type: 'GOODS_INSPECTION',
      description: 'Physical inspection of stored goods',
      allowedVerifiers: ['INSPECTOR', 'SURVEYOR'],
      mandatory: true,
    },
    {
      type: 'FACILITY_AUDIT',
      description: 'Warehouse facility compliance audit',
      allowedVerifiers: ['AUDITOR'],
      mandatory: false,
    },
  ],

  metadataSchema: {
    documentType: { type: 'string', required: true, description: 'Type of document' },
    documentNumber: { type: 'string', required: true, description: 'Unique document number' },
    issuingFacility: { type: 'object', required: true, description: 'Issuing warehouse details' },
    goods: { type: 'object', required: true, description: 'Goods description' },
    storage: { type: 'object', required: true, description: 'Storage details' },
    value: { type: 'object', required: true, description: 'Value information' },
    documentHashes: { type: 'object', required: true, description: 'Document hashes for verification' },
  },

  tags: ['supply-chain', 'warehouse', 'trade-finance', 'commodity', 'nft'],
};

export default WarehouseReceiptEngine;
