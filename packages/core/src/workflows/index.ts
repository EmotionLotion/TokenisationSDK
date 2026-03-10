// Generic Workflow Registry (pack-agnostic)
export {
  WorkflowRegistry,
} from './WorkflowRegistry.js';
export type {
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowExecutionContext,
  WorkflowProgressCallback,
  WorkflowProgressEvent,
  WorkflowResult,
  WorkflowStepResult,
  WorkflowError,
  WorkflowRunOptions,
} from './WorkflowRegistry.js';

// GoldenPath — Legacy convenience workflows (deprecated, use WorkflowRegistry)
export {
  // Types
  ProgressCallback,
  ProgressEvent,
  FlowResult,
  StepResult,
  FlowError,
  // Real Estate
  TokenizeRealEstateOptions,
  TokenizeRealEstateResult,
  DocumentInput,
  // Security Token
  LaunchSecurityTokenOptions,
  LaunchSecurityTokenResult,
  // Distribution
  DistributeOptions,
  DistributeResult,
  DistributionPayment,
  SkippedRecipient,
  // Interface
  IGoldenPathFlows,
  // Implementation
  GoldenPathFlows,
  // Errors
  FlowValidationError,
} from './GoldenPath.js';

export {
  // Types
  WorkflowStatus,
  WorkflowType,
  WorkflowHandle,
  WorkflowStep,
  WorkflowEventType,
  WorkflowEvent,
  SettlementReceipt,
  OnChainAnchor,
  // Implementation
  WorkflowOrchestrator,
} from './WorkflowOrchestrator.js';
