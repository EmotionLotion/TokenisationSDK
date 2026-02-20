-- ============================================================================
-- Migration 005: NAV History & Property Management Tables
-- Moves lazy-init table creation from nav.service.ts and
-- property-management.service.ts into a proper migration.
-- Run after 004_phase2_real_estate.sql
-- ============================================================================

-- ============================================================================
-- NAV History — stores NAV snapshots for tokenised assets
-- ============================================================================

CREATE TABLE IF NOT EXISTS nav_history (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  nav_per_token TEXT NOT NULL,
  total_asset_value TEXT NOT NULL,
  liabilities TEXT NOT NULL DEFAULT '0',
  net_asset_value TEXT NOT NULL,
  total_supply TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  decimals INTEGER NOT NULL DEFAULT 18,
  source TEXT NOT NULL DEFAULT 'cre_workflow',
  tx_hash TEXT,
  computed_at TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_history_asset
  ON nav_history(asset_id, computed_at);

CREATE INDEX IF NOT EXISTS idx_nav_history_org_asset
  ON nav_history(org_id, asset_id);

-- ============================================================================
-- Valuation Sources — per-source breakdown linked to a NAV record
-- ============================================================================

CREATE TABLE IF NOT EXISTS valuation_sources (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  nav_record_id TEXT NOT NULL REFERENCES nav_history(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  value TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  timestamp INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_valuation_sources_nav_record
  ON valuation_sources(nav_record_id);

-- ============================================================================
-- Property Units — individual units within a real estate asset
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_units (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_asset_id TEXT NOT NULL,
  unit_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'apartment',
  area REAL NOT NULL DEFAULT 0,
  tenant_name TEXT,
  tenant_email TEXT,
  lease_start TEXT,
  lease_end TEXT,
  monthly_rent TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'vacant',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_units_org_asset
  ON property_units(org_id, property_asset_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_units_number
  ON property_units(org_id, property_asset_id, unit_number);

-- ============================================================================
-- Maintenance Requests — maintenance lifecycle per property
-- ============================================================================

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_asset_id TEXT NOT NULL,
  unit_id TEXT,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee TEXT,
  estimated_cost TEXT,
  actual_cost TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  completed_at TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maint_req_org_asset
  ON maintenance_requests(org_id, property_asset_id);

CREATE INDEX IF NOT EXISTS idx_maint_req_status
  ON maintenance_requests(org_id, status);

-- ============================================================================
-- Property Expenses — expense recording per property
-- ============================================================================

CREATE TABLE IF NOT EXISTS property_expenses (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  property_asset_id TEXT NOT NULL,
  category TEXT NOT NULL,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  vendor TEXT,
  invoice_ref TEXT,
  paid_at TEXT,
  period TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prop_exp_org_asset
  ON property_expenses(org_id, property_asset_id);

CREATE INDEX IF NOT EXISTS idx_prop_exp_category
  ON property_expenses(org_id, category);
