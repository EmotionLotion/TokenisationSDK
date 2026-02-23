/**
 * Ahoy Ecosystem Types
 *
 * Type definitions for the Ahoy tokenization ecosystem covering:
 * - COMET (Logistics & Courier)
 * - Fly+ (Travel & Luggage)
 * - H2O (Water/Utility)
 * - AMS/GTS (Data Infrastructure)
 * - Nexus (AI/Federated ML)
 */

import { z } from 'zod';

// ============================================
// COMET Types (Logistics & Courier Operations)
// ============================================

export enum DriverTier {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  DIAMOND = 'DIAMOND',
}

export const DriverReputationSchema = z.object({
  driverId: z.string().uuid(),
  totalDeliveries: z.number().nonnegative(),
  onTimeRate: z.number().min(0).max(100),
  safetyScore: z.number().min(0).max(100),
  customerRating: z.number().min(0).max(5),
  xpPoints: z.number().nonnegative(),
  tier: z.nativeEnum(DriverTier),
  streakDays: z.number().nonnegative(),
  lastUpdated: z.string().datetime(),
});

export type DriverReputation = z.infer<typeof DriverReputationSchema>;

export const DeliverySlotSchema = z.object({
  slotId: z.string().uuid(),
  date: z.string(),
  timeWindow: z.object({
    start: z.string(),
    end: z.string(),
  }),
  zone: z.string(),
  capacity: z.number().positive(),
  bookedCount: z.number().nonnegative(),
  priceMultiplier: z.number().positive(),
  isPeak: z.boolean(),
});

export type DeliverySlot = z.infer<typeof DeliverySlotSchema>;

// ============================================
// Fly+ Types (Travel & Luggage Management)
// ============================================

export enum FlyPlusTier {
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  VIP = 'VIP',
  ELITE = 'ELITE',
}

export const FlyPlusPassSchema = z.object({
  passId: z.string().uuid(),
  holderId: z.string().uuid(),
  tier: z.nativeEnum(FlyPlusTier),
  features: z.object({
    remoteCheckIn: z.boolean(),
    doorToDoorLuggage: z.boolean(),
    fastTrackSecurity: z.boolean(),
    loungeAccess: z.boolean(),
    prioritySupport: z.boolean(),
  }),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  transferable: z.boolean(),
  usageCount: z.number().nonnegative(),
  maxUsage: z.number().positive().optional(),
});

export type FlyPlusPass = z.infer<typeof FlyPlusPassSchema>;

