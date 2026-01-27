/**
 * Common Fixtures
 *
 * Shared test data for seeding sandbox environments.
 */

export const JURISDICTIONS = {
  dubai: {
    country: 'AE',
    subdivision: 'DUBAI',
  },
  us: {
    country: 'US',
    subdivision: 'DE',
  },
  uk: {
    country: 'GB',
    subdivision: 'LONDON',
  },
  singapore: {
    country: 'SG',
    subdivision: 'SINGAPORE',
  },
};

export const INVESTORS = [
  {
    id: 'inv_seed_001',
    type: 'individual' as const,
    email: 'john.investor@example.com',
    jurisdiction: 'US',
    classification: 'accredited' as const,
    wallet: '0x1111111111111111111111111111111111111111',
  },
  {
    id: 'inv_seed_002',
    type: 'individual' as const,
    email: 'jane.investor@example.com',
    jurisdiction: 'AE',
    classification: 'professional' as const,
    wallet: '0x2222222222222222222222222222222222222222',
  },
  {
    id: 'inv_seed_003',
    type: 'company' as const,
    email: 'contact@investment-fund.com',
    jurisdiction: 'GB',
    classification: 'institutional' as const,
    wallet: '0x3333333333333333333333333333333333333333',
  },
  {
    id: 'inv_seed_004',
    type: 'individual' as const,
    email: 'retail@example.com',
    jurisdiction: 'US',
    classification: 'retail' as const,
    wallet: '0x4444444444444444444444444444444444444444',
  },
];

export const COMPLIANCE_POLICIES = {
  restrictedCountries: ['KP', 'IR', 'CU', 'SY'],
  minInvestmentUSD: {
    retail: 1000,
    accredited: 10000,
    professional: 50000,
    institutional: 100000,
  },
  kycRequired: true,
  lockupDays: 90,
};
