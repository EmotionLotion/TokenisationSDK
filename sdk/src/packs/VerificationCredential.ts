/**
 * Pack E: Education/IP Verification
 *
 * Reference implementation for tokenizing verification credentials.
 * Type: VERIFICATION Right (Soulbound)
 *
 * Flow: Define (Degree/Copyright) -> Verify (University/Patent Office) -> Mint (Soulbound)
 */

import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '../SDK.js';
import { EvidenceType, type VerificationMetadata } from '../models/index.js';

/**
 * Verification Credential types
 */
export type CredentialType =
  | 'EDUCATIONAL_DEGREE'
  | 'PROFESSIONAL_LICENSE'
  | 'PATENT'
  | 'COPYRIGHT'
  | 'CARBON_CREDIT'
  | 'SUPPLY_CHAIN_PROOF';

/**
 * Verification Credential Pack configuration
 */
export interface VerificationCredentialConfig {
  /** Credential type */
  type: CredentialType;

  /** Credential name/title */
  name: string;

  /** Description */
  description?: string;

  /** Issuing authority details */
  issuingAuthority: {
    name: string;
    jurisdiction: string;
    type: 'UNIVERSITY' | 'GOVERNMENT' | 'PROFESSIONAL_BODY' | 'REGISTRY' | 'CERTIFIER';
  };

  /** Certificate details */
  certificate: {
    number: string;
    issueDate: string;
    expiryDate?: string;
    proofUri?: string;
  };

  /** Subject (holder of the credential) */
  subject: {
    name: string;
    jurisdiction: string;
  };

  /** For carbon credits: amount in tonnes */
  carbonTonnes?: number;
}

/**
 * Verification Credential Pack
 *
 * Demonstrates the tokenization of verification credentials as soulbound tokens.
 */
export class VerificationCredentialPack {
  private sdk: TokenisationSDK;
  private config: VerificationCredentialConfig;

  constructor(sdk: TokenisationSDK, config: VerificationCredentialConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Execute the full tokenization flow
   */
  async execute(): Promise<{
    assetId: string;
    issuerId: string;
    subjectId: string;
    certificateEvidenceId: string;
  }> {
    // Step 1: Create Issuing Authority as Party
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      name: this.config.issuingAuthority.name,
      jurisdiction: this.config.issuingAuthority.jurisdiction,
    });

    // Step 2: Create Subject (credential holder)
    const subject = this.sdk.parties_.create({
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      name: this.config.subject.name,
      jurisdiction: this.config.subject.jurisdiction,
    });

    // Step 3: Create Verification Asset with Metadata
    const metadata: VerificationMetadata = {
      assetType: 'VERIFICATION',
      certificateType: this.mapToCertificateType(this.config.type),
      issuingAuthority: this.config.issuingAuthority.name,
      certificateNumber: this.config.certificate.number,
      issueDate: this.config.certificate.issueDate,
      expiryDate: this.config.certificate.expiryDate,
      verificationProof: this.config.certificate.proofUri,
      carbonTonnes: this.config.carbonTonnes,
      retiredAmount: 0,
    };

    const asset = await this.sdk.assets.create({
      name: this.config.name,
      description: this.config.description || `${this.config.type} issued by ${this.config.issuingAuthority.name}`,
      rightType: RightType.VERIFICATION,
      jurisdiction: {
        countryCode: this.config.subject.jurisdiction,
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        startTime: this.config.certificate.issueDate,
        endTime: this.config.certificate.expiryDate,
        isPerpetual: !this.config.certificate.expiryDate,
      },
      transferabilityRules: {
        mode: TransferabilityMode.NON_TRANSFERABLE, // Soulbound credentials
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      issuerId: issuer.id,
      typedMetadata: metadata,
    });

    // Step 4: Add Certificate Evidence
    const certificateEvidence = this.sdk.evidence.create({
      assetId: asset.id,
      type: EvidenceType.CERTIFICATE,
      title: `${this.config.type} Certificate`,
      description: `Certificate #${this.config.certificate.number} issued on ${this.config.certificate.issueDate}`,
      contentHash: 'sha256:' + Buffer.from(asset.id + 'cert').toString('hex').slice(0, 64),
      storageUri: this.config.certificate.proofUri,
      validFrom: this.config.certificate.issueDate,
      validUntil: this.config.certificate.expiryDate,
      source: {
        type: this.config.issuingAuthority.type,
        identifier: this.config.issuingAuthority.name.toLowerCase().replace(/\s/g, '-'),
        name: this.config.issuingAuthority.name,
        trusted: true,
        reputationScore: 100,
      },
    });

    // Step 5: Verify Certificate
    await this.sdk.evidence.verify(
      certificateEvidence.id,
      issuer.id,
      `${this.config.issuingAuthority.type}_VERIFICATION`
    );

    // Step 6: Submit for Verification
    await this.sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      issuer.id
    );

    // Step 7: Verify Asset
    await this.sdk.assets.verify(asset.id, issuer.id);

    // Step 8: Activate Asset (Mint Soulbound Token)
    await this.sdk.assets.activate(asset.id, issuer.id);

    // Step 9: Mint to subject
    await this.sdk.tokens.mint(asset.id, subject.id, '1');

