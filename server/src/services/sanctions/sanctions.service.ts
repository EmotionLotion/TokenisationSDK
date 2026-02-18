/**
 * Sanctions Screening Service
 *
 * Provides sanctions list screening against OFAC SDN and UN lists.
 * Uses fuzzy name matching for comprehensive coverage.
 */

import crypto from 'crypto';
import { logger } from '../../middleware/logger.js';

export interface SanctionsEntry {
  id: string;
  name: string;
  aliases: string[];
  type: 'individual' | 'entity' | 'vessel' | 'aircraft';
  programs: string[];
  country?: string;
  dateOfBirth?: string;
  nationalId?: string;
  source: 'OFAC' | 'UN' | 'EU' | 'UK';
  addedAt: Date;
}

export interface ScreeningResult {
  screened: boolean;
  matchFound: boolean;
  matches: SanctionsMatch[];
  screenedAt: Date;
  cacheHit: boolean;
}

export interface SanctionsMatch {
  entry: SanctionsEntry;
  score: number; // 0-100 match confidence
  matchedOn: string[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ScreeningRequest {
  name: string;
  dateOfBirth?: string;
  country?: string;
  nationalId?: string;
  aliases?: string[];
}

interface CacheEntry {
  result: ScreeningResult;
  expiresAt: number;
}

export class SanctionsService {
  private ofacEntries: Map<string, SanctionsEntry> = new Map();
  private unEntries: Map<string, SanctionsEntry> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTimeMs: number;
  private lastRefresh: Date | null = null;

  constructor(options?: { cacheTimeMs?: number }) {
    this.cacheTimeMs = options?.cacheTimeMs || 24 * 60 * 60 * 1000; // 24 hours default
  }

  /**
   * Screen a person or entity against sanctions lists
   */
  async screen(request: ScreeningRequest): Promise<ScreeningResult> {
    const cacheKey = this.getCacheKey(request);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return { ...cached.result, cacheHit: true };
    }

    // If both lists are empty, attempt a refresh before screening
    if (this.ofacEntries.size === 0 && this.unEntries.size === 0) {
      logger.info('Sanctions lists empty, attempting refresh before screening');
      try {
        await this.refreshLists();
      } catch (err) {
        logger.warn('On-demand sanctions list refresh failed', { error: err });
      }
    }

    // Perform screening
    const matches: SanctionsMatch[] = [];

    // Screen against OFAC
    const ofacMatches = this.screenAgainstList(request, this.ofacEntries);
    matches.push(...ofacMatches);

    // Screen against UN
    const unMatches = this.screenAgainstList(request, this.unEntries);
    matches.push(...unMatches);

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    const result: ScreeningResult = {
      screened: true,
      matchFound: matches.length > 0,
      matches: matches.slice(0, 10), // Top 10 matches
      screenedAt: new Date(),
      cacheHit: false,
    };

    // Cache result
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + this.cacheTimeMs,
    });

