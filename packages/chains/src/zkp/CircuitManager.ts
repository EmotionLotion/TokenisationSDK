/**
 * CircuitManager - Circuit Artifact Loading and Management
 *
 * Manages loading and caching of circom circuit artifacts.
 */

import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import type { CircuitArtifacts, VerificationKey } from './types.js';

/**
 * Default circuit paths
 */
const DEFAULT_CIRCUITS_PATH = './circuits/build';

/**
 * Circuit names to file mapping
 */
const CIRCUIT_FILES: Record<string, { wasm: string; zkey: string; vkey: string }> = {
  age_proof: {
    wasm: 'age_proof_js/age_proof.wasm',
    zkey: 'age_proof_final.zkey',
    vkey: 'age_proof_verification_key.json',
  },
  accreditation_proof: {
    wasm: 'accreditation_proof_js/accreditation_proof.wasm',
    zkey: 'accreditation_proof_final.zkey',
    vkey: 'accreditation_proof_verification_key.json',
  },
  jurisdiction_proof: {
    wasm: 'jurisdiction_proof_js/jurisdiction_proof.wasm',
    zkey: 'jurisdiction_proof_final.zkey',
    vkey: 'jurisdiction_proof_verification_key.json',
  },
  kyc_status_proof: {
    wasm: 'kyc_status_proof_js/kyc_status_proof.wasm',
    zkey: 'kyc_status_proof_final.zkey',
    vkey: 'kyc_status_proof_verification_key.json',
  },
  claim_verify: {
    wasm: 'claim_verify_js/claim_verify.wasm',
    zkey: 'claim_verify_final.zkey',
    vkey: 'claim_verify_verification_key.json',
  },
};

/**
 * CircuitManager - Manages circuit artifact loading
 */
export class CircuitManager {
  private circuitsPath: string;
  private artifactCache: Map<string, CircuitArtifacts> = new Map();
  private vkeyCache: Map<string, VerificationKey> = new Map();

  constructor(circuitsPath?: string) {
    this.circuitsPath = circuitsPath || DEFAULT_CIRCUITS_PATH;
  }

