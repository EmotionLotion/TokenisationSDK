-- =============================================================================
-- AHOY Tokenisation SDK - Database Initialization
-- =============================================================================

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create default organization for sandbox
INSERT INTO organizations (id, name, slug, status, settings, created_at, updated_at)
VALUES (
  'org_sandbox_default',
  'Sandbox Organization',
  'sandbox',
  'active',
  '{"environment": "sandbox", "features": ["mock_kyc", "test_chain"]}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create sandbox API key
INSERT INTO api_keys (id, org_id, name, key_hash, key_prefix, scopes, status, created_at)
VALUES (
  'key_sandbox_default',
  'org_sandbox_default',
  'Sandbox Test Key',
  encode(sha256('ak_test_sandbox_key_12345'::bytea), 'hex'),
  'ak_test_sandbox',
  ARRAY['read', 'write', 'admin'],
  'active',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create sandbox user
INSERT INTO users (id, org_id, email, name, role, status, created_at, updated_at)
VALUES (
  'user_sandbox_admin',
  'org_sandbox_default',
  'admin@sandbox.ahoy.fund',
  'Sandbox Admin',
  'admin',
  'active',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Log initialization
DO $$
BEGIN
  RAISE NOTICE 'AHOY Sandbox Database Initialized';
  RAISE NOTICE 'Organization: org_sandbox_default';
  RAISE NOTICE 'API Key: ak_test_sandbox_key_12345';
END $$;
