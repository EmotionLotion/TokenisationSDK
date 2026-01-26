/**
 * Saga Audit Plugin
 *
 * Automatically logs saga lifecycle events to the audit trail.
 * Provides full traceability of saga executions for compliance.
 */

import type { AuditLogService, AuditAction, AuditContext } from './AuditLog.js';
import type { SagaOptions } from '../core/Saga.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Saga audit plugin configuration
 */
export interface SagaAuditPluginConfig {
  /** Audit log service instance */
  auditService: AuditLogService;
  /** Default actor ID for saga events */
  defaultActorId?: string;
  /** Default actor type */
  defaultActorType?: 'system' | 'service';
  /** Whether to log step-level events (default: true) */
  logStepEvents?: boolean;
  /** Whether to log compensation events (default: true) */
  logCompensationEvents?: boolean;
  /** Additional metadata to include in all saga events */
  metadata?: Record<string, unknown>;
}

/**
 * Saga event details for audit logging
 */
export interface SagaEventDetails {
  sagaId: string;
  sagaType: string;
  stepName?: string;
  error?: string;
  duration?: number;
  context?: Record<string, unknown>;
  results?: Record<string, unknown>;
  compensated?: boolean;
}

// ============================================================================
// SAGA AUDIT PLUGIN
// ============================================================================

/**
 * Plugin that adds audit logging to saga executions
 */
export class SagaAuditPlugin {
  private auditService: AuditLogService;
  private defaultActorId: string;
  private defaultActorType: 'system' | 'service';
  private logStepEvents: boolean;
  private logCompensationEvents: boolean;
  private metadata: Record<string, unknown>;

  constructor(config: SagaAuditPluginConfig) {
    this.auditService = config.auditService;
    this.defaultActorId = config.defaultActorId ?? 'saga-coordinator';
    this.defaultActorType = config.defaultActorType ?? 'system';
    this.logStepEvents = config.logStepEvents ?? true;
    this.logCompensationEvents = config.logCompensationEvents ?? true;
    this.metadata = config.metadata ?? {};
  }

  /**
   * Get saga options with audit logging callbacks
   */
  getSagaOptions(
    sagaType: string,
    context?: AuditContext & { correlationId?: string }
  ): Partial<SagaOptions> {
    const actorId = context?.actorId ?? this.defaultActorId;
    const actorType = context?.actorType ?? this.defaultActorType;
    const requestId = context?.correlationId ?? context?.requestId;

    return {
      onStepStart: this.logStepEvents
        ? (stepName, sagaId) => {
            this.logEvent('SAGA_STEP_STARTED' as AuditAction, {
              sagaId,
              sagaType,
              stepName,
            }, {
              actorId,
              actorType,
              requestId,
            });
          }
        : undefined,

      onStepComplete: this.logStepEvents
        ? (stepName, sagaId) => {
            this.logEvent('SAGA_STEP_COMPLETED' as AuditAction, {
              sagaId,
              sagaType,
              stepName,
            }, {
              actorId,
              actorType,
              requestId,
            });
          }
        : undefined,

      onStepFail: (stepName, error, sagaId) => {
        this.logEvent('SAGA_STEP_FAILED' as AuditAction, {
          sagaId,
          sagaType,
          stepName,
          error,
        }, {
          actorId,
          actorType,
          requestId,
        });
      },

      onCompensationStart: this.logCompensationEvents
        ? (stepName, sagaId) => {
            this.logEvent('SAGA_COMPENSATION_STARTED' as AuditAction, {
              sagaId,
              sagaType,
              stepName,
            }, {
              actorId,
              actorType,
              requestId,
            });
          }
        : undefined,

      onCompensationComplete: this.logCompensationEvents
        ? (stepName, sagaId) => {
            this.logEvent('SAGA_COMPENSATION_COMPLETED' as AuditAction, {
              sagaId,
              sagaType,
              stepName,
            }, {
              actorId,
              actorType,
              requestId,
            });
          }
        : undefined,

      onCompensationFail: (stepName, error, sagaId) => {
        this.logEvent('SAGA_COMPENSATION_FAILED' as AuditAction, {
          sagaId,
          sagaType,
          stepName,
          error,
        }, {
          actorId,
          actorType,
          requestId,
        });
      },
    };
  }

  /**
   * Log saga started event
   */
  async logSagaStarted(
    sagaId: string,
    sagaType: string,
    context?: Record<string, unknown>,
    auditContext?: AuditContext
  ): Promise<void> {
    await this.logEvent('SAGA_STARTED' as AuditAction, {
      sagaId,
      sagaType,
      context,
    }, auditContext);
  }

  /**
   * Log saga completed event
   */
  async logSagaCompleted(
    sagaId: string,
    sagaType: string,
    results?: Record<string, unknown>,
    duration?: number,
    auditContext?: AuditContext
  ): Promise<void> {
    await this.logEvent('SAGA_COMPLETED' as AuditAction, {
      sagaId,
      sagaType,
      results,
      duration,
    }, auditContext);
  }

  /**
   * Log saga failed event
   */
  async logSagaFailed(
    sagaId: string,
    sagaType: string,
    error: string,
    compensated: boolean,
    auditContext?: AuditContext
  ): Promise<void> {
    await this.logEvent('SAGA_FAILED' as AuditAction, {
      sagaId,
      sagaType,
      error,
      compensated,
    }, auditContext);
  }

  /**
   * Create a wrapped saga executor with automatic audit logging
   */
  wrapSagaExecution<TContext extends Record<string, unknown>, TResult>(
    sagaType: string,
    executor: (context: TContext) => Promise<TResult>,
    auditContext?: AuditContext
  ): (context: TContext) => Promise<TResult> {
    return async (context: TContext): Promise<TResult> => {
      const sagaId = (context as { sagaId?: string }).sagaId ?? `saga-${Date.now()}`;
      const startTime = Date.now();

      await this.logSagaStarted(sagaId, sagaType, context, auditContext);

      try {
        const result = await executor(context);
        const duration = Date.now() - startTime;

        await this.logSagaCompleted(
          sagaId,
          sagaType,
          result as Record<string, unknown>,
          duration,
          auditContext
        );

        return result;
      } catch (error) {
        await this.logSagaFailed(
          sagaId,
          sagaType,
          error instanceof Error ? error.message : String(error),
          false,
          auditContext
        );
        throw error;
      }
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async logEvent(
    action: AuditAction,
    details: SagaEventDetails,
    auditContext?: AuditContext
  ): Promise<void> {
    try {
      await this.auditService.log({
        action,
        actorId: auditContext?.actorId ?? this.defaultActorId,
        actorType: auditContext?.actorType ?? this.defaultActorType,
        resourceType: 'saga',
        resourceId: details.sagaId,
        details: {
          ...this.metadata,
          ...details,
        },
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        requestId: auditContext?.requestId,
      });
    } catch (error) {
      // Don't let audit failures break saga execution
      console.error(`Failed to log saga audit event: ${error}`);
    }
  }
}

/**
 * Create a saga audit plugin
 */
export function createSagaAuditPlugin(config: SagaAuditPluginConfig): SagaAuditPlugin {
  return new SagaAuditPlugin(config);
}

export default SagaAuditPlugin;
