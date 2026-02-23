/**
 * PortableComplianceReceipt
 *
 * Bridges DecisionReceipt (cryptographically signed compliance decisions)
 * with SharedIdentityRegistry so a KYC receipt from one pack is accepted
 * by all others.
 */

import type { DecisionReceipt } from '../core/DecisionReceipt.js';
import {
  createReceipt,
  verifyReceiptSignature,
  hashReceipt,
  ReceiptChain,
} from '../core/DecisionReceipt.js';
import type { PolicyDecision, ComplianceContext } from '../core/types.js';
import type { IIdentityRegistry } from './SharedIdentityRegistry.js';

export type ComplianceType = 'KYC' | 'AML' | 'SANCTIONS' | 'IDENTITY_VERIFICATION';

export interface PortableReceipt {
  identityHash: string;
  issuingPack: string;
  receipt: DecisionReceipt;
  complianceType: ComplianceType;
  expiresAt: string;
}

export interface PortableReceiptQuery {
  identityHash: string;
  complianceType?: ComplianceType;
  issuingPack?: string;
  onlyValid?: boolean;
}

export interface PortableComplianceCheck {
  hasValidReceipt: boolean;
  receipt?: PortableReceipt;
  signatureValid?: boolean;
  chainValid?: boolean;
  verifiedBy?: string;
}

export class PortableComplianceRegistry {
  private portableReceipts: Map<string, PortableReceipt[]> = new Map();
  private receiptChain: ReceiptChain;

  constructor(
    private identityRegistry: IIdentityRegistry,
    receiptChain?: ReceiptChain,
  ) {
    this.receiptChain = receiptChain ?? new ReceiptChain();
  }

  issuePortableReceipt(params: {
    identityHash: string;
    issuingPack: string;
    complianceType: ComplianceType;
    decision: PolicyDecision;
    context: ComplianceContext;
    expiresAt?: string;
  }): PortableReceipt {
    const previousReceiptHash = this.receiptChain.getLastReceiptHash();

    const receipt = createReceipt(params.decision, params.context, {
      previousReceiptHash,
      issuedBy: params.issuingPack,
    });

    this.receiptChain.append(receipt);

    const expiresAt =
      params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const portable: PortableReceipt = {
      identityHash: params.identityHash,
      issuingPack: params.issuingPack,
      receipt,
      complianceType: params.complianceType,
      expiresAt,
    };

    const existing = this.portableReceipts.get(params.identityHash) ?? [];
    existing.push(portable);
    this.portableReceipts.set(params.identityHash, existing);

    // Register in identity registry
    this.identityRegistry.verify(
      params.identityHash,
      params.issuingPack,
      params.issuingPack,
    );

    return portable;
  }

  checkCompliance(query: PortableReceiptQuery): PortableComplianceCheck {
    const receipts = this.portableReceipts.get(query.identityHash);
    if (!receipts || receipts.length === 0) {
      return { hasValidReceipt: false };
    }

    // Find matching receipt
    let match = receipts.find((r) => {
      if (query.complianceType && r.complianceType !== query.complianceType) return false;
      if (query.issuingPack && r.issuingPack !== query.issuingPack) return false;
      return true;
    });

    if (!match) {
      return { hasValidReceipt: false };
    }

    // Check expiry if onlyValid
    if (query.onlyValid !== false) {
      const now = new Date().toISOString();
      if (match.expiresAt < now) {
        return {
          hasValidReceipt: false,
          receipt: match,
          verifiedBy: match.issuingPack,
        };
      }
    }

    // Verify cryptographic signature
    const signatureValid = verifyReceiptSignature(match.receipt);

    // Check chain validity
    const chainVerification = this.receiptChain.verifyChain();

    return {
      hasValidReceipt: signatureValid,
      receipt: match,
      signatureValid,
      chainValid: chainVerification.valid,
      verifiedBy: match.issuingPack,
    };
  }

  getReceipts(identityHash: string): PortableReceipt[] {
    return this.portableReceipts.get(identityHash) ?? [];
  }

  getReceiptChain(): ReceiptChain {
    return this.receiptChain;
  }
}