    return {
      assetId: asset.id,
      issuerId: issuer.id,
      subjectId: subject.id,
      certificateEvidenceId: certificateEvidence.id,
    };
  }

  /**
   * Map credential type to metadata certificate type
   */
  private mapToCertificateType(
    type: CredentialType
  ): VerificationMetadata['certificateType'] {
    const mapping: Record<CredentialType, VerificationMetadata['certificateType']> = {
      EDUCATIONAL_DEGREE: 'EDUCATIONAL_DEGREE',
      PROFESSIONAL_LICENSE: 'PROFESSIONAL_LICENSE',
      PATENT: 'PATENT',
      COPYRIGHT: 'COPYRIGHT',
      CARBON_CREDIT: 'CARBON_CREDIT',
      SUPPLY_CHAIN_PROOF: 'SUPPLY_CHAIN_PROOF',
    };
    return mapping[type];
  }

  /**
   * Retire carbon credits (burn portion)
   */
  async retireCarbon(
    assetId: string,
    tonnes: number,
    retirerId: string,
    reason: string
  ): Promise<void> {
    const asset = await this.sdk.assets.get(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }

    const metadata = asset.typedMetadata as VerificationMetadata;
    if (metadata.certificateType !== 'CARBON_CREDIT') {
      throw new Error('Asset is not a carbon credit');
    }

    const currentCarbon = metadata.carbonTonnes || 0;
    const currentRetired = metadata.retiredAmount || 0;
    const available = currentCarbon - currentRetired;

    if (tonnes > available) {
      throw new Error(`Cannot retire ${tonnes} tonnes. Only ${available} available.`);
    }

    // Update retired amount
    const updatedMetadata: VerificationMetadata = {
      ...metadata,
      retiredAmount: currentRetired + tonnes,
    };

    // Add retirement evidence
    this.sdk.evidence.create({
      assetId,
      type: EvidenceType.AUDIT_REPORT,
      title: 'Carbon Credit Retirement',
      description: `Retired ${tonnes} tonnes of carbon credits. Reason: ${reason}`,
      contentHash: 'sha256:' + Buffer.from(assetId + 'retire' + Date.now()).toString('hex').slice(0, 64),
      source: {
        type: 'REGISTRY',
        identifier: retirerId,
        name: 'Carbon Registry',
        trusted: true,
        reputationScore: 100,
      },
    });

    await this.sdk.assets.update(assetId, {
      typedMetadata: updatedMetadata,
    } as any);

    // If all carbon retired, transition to BURNED
    if (updatedMetadata.retiredAmount === currentCarbon) {
      await this.sdk.assets.retire(assetId, retirerId);
    }
  }
}

/**
 * Quick start helper for Educational Degree tokenization
 */
export async function createEducationalDegree(
  sdk: TokenisationSDK,
  config: {
    degreeName: string;
    university: string;
    studentName: string;
    certificateNumber: string;
    issueDate: string;
    jurisdiction: string;
  }
): Promise<string> {
  const pack = new VerificationCredentialPack(sdk, {
    type: 'EDUCATIONAL_DEGREE',
    name: `${config.degreeName} - ${config.studentName}`,
    description: `${config.degreeName} from ${config.university}`,
    issuingAuthority: {
      name: config.university,
      jurisdiction: config.jurisdiction,
      type: 'UNIVERSITY',
    },
    certificate: {
      number: config.certificateNumber,
      issueDate: config.issueDate,
    },
    subject: {
      name: config.studentName,
      jurisdiction: config.jurisdiction,
    },
  });

  const result = await pack.execute();
  return result.assetId;
}

/**
 * Quick start helper for Carbon Credit tokenization
 */
export async function createCarbonCredit(
  sdk: TokenisationSDK,
  config: {
    projectName: string;
    tonnes: number;
    registry: string;
    certificateNumber: string;
    issueDate: string;
    ownerName: string;
    jurisdiction: string;
  }
): Promise<string> {
  const pack = new VerificationCredentialPack(sdk, {
    type: 'CARBON_CREDIT',
    name: `Carbon Credit - ${config.projectName}`,
    description: `${config.tonnes} tonnes of verified carbon credits from ${config.projectName}`,
    issuingAuthority: {
      name: config.registry,
      jurisdiction: config.jurisdiction,
      type: 'CERTIFIER',
    },
    certificate: {
      number: config.certificateNumber,
      issueDate: config.issueDate,
    },
    subject: {
      name: config.ownerName,
      jurisdiction: config.jurisdiction,
    },
    carbonTonnes: config.tonnes,
  });

  const result = await pack.execute();
  return result.assetId;
}

/**
 * Quick start helper for Professional License tokenization
 */
export async function createProfessionalLicense(
  sdk: TokenisationSDK,
  config: {
    licenseType: string;
    holderName: string;
    issuingBody: string;
    licenseNumber: string;
    issueDate: string;
    expiryDate?: string;
    jurisdiction: string;
  }
): Promise<string> {
  const pack = new VerificationCredentialPack(sdk, {
    type: 'PROFESSIONAL_LICENSE',
    name: `${config.licenseType} - ${config.holderName}`,
    description: `${config.licenseType} issued by ${config.issuingBody}`,
    issuingAuthority: {
      name: config.issuingBody,
      jurisdiction: config.jurisdiction,
      type: 'PROFESSIONAL_BODY',
    },
    certificate: {
      number: config.licenseNumber,
      issueDate: config.issueDate,
      expiryDate: config.expiryDate,
    },
    subject: {
      name: config.holderName,
      jurisdiction: config.jurisdiction,
    },
  });

  const result = await pack.execute();
  return result.assetId;
}
