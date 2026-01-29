/**
 * AutomationLifecycleManager
 *
 * Listens to CrossPackEventBus events and creates/manages
 * Chainlink Automation upkeeps for recurring tasks.
 *
 * When events like TICKET_ISSUED, RESERVATION_CONFIRMED, or RENTAL_CREATED
 * are published, this manager automatically creates the appropriate
 * Chainlink Automation upkeep (compliance re-check, NAV update, etc.).
 */

import type { ChainlinkAutomationPlugin } from '../plugins/chainlink/AutomationPlugin.js';
import { AutomationTaskType } from '../plugins/chainlink/AutomationPlugin.js';
import type { CrossPackEventBus, CrossPackEvent } from '../orchestration/CrossPackEventBus.js';

export interface AutomationLifecycleConfig {
  /** Which task types to auto-register on events */
  autoRegisterTasks: AutomationTaskType[];
  /** Default contract address for compliance checks */
  complianceContract?: string;
  /** Default contract address for NAV updates */
  navContract?: string;
  /** Default admin address for upkeep registration */
  adminAddress?: string;
}

/** Event types that trigger automation creation */
const AUTOMATION_TRIGGER_EVENTS = [
  'TICKET_ISSUED',
  'RESERVATION_CONFIRMED',
  'RENTAL_CREATED',
  'ASSET_CREATED',
  'RIGHT_ACTIVATED',
] as const;

/**
 * AutomationLifecycleManager
 *
 * Bridges the event bus to Chainlink Automation by auto-creating
 * upkeeps for events that need recurring on-chain tasks.
 */
export class AutomationLifecycleManager {
  private subscriptionIds: string[] = [];
  private upkeepIds: Map<string, string> = new Map();
  private running = false;

  constructor(
    private readonly automationPlugin: ChainlinkAutomationPlugin,
    private readonly eventBus: CrossPackEventBus,
    private readonly config: AutomationLifecycleConfig
  ) {}

  /**
   * Start listening to the event bus and auto-creating upkeeps
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const subId = this.eventBus.subscribe(
      { type: [...AUTOMATION_TRIGGER_EVENTS] },
      (event: CrossPackEvent) => {
        this.handleEvent(event).catch(() => {
          // Swallow errors; automation creation is best-effort
        });
      }
    );

    this.subscriptionIds.push(subId);
  }

  /**
   * Stop listening and unsubscribe from events
   */
  stop(): void {
    this.running = false;
    for (const subId of this.subscriptionIds) {
      this.eventBus.unsubscribe(subId);
    }
    this.subscriptionIds = [];
  }

  /**
   * Whether the manager is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the mapping of resource IDs to upkeep IDs
   */
  getUpkeepIds(): Map<string, string> {
    return new Map(this.upkeepIds);
  }

  /**
   * Handle an event by creating appropriate automation tasks
   */
  private async handleEvent(event: CrossPackEvent): Promise<void> {
    const resourceId = event.resourceId;
    const tasks = this.config.autoRegisterTasks;

    // Create compliance check task if configured
    if (
      tasks.includes(AutomationTaskType.COMPLIANCE_CHECK) &&
      this.config.complianceContract &&
      this.config.adminAddress
    ) {
      const result = await this.automationPlugin.createComplianceCheckTask({
        complianceContract: this.config.complianceContract,
        assetId: resourceId,
        checkInterval: 'daily',
        admin: this.config.adminAddress,
      });

      if (result.success && result.data.upkeepId) {
        this.upkeepIds.set(`compliance:${resourceId}`, result.data.upkeepId);
      }
    }

    // Create NAV update task if configured
    if (
      tasks.includes(AutomationTaskType.NAV_UPDATE) &&
      this.config.navContract &&
      this.config.adminAddress
    ) {
      const result = await this.automationPlugin.createNAVUpdateTask({
        navContract: this.config.navContract,
        assetId: resourceId,
        admin: this.config.adminAddress,
      });

      if (result.success && result.data.upkeepId) {
        this.upkeepIds.set(`nav:${resourceId}`, result.data.upkeepId);
      }
    }
  }
}