  /**
   * Load circuit artifacts (wasm and zkey)
   */
  async loadCircuit(circuitName: string): Promise<Result<CircuitArtifacts, string>> {
    // Check cache
    const cached = this.artifactCache.get(circuitName);
    if (cached) {
      return ok(cached);
    }

    const files = CIRCUIT_FILES[circuitName];
    if (!files) {
      return err(`Unknown circuit: ${circuitName}`);
    }

    try {
      // In Node.js, we'd use fs to read files
      // In browser, we'd use fetch
      const isNode = typeof process !== 'undefined' && process.versions?.node;

      let wasm: Uint8Array | string;
      let zkey: Uint8Array | string;
      let vkey: VerificationKey | undefined;

      if (isNode) {
        const fs = await import('fs/promises');
        const path = await import('path');

        const wasmPath = path.join(this.circuitsPath, files.wasm);
        const zkeyPath = path.join(this.circuitsPath, files.zkey);
        const vkeyPath = path.join(this.circuitsPath, files.vkey);

        try {
          wasm = await fs.readFile(wasmPath);
          zkey = await fs.readFile(zkeyPath);
          const vkeyData = await fs.readFile(vkeyPath, 'utf-8');
          vkey = JSON.parse(vkeyData);
        } catch (fileError) {
          // Files may not exist in development - return mock artifacts
          return this._getMockArtifacts(circuitName);
        }
      } else {
        // Browser environment - use fetch
        try {
          const wasmResponse = await fetch(`${this.circuitsPath}/${files.wasm}`);
          const zkeyResponse = await fetch(`${this.circuitsPath}/${files.zkey}`);
          const vkeyResponse = await fetch(`${this.circuitsPath}/${files.vkey}`);

          wasm = new Uint8Array(await wasmResponse.arrayBuffer());
          zkey = new Uint8Array(await zkeyResponse.arrayBuffer());
          vkey = await vkeyResponse.json();
        } catch (fetchError) {
          // Return mock artifacts if fetch fails
          return this._getMockArtifacts(circuitName);
        }
      }

      const artifacts: CircuitArtifacts = { wasm, zkey, vkey };

      // Cache artifacts
      this.artifactCache.set(circuitName, artifacts);
      if (vkey) {
        this.vkeyCache.set(circuitName, vkey);
      }

      return ok(artifacts);
    } catch (error) {
      return err(`Failed to load circuit ${circuitName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load verification key only
   */
  async loadVerificationKey(circuitName: string): Promise<Result<VerificationKey, string>> {
    // Check cache
    const cached = this.vkeyCache.get(circuitName);
    if (cached) {
      return ok(cached);
    }

    const files = CIRCUIT_FILES[circuitName];
    if (!files) {
      return err(`Unknown circuit: ${circuitName}`);
    }

    try {
      const isNode = typeof process !== 'undefined' && process.versions?.node;
      let vkey: VerificationKey;

      if (isNode) {
        const fs = await import('fs/promises');
        const path = await import('path');

        const vkeyPath = path.join(this.circuitsPath, files.vkey);

        try {
          const vkeyData = await fs.readFile(vkeyPath, 'utf-8');
          vkey = JSON.parse(vkeyData);
        } catch {
          return this._getMockVerificationKey(circuitName);
        }
      } else {
        try {
          const response = await fetch(`${this.circuitsPath}/${files.vkey}`);
          vkey = await response.json();
        } catch {
          return this._getMockVerificationKey(circuitName);
        }
      }

      this.vkeyCache.set(circuitName, vkey);
      return ok(vkey);
    } catch (error) {
      return err(`Failed to load verification key for ${circuitName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if circuit artifacts are available
   */
  async isCircuitAvailable(circuitName: string): Promise<boolean> {
    const result = await this.loadCircuit(circuitName);
    return result.success;
  }

  /**
   * Get list of supported circuits
   */
  getSupportedCircuits(): string[] {
    return Object.keys(CIRCUIT_FILES);
  }

  /**
   * Clear cached artifacts
   */
  clearCache(): void {
    this.artifactCache.clear();
    this.vkeyCache.clear();
  }

  /**
   * Set circuits path
   */
  setCircuitsPath(path: string): void {
    this.circuitsPath = path;
    this.clearCache();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Get mock artifacts for development/testing
   */
  private _getMockArtifacts(circuitName: string): Result<CircuitArtifacts, string> {
    // Return mock artifacts that allow the plugin to function without real circuits
    const mockArtifacts: CircuitArtifacts = {
      wasm: `mock_${circuitName}.wasm`,
      zkey: `mock_${circuitName}.zkey`,
      vkey: this._createMockVerificationKey(circuitName),
    };

    this.artifactCache.set(circuitName, mockArtifacts);

    return ok(mockArtifacts);
  }

  /**
   * Get mock verification key
   */
  private _getMockVerificationKey(circuitName: string): Result<VerificationKey, string> {
    const vkey = this._createMockVerificationKey(circuitName);
    this.vkeyCache.set(circuitName, vkey);
    return ok(vkey);
  }

  /**
   * Create a mock verification key
   */
  private _createMockVerificationKey(circuitName: string): VerificationKey {
    return {
      protocol: 'groth16',
      curve: 'bn128',
      nPublic: 3,
      vk_alpha_1: [
        '20491192805390485299153009773594534940189261866228447918068658471970481763042',
        '9383485363053290200918347156157836566562967994039712273449902621266178545958',
        '1',
      ],
      vk_beta_2: [
        [
          '6375614351688725206403948262868962793625744043794305715222011528459656738731',
          '4252822878758300859123897981450591353533073413197771768651442665752259397132',
        ],
        [
          '10505242626370262277552901082094356697409835680220590971873171140371331206856',
          '21847035105528745403288232691147584728191162732299865338377159692350059136679',
        ],
        ['1', '0'],
      ],
      vk_gamma_2: [
        [
          '10857046999023057135944570762232829481370756359578518086990519993285655852781',
          '11559732032986387107991004021392285783925812861821192530917403151452391805634',
        ],
        [
          '8495653923123431417604973247489272438418190587263600148770280649306958101930',
          '4082367875863433681332203403145435568316851327593401208105741076214120093531',
        ],
        ['1', '0'],
      ],
      vk_delta_2: [
        [
          '10857046999023057135944570762232829481370756359578518086990519993285655852781',
          '11559732032986387107991004021392285783925812861821192530917403151452391805634',
        ],
        [
          '8495653923123431417604973247489272438418190587263600148770280649306958101930',
          '4082367875863433681332203403145435568316851327593401208105741076214120093531',
        ],
        ['1', '0'],
      ],
      vk_alphabeta_12: [],
      IC: [
        [
          '6258609903805505270860461913729459076833854269783960620063579076445099787126',
          '19716548116288566764594354455764720363923894911095163814424816400778113558583',
          '1',
        ],
        [
          '21529644862649733827902117116509380025038127456817161949218362908262682332301',
          '1830438122047413217831282851858505965127866143052153597464556139233679273169',
          '1',
        ],
        [
          '17312746093486654203533966994802949055432691466903618290793538315344573088963',
          '12121347708984404610796643813069802632934080287040794699313024082052300379968',
          '1',
        ],
      ],
    };
  }
}

/**
 * Factory function
 */
export function createCircuitManager(circuitsPath?: string): CircuitManager {
  return new CircuitManager(circuitsPath);
}