export const LuggageBookingSchema = z.object({
  bookingId: z.string().uuid(),
  passId: z.string().uuid().optional(),
  userId: z.string().uuid(),
  pickupLocation: z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  dropoffLocation: z.object({
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  scheduledPickup: z.string().datetime(),
  luggageCount: z.number().positive(),
  isEcoFriendly: z.boolean(),
  pointsEarned: z.number().nonnegative(),
});

export type LuggageBooking = z.infer<typeof LuggageBookingSchema>;

// ============================================
// H2O Types (Water/Utility Logistics)
// ============================================

export enum UtilityType {
  WATER = 'WATER',
  ELECTRICITY = 'ELECTRICITY',
  GAS = 'GAS',
  COLD_CHAIN = 'COLD_CHAIN',
}

export const UtilityCreditSchema = z.object({
  creditId: z.string().uuid(),
  utilityType: z.nativeEnum(UtilityType),
  quantity: z.number().positive(), // In base units (liters for water, kWh for electricity)
  unit: z.string(),
  verifiedBy: z.string(), // IoT device ID
  timestamp: z.string().datetime(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
  carbonOffset: z.number().nonnegative().optional(),
});

export type UtilityCredit = z.infer<typeof UtilityCreditSchema>;

export const IoTReadingSchema = z.object({
  deviceId: z.string(),
  readingType: z.string(),
  value: z.number(),
  unit: z.string(),
  timestamp: z.string().datetime(),
  signature: z.string().optional(),
});

export type IoTReading = z.infer<typeof IoTReadingSchema>;

// ============================================
// AMS/GTS Types (Data Infrastructure)
// ============================================

export enum DataStreamType {
  ROUTING = 'ROUTING',
  TRAFFIC = 'TRAFFIC',
  WEATHER = 'WEATHER',
  DEMAND = 'DEMAND',
  FLEET = 'FLEET',
}

export const DataStreamAccessSchema = z.object({
  accessId: z.string().uuid(),
  developerId: z.string().uuid(),
  streamType: z.nativeEnum(DataStreamType),
  tier: z.enum(['FREE', 'BASIC', 'PRO', 'ENTERPRISE']),
  rateLimit: z.number().positive(), // Requests per minute
  dataRetention: z.number().positive(), // Days
  stakeAmount: z.string(), // $AHOY tokens staked
  apiKey: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
});

export type DataStreamAccess = z.infer<typeof DataStreamAccessSchema>;

export const AlgorithmIPSchema = z.object({
  algorithmId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  creatorId: z.string().uuid(),
  category: z.enum(['ROUTING', 'OPTIMIZATION', 'PREDICTION', 'CLUSTERING']),
  version: z.string(),
  royaltyRate: z.number().min(0).max(100), // Percentage per API call
  totalCalls: z.number().nonnegative(),
  totalRoyalties: z.string(),
  licenseType: z.enum(['EXCLUSIVE', 'NON_EXCLUSIVE', 'OPEN_SOURCE']),
});

export type AlgorithmIP = z.infer<typeof AlgorithmIPSchema>;

// ============================================
// Nexus Types (AI & Federated ML)
// ============================================

export enum AgentCapability {
  ROUTING = 'ROUTING',
  SCHEDULING = 'SCHEDULING',
  PRICING = 'PRICING',
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
  FRAUD_DETECTION = 'FRAUD_DETECTION',
}

export const ComputeCreditSchema = z.object({
  creditId: z.string().uuid(),
  nodeId: z.string().uuid(),
  modelId: z.string(),
  trainingRound: z.number().positive(),
  dataPointsProcessed: z.number().positive(),
  computeUnits: z.number().positive(),
  zkProofHash: z.string(), // Zero-Knowledge proof of training
  timestamp: z.string().datetime(),
  rewardAmount: z.string(), // $AHOY earned
});

export type ComputeCredit = z.infer<typeof ComputeCreditSchema>;

export const AgentWalletSchema = z.object({
  agentId: z.string().uuid(),
  walletAddress: z.string(),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  balance: z.string(), // $AHOY balance
  spentTotal: z.string(),
  earnedTotal: z.string(),
  servicesHired: z.number().nonnegative(),
  servicesProvided: z.number().nonnegative(),
  reputation: z.number().min(0).max(100),
  isActive: z.boolean(),
});

export type AgentWallet = z.infer<typeof AgentWalletSchema>;

// ============================================
// $AHOY Token Types (Unified Loyalty)
// ============================================

export enum AhoyActionType {
  // Earn Actions
  PERFECT_DELIVERY_WEEK = 'PERFECT_DELIVERY_WEEK',
  OFF_PEAK_BOOKING = 'OFF_PEAK_BOOKING',
  LOCATION_DATA_SHARE = 'LOCATION_DATA_SHARE',
  ALGORITHM_PUBLISH = 'ALGORITHM_PUBLISH',
  COMPUTE_CONTRIBUTION = 'COMPUTE_CONTRIBUTION',
  ECO_FRIENDLY_DROPOFF = 'ECO_FRIENDLY_DROPOFF',
  EARLY_BOOKING = 'EARLY_BOOKING',
  REFERRAL = 'REFERRAL',

  // Burn Actions
  DISCOUNT_REDEMPTION = 'DISCOUNT_REDEMPTION',
  PRIORITY_QUEUE = 'PRIORITY_QUEUE',
  DATA_ACCESS = 'DATA_ACCESS',
  AGENT_HIRE = 'AGENT_HIRE',
  PREMIUM_FEATURE = 'PREMIUM_FEATURE',
}

export const AhoyPointsConfigSchema = z.object({
  action: z.nativeEnum(AhoyActionType),
  points: z.number(),
  isEarn: z.boolean(),
  minHoldPeriod: z.number().nonnegative().optional(), // Days
  cooldownPeriod: z.number().nonnegative().optional(), // Hours
  maxPerDay: z.number().positive().optional(),
});

export type AhoyPointsConfig = z.infer<typeof AhoyPointsConfigSchema>;

export const AhoyTransactionSchema = z.object({
  txId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.nativeEnum(AhoyActionType),
  points: z.number(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  source: z.enum(['COMET', 'FLYPLUS', 'H2O', 'AMS', 'NEXUS', 'CONNECT']),
  referenceId: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type AhoyTransaction = z.infer<typeof AhoyTransactionSchema>;

// ============================================
// Ecosystem Configuration
// ============================================

export const AhoyEcosystemConfig = {
  // Points configuration
  POINTS_CONFIG: {
    [AhoyActionType.PERFECT_DELIVERY_WEEK]: { points: 100, isEarn: true },
    [AhoyActionType.OFF_PEAK_BOOKING]: { points: 50, isEarn: true },
    [AhoyActionType.LOCATION_DATA_SHARE]: { points: 10, isEarn: true, maxPerDay: 1 },
    [AhoyActionType.ALGORITHM_PUBLISH]: { points: 500, isEarn: true },
    [AhoyActionType.COMPUTE_CONTRIBUTION]: { points: 25, isEarn: true },
    [AhoyActionType.ECO_FRIENDLY_DROPOFF]: { points: 20, isEarn: true },
    [AhoyActionType.EARLY_BOOKING]: { points: 30, isEarn: true },
    [AhoyActionType.REFERRAL]: { points: 200, isEarn: true },
    [AhoyActionType.DISCOUNT_REDEMPTION]: { points: -1000, isEarn: false }, // 1000 = $10
    [AhoyActionType.PRIORITY_QUEUE]: { points: -500, isEarn: false },
    [AhoyActionType.DATA_ACCESS]: { points: -100, isEarn: false },
    [AhoyActionType.AGENT_HIRE]: { points: -250, isEarn: false },
    [AhoyActionType.PREMIUM_FEATURE]: { points: -150, isEarn: false },
  },

  // Driver tier thresholds (XP points)
  DRIVER_TIERS: {
    [DriverTier.BRONZE]: 0,
    [DriverTier.SILVER]: 1000,
    [DriverTier.GOLD]: 5000,
    [DriverTier.PLATINUM]: 15000,
    [DriverTier.DIAMOND]: 50000,
  },

  // Fly+ tier benefits
  FLYPLUS_TIERS: {
    [FlyPlusTier.BASIC]: {
      remoteCheckIn: true,
      doorToDoorLuggage: false,
      fastTrackSecurity: false,
      loungeAccess: false,
      prioritySupport: false,
    },
    [FlyPlusTier.PREMIUM]: {
      remoteCheckIn: true,
      doorToDoorLuggage: true,
      fastTrackSecurity: false,
      loungeAccess: false,
      prioritySupport: false,
    },
    [FlyPlusTier.VIP]: {
      remoteCheckIn: true,
      doorToDoorLuggage: true,
      fastTrackSecurity: true,
      loungeAccess: false,
      prioritySupport: true,
    },
    [FlyPlusTier.ELITE]: {
      remoteCheckIn: true,
      doorToDoorLuggage: true,
      fastTrackSecurity: true,
      loungeAccess: true,
      prioritySupport: true,
    },
  },
};