    return result;
  }

  /**
   * Screen against a specific list
   */
  private screenAgainstList(
    request: ScreeningRequest,
    entries: Map<string, SanctionsEntry>
  ): SanctionsMatch[] {
    const matches: SanctionsMatch[] = [];
    const searchNames = [request.name, ...(request.aliases || [])];

    for (const entry of entries.values()) {
      const entryNames = [entry.name, ...entry.aliases];
      let bestScore = 0;
      const matchedOn: string[] = [];

      // Name matching
      for (const searchName of searchNames) {
        for (const entryName of entryNames) {
          const score = this.fuzzyMatch(searchName, entryName);
          if (score > bestScore) {
            bestScore = score;
            if (score >= 80 && !matchedOn.includes('name')) {
              matchedOn.push('name');
            }
          }
        }
      }

      // DOB matching (if available)
      if (request.dateOfBirth && entry.dateOfBirth) {
        if (request.dateOfBirth === entry.dateOfBirth) {
          bestScore = Math.min(100, bestScore + 20);
          matchedOn.push('dateOfBirth');
        }
      }

      // Country matching
      if (request.country && entry.country) {
        if (request.country.toLowerCase() === entry.country.toLowerCase()) {
          bestScore = Math.min(100, bestScore + 10);
          matchedOn.push('country');
        }
      }

      // National ID matching
      if (request.nationalId && entry.nationalId) {
        if (request.nationalId === entry.nationalId) {
          bestScore = Math.min(100, bestScore + 30);
          matchedOn.push('nationalId');
        }
      }

      // Only include if score is above threshold
      if (bestScore >= 70) {
        matches.push({
          entry,
          score: bestScore,
          matchedOn,
          riskLevel: bestScore >= 95 ? 'HIGH' : bestScore >= 85 ? 'MEDIUM' : 'LOW',
        });
      }
    }

    return matches;
  }

  /**
   * Fuzzy string matching using Levenshtein distance
   */
  private fuzzyMatch(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 100;

    const len1 = s1.length;
    const len2 = s2.length;

    if (len1 === 0 || len2 === 0) return 0;

    // Create matrix
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);

    return Math.round((1 - distance / maxLen) * 100);
  }

  /**
   * Refresh sanctions lists from sources
   */
  async refreshLists(): Promise<void> {
    await Promise.all([
      this.refreshOFAC(),
      this.refreshUN(),
    ]);
    this.lastRefresh = new Date();
    this.clearCache();
  }

  /**
   * Refresh OFAC SDN list
   */
  private async refreshOFAC(): Promise<void> {
    try {
      // OFAC SDN XML endpoint
      const response = await fetch(
        'https://www.treasury.gov/ofac/downloads/sdn.xml'
      );

      if (!response.ok) {
        throw new Error(`OFAC fetch failed: ${response.status}`);
      }

      const xml = await response.text();
      const entries = this.parseOFACXML(xml);

      this.ofacEntries.clear();
      for (const entry of entries) {
        this.ofacEntries.set(entry.id, entry);
      }

      logger.info(`Loaded ${this.ofacEntries.size} OFAC entries`);
    } catch (error) {
      logger.error('Failed to refresh OFAC list', { error: error as Error });
    }
  }

  /**
   * Parse OFAC SDN XML
   */
  private parseOFACXML(xml: string): SanctionsEntry[] {
    const entries: SanctionsEntry[] = [];

    // Simple regex-based parsing (in production, use proper XML parser)
    const entryRegex = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];

      const uid = this.extractXMLValue(entryXml, 'uid');
      const firstName = this.extractXMLValue(entryXml, 'firstName') || '';
      const lastName = this.extractXMLValue(entryXml, 'lastName') || '';
      const sdnType = this.extractXMLValue(entryXml, 'sdnType') || '';
      const program = this.extractXMLValue(entryXml, 'program') || '';

      const name = `${firstName} ${lastName}`.trim() || this.extractXMLValue(entryXml, 'lastName') || '';

      if (uid && name) {
        entries.push({
          id: `OFAC-${uid}`,
          name,
          aliases: this.extractAliases(entryXml),
          type: this.mapSDNType(sdnType),
          programs: program ? [program] : [],
          source: 'OFAC',
          addedAt: new Date(),
        });
      }
    }

    return entries;
  }

  private extractXMLValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<]*)<\/${tag}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : undefined;
  }

  private extractAliases(xml: string): string[] {
    const aliases: string[] = [];
    const aliasRegex = /<aka>([\s\S]*?)<\/aka>/g;
    let match;

    while ((match = aliasRegex.exec(xml)) !== null) {
      const firstName = this.extractXMLValue(match[1], 'firstName') || '';
      const lastName = this.extractXMLValue(match[1], 'lastName') || '';
      const alias = `${firstName} ${lastName}`.trim();
      if (alias) aliases.push(alias);
    }

    return aliases;
  }

  private mapSDNType(type: string): 'individual' | 'entity' | 'vessel' | 'aircraft' {
    switch (type?.toLowerCase()) {
      case 'individual':
        return 'individual';
      case 'vessel':
        return 'vessel';
      case 'aircraft':
        return 'aircraft';
      default:
        return 'entity';
    }
  }

  /**
   * Refresh UN sanctions list
   */
  private async refreshUN(): Promise<void> {
    try {
      // UN Security Council Consolidated List
      const response = await fetch(
        'https://scsanctions.un.org/resources/xml/en/consolidated.xml'
      );

      if (!response.ok) {
        throw new Error(`UN fetch failed: ${response.status}`);
      }

      const xml = await response.text();
      const entries = this.parseUNXML(xml);

      this.unEntries.clear();
      for (const entry of entries) {
        this.unEntries.set(entry.id, entry);
      }

      logger.info(`Loaded ${this.unEntries.size} UN entries`);
    } catch (error) {
      logger.error('Failed to refresh UN list', { error: error as Error });
    }
  }

  /**
   * Parse UN Consolidated List XML
   */
  private parseUNXML(xml: string): SanctionsEntry[] {
    const entries: SanctionsEntry[] = [];

    // Simple regex-based parsing
    const individualRegex = /<INDIVIDUAL>([\s\S]*?)<\/INDIVIDUAL>/g;
    const entityRegex = /<ENTITY>([\s\S]*?)<\/ENTITY>/g;

    let match;

    // Parse individuals
    while ((match = individualRegex.exec(xml)) !== null) {
      const entry = this.parseUNEntry(match[1], 'individual');
      if (entry) entries.push(entry);
    }

    // Parse entities
    while ((match = entityRegex.exec(xml)) !== null) {
      const entry = this.parseUNEntry(match[1], 'entity');
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private parseUNEntry(
    xml: string,
    type: 'individual' | 'entity'
  ): SanctionsEntry | null {
    const dataId = this.extractXMLValue(xml, 'DATAID');
    const firstName = this.extractXMLValue(xml, 'FIRST_NAME') || '';
    const secondName = this.extractXMLValue(xml, 'SECOND_NAME') || '';
    const thirdName = this.extractXMLValue(xml, 'THIRD_NAME') || '';

    const name = `${firstName} ${secondName} ${thirdName}`.trim();

    if (!dataId || !name) return null;

    return {
      id: `UN-${dataId}`,
      name,
      aliases: [],
      type,
      programs: ['UN-SANCTIONS'],
      source: 'UN',
      addedAt: new Date(),
    };
  }

  /**
   * Add a manual entry (for testing or custom lists)
   */
  addEntry(entry: Omit<SanctionsEntry, 'id' | 'addedAt'>): void {
    const id = `MANUAL-${crypto.randomUUID()}`;
    const fullEntry: SanctionsEntry = {
      ...entry,
      id,
      addedAt: new Date(),
    };

    if (entry.source === 'OFAC') {
      this.ofacEntries.set(id, fullEntry);
    } else {
      this.unEntries.set(id, fullEntry);
    }
  }

  /**
   * Clear the screening cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache key for request
   */
  private getCacheKey(request: ScreeningRequest): string {
    const data = JSON.stringify({
      name: request.name.toLowerCase().trim(),
      dob: request.dateOfBirth,
      country: request.country?.toLowerCase(),
      nationalId: request.nationalId,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get statistics
   */
  getStats(): {
    ofacCount: number;
    unCount: number;
    cacheSize: number;
    lastRefresh: Date | null;
  } {
    return {
      ofacCount: this.ofacEntries.size,
      unCount: this.unEntries.size,
      cacheSize: this.cache.size,
      lastRefresh: this.lastRefresh,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    const hasData = this.ofacEntries.size > 0 || this.unEntries.size > 0;
    return {
      healthy: hasData,
      latencyMs: Date.now() - start,
    };
  }
}

// Export singleton
let sanctionsService: SanctionsService | null = null;

export function getSanctionsService(): SanctionsService {
  if (!sanctionsService) {
    sanctionsService = new SanctionsService();
    sanctionsService.refreshLists().catch(err =>
      logger.warn('Sanctions list refresh failed at startup', { error: err })
    );
  }
  return sanctionsService;
}

export function createSanctionsService(options?: { cacheTimeMs?: number }): SanctionsService {
  return new SanctionsService(options);
}
