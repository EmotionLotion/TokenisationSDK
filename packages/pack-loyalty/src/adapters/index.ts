/**
 * Ahoy Adapters
 *
 * Connects Ahoy ecosystem apps (COMET, FLY+, H2O) to the tokenization SDK.
 */

export {
  CometDataAdapter,
  createCometAdapter,
  createDevCometAdapter,
  type CometConfig,
  type CometDriver,
  type CometDelivery,
  type CometTelematicsEvent,
  type CometWebhookPayload,
  type WebhookEvent,
} from './CometDataAdapter.js';

export {
  LoyaltyAdapter,
  loyaltyAdapter,
  type LoyaltyInput,
  type LoyaltyMetadata,
  type LoyaltyProgramType,
  type ExpirationPolicy,
  type EarnMethod,
  type RedemptionOption,
} from './LoyaltyAdapter.js';
