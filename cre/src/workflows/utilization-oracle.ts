/**
 * CRE Workflow: Utilization Oracle (DePIN)
 *
 * Daily aggregation of IoT telemetry data per asset, reports utilization
 * scores on-chain, and triggers yield distribution when period is reached.
 *
 * Triggers:
 *   - Cron: daily at midnight UTC
 *   - HTTP: manual utilization check trigger
 *
 * Data flow:
 *   1. Query server for assets with active IoT devices
 *   2. Aggregate telemetry data for the reporting period
 *   3. Compute utilization score (0-100)
 *   4. Report utilization on-chain
 *   5. Trigger yield distribution if period boundary reached
 *
 * @packageDocumentation
 */

import {
  Workflow,
  HttpTrigger,
  CronTrigger,
  HttpCapability,
  ConsensusCapability,
  OnChainReportCapability,
  type TriggerEvent,
  type WorkflowSpec,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface UtilizationRequest {
  assetId: string;
  period: string;           // YYYY-MM
  serverBaseUrl: string;
  callbackUrl?: string;
}

interface UtilizationReport {
  assetId: string;
  period: string;
  utilizationScore: number;
  dataPoints: number;
  reportedOnChain: boolean;
  yieldTriggered: boolean;
  timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

const DAILY_CRON = '0 0 * * *';

const FUNCTIONS_CONSUMER_ADDRESS =
  process.env.FUNCTIONS_CONSUMER_ADDRESS || '0x0000000000000000000000000000000000000000';
const REPORT_DON_ID = process.env.CRE_DON_ID || 'don-1';
const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111';

// ============================================================================
// Helpers
// ============================================================================

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isEndOfPeriod(): boolean {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.getMonth() !== now.getMonth();
}

// ============================================================================
// Workflow Definition
// ============================================================================

const utilizationOracleWorkflow: WorkflowSpec = {
  name: 'utilization-oracle',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    {
      type: 'http',
      id: 'http-utilization-check',
      config: { method: 'POST', path: '/utilization-check', authentication: 'bearer' },
    } as HttpTrigger,
    {
      type: 'cron',
      id: 'cron-daily-utilization',
      config: { schedule: DAILY_CRON },
    } as CronTrigger,
  ],

  capabilities: {
    http: {
      type: 'http',
      config: {
        allowedDomains: ['*'], // Needs to reach the server API
        maxConcurrent: 4,
        timeoutMs: 30_000,
      },
    } as HttpCapability,
    consensus: {
      type: 'consensus',
      config: { method: 'median', minResponses: 3, maxDeviation: 5 },
    } as ConsensusCapability,
    onChainReport: {
      type: 'on_chain_report',
      config: {
        chainId: CHAIN_ID,
        contractAddress: FUNCTIONS_CONSUMER_ADDRESS,
        donId: REPORT_DON_ID,
        method: 'fulfillRequest',
        gasLimit: 400_000,
      },
    } as OnChainReportCapability,
  },

  async execute(event: TriggerEvent, capabilities) {
    const { http, consensus, onChainReport } = capabilities;

    let requests: UtilizationRequest[];

    if (event.trigger === 'http-utilization-check') {
      requests = [event.body as UtilizationRequest];
    } else {
      const pollAssets = process.env.CRE_POLL_ASSETS;
      if (!pollAssets) return { status: 'no_assets_to_check' };
      requests = JSON.parse(pollAssets);
    }

    const period = getCurrentPeriod();
    const shouldTriggerYield = isEndOfPeriod();
    const reports: UtilizationReport[] = [];

    for (const req of requests) {
      const assetPeriod = req.period || period;

      // 1. Fetch utilization from server API
      let utilizationScore = 0;
      let dataPoints = 0;

      try {
        const apiKey = process.env.SERVER_API_KEY ?? '';
        const response = await http.fetch(`${req.serverBaseUrl}/api/v1/devices/utilization`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({ assetId: req.assetId, period: assetPeriod }),
          timeout: 15_000,
        });

        if (response.ok) {
          const body = await response.json() as any;
          utilizationScore = body.data?.score ?? 0;
          dataPoints = body.data?.dataPoints ?? 0;
        }
      } catch {
        console.error(`Failed to fetch utilization for asset ${req.assetId}`);
      }

      // 2. Consensus across DON nodes
      const agreed = await consensus.reach({
        assetId: req.assetId,
        utilizationScore,
        dataPoints,
      });

      const finalScore = agreed.utilizationScore as number;

      // 3. Report on-chain
      let reportedOnChain = false;
      try {
        await onChainReport.submit({
          data: JSON.stringify({
            assetId: req.assetId,
            period: assetPeriod,
            utilizationScore: finalScore,
            dataPoints: agreed.dataPoints,
            timestamp: new Date().toISOString(),
          }),
          metadata: { assetId: req.assetId, period: assetPeriod },
        });
        reportedOnChain = true;
      } catch (err) {
        console.error('On-chain utilization report failed:', err);
      }

      // 4. Trigger yield distribution if end of period
      let yieldTriggered = false;
      if (shouldTriggerYield && req.callbackUrl) {
        try {
          await http.fetch(req.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'utilization_report',
              data: {
                assetId: req.assetId,
                period: assetPeriod,
                utilizationScore: finalScore,
                dataPoints,
                triggerYield: true,
              },
            }),
            timeout: 5_000,
          });
          yieldTriggered = true;
        } catch {
          console.error(`Utilization callback to ${req.callbackUrl} failed`);
        }
      }

      reports.push({
        assetId: req.assetId,
        period: assetPeriod,
        utilizationScore: finalScore,
        dataPoints,
        reportedOnChain,
        yieldTriggered,
        timestamp: new Date().toISOString(),
      });
    }

    return { status: 'complete', reports };
  },
};

// ============================================================================
// Export
// ============================================================================

export default Workflow.create(utilizationOracleWorkflow);
export type { UtilizationRequest, UtilizationReport };
