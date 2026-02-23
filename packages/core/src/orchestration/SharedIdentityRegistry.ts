/**
 * SharedIdentityRegistry
 *
 * Cross-pack identity sharing layer. Allows multiple pack engines
 * (Airline, Hotel, CarRental, Concert) to share identity verification
 * state so that a passenger verified by one engine can be auto-approved
 * in another.
 */

export interface IdentityVerification {
  identityHash: string;
  source: string;
  verifiedAt: string;
  verifiedBy?: string;
}

export interface IIdentityRegistry {
  verify(hash: string, source: string, verifiedBy?: string): void;
  isVerified(hash: string): boolean;
  isVerifiedBy(hash: string, source: string): boolean;
  getVerifications(hash: string): IdentityVerification[];
  getAllVerified(): string[];
}

export class SharedIdentityRegistry implements IIdentityRegistry {
  private verifications: Map<string, IdentityVerification[]> = new Map();

  verify(hash: string, source: string, verifiedBy?: string): void {
    const existing = this.verifications.get(hash) ?? [];

    // Deduplicate: same source can't verify twice
    if (existing.some(v => v.source === source)) {
      return;
    }

    existing.push({
      identityHash: hash,
      source,
      verifiedAt: new Date().toISOString(),
      verifiedBy,
    });

    this.verifications.set(hash, existing);
  }

  isVerified(hash: string): boolean {
    const records = this.verifications.get(hash);
    return !!records && records.length > 0;
  }

  isVerifiedBy(hash: string, source: string): boolean {
    const records = this.verifications.get(hash);
    if (!records) return false;
    return records.some(v => v.source === source);
  }

  getVerifications(hash: string): IdentityVerification[] {
    return this.verifications.get(hash) ?? [];
  }

  getAllVerified(): string[] {
    return Array.from(this.verifications.keys());
  }
}
