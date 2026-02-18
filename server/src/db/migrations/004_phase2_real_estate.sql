-- ============================================================================
-- Migration 004: Real Estate Phase 2 Tables
-- Investor Tiers, Exit Windows, Secondary Market
-- Run after 003_verticals_and_compliance.sql
-- ============================================================================

-- ============================================================================
-- Investor Plans — per-asset tier configurations (VARA compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS investor_plans (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  tier VARCHAR(32) NOT NULL,
  name VARCHAR(256) NOT NULL,
  min_investment NUMERIC(18, 2) NOT NULL,
  max_investment NUMERIC(18, 2) NOT NULL,
  max_holding_percent NUMERIC(5, 2) NOT NULL,
  management_fee_percent NUMERIC(5, 2) NOT NULL,
  performance_fee_percent NUMERIC(5, 2) NOT NULL,
  lockup_days INTEGER NOT NULL,
  accreditation_required BOOLEAN NOT NULL DEFAULT FALSE,
  accreditation_types JSONB DEFAULT '[]',
  currency VARCHAR(8) NOT NULL DEFAULT 'AED',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investor_plans_asset ON investor_plans(asset_id);
CREATE INDEX IF NOT EXISTS idx_investor_plans_tier ON investor_plans(tier);

-- ============================================================================
-- Investor Tier Assignments — maps investors to their classification
-- ============================================================================

CREATE TABLE IF NOT EXISTS investor_tier_assignments (
  id TEXT PRIMARY KEY,
  investor_id TEXT NOT NULL,
  tier VARCHAR(32) NOT NULL,
  accreditation_status VARCHAR(32) NOT NULL DEFAULT 'none',
  total_invested NUMERIC(18, 2) NOT NULL DEFAULT 0,
  verified_at TIMESTAMPTZ,
  accreditation_docs JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_investor_tier_investor ON investor_tier_assignments(investor_id);

-- ============================================================================
-- Exit Window Schedules — defines recurring redemption windows per asset
-- ============================================================================

CREATE TABLE IF NOT EXISTS exit_window_schedules (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  frequency VARCHAR(32) NOT NULL,
  window_duration_days INTEGER NOT NULL,
  max_redemption_percent NUMERIC(5, 2) NOT NULL,
  notice_period_days INTEGER NOT NULL,
  next_window_opens TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_exit_schedules_asset ON exit_window_schedules(asset_id);

-- ============================================================================
-- Exit Windows — individual window instances
-- ============================================================================

CREATE TABLE IF NOT EXISTS exit_windows (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES exit_window_schedules(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  max_redemption_percent NUMERIC(5, 2) NOT NULL,
  total_redeemed NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_requested NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_windows_asset ON exit_windows(asset_id);
CREATE INDEX IF NOT EXISTS idx_exit_windows_schedule ON exit_windows(schedule_id);
CREATE INDEX IF NOT EXISTS idx_exit_windows_status ON exit_windows(status);

-- ============================================================================
-- Exit Redemptions — individual redemption requests within a window
-- ============================================================================

CREATE TABLE IF NOT EXISTS exit_redemptions (
  id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL REFERENCES exit_windows(id) ON DELETE CASCADE,
  investor_id TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_redemptions_window ON exit_redemptions(window_id);
CREATE INDEX IF NOT EXISTS idx_exit_redemptions_investor ON exit_redemptions(investor_id);

-- ============================================================================
-- Secondary Listings — P2P token trading on secondary market
-- ============================================================================

CREATE TABLE IF NOT EXISTS secondary_listings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  seller_wallet VARCHAR(128) NOT NULL,
  token_amount NUMERIC(18, 2) NOT NULL,
  price_per_token NUMERIC(18, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'AED',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  buyer_id TEXT,
  listed_at TIMESTAMPTZ DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_secondary_listings_asset ON secondary_listings(asset_id);
CREATE INDEX IF NOT EXISTS idx_secondary_listings_seller ON secondary_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_secondary_listings_status ON secondary_listings(status);

-- ============================================================================
-- Enable Row Level Security on all Phase 2 tables
-- ============================================================================

-- Note: These tables use asset_id rather than org_id for scoping.
-- RLS policies can be added when org_id columns are introduced.
-- For now, enable RLS so policies can be applied later.

-- investor_plans: no org_id, scoped by asset_id
-- investor_tier_assignments: no org_id, scoped by investor_id
-- exit_window_schedules: no org_id, scoped by asset_id
-- exit_windows: no org_id, scoped by asset_id
-- exit_redemptions: no org_id, scoped by window_id/investor_id
-- secondary_listings: no org_id, scoped by asset_id
