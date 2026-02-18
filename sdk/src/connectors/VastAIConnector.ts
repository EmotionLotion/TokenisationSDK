/**
 * Vast.ai Connector
 *
 * Integration with the Vast.ai GPU marketplace API for machine listing,
 * earnings tracking, market rate discovery, and hardware verification.
 * Supports host-side operations for GPU compute tokenization workflows.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface VastMachine {
  machineId: string;
  gpuName: string;
  numGpus: number;
  gpuRam: number;
  cpuName: string;
  cpuRam: number;
  diskSpace: number;
  dlPerf: number;
  ulPerf: number;
  reliability: number;
  dphTotal: number;
  rentable: boolean;
  rented: boolean;
  hostId: string;
  datacenterCity: string;
  datacenterCountry: string;
  datacenterRegion: string;
}

export interface VastOffer {
  offerId: string;
  machineId: string;
  gpuName: string;
  numGpus: number;
  totalFlops: number;
  dphTotal: number;
  dlPerf: number;
  reliability: number;
  duration: number;
  startDate: string;
}

export interface VastEarnings {
  machineId: string;
  totalEarnings: number;
  periodStart: string;
  periodEnd: string;
  hoursRented: number;
  utilizationPercent: number;
}

export interface VastMachineStatus {
  machineId: string;
  online: boolean;
  gpuUtilization: number;
  gpuTemp: number;
  memUsed: number;
  memTotal: number;
}

export interface GPUFilters {
  gpuName?: string;
  minGpuRam?: number;
  maxDphTotal?: number;
  minReliability?: number;
  minDlPerf?: number;
  numGpus?: number;
}

export interface VastMarketRates {
  avgPricePerHour: number;
  minPrice: number;
  maxPrice: number;
  totalAvailable: number;
}

export interface VastVerificationResult {
  verified: boolean;
  discrepancies: string[];
}

// ============================================================================
// ERROR
// ============================================================================

export class VastAIError extends Error {
  readonly provider = 'vast.ai';
  readonly errorCode: string;
  readonly details: unknown;

  constructor(message: string, errorCode: string, details?: unknown) {
    super(message);
    this.name = 'VastAIError';
    this.errorCode = errorCode;
    this.details = details;
  }
}

// ============================================================================
// CONNECTOR
// ============================================================================

/**
 * Vast.ai GPU marketplace connector
 *
 * @example
 * ```typescript
 * const vast = new VastAIConnector('your-api-key');
 * const machines = await vast.listHostMachines();
 * const rates = await vast.getMarketRates('H100');
 * ```
 */
export class VastAIConnector {
  readonly name = 'vast.ai';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://console.vast.ai/api/v0') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) params.append(key, String(value));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try { errorData = JSON.parse(errorText); } catch { errorData = { message: errorText }; }
      throw new VastAIError(
        `Vast.ai API error: ${response.status} - ${errorData.message || errorText}`,
        `HTTP_${response.status}`, errorData
      );
    }

    if (response.status === 204) return {} as T;
    return response.json();
  }

  async listHostMachines(): Promise<VastMachine[]> {
    const response = await this.request<{ machines: VastMachine[] }>('GET', '/machines');
    return response.machines || [];
  }

  async getMachineStatus(machineId: string): Promise<VastMachineStatus> {
    return this.request<VastMachineStatus>('GET', `/machines/${machineId}/status`);
  }

  async getMachineEarnings(machineId: string, period: { start: Date; end: Date }): Promise<VastEarnings> {
    return this.request<VastEarnings>('GET', `/machines/${machineId}/earnings`, undefined, {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
    });
  }

  async getMarketRates(gpuModel: string): Promise<VastMarketRates> {
    const offers = await this.searchOffers({ gpuName: gpuModel });
    if (offers.length === 0) return { avgPricePerHour: 0, minPrice: 0, maxPrice: 0, totalAvailable: 0 };

    const prices = offers.map(o => o.dphTotal);
    const sum = prices.reduce((a, b) => a + b, 0);
    return {
      avgPricePerHour: sum / prices.length,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalAvailable: offers.length,
    };
  }

  async searchOffers(filters: GPUFilters): Promise<VastOffer[]> {
    const queryParams: Record<string, string | number | boolean> = {};
    if (filters.gpuName) queryParams.gpu_name = filters.gpuName;
    if (filters.minGpuRam !== undefined) queryParams.min_gpu_ram = filters.minGpuRam;
    if (filters.maxDphTotal !== undefined) queryParams.max_dph_total = filters.maxDphTotal;
    if (filters.minReliability !== undefined) queryParams.min_reliability = filters.minReliability;
    if (filters.minDlPerf !== undefined) queryParams.min_dl_perf = filters.minDlPerf;
    if (filters.numGpus !== undefined) queryParams.num_gpus = filters.numGpus;

    const response = await this.request<{ offers: VastOffer[] }>('GET', '/offers', undefined, queryParams);
    return response.offers || [];
  }

  async verifyMachineSpecs(
    machineId: string,
    expectedSpecs: { gpuModel: string; gpuCount: number; vramGB: number }
  ): Promise<VastVerificationResult> {
    const machines = await this.listHostMachines();
    const machine = machines.find(m => m.machineId === machineId);

    if (!machine) {
      return { verified: false, discrepancies: [`Machine ${machineId} not found in host inventory`] };
    }

    const discrepancies: string[] = [];

    if (machine.gpuName.toLowerCase() !== expectedSpecs.gpuModel.toLowerCase()) {
      discrepancies.push(`GPU model mismatch: expected '${expectedSpecs.gpuModel}', found '${machine.gpuName}'`);
    }
    if (machine.numGpus !== expectedSpecs.gpuCount) {
      discrepancies.push(`GPU count mismatch: expected ${expectedSpecs.gpuCount}, found ${machine.numGpus}`);
    }
    const vramTolerance = expectedSpecs.vramGB * 0.05;
    if (Math.abs(machine.gpuRam - expectedSpecs.vramGB) > vramTolerance) {
      discrepancies.push(`VRAM mismatch: expected ${expectedSpecs.vramGB}GB, found ${machine.gpuRam}GB`);
    }

    return { verified: discrepancies.length === 0, discrepancies };
  }
}

export default VastAIConnector;
