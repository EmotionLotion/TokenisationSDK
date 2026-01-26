-- AHOY Tokenisation Platform - Initial Schema
-- Run this migration to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Parties table - Identity/KYC records
CREATE TABLE IF NOT EXISTS parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(256) NOT NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('INDIVIDUAL', 'ORGANIZATION', 'AGENT')),
    roles TEXT[] NOT NULL DEFAULT '{}',
    jurisdiction VARCHAR(2) NOT NULL,
    verification_level VARCHAR(32) DEFAULT 'NONE' CHECK (verification_level IN ('NONE', 'BASIC', 'STANDARD', 'ENHANCED')),
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_expiry_date TIMESTAMPTZ,
    accredited_investor BOOLEAN DEFAULT FALSE,
    is_frozen BOOLEAN DEFAULT FALSE,
    freeze_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parties_jurisdiction ON parties(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_parties_type ON parties(type);
CREATE INDEX IF NOT EXISTS idx_parties_verification ON parties(verification_level);

-- Party wallets - Link wallet addresses to parties
CREATE TABLE IF NOT EXISTS party_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    address VARCHAR(42) NOT NULL,
    chain_id INTEGER NOT NULL,
    wallet_type VARCHAR(32) DEFAULT 'EOA',
    is_primary BOOLEAN DEFAULT FALSE,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(address, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_party_wallets_address ON party_wallets(LOWER(address));
CREATE INDEX IF NOT EXISTS idx_party_wallets_party ON party_wallets(party_id);

-- Assets table - Tokenized asset definitions
CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(256) NOT NULL,
    description TEXT,
    right_type VARCHAR(32) NOT NULL CHECK (right_type IN ('OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION')),
    state VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FROZEN', 'REDEEMED', 'EXPIRED', 'BURNED')),
    issuer_id UUID REFERENCES parties(id),
    jurisdiction JSONB NOT NULL,
    validity_period JSONB,
    transferability_rules JSONB,
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_state ON assets(state);
CREATE INDEX IF NOT EXISTS idx_assets_right_type ON assets(right_type);
CREATE INDEX IF NOT EXISTS idx_assets_issuer ON assets(issuer_id);

-- Events table - Audit trail (event sourcing)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(64) NOT NULL,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    actor_id VARCHAR(256) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    event_version INTEGER DEFAULT 1,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_asset ON events(asset_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_asset_type ON events(asset_id, type);

-- Sessions table - SIWE auth sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    wallet_address VARCHAR(42) NOT NULL,
    siwe_nonce VARCHAR(64) NOT NULL,
    siwe_issued_at TIMESTAMPTZ,
    siwe_expiry_at TIMESTAMPTZ,
    jwt_issued_at TIMESTAMPTZ,
    jwt_expires_at TIMESTAMPTZ,
    refresh_token_hash VARCHAR(256),
    refresh_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_party ON sessions(party_id);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON sessions(LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active) WHERE is_active = TRUE;

-- Chain deployments - Contract addresses per chain
CREATE TABLE IF NOT EXISTS chain_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    chain_id INTEGER NOT NULL,
    chain_name VARCHAR(64) NOT NULL,
    contract_type VARCHAR(32) NOT NULL CHECK (contract_type IN ('ERC20', 'ERC721', 'ERC1155', 'SBT')),
    contract_address VARCHAR(42) NOT NULL,
    deploy_tx_hash VARCHAR(66),
    deployer_address VARCHAR(42),
    verified BOOLEAN DEFAULT FALSE,
    abi JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, chain_id, contract_type)
);

CREATE INDEX IF NOT EXISTS idx_deployments_chain ON chain_deployments(chain_id);
CREATE INDEX IF NOT EXISTS idx_deployments_asset ON chain_deployments(asset_id);
CREATE INDEX IF NOT EXISTS idx_deployments_address ON chain_deployments(LOWER(contract_address));

-- Token balances - Cached token balances per holder
CREATE TABLE IF NOT EXISTS token_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    holder_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    balance VARCHAR(78) NOT NULL DEFAULT '0',
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, holder_id)
);

CREATE INDEX IF NOT EXISTS idx_balances_asset ON token_balances(asset_id);
CREATE INDEX IF NOT EXISTS idx_balances_holder ON token_balances(holder_id);

-- Nonces table - For SIWE nonce management
CREATE TABLE IF NOT EXISTS nonces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(42) NOT NULL,
    nonce VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nonces_address ON nonces(LOWER(address));
CREATE INDEX IF NOT EXISTS idx_nonces_expires ON nonces(expires_at) WHERE used = FALSE;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_parties_updated_at BEFORE UPDATE ON parties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_updated_at BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
