-- ============================================================================
-- MIGRATION: Enable Row Level Security (RLS) for Multi-Tenant Isolation
-- ============================================================================
--
-- This migration enables PostgreSQL Row Level Security on all tenant-scoped
-- tables. RLS ensures that queries automatically filter rows based on the
-- current organization context, preventing cross-tenant data access.
--
-- Usage:
--   1. Application sets current_setting('app.current_org_id', 'org-uuid')
--   2. All queries automatically filter by org_id
--   3. Superusers (migrations, admin) bypass RLS
--
-- ============================================================================

-- Create app schema for configuration settings
CREATE SCHEMA IF NOT EXISTS app;

-- Function to get current org_id from session
CREATE OR REPLACE FUNCTION app.current_org_id()
RETURNS uuid AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to set current org_id for the session
CREATE OR REPLACE FUNCTION app.set_current_org_id(org_id uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_org_id', org_id::text, false);
END;
$$ LANGUAGE plpgsql;

-- Function to clear current org_id
CREATE OR REPLACE FUNCTION app.clear_current_org_id()
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_org_id', '', false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENABLE RLS ON ALL TENANT-SCOPED TABLES
-- ============================================================================

-- IAM Tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Billing & Usage Tables
ALTER TABLE org_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;

-- Projects & Documents
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Parties & Investors
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_sessions ENABLE ROW LEVEL SECURITY;

-- Assets & Policies
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;

-- Tokens & Issuance
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_tranches ENABLE ROW LEVEL SECURITY;
ALTER TABLE issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clawbacks ENABLE ROW LEVEL SECURITY;

-- Compliance & Approvals
ALTER TABLE compliance_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_rulesets ENABLE ROW LEVEL SECURITY;

-- Offerings & Allocations
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyback_requests ENABLE ROW LEVEL SECURITY;

-- Transfers & Settlements
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- DLD Integration
ALTER TABLE dld_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dld_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dld_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Ledger
ALTER TABLE ledger_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cap_table_snapshots ENABLE ROW LEVEL SECURITY;

-- Webhooks
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Audit & Events
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Sessions & Deployments
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_balances ENABLE ROW LEVEL SECURITY;

-- Infrastructure Tables
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_bus_queue ENABLE ROW LEVEL SECURITY;

-- Vesting
ALTER TABLE vesting_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE vesting_releases ENABLE ROW LEVEL SECURITY;

-- Distributions & Corporate Actions
ALTER TABLE distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribution_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_action_entitlements ENABLE ROW LEVEL SECURITY;

-- State Machine
ALTER TABLE state_transitions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE RLS POLICIES
-- Each table gets four policies: SELECT, INSERT, UPDATE, DELETE
-- ============================================================================

-- Helper macro for creating standard tenant isolation policies
-- Tables with direct org_id column

-- users
CREATE POLICY users_tenant_isolation ON users
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- roles
CREATE POLICY roles_tenant_isolation ON roles
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- api_keys
CREATE POLICY api_keys_tenant_isolation ON api_keys
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- oauth_clients
CREATE POLICY oauth_clients_tenant_isolation ON oauth_clients
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- oauth_tokens
CREATE POLICY oauth_tokens_tenant_isolation ON oauth_tokens
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- org_billing
CREATE POLICY org_billing_tenant_isolation ON org_billing
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- usage_records
CREATE POLICY usage_records_tenant_isolation ON usage_records
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- usage_quotas
CREATE POLICY usage_quotas_tenant_isolation ON usage_quotas
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- projects
CREATE POLICY projects_tenant_isolation ON projects
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- documents
CREATE POLICY documents_tenant_isolation ON documents
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- parties
CREATE POLICY parties_tenant_isolation ON parties
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- party_wallets (via parties)
CREATE POLICY party_wallets_tenant_isolation ON party_wallets
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- investors
CREATE POLICY investors_tenant_isolation ON investors
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- investor_wallets
CREATE POLICY investor_wallets_tenant_isolation ON investor_wallets
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- kyc_sessions
CREATE POLICY kyc_sessions_tenant_isolation ON kyc_sessions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- assets
CREATE POLICY assets_tenant_isolation ON assets
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- policies
CREATE POLICY policies_tenant_isolation ON policies
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- policy_versions
CREATE POLICY policy_versions_tenant_isolation ON policy_versions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- decisions
CREATE POLICY decisions_tenant_isolation ON decisions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- tokens
CREATE POLICY tokens_tenant_isolation ON tokens
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- token_tranches
CREATE POLICY token_tranches_tenant_isolation ON token_tranches
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- issuances
CREATE POLICY issuances_tenant_isolation ON issuances
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- redemptions
CREATE POLICY redemptions_tenant_isolation ON redemptions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- clawbacks
CREATE POLICY clawbacks_tenant_isolation ON clawbacks
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- compliance_approvals
CREATE POLICY compliance_approvals_tenant_isolation ON compliance_approvals
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- compliance_receipts
CREATE POLICY compliance_receipts_tenant_isolation ON compliance_receipts
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- compliance_audit_log
CREATE POLICY compliance_audit_log_tenant_isolation ON compliance_audit_log
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- policy_rulesets
CREATE POLICY policy_rulesets_tenant_isolation ON policy_rulesets
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- offerings
CREATE POLICY offerings_tenant_isolation ON offerings
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- allocations
CREATE POLICY allocations_tenant_isolation ON allocations
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- buyback_requests
CREATE POLICY buyback_requests_tenant_isolation ON buyback_requests
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- transfers
CREATE POLICY transfers_tenant_isolation ON transfers
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- settlements
CREATE POLICY settlements_tenant_isolation ON settlements
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- dld_titles
CREATE POLICY dld_titles_tenant_isolation ON dld_titles
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- dld_events
CREATE POLICY dld_events_tenant_isolation ON dld_events
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- dld_sync_jobs
CREATE POLICY dld_sync_jobs_tenant_isolation ON dld_sync_jobs
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- ledger_positions
CREATE POLICY ledger_positions_tenant_isolation ON ledger_positions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- ledger_events
CREATE POLICY ledger_events_tenant_isolation ON ledger_events
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- cap_table_snapshots
CREATE POLICY cap_table_snapshots_tenant_isolation ON cap_table_snapshots
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- webhook_endpoints
CREATE POLICY webhook_endpoints_tenant_isolation ON webhook_endpoints
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- webhook_deliveries
CREATE POLICY webhook_deliveries_tenant_isolation ON webhook_deliveries
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- audit_log
CREATE POLICY audit_log_tenant_isolation ON audit_log
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- events
CREATE POLICY events_tenant_isolation ON events
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- sessions
CREATE POLICY sessions_tenant_isolation ON sessions
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- chain_deployments
CREATE POLICY chain_deployments_tenant_isolation ON chain_deployments
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- token_balances
CREATE POLICY token_balances_tenant_isolation ON token_balances
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- idempotency_keys
CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- domain_events_outbox
CREATE POLICY domain_events_outbox_tenant_isolation ON domain_events_outbox
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- event_bus_queue
CREATE POLICY event_bus_queue_tenant_isolation ON event_bus_queue
  FOR ALL USING (org_id = app.current_org_id() OR org_id IS NULL)
  WITH CHECK (org_id = app.current_org_id() OR org_id IS NULL);

-- vesting_schedules
CREATE POLICY vesting_schedules_tenant_isolation ON vesting_schedules
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- vesting_milestones
CREATE POLICY vesting_milestones_tenant_isolation ON vesting_milestones
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- vesting_releases
CREATE POLICY vesting_releases_tenant_isolation ON vesting_releases
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- distributions
CREATE POLICY distributions_tenant_isolation ON distributions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- distribution_payments
CREATE POLICY distribution_payments_tenant_isolation ON distribution_payments
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- corporate_actions
CREATE POLICY corporate_actions_tenant_isolation ON corporate_actions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- corporate_action_entitlements
CREATE POLICY corporate_action_entitlements_tenant_isolation ON corporate_action_entitlements
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- state_transitions
CREATE POLICY state_transitions_tenant_isolation ON state_transitions
  FOR ALL USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION app.current_org_id() IS 'Returns the current organization ID from the session context';
COMMENT ON FUNCTION app.set_current_org_id(uuid) IS 'Sets the current organization ID for the session';
COMMENT ON FUNCTION app.clear_current_org_id() IS 'Clears the current organization ID from the session';
